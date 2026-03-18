/**
 * Workflow DAG Scheduling Engine (Main Process)
 *
 * 职责:
 *   1. 拓扑排序确定执行顺序
 *   2. 按层级并行/串行执行节点
 *   3. 上下文流转：上游节点输出 → 下游节点输入
 *   4. 通过 IPC 向渲染进程实时报告节点状态
 *
 * 仅在 Electron 主进程中运行。
 */

import { BrowserWindow } from 'electron';
import { orchestrator } from './orchestration';

// ── 类型定义 (与 renderer types/workflow.ts 对齐) ─────────

interface SerializedNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

interface SerializedEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

interface WorkflowDefinition {
  id: string;
  name: string;
  version: number;
  nodes: SerializedNode[];
  edges: SerializedEdge[];
  globalVariables?: Record<string, string>;
}

interface WorkflowNodeData {
  type: 'trigger' | 'agent' | 'skill' | 'logic' | 'output';
  label: string;
  description?: string;
  triggerConfig?: {
    type: 'manual' | 'cron' | 'webhook' | 'event';
    cronExpression?: string;
    webhookPath?: string;
    eventName?: string;
  };
  agentConfig?: {
    agentId: string;
    modelOverride?: string;
    promptTemplate?: string;
    inputMappings: Array<{
      sourceNodeId: string;
      sourceField: string;
      targetVariable: string;
    }>;
    timeoutSeconds?: number;
    retryCount?: number;
  };
  skillConfig?: {
    skillId: string;
    agentId?: string;
    promptTemplate?: string;
    inputMappings: Array<{
      sourceNodeId: string;
      sourceField: string;
      targetVariable: string;
    }>;
    timeoutSeconds?: number;
    retryCount?: number;
  };
  logicConfig?: {
    logicType: 'branch' | 'merge' | 'delay';
    conditions?: Array<{
      id: string;
      label: string;
      field: string;
      operator: string;
      value: string;
      targetHandle: string;
    }>;
    defaultHandle?: string;
    delaySeconds?: number;
  };
  outputConfig?: {
    channelType: string;
    channelAccountId?: string;
    deliveryTarget?: string;
    agentId?: string;
    messageTemplate: string;
    inputMappings: Array<{
      sourceNodeId: string;
      sourceField: string;
      targetVariable: string;
    }>;
  };
  runStatus?: string;
}

type NodeRunStatus = 'idle' | 'pending' | 'running' | 'success' | 'failed' | 'skipped';

interface NodeRunResult {
  nodeId: string;
  status: NodeRunStatus;
  output?: Record<string, unknown>;
  error?: string;
  durationMs?: number;
  startedAt?: number;
  finishedAt?: number;
}

interface ExecutionContext {
  runId: string;
  workflow: WorkflowDefinition;
  nodeResults: Record<string, NodeRunResult>;
  variables: Record<string, unknown>;
  startedAt: number;
  aborted: boolean;
  /** GatewayManager.rpc 函数引用 (从 IPC handler 注入) */
  rpc: RpcFunction | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RpcFunction = <T>(method: string, params?: unknown, timeoutMs?: number) => Promise<T>;

// ── 全局 Gateway RPC 引用 (由 IPC handler 设置) ────────────

let _gatewayRpc: RpcFunction | null = null;

/** 由 ipc-handlers 在注册 workflow handlers 时调用，注入 gatewayManager.rpc */
export function setGatewayRpc(rpc: RpcFunction) {
  _gatewayRpc = rpc;
  orchestrator.setRpc(rpc);
}

// ── 拓扑排序 (Kahn's Algorithm) ──────────────────────────

function topologicalSort(nodes: SerializedNode[], edges: SerializedEdge[]): string[][] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const inDegree: Record<string, number> = {};
  const adjacency: Record<string, string[]> = {};

  for (const id of nodeIds) {
    inDegree[id] = 0;
    adjacency[id] = [];
  }

  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      adjacency[edge.source].push(edge.target);
      inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
    }
  }

  const layers: string[][] = [];
  let queue = Object.keys(inDegree).filter((id) => inDegree[id] === 0);

  while (queue.length > 0) {
    layers.push([...queue]);
    const nextQueue: string[] = [];
    for (const id of queue) {
      for (const neighbor of adjacency[id]) {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) {
          nextQueue.push(neighbor);
        }
      }
    }
    queue = nextQueue;
  }

  // 环路检测
  const processed = layers.flat();
  if (processed.length !== nodeIds.size) {
    throw new Error('Workflow contains a cycle — cannot execute.');
  }

  return layers;
}

// ── 深度取值 (简易 JSONPath) ──────────────────────────────

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

// ── 模板插值 ─────────────────────────────────────────────

function interpolateTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, rawKey) => {
    const key = String(rawKey).trim();
    const val = getNestedValue(vars, key);
    if (val === undefined || val === null) {
      return `{{${key}}}`;
    }
    return typeof val === 'object' ? JSON.stringify(val) : String(val);
  });
}

function collectImplicitInputVars(
  ctx: ExecutionContext,
  nodeId: string,
  edges: SerializedEdge[],
): Record<string, unknown> {
  const vars: Record<string, unknown> = { ...ctx.variables };
  const upstream: Record<string, unknown> = {};

  for (const edge of edges) {
    if (edge.target !== nodeId) continue;

    const upstreamResult = ctx.nodeResults[edge.source];
    if (!upstreamResult?.output) continue;

    upstream[edge.source] = upstreamResult.output;
    Object.assign(vars, upstreamResult.output);
  }

  if (Object.keys(upstream).length > 0) {
    vars.upstream = upstream;
  }

  return vars;
}

function collectNodeInputVars(
  ctx: ExecutionContext,
  nodeId: string,
  inputMappings: Array<{
    sourceNodeId: string;
    sourceField: string;
    targetVariable: string;
  }> = [],
  edges: SerializedEdge[],
): Record<string, unknown> {
  const vars = collectImplicitInputVars(ctx, nodeId, edges);

  for (const mapping of inputMappings) {
    const upstreamResult = ctx.nodeResults[mapping.sourceNodeId];
    if (!upstreamResult?.output) continue;

    const mappedValue = getNestedValue(upstreamResult.output, mapping.sourceField);
    if (mappedValue !== undefined) {
      vars[mapping.targetVariable] = mappedValue;
    }
  }

  return vars;
}

function buildAgentPrompt(promptTemplate: string | undefined, inputVars: Record<string, unknown>): string {
  const basePrompt = promptTemplate ? interpolateTemplate(promptTemplate, inputVars).trim() : '';
  if (Object.keys(inputVars).length === 0) {
    return basePrompt || '{}';
  }

  const contextJson = JSON.stringify(inputVars, null, 2);
  if (!basePrompt) {
    return contextJson;
  }

  return `${basePrompt}\n\nWorkflow input context (JSON):\n${contextJson}`;
}

function parseStructuredResponse(responseText: string): Record<string, unknown> | null {
  const trimmed = responseText.trim();
  if (!trimmed) return null;

  const candidates = new Set<string>([trimmed]);
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    candidates.add(fencedMatch[1].trim());
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.add(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Ignore non-JSON replies and keep the raw assistant response.
    }
  }

  return null;
}

async function waitForGatewayRun(
  rpc: RpcFunction,
  runId: string | undefined,
  timeoutMs: number,
  label: string,
): Promise<void> {
  if (!runId) return;

  const waitResult = await rpc<{ status?: string; error?: string }>(
    'agent.wait',
    { runId, timeoutMs },
    timeoutMs + 5000,
  );

  if (waitResult?.status && waitResult.status !== 'ok') {
    throw new Error(
      waitResult.error
        ? `${label} failed: ${waitResult.error}`
        : `${label} finished with status "${waitResult.status}"`,
    );
  }
}

/** Extract readable text from chat message content (string or ContentBlock[]) */
function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: Record<string, unknown>) => b.type === 'text' && b.text)
      .map((b: Record<string, unknown>) => String(b.text))
      .join('\n');
  }
  if (content && typeof content === 'object') {
    const obj = content as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text;
  }
  return content ? String(content) : '';
}

/** Extract the last assistant response text from a chat.history RPC result */
function extractAgentResponse(historyData: unknown): string {
  if (!historyData || typeof historyData !== 'object') return '';
  const data = historyData as Record<string, unknown>;
  // Gateway may nest messages at different levels
  const raw = data.messages ?? data.payload ?? (Array.isArray(data) ? data : null);
  const messages = Array.isArray(raw) ? raw as Array<Record<string, unknown>> : null;
  if (!messages) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      return extractTextFromContent(messages[i].content);
    }
  }
  return '';
}

/**
 * 自动收集指定节点的所有上游 agent 节点的 response/output。
 * 用于输出节点没有配置消息模板时的 fallback。
 */
function collectUpstreamOutputs(
  ctx: ExecutionContext,
  nodeId: string,
  edges: SerializedEdge[],
  nodes: SerializedNode[],
): string {
  // 找到所有直接上游节点
  const parentIds = edges
    .filter((e) => e.target === nodeId)
    .map((e) => e.source);

  const parts: string[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (const parentId of parentIds) {
    const result = ctx.nodeResults[parentId];
    const parentNode = nodeMap.get(parentId);
    if (!result?.output) continue;

    // 优先取 response 字段，其次取整个 output
    const content = result.output.response
      ?? result.output.message
      ?? result.output.result
      ?? JSON.stringify(result.output);

    const label = parentNode?.data?.label || parentId;
    parts.push(`[${label}]\n${String(content)}`);
  }

  return parts.join('\n\n') || '';
}

// ── 条件评估 ─────────────────────────────────────────────

function evaluateCondition(
  field: string,
  operator: string,
  value: string,
  context: Record<string, unknown>,
): boolean {
  const fieldValue = getNestedValue(context, field);
  const strFieldValue = String(fieldValue ?? '');
  switch (operator) {
    case 'equals':
      return strFieldValue === value;
    case 'notEquals':
      return strFieldValue !== value;
    case 'contains':
      return strFieldValue.includes(value);
    case 'greaterThan':
      return Number(fieldValue) > Number(value);
    case 'lessThan':
      return Number(fieldValue) < Number(value);
    case 'isEmpty':
      return !fieldValue || strFieldValue === '';
    case 'isNotEmpty':
      return !!fieldValue && strFieldValue !== '';
    default:
      return false;
  }
}

// ── 活跃执行注册表 ──────────────────────────────────────

const activeRuns = new Map<string, ExecutionContext>();

// ── 向渲染进程发送节点状态事件 ──────────────────────────

function emitNodeEvent(runId: string, nodeId: string, status: NodeRunStatus, result?: NodeRunResult) {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    win.webContents.send('workflow:nodeEvent', { runId, nodeId, status, result });
  }
}

function emitComplete(runId: string, success: boolean, error?: string) {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    win.webContents.send('workflow:complete', { runId, success, error });
  }
}

// ── 单节点执行器 ─────────────────────────────────────────

async function executeNode(
  node: SerializedNode,
  ctx: ExecutionContext,
  edges: SerializedEdge[],
): Promise<NodeRunResult> {
  const startedAt = Date.now();

  try {
    emitNodeEvent(ctx.runId, node.id, 'running');

    let output: Record<string, unknown> = {};

    switch (node.data.type) {
      case 'trigger': {
        // 触发器节点：将用户输入传递给下游节点
        const userMessage = (ctx.variables.message as string) ?? (ctx.variables.input as string) ?? '';
        output = {
          triggered: true,
          timestamp: startedAt,
          message: userMessage,
          input: userMessage,
          ...ctx.variables,
        };
        break;
      }

      case 'agent': {
        const agentCfg = node.data.agentConfig;
        if (!agentCfg?.agentId) {
          throw new Error(`Agent node "${node.data.label}" has no agent configured`);
        }

        // 构建输入变量：默认继承上游输出和触发器输入，显式 mapping 覆盖同名变量
        const inputVars = collectNodeInputVars(ctx, node.id, agentCfg.inputMappings, edges);

        // 组装 prompt：保留模板，同时追加结构化上下文，避免无 mapping 时丢失输入
        const prompt = buildAgentPrompt(agentCfg.promptTemplate, inputVars);

        // 通过 Gateway RPC 调用 OpenClaw Agent
        if (ctx.rpc) {
          const sessionKey = `agent:${agentCfg.agentId}:workflow-${ctx.runId}-${node.id}`;
          const timeoutMs = (agentCfg.timeoutSeconds ?? 120) * 1000;
          let lastError: Error | null = null;
          const maxAttempts = (agentCfg.retryCount ?? 0) + 1;

          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
              console.log(`[WorkflowEngine] Calling agent "${agentCfg.agentId}" (attempt ${attempt}/${maxAttempts})`);
              const result = await ctx.rpc<{ runId?: string }>('chat.send', {
                sessionKey,
                message: prompt,
                deliver: false,
                idempotencyKey: `wf-${ctx.runId}-${node.id}-${attempt}`,
              }, timeoutMs);

              await waitForGatewayRun(
                ctx.rpc,
                result?.runId,
                timeoutMs,
                `Agent "${agentCfg.agentId}"`,
              );

              // Fetch the actual agent response from chat history
              let agentResponseText = '';
              try {
                const historyData = await ctx.rpc<Record<string, unknown>>(
                  'chat.history',
                  { sessionKey, limit: 30 },
                  15000,
                );
                agentResponseText = extractAgentResponse(historyData);
                if (agentResponseText) {
                  console.log(`[WorkflowEngine] Agent "${agentCfg.agentId}" response (${agentResponseText.length} chars)`);
                }
              } catch (historyErr) {
                console.warn(`[WorkflowEngine] chat.history failed for "${agentCfg.agentId}":`, historyErr);
              }

              const parsedResponse = parseStructuredResponse(agentResponseText);
              output = {
                agentId: agentCfg.agentId,
                sessionKey,
                prompt,
                gatewayRunId: result?.runId,
                response: agentResponseText || `Agent "${agentCfg.agentId}" completed (no text captured)`,
                inputVars,
              };
              if (parsedResponse) {
                output.parsedResponse = parsedResponse;
                for (const [key, value] of Object.entries(parsedResponse)) {
                  if (!(key in output)) {
                    output[key] = value;
                  }
                }
              }
              lastError = null;
              break;
            } catch (err) {
              lastError = err instanceof Error ? err : new Error(String(err));
              console.warn(`[WorkflowEngine] Agent attempt ${attempt} failed:`, lastError.message);
              if (attempt < maxAttempts) {
                await new Promise((r) => setTimeout(r, 1000 * attempt)); // backoff
              }
            }
          }

          if (lastError) {
            throw lastError;
          }
        } else {
          // Gateway 未连接时的降级模拟
          console.warn(`[WorkflowEngine] Gateway not connected, simulating agent "${agentCfg.agentId}"`);
          output = {
            agentId: agentCfg.agentId,
            prompt,
            response: `[Simulated - Gateway offline] Agent "${agentCfg.agentId}" execution skipped`,
            inputVars,
            simulated: true,
          };
        }
        break;
      }

      case 'skill': {
        const skillCfg = node.data.skillConfig;
        if (!skillCfg?.skillId) {
          throw new Error(`Skill node "${node.data.label}" has no skill configured`);
        }

        const inputVars = collectNodeInputVars(ctx, node.id, skillCfg.inputMappings, edges);

        // Build a prompt that instructs the agent to use the specific skill
        let skillPrompt: string;
        if (skillCfg.promptTemplate && skillCfg.promptTemplate.trim()) {
          skillPrompt = interpolateTemplate(skillCfg.promptTemplate, inputVars);
        } else {
          // Default: generic instruction to use the skill
          const inputSummary = Object.keys(inputVars).length > 0
            ? `\n\nInput context:\n${JSON.stringify(inputVars, null, 2)}`
            : '';
          skillPrompt = `Use the "${skillCfg.skillId}" skill to process the following task.${inputSummary}`;
        }

        if (ctx.rpc) {
          const agentId = skillCfg.agentId || 'main';
          const sessionKey = `agent:${agentId}:workflow-skill-${ctx.runId}-${node.id}`;
          const timeoutMs = (skillCfg.timeoutSeconds ?? 120) * 1000;
          let lastError: Error | null = null;
          const maxAttempts = (skillCfg.retryCount ?? 0) + 1;

          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
              console.log(`[WorkflowEngine] Running skill "${skillCfg.skillId}" via agent "${agentId}" (attempt ${attempt}/${maxAttempts})`);
              const result = await ctx.rpc<{ runId?: string }>('chat.send', {
                sessionKey,
                message: skillPrompt,
                deliver: false,
                idempotencyKey: `wf-skill-${ctx.runId}-${node.id}-${attempt}`,
              }, timeoutMs);

              await waitForGatewayRun(
                ctx.rpc,
                result?.runId,
                timeoutMs,
                `Skill "${skillCfg.skillId}"`,
              );

              // Fetch the agent response
              let responseText = '';
              try {
                const historyData = await ctx.rpc<Record<string, unknown>>(
                  'chat.history',
                  { sessionKey, limit: 30 },
                  15000,
                );
                responseText = extractAgentResponse(historyData);
                if (responseText) {
                  console.log(`[WorkflowEngine] Skill "${skillCfg.skillId}" response (${responseText.length} chars)`);
                }
              } catch (historyErr) {
                console.warn(`[WorkflowEngine] chat.history failed for skill "${skillCfg.skillId}":`, historyErr);
              }

              const parsedResponse = parseStructuredResponse(responseText);
              output = {
                skillId: skillCfg.skillId,
                agentId,
                sessionKey,
                prompt: skillPrompt,
                gatewayRunId: result?.runId,
                response: responseText || `Skill "${skillCfg.skillId}" completed (no text captured)`,
                inputVars,
              };
              if (parsedResponse) {
                output.parsedResponse = parsedResponse;
                for (const [key, value] of Object.entries(parsedResponse)) {
                  if (!(key in output)) {
                    output[key] = value;
                  }
                }
              }
              lastError = null;
              break;
            } catch (err) {
              lastError = err instanceof Error ? err : new Error(String(err));
              console.warn(`[WorkflowEngine] Skill attempt ${attempt} failed:`, lastError.message);
              if (attempt < maxAttempts) {
                await new Promise((r) => setTimeout(r, 1000 * attempt));
              }
            }
          }

          if (lastError) {
            throw lastError;
          }
        } else {
          console.warn(`[WorkflowEngine] Gateway not connected, simulating skill "${skillCfg.skillId}"`);
          output = {
            skillId: skillCfg.skillId,
            prompt: skillPrompt,
            response: `[Simulated - Gateway offline] Skill "${skillCfg.skillId}" execution skipped`,
            inputVars,
            simulated: true,
          };
        }
        break;
      }

      case 'output': {
        const outCfg = node.data.outputConfig;
        if (!outCfg?.channelType) {
          throw new Error(`Output node "${node.data.label}" has no channel configured`);
        }

        // 构建输入变量：默认继承上游输出，显式 mapping 覆盖同名变量
        const outVars = collectNodeInputVars(ctx, node.id, outCfg.inputMappings ?? [], edges);

        // 组装消息文本：优先用模板，否则自动收集所有上游 agent 节点的 response
        let message: string;
        if (outCfg.messageTemplate && outCfg.messageTemplate.trim() !== '') {
          message = interpolateTemplate(outCfg.messageTemplate, outVars);
        } else {
          // 自动收集上游所有节点的输出作为消息
          const allUpstreamOutputs = collectUpstreamOutputs(ctx, node.id, ctx.workflow.edges, ctx.workflow.nodes);
          message = allUpstreamOutputs || JSON.stringify(outVars);
        }

        // 通过 Orchestration Layer 投递到频道
        const agentId = outCfg.agentId || 'main';
        const deliveryResult = await orchestrator.deliverToChannel({
          channelType: outCfg.channelType,
          channelAccountId: outCfg.channelAccountId,
          deliveryTarget: outCfg.deliveryTarget,
          agentId,
          message,
        });

        if (!deliveryResult.success) {
          throw new Error(`Failed to deliver to channel "${outCfg.channelType}": ${deliveryResult.error}`);
        }

        output = {
          channelType: outCfg.channelType,
          agentId,
          message,
          delivered: deliveryResult.delivered,
          deliveryTarget: outCfg.deliveryTarget,
          channelAccountId: outCfg.channelAccountId,
          gatewayRunId: deliveryResult.runId,
          response: deliveryResult.response,
        };
        break;
      }

      case 'logic': {
        const logicCfg = node.data.logicConfig;
        if (!logicCfg) break;

        switch (logicCfg.logicType) {
          case 'branch': {
            // 评估条件，确定走哪个分支
            const flatContext = Object.assign(
              {},
              ctx.variables,
              ...Object.values(ctx.nodeResults)
                .filter((r) => r.output)
                .map((r) => r.output),
            );

            let matchedHandle: string | null = null;
            for (const cond of logicCfg.conditions ?? []) {
              if (evaluateCondition(cond.field, cond.operator, cond.value, flatContext)) {
                matchedHandle = cond.targetHandle;
                break;
              }
            }
            if (!matchedHandle) {
              matchedHandle = logicCfg.defaultHandle ?? 'default';
            }

            output = { matchedHandle, branchType: 'conditional' };
            break;
          }

          case 'merge': {
            // 汇聚：收集所有上游输出
            const incomingEdges = edges.filter((e) => e.target === node.id);
            const mergedData: Record<string, unknown> = {};
            for (const e of incomingEdges) {
              const upResult = ctx.nodeResults[e.source];
              if (upResult?.output) {
                mergedData[e.source] = upResult.output;
              }
            }
            output = { merged: mergedData };
            break;
          }

          case 'delay': {
            const delayMs = (logicCfg.delaySeconds ?? 0) * 1000;
            if (delayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
            output = { delayed: true, delayMs };
            break;
          }
        }
        break;
      }
    }

    const finishedAt = Date.now();
    const result: NodeRunResult = {
      nodeId: node.id,
      status: 'success',
      output,
      durationMs: finishedAt - startedAt,
      startedAt,
      finishedAt,
    };

    emitNodeEvent(ctx.runId, node.id, 'success', result);
    return result;
  } catch (error) {
    const finishedAt = Date.now();
    const result: NodeRunResult = {
      nodeId: node.id,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      durationMs: finishedAt - startedAt,
      startedAt,
      finishedAt,
    };
    emitNodeEvent(ctx.runId, node.id, 'failed', result);
    return result;
  }
}

// ── 主执行函数 ──────────────────────────────────────────

export async function runWorkflow(
  workflow: WorkflowDefinition,
  triggerInput?: Record<string, unknown>,
): Promise<{ runId: string; results: Record<string, NodeRunResult> }> {
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const ctx: ExecutionContext = {
    runId,
    workflow,
    nodeResults: {},
    variables: { ...(workflow.globalVariables ?? {}), ...(triggerInput ?? {}) },
    startedAt: Date.now(),
    aborted: false,
    rpc: _gatewayRpc,
  };

  activeRuns.set(runId, ctx);

  try {
    const layers = topologicalSort(workflow.nodes, workflow.edges);
    const nodeMap = new Map(workflow.nodes.map((n) => [n.id, n]));

    for (const layer of layers) {
      if (ctx.aborted) break;

      // 同一层的节点可以并行执行
      const promises = layer.map(async (nodeId) => {
        if (ctx.aborted) return;

        const node = nodeMap.get(nodeId);
        if (!node) return;

        // 检查是否应该被跳过：
        // 1. 直接上游是 branch 且该边不是被选中的分支
        // 2. 任一上游节点已经被 skipped（跳过传播）
        const incomingEdges = workflow.edges.filter((e) => e.target === nodeId);
        let shouldSkip = false;

        for (const edge of incomingEdges) {
          const sourceResult = ctx.nodeResults[edge.source];
          const sourceNode = nodeMap.get(edge.source);

          // Case 1: 直接上游是 branch，检查是否选中了该边
          if (
            sourceNode?.data.type === 'logic' &&
            sourceNode.data.logicConfig?.logicType === 'branch' &&
            sourceResult?.output
          ) {
            const matchedHandle = sourceResult.output.matchedHandle as string;
            if (edge.sourceHandle && edge.sourceHandle !== matchedHandle) {
              shouldSkip = true;
            }
          }

          // Case 2: 上游节点已被跳过 → 传播跳过
          if (sourceResult?.status === 'skipped') {
            shouldSkip = true;
          }
        }

        if (shouldSkip) {
          const skippedResult: NodeRunResult = {
            nodeId,
            status: 'skipped',
            startedAt: Date.now(),
            finishedAt: Date.now(),
            durationMs: 0,
          };
          ctx.nodeResults[nodeId] = skippedResult;
          emitNodeEvent(ctx.runId, nodeId, 'skipped', skippedResult);
          return;
        }

        const result = await executeNode(node, ctx, workflow.edges);
        ctx.nodeResults[nodeId] = result;
      });

      await Promise.all(promises);
    }

    const hasFailure = Object.values(ctx.nodeResults).some((r) => r.status === 'failed');
    emitComplete(runId, !hasFailure);

    return { runId, results: ctx.nodeResults };
  } catch (error) {
    emitComplete(runId, false, error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    activeRuns.delete(runId);
  }
}

// ── 停止工作流 ──────────────────────────────────────────

export function stopWorkflow(runId: string) {
  const ctx = activeRuns.get(runId);
  if (ctx) {
    ctx.aborted = true;
    emitComplete(runId, false, 'Workflow was manually stopped');
  }
}

// ── 导出用于 IPC handler ────────────────────────────────

export { topologicalSort, getNestedValue, interpolateTemplate, evaluateCondition };
