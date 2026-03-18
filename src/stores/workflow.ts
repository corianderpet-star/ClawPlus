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

  loadWorkflow: (id) => {
    const workflow = get().workflows.find((w) => w.id === id);
    if (!workflow) return;
    set({
      currentWorkflowId: id,
      nodes: workflow.nodes.map((n) => ({
        ...n,
        data: { ...n.data, runStatus: undefined },
      })) as WorkflowNode[],
      edges: workflow.edges as WorkflowEdge[],
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
              nodes: nodes.map((n) => ({
                id: n.id,
                type: n.type!,
                position: n.position,
                data: n.data,
              })),
              edges: edges.map((e) => ({
                id: e.id,
                source: e.source,
                target: e.target,
                sourceHandle: e.sourceHandle ?? undefined,
                targetHandle: e.targetHandle ?? undefined,
                label: typeof e.label === 'string' ? e.label : undefined,
              })),
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
          nodes: nodes.map((n) => ({
            id: n.id,
            type: n.type!,
            position: n.position,
            data: n.data,
          })),
          edges: edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle ?? undefined,
            targetHandle: e.targetHandle ?? undefined,
          })),
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
