/**
 * 工作流核心数据结构定义
 *
 * 描述 DAG 图的节点 (Node)、边 (Edge)、整体 Schema，
 * 以及节点间上下文流转的数据格式。
 */

// ── 节点类型枚举 ─────────────────────────────────────────────

/** 工作流节点类型 */
export type WorkflowNodeType = 'trigger' | 'agent' | 'skill' | 'logic' | 'output';

// ── 触发器配置 ─────────────────────────────────────────────

/** 触发器类型 */
export type TriggerType = 'manual' | 'cron' | 'webhook' | 'event';

export interface TriggerConfig {
  type: TriggerType;
  /** Cron 表达式 (type=cron 时) */
  cronExpression?: string;
  /** Webhook URL (type=webhook 时) */
  webhookPath?: string;
  /** 事件名 (type=event 时) */
  eventName?: string;
}

// ── Agent 节点配置 ──────────────────────────────────────────

/** 输入变量映射：上游节点输出 → 本节点输入 */
export interface VariableMapping {
  /** 来源节点 ID */
  sourceNodeId: string;
  /** 来源节点输出字段路径 (JSONPath-like) */
  sourceField: string;
  /** 目标输入变量名 */
  targetVariable: string;
}

export interface AgentNodeConfig {
  /** 关联的 OpenClaw Agent ID */
  agentId: string;
  /** 覆盖默认模型 (可选) */
  modelOverride?: string;
  /** 传给 Agent 的提示词模板，支持 {{variable}} 插值 */
  promptTemplate?: string;
  /** 输入变量映射 */
  inputMappings: VariableMapping[];
  /** 超时时间 (秒) */
  timeoutSeconds?: number;
  /** 重试次数 */
  retryCount?: number;
}

// ── 逻辑分支配置 ────────────────────────────────────────────

/** 分支条件 */
export interface BranchCondition {
  /** 条件 ID */
  id: string;
  /** 条件标签 (用于显示) */
  label: string;
  /** 字段路径 */
  field: string;
  /** 操作符 */
  operator: 'equals' | 'notEquals' | 'contains' | 'greaterThan' | 'lessThan' | 'isEmpty' | 'isNotEmpty';
  /** 比较值 */
  value: string;
  /** 匹配后走向的 Handle ID */
  targetHandle: string;
}

export interface LogicNodeConfig {
  /** 逻辑类型 */
  logicType: 'branch' | 'merge' | 'delay';
  /** 分支条件 (logicType=branch) */
  conditions?: BranchCondition[];
  /** 默认分支 Handle ID (无条件匹配时) */
  defaultHandle?: string;
  /** 延迟秒数 (logicType=delay) */
  delaySeconds?: number;
}

// ── 输出节点配置 ──────────────────────────────────────────

export interface OutputNodeConfig {
  /** 目标频道类型 (如 telegram, qqbot, discord 等) */
  channelType: string;
  /** 频道账号 ID (多账号场景) */
  channelAccountId?: string;
  /** 实际发送目标 (用户 / 群 / 频道 ID)，为空时回退到频道默认目标 */
  deliveryTarget?: string;
  /** 绑定的 Agent ID (用于通过该 agent 发送消息到频道) */
  agentId?: string;
  /** 消息模板，支持 {{variable}} 插值，引用上游节点输出 */
  messageTemplate: string;
  /** 输入变量映射 */
  inputMappings: VariableMapping[];
}

// ── Skill 节点配置 ──────────────────────────────────────────

export interface SkillNodeConfig {
  /** 关联的 Skill ID (slug) */
  skillId: string;
  /** 通过哪个 Agent 执行 skill */
  agentId?: string;
  /** 提示词模板: 告诉 Agent 如何使用该 skill，支持 {{variable}} 插值 */
  promptTemplate?: string;
  /** 输入变量映射 */
  inputMappings: VariableMapping[];
  /** 超时时间 (秒) */
  timeoutSeconds?: number;
  /** 重试次数 */
  retryCount?: number;
}

// ── 工作流节点数据 ──────────────────────────────────────────

/** 通用节点数据 (存储在 React Flow 的 node.data 中) */
export interface WorkflowNodeData {
  /** 允许索引访问 (React Flow 兼容) */
  [key: string]: unknown;
  /** 节点类型 */
  type: WorkflowNodeType;
  /** 显示标签 */
  label: string;
  /** 描述 */
  description?: string;
  /** Emoji 图标 */
  emoji?: string;
  /** 触发器配置 (type=trigger) */
  triggerConfig?: TriggerConfig;
  /** Agent 配置 (type=agent) */
  agentConfig?: AgentNodeConfig;
  /** Skill 配置 (type=skill) */
  skillConfig?: SkillNodeConfig;
  /** 逻辑配置 (type=logic) */
  logicConfig?: LogicNodeConfig;
  /** 输出配置 (type=output) */
  outputConfig?: OutputNodeConfig;
  /** 运行状态 (执行时由引擎更新) */
  runStatus?: NodeRunStatus;
  /** 运行结果详情 (执行时由引擎更新) */
  runResult?: NodeRunResult;
}

// ── 运行状态 ────────────────────────────────────────────────

export type NodeRunStatus = 'idle' | 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface NodeRunResult {
  nodeId: string;
  status: NodeRunStatus;
  /** Agent 执行的输出 (JSON) */
  output?: Record<string, unknown>;
  /** 错误信息 */
  error?: string;
  /** 执行耗时 (ms) */
  durationMs?: number;
  /** 开始时间 */
  startedAt?: number;
  /** 结束时间 */
  finishedAt?: number;
}

// ── 工作流整体 Schema ──────────────────────────────────────

export interface WorkflowDefinition {
  /** 唯一标识 */
  id: string;
  /** 名称 */
  name: string;
  /** 描述 */
  description?: string;
  /** 版本号 */
  version: number;
  /** 创建时间 */
  createdAt: number;
  /** 最后修改时间 */
  updatedAt: number;
  /** React Flow 节点数组 (序列化格式) */
  nodes: SerializedNode[];
  /** React Flow 边数组 */
  edges: SerializedEdge[];
  /** 全局变量 */
  globalVariables?: Record<string, string>;
}

/** 序列化的节点 (存储用) */
export interface SerializedNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

/** 序列化的边 (存储用) */
export interface SerializedEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  type?: string;
  animated?: boolean;
}

// ── 执行上下文 ──────────────────────────────────────────────

/** 工作流执行上下文：在节点间传递的全局状态 */
export interface WorkflowExecutionContext {
  /** 本次执行 ID */
  runId: string;
  /** 工作流定义 */
  workflow: WorkflowDefinition;
  /** 各节点的执行结果 (nodeId → result) */
  nodeResults: Record<string, NodeRunResult>;
  /** 全局变量 */
  variables: Record<string, unknown>;
  /** 执行开始时间 */
  startedAt: number;
}

// ── IPC 通信接口 ────────────────────────────────────────────

/** 前端 → 主进程：执行工作流请求 */
export interface WorkflowRunRequest {
  workflow: WorkflowDefinition;
  /** 触发器输入参数 */
  triggerInput?: Record<string, unknown>;
}

/** 主进程 → 前端：节点状态更新事件 */
export interface WorkflowNodeEvent {
  runId: string;
  nodeId: string;
  status: NodeRunStatus;
  result?: NodeRunResult;
}

/** 主进程 → 前端：工作流完成事件 */
export interface WorkflowCompleteEvent {
  runId: string;
  success: boolean;
  results: Record<string, NodeRunResult>;
  durationMs: number;
}

export interface WorkflowGenerationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface WorkflowGenerationSkillOption {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
}

export interface WorkflowGenerationApprovalDecision {
  approvalId: string;
  approved: boolean;
}

export interface WorkflowGenerationApproval {
  id: string;
  kind: 'skill';
  title: string;
  description: string;
  nodeId?: string;
  nodeLabel?: string;
  skillId?: string;
  skillName?: string;
  available?: boolean;
}

export interface WorkflowGenerationRequest {
  agentId: string;
  messages: WorkflowGenerationMessage[];
  approvalDecisions?: WorkflowGenerationApprovalDecision[];
  availableSkills?: WorkflowGenerationSkillOption[];
}

export interface WorkflowGenerationResult {
  success: boolean;
  workflow?: WorkflowDefinition;
  assistantReply?: string;
  warnings?: string[];
  approvals?: WorkflowGenerationApproval[];
  requiresApproval?: boolean;
  draftMode?: 'agent' | 'fallback';
  error?: string;
}
