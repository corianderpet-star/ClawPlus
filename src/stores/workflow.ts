/**
 * 工作流画布状态管理 (Zustand)
 *
 * 管理 React Flow 画布的节点、边、选中状态，
 * 以及工作流的保存/加载/执行逻辑。
 */
import { create } from 'zustand';
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react';
import type {
  WorkflowDefinition,
  WorkflowNodeData,
  NodeRunStatus,
  NodeRunResult,
} from '@/types/workflow';
import { invokeIpc } from '@/lib/api-client';

// ── 工作流节点 & 边 的 React Flow 泛型类型 ──────────────

export type WorkflowNode = Node<WorkflowNodeData>;
export type WorkflowEdge = Edge;

// ── Store 接口 ──────────────────────────────────────────

interface WorkflowState {
  // ── 画布状态 ────────────────────────────────────────
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeId: string | null;

  // ── 工作流列表 ──────────────────────────────────────
  workflows: WorkflowDefinition[];
  currentWorkflowId: string | null;
  loading: boolean;
  saving: boolean;

  // ── 执行状态 ─────────────────────────────────────────
  isRunning: boolean;
  runId: string | null;
  nodeResults: Record<string, NodeRunResult>;

  // ── 画布操作 (React Flow 回调) ──────────────────────
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  // ── 节点操作 ─────────────────────────────────────────
  addNode: (node: WorkflowNode) => void;
  updateNodeData: (nodeId: string, data: Partial<WorkflowNodeData>) => void;
  removeNode: (nodeId: string) => void;
  setSelectedNode: (nodeId: string | null) => void;

  // ── 工作流 CRUD ─────────────────────────────────────
  createWorkflow: (name: string, description?: string) => string;
  importWorkflow: (workflow: WorkflowDefinition) => Promise<string | null>;
  loadWorkflow: (id: string) => void;
  saveWorkflow: () => Promise<void>;
  deleteWorkflow: (id: string) => void;
  fetchWorkflows: () => Promise<void>;

  // ── 执行控制 ─────────────────────────────────────────
  runWorkflow: (triggerInput?: Record<string, unknown>) => Promise<void>;
  stopWorkflow: () => void;
  updateNodeRunStatus: (nodeId: string, status: NodeRunStatus, result?: NodeRunResult) => void;
  clearRunResults: () => void;
}

// ── 唯一 ID 生成器 ──────────────────────────────────────

let nodeIdCounter = 0;
export function generateNodeId(): string {
  return `node_${Date.now()}_${++nodeIdCounter}`;
}

function clearRuntimeState(data: WorkflowNodeData): WorkflowNodeData {
  return {
    ...data,
    runStatus: undefined,
    runResult: undefined,
  };
}

function serializeNodes(nodes: WorkflowNode[]): WorkflowDefinition['nodes'] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type!,
    position: node.position,
    data: clearRuntimeState(node.data),
  }));
}

function serializeEdges(edges: WorkflowEdge[]): WorkflowDefinition['edges'] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
    label: typeof edge.label === 'string' ? edge.label : undefined,
    type: typeof edge.type === 'string' ? edge.type : 'smoothstep',
    animated: typeof edge.animated === 'boolean' ? edge.animated : false,
  }));
}

function hydrateNodes(nodes: WorkflowDefinition['nodes']): WorkflowNode[] {
  return nodes.map((node) => ({
    ...node,
    data: clearRuntimeState(node.data),
  })) as WorkflowNode[];
}

function hydrateEdges(edges: WorkflowDefinition['edges']): WorkflowEdge[] {
  return edges.map((edge) => ({
    ...edge,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
    label: edge.label ?? undefined,
    type: typeof edge.type === 'string' ? edge.type : 'smoothstep',
    animated: typeof edge.animated === 'boolean' ? edge.animated : false,
  })) as WorkflowEdge[];
}

function ensureUniqueWorkflowId(baseId: string, workflows: WorkflowDefinition[]): string {
  let candidate = baseId;
  let suffix = 1;

  while (workflows.some((workflow) => workflow.id === candidate)) {
    candidate = `${baseId}_${suffix++}`;
  }

  return candidate;
}

function prepareImportedWorkflow(
  workflow: WorkflowDefinition,
  existingWorkflows: WorkflowDefinition[],
): WorkflowDefinition {
  const now = Date.now();
  const baseId = workflow.id?.trim() || `wf_${now}`;
  const id = ensureUniqueWorkflowId(baseId, existingWorkflows);

  return {
    ...workflow,
    id,
    name: workflow.name?.trim() || `Workflow ${existingWorkflows.length + 1}`,
    description: workflow.description?.trim() || undefined,
    version: 1,
    createdAt: now,
    updatedAt: now,
    nodes: serializeNodes(hydrateNodes(workflow.nodes)),
    edges: serializeEdges(hydrateEdges(workflow.edges)),
  };
}

// ── Store 实现 ──────────────────────────────────────────

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  // 初始状态
  nodes: [],
  edges: [],
  selectedNodeId: null,
  workflows: [],
  currentWorkflowId: null,
  loading: false,
  saving: false,
  isRunning: false,
  runId: null,
  nodeResults: {},

  // ── React Flow 回调 ─────────────────────────────────

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) as WorkflowNode[] });
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },

  onConnect: (connection) => {
    set({ edges: addEdge({ ...connection, id: `edge_${Date.now()}` }, get().edges) });
  },

  // ── 节点操作 ─────────────────────────────────────────

  addNode: (node) => {
    set({ nodes: [...get().nodes, node] });
  },

  updateNodeData: (nodeId, data) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n,
      ),
    });
  },

  removeNode: (nodeId) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== nodeId),
      edges: get().edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNodeId: get().selectedNodeId === nodeId ? null : get().selectedNodeId,
    });
  },

  setSelectedNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  // ── 工作流 CRUD ─────────────────────────────────────

  createWorkflow: (name, description) => {
    const id = `wf_${Date.now()}`;
    const now = Date.now();
    const workflow: WorkflowDefinition = {
      id,
      name,
      description,
      version: 1,
      createdAt: now,
      updatedAt: now,
      nodes: [],
      edges: [],
    };
    set({
      workflows: [...get().workflows, workflow],
      currentWorkflowId: id,
      nodes: [],
      edges: [],
      selectedNodeId: null,
      nodeResults: {},
    });
    return id;
  },

  importWorkflow: async (workflow) => {
    const existingWorkflows = get().workflows;
    const importedWorkflow = prepareImportedWorkflow(workflow, existingWorkflows);
    const nextWorkflows = [...existingWorkflows, importedWorkflow];

    set({
      saving: true,
      workflows: nextWorkflows,
      currentWorkflowId: importedWorkflow.id,
      nodes: hydrateNodes(importedWorkflow.nodes),
      edges: hydrateEdges(importedWorkflow.edges),
      selectedNodeId: null,
      nodeResults: {},
    });

    try {
      await invokeIpc('workflow:save', { workflows: nextWorkflows }).catch(() => {
        // 如果 IPC 尚未注册，静默忽略
      });
      return importedWorkflow.id;
    } finally {
      set({ saving: false });
    }
  },

  loadWorkflow: (id) => {
    const workflow = get().workflows.find((w) => w.id === id);
    if (!workflow) return;
    set({
      currentWorkflowId: id,
      nodes: hydrateNodes(workflow.nodes),
      edges: hydrateEdges(workflow.edges),
      selectedNodeId: null,
      nodeResults: {},
    });
  },

  saveWorkflow: async () => {
    const { currentWorkflowId, nodes, edges, workflows } = get();
    if (!currentWorkflowId) return;
    set({ saving: true });
    try {
      const updated = workflows.map((w) =>
        w.id === currentWorkflowId
          ? {
              ...w,
              updatedAt: Date.now(),
              version: w.version + 1,
              nodes: serializeNodes(nodes),
              edges: serializeEdges(edges),
            }
          : w,
      );
      set({ workflows: updated });
      // 持久化到主进程
      await invokeIpc('workflow:save', { workflows: updated }).catch(() => {
        // 如果 IPC 尚未注册，静默忽略
      });
    } finally {
      set({ saving: false });
    }
  },

  deleteWorkflow: (id) => {
    set({
      workflows: get().workflows.filter((w) => w.id !== id),
      ...(get().currentWorkflowId === id
        ? { currentWorkflowId: null, nodes: [], edges: [], selectedNodeId: null }
        : {}),
    });
  },

  fetchWorkflows: async () => {
    set({ loading: true });
    try {
      const result = await invokeIpc('workflow:list').catch(() => [] as WorkflowDefinition[]);
      if (Array.isArray(result)) {
        set({ workflows: result as WorkflowDefinition[] });
      }
    } finally {
      set({ loading: false });
    }
  },

  // ── 执行控制 ─────────────────────────────────────────

  runWorkflow: async (triggerInput) => {
    const { currentWorkflowId, nodes, edges, workflows } = get();
    if (!currentWorkflowId || get().isRunning) return;

    const workflow = workflows.find((w) => w.id === currentWorkflowId);
    if (!workflow) return;

    const runId = `run_${Date.now()}`;
    set({ isRunning: true, runId, nodeResults: {} });

    // 重置所有节点状态
    set({
      nodes: nodes.map((n) => ({
        ...n,
        data: { ...n.data, runStatus: 'pending' as NodeRunStatus },
      })),
    });

    try {
      // 通过 IPC 发送到主进程执行
      await invokeIpc('workflow:run', {
        workflow: {
          ...workflow,
          nodes: serializeNodes(nodes),
          edges: serializeEdges(edges),
        },
        triggerInput: triggerInput ?? {},
      });
    } catch (error) {
      console.error('Workflow execution failed:', error);
    } finally {
      set({ isRunning: false });
    }
  },

  stopWorkflow: () => {
    const { runId } = get();
    if (runId) {
      invokeIpc('workflow:stop', { runId }).catch(() => {});
    }
    set({ isRunning: false });
  },

  updateNodeRunStatus: (nodeId, status, result) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, runStatus: status, runResult: result } } : n,
      ),
      nodeResults: result
        ? { ...get().nodeResults, [nodeId]: result }
        : get().nodeResults,
    });
  },

  clearRunResults: () => {
    set({
      nodeResults: {},
      nodes: get().nodes.map((n) => ({
        ...n,
        data: { ...n.data, runStatus: undefined, runResult: undefined },
      })),
    });
  },
}));
