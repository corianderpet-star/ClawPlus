import { listAgentsFromConfig } from '../../utils/agent-config';
import { orchestrator } from './orchestration';

type WorkflowNodeType = 'trigger' | 'agent' | 'skill' | 'logic' | 'output';
type TriggerType = 'manual' | 'cron' | 'webhook' | 'event';
type LogicType = 'branch' | 'merge' | 'delay';
type BranchOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'greaterThan'
  | 'lessThan'
  | 'isEmpty'
  | 'isNotEmpty';

type WorkflowGenerationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type WorkflowGenerationSkillOption = {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
};

type WorkflowGenerationApprovalDecision = {
  approvalId: string;
  approved: boolean;
};

type WorkflowGenerationApproval = {
  id: string;
  kind: 'skill';
  title: string;
  description: string;
  nodeId?: string;
  nodeLabel?: string;
  skillId?: string;
  skillName?: string;
  available?: boolean;
};

type WorkflowGenerationRequest = {
  agentId: string;
  messages: WorkflowGenerationMessage[];
  approvalDecisions?: WorkflowGenerationApprovalDecision[];
  availableSkills?: WorkflowGenerationSkillOption[];
};

type VariableMapping = {
  sourceNodeId: string;
  sourceField: string;
  targetVariable: string;
};

type WorkflowNodeData = {
  type: WorkflowNodeType;
  label: string;
  description?: string;
  emoji?: string;
  triggerConfig?: {
    type: TriggerType;
    cronExpression?: string;
    webhookPath?: string;
    eventName?: string;
  };
  agentConfig?: {
    agentId: string;
    modelOverride?: string;
    promptTemplate?: string;
    inputMappings: VariableMapping[];
    timeoutSeconds?: number;
    retryCount?: number;
  };
  skillConfig?: {
    skillId: string;
    agentId?: string;
    promptTemplate?: string;
    inputMappings: VariableMapping[];
    timeoutSeconds?: number;
    retryCount?: number;
  };
  logicConfig?: {
    logicType: LogicType;
    conditions?: Array<{
      id: string;
      label: string;
      field: string;
      operator: BranchOperator;
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
    inputMappings: VariableMapping[];
  };
};

type WorkflowNode = {
  id: string;
  type: WorkflowNodeType;
  position: { x: number; y: number };
  data: WorkflowNodeData;
};

type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  type?: string;
  animated?: boolean;
};

type WorkflowDefinition = {
  id: string;
  name: string;
  description?: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  globalVariables?: Record<string, string>;
};

type WorkflowGenerationResult = {
  success: boolean;
  workflow?: WorkflowDefinition;
  assistantReply?: string;
  warnings?: string[];
  approvals?: WorkflowGenerationApproval[];
  requiresApproval?: boolean;
  draftMode?: 'agent' | 'fallback';
  error?: string;
};

const VALID_NODE_TYPES = new Set<WorkflowNodeType>(['trigger', 'agent', 'skill', 'logic', 'output']);
const VALID_TRIGGER_TYPES = new Set<TriggerType>(['manual', 'cron', 'webhook', 'event']);
const VALID_LOGIC_TYPES = new Set<LogicType>(['branch', 'merge', 'delay']);
const VALID_BRANCH_OPERATORS = new Set<BranchOperator>([
  'equals',
  'notEquals',
  'contains',
  'greaterThan',
  'lessThan',
  'isEmpty',
  'isNotEmpty',
]);
const SUPPORTED_CHANNEL_TYPES = [
  'telegram',
  'discord',
  'qqbot',
  'whatsapp',
  'dingtalk',
  'feishu',
  'signal',
  'slack',
  'msteams',
];

function buildSkillApprovalId(nodeId: string, skillId: string): string {
  return `skill:${nodeId}:${skillId}`;
}

function deriveSuggestedSkillId(label: string, description?: string, promptTemplate?: string): string {
  const combined = `${label} ${description || ''} ${promptTemplate || ''}`.toLowerCase();

  if (combined.includes('公众号') || combined.includes('wechat official') || combined.includes('official account')) {
    return 'publish-wechat-official-account';
  }
  if (combined.includes('小红书') || combined.includes('xiaohongshu') || combined.includes('rednote')) {
    return 'publish-xiaohongshu';
  }
  if (combined.includes('telegram')) {
    return 'publish-telegram';
  }
  if (combined.includes('discord')) {
    return 'publish-discord';
  }
  if (combined.includes('发布') || combined.includes('publish') || combined.includes('post')) {
    return 'publish-content';
  }

  const slug = combined
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return slug || 'proposed-skill';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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
      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
      // Ignore malformed JSON fragments.
    }
  }

  return null;
}

function buildConversation(messages: WorkflowGenerationMessage[]): string {
  return messages
    .map((message) => `${message.role === 'user' ? '用户' : '助手'}: ${message.content}`)
    .join('\n\n');
}

function guessChannelType(text: string): string {
  const normalized = text.toLowerCase();
  if (normalized.includes('qq')) return 'qqbot';
  if (normalized.includes('telegram')) return 'telegram';
  if (normalized.includes('discord')) return 'discord';
  if (normalized.includes('whatsapp')) return 'whatsapp';
  if (normalized.includes('钉钉') || normalized.includes('dingtalk')) return 'dingtalk';
  if (normalized.includes('飞书') || normalized.includes('feishu') || normalized.includes('lark')) return 'feishu';
  if (normalized.includes('slack')) return 'slack';
  if (normalized.includes('teams')) return 'msteams';
  if (normalized.includes('signal')) return 'signal';
  return '';
}

function deriveWorkflowName(userRequest: string): string {
  const cleaned = userRequest
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim();

  if (!cleaned) return 'AI 生成工作流';
  return cleaned.length > 18 ? `${cleaned.slice(0, 18)}...` : cleaned;
}

function buildPrompt(
  request: WorkflowGenerationRequest,
  availableAgents: Array<{ id: string; name: string; description?: string }>,
  availableSkills: WorkflowGenerationSkillOption[],
): string {
  const availableAgentText = availableAgents
    .map((agent) => `- ${agent.id} | ${agent.name}${agent.description ? ` | ${agent.description}` : ''}`)
    .join('\n');
  const availableSkillText = availableSkills.length
    ? availableSkills
      .map((skill) => `- ${skill.id} | ${skill.name}${skill.description ? ` | ${skill.description}` : ''}`)
      .join('\n')
    : '- none';

  return [
    '你是 ClawPlus 的工作流设计助手，需要根据对话直接产出一个“可导入、可预览”的工作流草稿。',
    '请尽量满足用户要求，同时保持流程图简单、直白、节点命名清晰。',
    '严格要求：只输出 JSON，不要 Markdown，不要代码块，不要额外解释。',
    '返回结构必须符合下面格式：',
    '{',
    '  "assistantReply": "对用户的简短说明",',
    '  "warnings": ["可选修正说明"],',
    '  "workflow": {',
    '    "name": "工作流名称",',
    '    "description": "工作流描述",',
    '    "nodes": [',
    '      {',
    '        "id": "trigger_1",',
    '        "type": "trigger",',
    '        "position": { "x": 0, "y": 0 },',
    '        "data": {',
    '          "type": "trigger",',
    '          "label": "用户输入",',
    '          "description": "说明文本",',
    '          "triggerConfig": { "type": "manual" }',
    '        }',
    '      }',
    '    ],',
    '    "edges": [',
    '      { "id": "edge_1", "source": "trigger_1", "target": "agent_1" }',
    '    ]',
    '  }',
    '}',
    '',
    '只允许使用这些节点类型：trigger, agent, skill, logic, output。',
    'trigger.triggerConfig.type 只允许：manual, cron, webhook, event。',
    'logic.logicConfig.logicType 只允许：branch, merge, delay。',
    'branch 条件 operator 只允许：equals, notEquals, contains, greaterThan, lessThan, isEmpty, isNotEmpty。',
    `output.channelType 只允许使用这些值之一或空字符串：${SUPPORTED_CHANNEL_TYPES.join(', ')}。`,
    '如果用户没有明确要求触发方式，默认用 manual trigger。',
    '如果用户没有明确要求发送渠道，output.channelType 可以为空字符串。',
    '如果需要 agent 节点，请优先使用现有智能体 ID；如果用户没有指定，默认使用当前选中的生成智能体。',
    '尽量少用节点，除非用户明确需要分支、延时、技能或多路输出。',
    '',
    `当前选中的生成智能体 ID：${request.agentId}`,
    '当前可用的智能体列表：',
    `${availableAgentText}\n\n当前可用的 skill 列表：\n${availableSkillText}`,
    'If the workflow needs external tools, publishing, retrieval, or channel-specific operations, prefer a skill node over a generic agent node.',
    'If an existing skill matches, reuse its exact skillId from the available skill list.',
    'If no existing skill matches, you may still propose a new skill node with a descriptive skillId. The UI will require user approval before import.',
    '',
    '下面是完整对话，请据此生成最新版本的工作流：',
    buildConversation(request.messages),
  ].join('\n');
}

function sanitizeInputMappings(value: unknown): VariableMapping[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const sourceNodeId = asTrimmedString(entry.sourceNodeId);
      const sourceField = asTrimmedString(entry.sourceField);
      const targetVariable = asTrimmedString(entry.targetVariable);
      if (!sourceNodeId || !sourceField || !targetVariable) return null;
      return { sourceNodeId, sourceField, targetVariable };
    })
    .filter((entry): entry is VariableMapping => !!entry);
}

function sanitizeNodeData(
  rawType: WorkflowNodeType,
  rawData: unknown,
  preferredAgentId: string,
  availableAgentIds: Set<string>,
  warnings: string[],
): { type: WorkflowNodeType; data: WorkflowNodeData } {
  const data = isRecord(rawData) ? rawData : {};
  const label = asTrimmedString(data.label) || {
    trigger: '触发器',
    agent: '智能体',
    skill: '技能',
    logic: '逻辑判断',
    output: '输出',
  }[rawType];

  const common = {
    type: rawType,
    label,
    description: asTrimmedString(data.description),
    emoji: asTrimmedString(data.emoji),
  };

  if (rawType === 'trigger') {
    const triggerConfig = isRecord(data.triggerConfig) ? data.triggerConfig : {};
    const triggerType = asTrimmedString(triggerConfig.type);
    return {
      type: 'trigger',
      data: {
        ...common,
        type: 'trigger',
        triggerConfig: {
          type: triggerType && VALID_TRIGGER_TYPES.has(triggerType as TriggerType)
            ? triggerType as TriggerType
            : 'manual',
          cronExpression: asTrimmedString(triggerConfig.cronExpression),
          webhookPath: asTrimmedString(triggerConfig.webhookPath),
          eventName: asTrimmedString(triggerConfig.eventName),
        },
      },
    };
  }

  if (rawType === 'logic') {
    const logicConfig = isRecord(data.logicConfig) ? data.logicConfig : {};
    const logicType = asTrimmedString(logicConfig.logicType);
    const resolvedLogicType = logicType && VALID_LOGIC_TYPES.has(logicType as LogicType)
      ? logicType as LogicType
      : 'branch';

    const conditions = Array.isArray(logicConfig.conditions)
      ? logicConfig.conditions
        .map((condition, index) => {
          if (!isRecord(condition)) return null;
          const field = asTrimmedString(condition.field) || 'response';
          const operator = asTrimmedString(condition.operator);
          return {
            id: asTrimmedString(condition.id) || `cond_${index + 1}`,
            label: asTrimmedString(condition.label) || `条件 ${index + 1}`,
            field,
            operator: operator && VALID_BRANCH_OPERATORS.has(operator as BranchOperator)
              ? operator as BranchOperator
              : 'contains',
            value: asTrimmedString(condition.value) || '',
            targetHandle: asTrimmedString(condition.targetHandle) || `handle_branch_${index + 1}`,
          };
        })
        .filter((condition): condition is NonNullable<typeof condition> => !!condition)
      : [];

    return {
      type: 'logic',
      data: {
        ...common,
        type: 'logic',
        logicConfig: {
          logicType: resolvedLogicType,
          conditions,
          defaultHandle: asTrimmedString(logicConfig.defaultHandle) || 'handle_default',
          delaySeconds: asNumber(logicConfig.delaySeconds),
        },
      },
    };
  }

  if (rawType === 'output') {
    const outputConfig = isRecord(data.outputConfig) ? data.outputConfig : {};
    const channelType = asTrimmedString(outputConfig.channelType) || '';
    const agentId = asTrimmedString(outputConfig.agentId);
    return {
      type: 'output',
      data: {
        ...common,
        type: 'output',
        outputConfig: {
          channelType: channelType && SUPPORTED_CHANNEL_TYPES.includes(channelType) ? channelType : '',
          channelAccountId: asTrimmedString(outputConfig.channelAccountId),
          deliveryTarget: asTrimmedString(outputConfig.deliveryTarget),
          agentId: agentId && availableAgentIds.has(agentId) ? agentId : preferredAgentId,
          messageTemplate: asTrimmedString(outputConfig.messageTemplate) || '{{response}}',
          inputMappings: sanitizeInputMappings(outputConfig.inputMappings),
        },
      },
    };
  }

  if (rawType === 'skill') {
    const skillConfig = isRecord(data.skillConfig) ? data.skillConfig : {};
    const skillId = asTrimmedString(skillConfig.skillId)
      || deriveSuggestedSkillId(
        label,
        asTrimmedString(data.description),
        asTrimmedString(skillConfig.promptTemplate) || asTrimmedString(data.promptTemplate),
      );
    if (!skillId) {
      warnings.push(`技能节点“${label}”缺少 skillId，已自动转为智能体节点。`);
      return {
        type: 'agent',
        data: {
          ...common,
          type: 'agent',
          agentConfig: {
            agentId: preferredAgentId,
            promptTemplate: asTrimmedString(skillConfig.promptTemplate) || asTrimmedString(data.promptTemplate),
            inputMappings: sanitizeInputMappings(skillConfig.inputMappings),
            timeoutSeconds: asNumber(skillConfig.timeoutSeconds),
            retryCount: asNumber(skillConfig.retryCount),
          },
        },
      };
    }

    if (!asTrimmedString(skillConfig.skillId)) {
      warnings.push(`技能节点“${label}”缺少 skillId，已自动补全为 ${skillId}，导入前需要你审批。`);
    }

    const skillAgentId = asTrimmedString(skillConfig.agentId);
    return {
      type: 'skill',
      data: {
        ...common,
        type: 'skill',
        skillConfig: {
          skillId,
          agentId: skillAgentId && availableAgentIds.has(skillAgentId) ? skillAgentId : preferredAgentId,
          promptTemplate: asTrimmedString(skillConfig.promptTemplate),
          inputMappings: sanitizeInputMappings(skillConfig.inputMappings),
          timeoutSeconds: asNumber(skillConfig.timeoutSeconds),
          retryCount: asNumber(skillConfig.retryCount),
        },
      },
    };
  }

  const agentConfig = isRecord(data.agentConfig) ? data.agentConfig : {};
  const agentId = asTrimmedString(agentConfig.agentId);
  return {
    type: 'agent',
    data: {
      ...common,
      type: 'agent',
      agentConfig: {
        agentId: agentId && availableAgentIds.has(agentId) ? agentId : preferredAgentId,
        modelOverride: asTrimmedString(agentConfig.modelOverride),
        promptTemplate: asTrimmedString(agentConfig.promptTemplate),
        inputMappings: sanitizeInputMappings(agentConfig.inputMappings),
        timeoutSeconds: asNumber(agentConfig.timeoutSeconds),
        retryCount: asNumber(agentConfig.retryCount),
      },
    },
  };
}

function buildFallbackWorkflow(
  request: WorkflowGenerationRequest,
  lastUserMessage: string,
): {
  workflow: WorkflowDefinition;
  assistantReply: string;
  warnings: string[];
  approvals?: WorkflowGenerationApproval[];
} {
  const now = Date.now();
  const channelType = guessChannelType(lastUserMessage);
  const workflowId = `wf_ai_${now}`;
  const workflow: WorkflowDefinition = {
    id: workflowId,
    name: deriveWorkflowName(lastUserMessage),
    description: lastUserMessage || '根据需求自动生成的基础工作流草稿',
    version: 1,
    createdAt: now,
    updatedAt: now,
    nodes: [
      {
        id: 'trigger_1',
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: {
          type: 'trigger',
          label: '开始',
          description: '手动触发生成的流程草稿',
          triggerConfig: { type: 'manual' },
        },
      },
      {
        id: 'agent_1',
        type: 'agent',
        position: { x: 0, y: 0 },
        data: {
          type: 'agent',
          label: '需求处理',
          description: '由所选智能体执行核心处理逻辑',
          agentConfig: {
            agentId: request.agentId,
            promptTemplate: lastUserMessage
              ? `请根据以下需求执行任务，并给出结构清晰的结果：\n${lastUserMessage}`
              : '请根据触发输入完成任务，并返回结构清晰的结果。',
            inputMappings: [],
          },
        },
      },
      {
        id: 'output_1',
        type: 'output',
        position: { x: 0, y: 0 },
        data: {
          type: 'output',
          label: channelType ? '发送结果' : '结果输出',
          description: channelType ? '将结果发送到指定频道' : '保留一个可配置的输出节点',
          outputConfig: {
            channelType,
            agentId: request.agentId,
            messageTemplate: '{{response}}',
            inputMappings: [],
          },
        },
      },
    ],
    edges: [
      { id: 'edge_1', source: 'trigger_1', target: 'agent_1', type: 'smoothstep', animated: false },
      { id: 'edge_2', source: 'agent_1', target: 'output_1', type: 'smoothstep', animated: false },
    ],
  };

  return {
    workflow,
    assistantReply: '我先根据你的描述生成了一个基础工作流草稿，你可以继续补充要求让我细化。',
    warnings: ['当前返回了基础草稿；如需更贴合业务的分支和节点，请继续补充需求。'],
  };
}

function sanitizeWorkflow(
  rawPayload: Record<string, unknown>,
  request: WorkflowGenerationRequest,
  lastUserMessage: string,
  availableAgentIds: Set<string>,
): {
  workflow: WorkflowDefinition;
  assistantReply: string;
  warnings: string[];
  approvals?: WorkflowGenerationApproval[];
} {
  const warnings = Array.isArray(rawPayload.warnings)
    ? rawPayload.warnings.map((warning) => String(warning)).filter(Boolean)
    : [];
  const availableSkills = request.availableSkills ?? [];
  const availableSkillMap = new Map(availableSkills.map((skill) => [skill.id, skill]));
  const availableSkillIds = new Set(availableSkills.map((skill) => skill.id));
  const approvalDecisionMap = new Map(
    (request.approvalDecisions ?? []).map((decision) => [decision.approvalId, decision.approved]),
  );
  const approvals: WorkflowGenerationApproval[] = [];
  const payloadWorkflow = isRecord(rawPayload.workflow) ? rawPayload.workflow : rawPayload;
  const now = Date.now();
  const rawNodes = Array.isArray(payloadWorkflow.nodes) ? payloadWorkflow.nodes : [];
  const rawEdges = Array.isArray(payloadWorkflow.edges) ? payloadWorkflow.edges : [];
  const nodeIds = new Set<string>();
  const originalToNormalizedId = new Map<string, string>();
  const nodes: WorkflowNode[] = [];

  for (let index = 0; index < rawNodes.length; index += 1) {
    const rawNode = rawNodes[index];
    if (!isRecord(rawNode)) continue;

    const rawType = asTrimmedString(rawNode.type) || asTrimmedString(isRecord(rawNode.data) ? rawNode.data.type : undefined);
    if (!rawType || !VALID_NODE_TYPES.has(rawType as WorkflowNodeType)) continue;

    const originalId = asTrimmedString(rawNode.id) || `${rawType}_${index + 1}`;
    let normalizedId = originalId;
    let suffix = 1;
    while (nodeIds.has(normalizedId)) {
      normalizedId = `${originalId}_${suffix++}`;
    }
    nodeIds.add(normalizedId);
    originalToNormalizedId.set(originalId, normalizedId);

    const sanitized = sanitizeNodeData(
      rawType as WorkflowNodeType,
      rawNode.data,
      request.agentId,
      availableAgentIds,
      warnings,
    );

    nodes.push({
      id: normalizedId,
      type: sanitized.type,
      position: { x: 0, y: 0 },
      data: sanitized.data,
    });
  }

  if (!nodes.length) {
    warnings.push('模型没有返回可用节点，已退回到基础草稿。');
    return buildFallbackWorkflow(request, lastUserMessage);
  }

  const edges: WorkflowEdge[] = [];
  const edgeIds = new Set<string>();
  for (let index = 0; index < rawEdges.length; index += 1) {
    const rawEdge = rawEdges[index];
    if (!isRecord(rawEdge)) continue;

    const source = asTrimmedString(rawEdge.source);
    const target = asTrimmedString(rawEdge.target);
    if (!source || !target) continue;

    const normalizedSource = originalToNormalizedId.get(source) || source;
    const normalizedTarget = originalToNormalizedId.get(target) || target;
    if (!nodeIds.has(normalizedSource) || !nodeIds.has(normalizedTarget) || normalizedSource === normalizedTarget) {
      continue;
    }

    const baseEdgeId = asTrimmedString(rawEdge.id) || `edge_${index + 1}`;
    let edgeId = baseEdgeId;
    let suffix = 1;
    while (edgeIds.has(edgeId)) {
      edgeId = `${baseEdgeId}_${suffix++}`;
    }
    edgeIds.add(edgeId);

    edges.push({
      id: edgeId,
      source: normalizedSource,
      target: normalizedTarget,
      sourceHandle: asTrimmedString(rawEdge.sourceHandle),
      targetHandle: asTrimmedString(rawEdge.targetHandle),
      label: asTrimmedString(rawEdge.label),
      type: 'smoothstep',
      animated: false,
    });
  }

  for (const node of nodes) {
    if (node.data.agentConfig) {
      node.data.agentConfig.inputMappings = node.data.agentConfig.inputMappings
        .map((mapping) => ({
          ...mapping,
          sourceNodeId: originalToNormalizedId.get(mapping.sourceNodeId) || mapping.sourceNodeId,
        }))
        .filter((mapping) => nodeIds.has(mapping.sourceNodeId));
    }

    if (node.data.skillConfig) {
      node.data.skillConfig.inputMappings = node.data.skillConfig.inputMappings
        .map((mapping) => ({
          ...mapping,
          sourceNodeId: originalToNormalizedId.get(mapping.sourceNodeId) || mapping.sourceNodeId,
        }))
        .filter((mapping) => nodeIds.has(mapping.sourceNodeId));
    }

    if (node.data.outputConfig) {
      node.data.outputConfig.inputMappings = node.data.outputConfig.inputMappings
        .map((mapping) => ({
          ...mapping,
          sourceNodeId: originalToNormalizedId.get(mapping.sourceNodeId) || mapping.sourceNodeId,
        }))
        .filter((mapping) => nodeIds.has(mapping.sourceNodeId));
    }
  }

  for (const node of nodes) {
    if (node.type !== 'skill' || !node.data.skillConfig?.skillId) continue;

    const skillConfig = node.data.skillConfig;
    const skillId = skillConfig.skillId;
    const approvalId = buildSkillApprovalId(node.id, skillId);
    const approvalDecision = approvalDecisionMap.get(approvalId);
    const skillAvailable = availableSkillIds.size === 0 ? undefined : availableSkillIds.has(skillId);

    if (approvalDecision === false) {
      node.type = 'agent';
      node.data = {
        type: 'agent',
        label: node.data.label,
        description: node.data.description,
        emoji: node.data.emoji,
        agentConfig: {
          agentId: skillConfig.agentId && availableAgentIds.has(skillConfig.agentId)
            ? skillConfig.agentId
            : request.agentId,
          promptTemplate: skillConfig.promptTemplate
            || `请完成原本计划由技能 ${skillId} 处理的任务，并返回清晰结果。`,
          inputMappings: skillConfig.inputMappings,
          timeoutSeconds: skillConfig.timeoutSeconds,
          retryCount: skillConfig.retryCount,
        },
      };
      warnings.push(`你拒绝了技能“${skillId}”，节点“${node.data.label}”已改为智能体节点。`);
      continue;
    }

    if (approvalDecision === true && skillAvailable === false) {
      warnings.push(`你同意新增技能“${skillId}”，但它当前还不在已启用 skill 列表中，导入后仍需补齐该技能。`);
      continue;
    }

    if (approvalDecision !== true) {
      const knownSkill = availableSkillMap.get(skillId);
      approvals.push({
        id: approvalId,
        kind: 'skill',
        title: `建议为节点“${node.data.label}”使用技能`,
        description: skillAvailable === false
          ? `节点“${node.data.label}”建议调用技能 ${skillId}，但它当前不在已启用技能列表中。请先确认是否保留这个技能节点。`
          : `节点“${node.data.label}”建议使用技能 ${skillId} 来完成外部能力调用，导入前需要你的批准。`,
        nodeId: node.id,
        nodeLabel: node.data.label,
        skillId,
        skillName: knownSkill?.name,
        available: skillAvailable,
      });
    }
  }

  if (!nodes.some((node) => node.type === 'trigger')) {
    const triggerId = 'trigger_generated';
    nodes.unshift({
      id: triggerId,
      type: 'trigger',
      position: { x: 0, y: 0 },
      data: {
        type: 'trigger',
        label: '开始',
        description: '自动补齐的手动触发器',
        triggerConfig: { type: 'manual' },
      },
    });
    nodeIds.add(triggerId);
    warnings.push('原始结果缺少触发器，已自动补齐一个手动触发节点。');
  }

  if (!edges.length && nodes.length > 1) {
    for (let index = 0; index < nodes.length - 1; index += 1) {
      edges.push({
        id: `edge_auto_${index + 1}`,
        source: nodes[index].id,
        target: nodes[index + 1].id,
        type: 'smoothstep',
        animated: false,
      });
    }
    warnings.push('原始结果缺少有效连线，已按节点顺序自动补齐。');
  }

  const triggerNode = nodes.find((node) => node.type === 'trigger');
  if (triggerNode) {
    const hasTriggerOutgoing = edges.some((edge) => edge.source === triggerNode.id);
    const firstNonTrigger = nodes.find((node) => node.id !== triggerNode.id);
    if (!hasTriggerOutgoing && firstNonTrigger) {
      edges.unshift({
        id: 'edge_trigger_start',
        source: triggerNode.id,
        target: firstNonTrigger.id,
        type: 'smoothstep',
        animated: false,
      });
      warnings.push('已将触发器连接到流程的首个执行节点。');
    }
  }

  const workflow: WorkflowDefinition = {
    id: `wf_ai_${now}`,
    name: asTrimmedString(payloadWorkflow.name) || deriveWorkflowName(lastUserMessage),
    description: asTrimmedString(payloadWorkflow.description) || lastUserMessage || 'AI 生成的工作流草稿',
    version: 1,
    createdAt: now,
    updatedAt: now,
    nodes,
    edges,
  };

  return {
    workflow,
    assistantReply: asTrimmedString(rawPayload.assistantReply)
      || '已根据你的要求生成一个工作流草稿，你可以继续补充修改意见。',
    warnings,
    approvals,
  };
}

export async function generateWorkflowDraft(
  request: WorkflowGenerationRequest,
): Promise<WorkflowGenerationResult> {
  const normalizedMessages = request.messages
    .filter((message) => message && typeof message.content === 'string')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content.trim(),
    }))
    .filter((message) => message.content);

  if (!request.agentId || !normalizedMessages.some((message) => message.role === 'user')) {
    return {
      success: false,
      error: '请先选择一个智能体，并输入至少一条需求。',
    };
  }

  const availableAgents = (await listAgentsFromConfig()).map((agent) => ({
    id: agent.id,
    name: agent.name || agent.id,
    description: asTrimmedString(agent.description),
  }));
  const availableAgentIds = new Set(availableAgents.map((agent) => agent.id));
  availableAgentIds.add(request.agentId);
  const lastUserMessage = [...normalizedMessages].reverse().find((message) => message.role === 'user')?.content || '';

  try {
    const prompt = buildPrompt(
      {
        agentId: request.agentId,
        messages: normalizedMessages,
        approvalDecisions: request.approvalDecisions,
        availableSkills: request.availableSkills,
      },
      availableAgents,
      request.availableSkills ?? [],
    );

    const generationResult = await orchestrator.executeAgent({
      agentId: request.agentId,
      message: prompt,
      sessionKey: `agent:${request.agentId}:workflow-generator-${Date.now()}`,
      timeoutMs: 120000,
      idempotencyKey: `workflow-generator-${Date.now()}`,
    });

    if (generationResult.success && generationResult.response) {
      const parsed = parseStructuredResponse(generationResult.response);
      if (parsed) {
        const sanitized = sanitizeWorkflow(parsed, request, lastUserMessage, availableAgentIds);
        return {
          success: true,
          workflow: sanitized.workflow,
          assistantReply: sanitized.assistantReply,
          warnings: sanitized.warnings,
          approvals: sanitized.approvals ?? [],
          requiresApproval: (sanitized.approvals?.length ?? 0) > 0,
          draftMode: 'agent',
        };
      }

      const fallback = buildFallbackWorkflow(request, lastUserMessage);
      return {
        success: true,
        workflow: fallback.workflow,
        assistantReply: fallback.assistantReply,
        warnings: [
          '智能体回复不是合法 JSON，已退回到基础草稿。',
          ...fallback.warnings,
        ],
        approvals: fallback.approvals ?? [],
        requiresApproval: (fallback.approvals?.length ?? 0) > 0,
        draftMode: 'fallback',
      };
    }

    const fallback = buildFallbackWorkflow(request, lastUserMessage);
    return {
      success: true,
      workflow: fallback.workflow,
      assistantReply: fallback.assistantReply,
      warnings: [
        generationResult.error || '当前无法调用智能体，已按你的需求生成基础草稿。',
        ...fallback.warnings,
      ],
      approvals: fallback.approvals ?? [],
      requiresApproval: (fallback.approvals?.length ?? 0) > 0,
      draftMode: 'fallback',
    };
  } catch (error) {
    const fallback = buildFallbackWorkflow(request, lastUserMessage);
    return {
      success: true,
      workflow: fallback.workflow,
      assistantReply: fallback.assistantReply,
      warnings: [
        error instanceof Error ? error.message : String(error),
        ...fallback.warnings,
      ],
      approvals: fallback.approvals ?? [],
      requiresApproval: (fallback.approvals?.length ?? 0) > 0,
      draftMode: 'fallback',
    };
  }
}
