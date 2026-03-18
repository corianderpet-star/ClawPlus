/**
 * Workflows Page
 *
 * 可视化工作流编排页面，包含：
 *   - 左侧：节点调色板 + 工作流列表
 *   - 中间：React Flow 画布
 *   - 右侧：选中节点的属性配置面板
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Play,
  Square,
  Save,
  Plus,
  Trash2,
  Zap,
  Bot,
  Sparkles,
  GitBranch,
  Send,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  ArrowDownUp,
  ArrowLeftRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAgentsStore } from '@/stores/agents';
import { useGatewayStore } from '@/stores/gateway';

import {
  useWorkflowStore,
  generateNodeId,
  type WorkflowNode,
  type WorkflowEdge,
} from '@/stores/workflow';
import type { WorkflowNodeData, WorkflowNodeType, WorkflowDefinition } from '@/types/workflow';

import { NodeConfigPanel } from './NodeConfigPanel';
import { LayoutDirectionProvider, type LayoutDirection } from './LayoutDirectionContext';
import { autoLayoutWorkflow } from './autoLayout';
import { WorkflowGenerateDialog } from './WorkflowGenerateDialog';
import { workflowNodeTypes } from './nodeTypes';

// ── 调色板数据 ───────────────────────────────────────────

interface PaletteItem {
  type: WorkflowNodeType;
  labelKey: string;
  descKey: string;
  icon: React.ReactNode;
  color: string;
}

const paletteItemDefs: PaletteItem[] = [
  {
    type: 'trigger',
    labelKey: 'palette.trigger',
    descKey: 'palette.triggerDesc',
    icon: <Zap className="h-4 w-4" />,
    color: 'text-orange-500',
  },
  {
    type: 'agent',
    labelKey: 'palette.agent',
    descKey: 'palette.agentDesc',
    icon: <Bot className="h-4 w-4" />,
    color: 'text-blue-500',
  },
  {
    type: 'skill',
    labelKey: 'palette.skill',
    descKey: 'palette.skillDesc',
    icon: <Sparkles className="h-4 w-4" />,
    color: 'text-teal-500',
  },
  {
    type: 'logic',
    labelKey: 'palette.logic',
    descKey: 'palette.logicDesc',
    icon: <GitBranch className="h-4 w-4" />,
    color: 'text-purple-500',
  },
  {
    type: 'output',
    labelKey: 'palette.output',
    descKey: 'palette.outputDesc',
    icon: <Send className="h-4 w-4" />,
    color: 'text-green-500',
  },
];

// ── 默认节点数据工厂 ─────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TranslateFn = (...args: any[]) => any;

function createDefaultNodeData(type: WorkflowNodeType, t: TranslateFn): WorkflowNodeData {
  switch (type) {
    case 'trigger':
      return {
        type: 'trigger',
        label: t('nodeLabel.trigger', 'Trigger'),
        triggerConfig: { type: 'manual' },
      };
    case 'agent':
      return {
        type: 'agent',
        label: t('nodeLabel.agent', 'Agent'),
        agentConfig: { agentId: '', inputMappings: [] },
      };
    case 'skill':
      return {
        type: 'skill',
        label: t('nodeLabel.skill', 'Skill'),
        skillConfig: { skillId: '', inputMappings: [] },
      };
    case 'logic':
      return {
        type: 'logic',
        label: t('nodeLabel.branch', 'Branch'),
        logicConfig: { logicType: 'branch', conditions: [], defaultHandle: 'default' },
      };
    case 'output':
      return {
        type: 'output',
        label: t('nodeLabel.output', 'Output'),
        outputConfig: { channelType: '', messageTemplate: '', inputMappings: [] },
      };
  }
}

// ── 内置教学模板工作流 ID ──────────────────────────────────

const TEMPLATE_WORKFLOW_ID = 'wf_builtin_tutorial';

/**
 * 生成内置教学模板工作流
 * 演示: 触发器 → AI 分析 Agent → 情绪分支 → 积极/消极处理
 */
function createTutorialWorkflow(t: TranslateFn): WorkflowDefinition {
  return {
    id: TEMPLATE_WORKFLOW_ID,
    name: t('template.name', '📖 Tutorial: Getting Started'),
    description: t('template.description', 'A built-in tutorial workflow demonstrating Trigger → Agent → Branch basics'),
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    nodes: [
      {
        id: 'tpl_trigger',
        type: 'trigger',
        position: { x: 300, y: 40 },
        data: {
          type: 'trigger',
          label: t('template.triggerLabel', 'User Input'),
          description: t('template.triggerDesc', 'Manual trigger — click Run to start the workflow'),
          emoji: '🚀',
          triggerConfig: { type: 'manual' },
        },
      },
      {
        id: 'tpl_agent_analyze',
        type: 'agent',
        position: { x: 300, y: 200 },
        data: {
          type: 'agent',
          label: t('template.agentLabel', 'AI Analysis'),
          emoji: '🤖',
          agentConfig: {
            agentId: '',
            promptTemplate: t('template.agentPrompt', 'Analyze the user input and determine its sentiment. Reply with a JSON object: {"sentiment": "positive" | "negative" | "neutral", "summary": "..."}'),
            inputMappings: [],
            timeoutSeconds: 30,
          },
        },
      },
      {
        id: 'tpl_branch',
        type: 'logic',
        position: { x: 300, y: 400 },
        data: {
          type: 'logic',
          label: t('template.branchLabel', 'Sentiment Router'),
          emoji: '🔀',
          logicConfig: {
            logicType: 'branch',
            conditions: [
              {
                id: 'cond_positive',
                label: t('template.positiveLabel', 'Positive Path'),
                field: 'sentiment',
                operator: 'equals',
                value: 'positive',
                targetHandle: 'handle_positive',
              },
              {
                id: 'cond_negative',
                label: t('template.negativeLabel', 'Negative Path'),
                field: 'sentiment',
                operator: 'equals',
                value: 'negative',
                targetHandle: 'handle_negative',
              },
            ],
            defaultHandle: 'handle_default',
          },
        },
      },
      {
        id: 'tpl_agent_positive',
        type: 'agent',
        position: { x: 100, y: 600 },
        data: {
          type: 'agent',
          label: t('template.positiveAgent', 'Positive Handler'),
          emoji: '😊',
          agentConfig: {
            agentId: '',
            promptTemplate: t('template.positivePrompt', 'The user expressed a positive sentiment. Generate an encouraging response.'),
            inputMappings: [
              { sourceNodeId: 'tpl_agent_analyze', sourceField: 'response', targetVariable: 'analysisResult' },
            ],
          },
        },
      },
      {
        id: 'tpl_agent_negative',
        type: 'agent',
        position: { x: 500, y: 600 },
        data: {
          type: 'agent',
          label: t('template.negativeAgent', 'Negative Handler'),
          emoji: '🤗',
          agentConfig: {
            agentId: '',
            promptTemplate: t('template.negativePrompt', 'The user expressed a negative sentiment. Generate a sympathetic and helpful response.'),
            inputMappings: [
              { sourceNodeId: 'tpl_agent_analyze', sourceField: 'response', targetVariable: 'analysisResult' },
            ],
          },
        },
      },
      {
        id: 'tpl_output',
        type: 'output',
        position: { x: 300, y: 800 },
        data: {
          type: 'output',
          label: t('template.outputLabel', 'Send to Channel'),
          emoji: '📤',
          outputConfig: {
            channelType: '',
            messageTemplate: t('template.outputMessage', 'Analysis Result:\n\nSentiment: {{sentiment}}\nSummary: {{summary}}'),
            inputMappings: [
              { sourceNodeId: 'tpl_agent_positive', sourceField: 'response', targetVariable: 'positiveReply' },
              { sourceNodeId: 'tpl_agent_negative', sourceField: 'response', targetVariable: 'negativeReply' },
            ],
          },
        },
      },
    ],
    edges: [
      { id: 'tpl_e1', source: 'tpl_trigger', target: 'tpl_agent_analyze' },
      { id: 'tpl_e2', source: 'tpl_agent_analyze', target: 'tpl_branch' },
      { id: 'tpl_e3', source: 'tpl_branch', target: 'tpl_agent_positive', sourceHandle: 'handle_positive' },
      { id: 'tpl_e4', source: 'tpl_branch', target: 'tpl_agent_negative', sourceHandle: 'handle_negative' },
      { id: 'tpl_e5', source: 'tpl_agent_positive', target: 'tpl_output' },
      { id: 'tpl_e6', source: 'tpl_agent_negative', target: 'tpl_output' },
    ],
  };
}

// ── WorkflowCanvas 内部组件 ──────────────────────────────

function WorkflowCanvas() {
  const { t } = useTranslation('workflows');
  const reactFlowRef = useRef<ReactFlowInstance<WorkflowNode, WorkflowEdge> | null>(null);

  // Store
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange);
  const onConnect = useWorkflowStore((s) => s.onConnect);
  const addNode = useWorkflowStore((s) => s.addNode);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const workflows = useWorkflowStore((s) => s.workflows);
  const currentWorkflowId = useWorkflowStore((s) => s.currentWorkflowId);
  const createWorkflow = useWorkflowStore((s) => s.createWorkflow);
  const importWorkflow = useWorkflowStore((s) => s.importWorkflow);
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow);
  const saveWorkflow = useWorkflowStore((s) => s.saveWorkflow);
  const deleteWorkflow = useWorkflowStore((s) => s.deleteWorkflow);
  const fetchWorkflows = useWorkflowStore((s) => s.fetchWorkflows);
  const runWorkflow = useWorkflowStore((s) => s.runWorkflow);
  const stopWorkflow = useWorkflowStore((s) => s.stopWorkflow);
  const isRunning = useWorkflowStore((s) => s.isRunning);
  const saving = useWorkflowStore((s) => s.saving);
  const agents = useAgentsStore((s) => s.agents);
  const currentAgentId = useAgentsStore((s) => s.currentAgentId);
  const agentsLoaded = useAgentsStore((s) => s.isLoaded);
  const loadAgents = useAgentsStore((s) => s.loadAgents);
  const gatewayStatus = useGatewayStore((s) => s.status);

  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [showTriggerInput, setShowTriggerInput] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [triggerMessage, setTriggerMessage] = useState('');
  const [layoutDirection, setLayoutDirection] = useState<LayoutDirection>('TB');

  /**
   * 保存、运行和切换方向前都走同一套自动排版，
   * 让层级、分支和执行路径更容易阅读。
   */
  const autoLayout = useCallback(
    (dir: LayoutDirection) => {
      const { nodes: currentNodes, edges: currentEdges } = useWorkflowStore.getState();
      if (currentNodes.length === 0) return;

      const newNodes = autoLayoutWorkflow(currentNodes, currentEdges, dir);

      useWorkflowStore.setState({ nodes: newNodes });

      setTimeout(() => {
        reactFlowRef.current?.fitView({ padding: 0.18, duration: 350 });
      }, 50);
    },
    [],
  );

  const handleToggleDirection = useCallback(() => {
    const newDir = layoutDirection === 'TB' ? 'LR' : 'TB';
    setLayoutDirection(newDir);
    autoLayout(newDir);
  }, [layoutDirection, autoLayout]);

  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null),
    [selectedNodeId, nodes],
  );

  // 加载工作流列表
  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  useEffect(() => {
    if (!agentsLoaded) {
      loadAgents().catch(() => {});
    }
  }, [agentsLoaded, loadAgents]);

  useEffect(() => {
    if (!currentWorkflowId || nodes.length === 0) return;

    const timer = setTimeout(() => {
      reactFlowRef.current?.fitView({ padding: 0.18, duration: 350 });
    }, 80);

    return () => clearTimeout(timer);
  }, [currentWorkflowId, nodes.length]);

  // 注入内置教学模板工作流 (仅在列表为空或模板不存在时添加)
  useEffect(() => {
    const { workflows: wfs } = useWorkflowStore.getState();
    if (!wfs.find((w) => w.id === TEMPLATE_WORKFLOW_ID)) {
      const tutorial = createTutorialWorkflow(t);
      useWorkflowStore.setState({
        workflows: [tutorial, ...wfs],
      });
    }
  }, [t, workflows.length]);

  // 监听主进程的节点状态更新事件
  useEffect(() => {
    const updateNodeRunStatus = useWorkflowStore.getState().updateNodeRunStatus;

    const unsubNodeEvent = window.electron.ipcRenderer.on(
      'workflow:nodeEvent',
      (event: unknown) => {
        const { nodeId, status, result } = event as {
          runId: string;
          nodeId: string;
          status: string;
          result?: import('@/types/workflow').NodeRunResult;
        };
        updateNodeRunStatus(nodeId, status as import('@/types/workflow').NodeRunStatus, result);
      },
    );

    const unsubComplete = window.electron.ipcRenderer.on(
      'workflow:complete',
      (event: unknown) => {
        const { success, error } = event as { runId: string; success: boolean; error?: string };
        useWorkflowStore.setState({ isRunning: false });
        if (success) {
          toast.success(t('workflowCompleted', 'Workflow completed'));
        } else {
          toast.error(error || t('workflowFailed', 'Workflow failed'));
        }
      },
    );

    return () => {
      if (typeof unsubNodeEvent === 'function') unsubNodeEvent();
      if (typeof unsubComplete === 'function') unsubComplete();
    };
  }, [t]);

  // 节点选中监听
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      setSelectedNode(node.id);
    },
    [setSelectedNode],
  );

  const handlePaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  // 从调色板拖拽放置节点
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/workflow-node') as WorkflowNodeType;
      if (!type || !reactFlowRef.current) return;

      const position = reactFlowRef.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: WorkflowNode = {
        id: generateNodeId(),
        type,
        position,
        data: createDefaultNodeData(type, t),
      };

      addNode(newNode);
    },
    [addNode, t],
  );

  // 创建新工作流
  const handleCreateWorkflow = () => {
    const name = newWorkflowName.trim() || `Workflow ${workflows.length + 1}`;
    createWorkflow(name);
    setNewWorkflowName('');
    toast.success(t('workflowCreated', 'Workflow created'));
  };

  // 保存
  const handleSave = async () => {
    autoLayout(layoutDirection);
    await saveWorkflow();
    toast.success(t('workflowSaved', 'Workflow saved'));
  };

  const handleImportGeneratedWorkflow = async (workflow: WorkflowDefinition) => {
    const importedId = await importWorkflow(workflow);
    if (!importedId) {
      throw new Error(t('generateImportFailed', 'Failed to import workflow'));
    }
    setShowGenerateDialog(false);
    toast.success(t('generateImported', 'Generated workflow imported'));
  };

  // 运行/停止
  const handleRunStop = () => {
    if (isRunning) {
      stopWorkflow();
    } else {
      autoLayout(layoutDirection);
      // 检查是否有 manual trigger 节点 → 弹出输入框
      const hasTrigger = nodes.some(
        (n) => (n.data as WorkflowNodeData).type === 'trigger' &&
          (n.data as WorkflowNodeData).triggerConfig?.type === 'manual',
      );
      if (hasTrigger) {
        setShowTriggerInput(true);
        setTriggerMessage('');
      } else {
        runWorkflow();
      }
    }
  };

  // 确认触发：带用户输入运行工作流
  const handleTriggerConfirm = () => {
    setShowTriggerInput(false);
    runWorkflow({ message: triggerMessage, input: triggerMessage });
  };

  return (
    <div className="flex h-full w-full">
      {/* ── 左侧面板：调色板 + 工作流列表 ──────────────── */}
      <div
        className={cn(
          'flex flex-col border-r bg-background transition-all duration-200',
          leftPanelOpen ? 'w-60' : 'w-0 overflow-hidden',
        )}
      >
        {leftPanelOpen && (
          <>
            {/* Node palette */}
            <div className="border-b p-3">
              <h4 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t('nodePalette', 'Node Palette')}
              </h4>
              <div className="space-y-1.5">
                {paletteItemDefs.map((item) => (
                  <div
                    key={item.type}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/workflow-node', item.type);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    className="flex cursor-grab items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2 text-sm transition-colors hover:bg-muted active:cursor-grabbing"
                  >
                    <div className={cn('shrink-0', item.color)}>{item.icon}</div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium">{t(item.labelKey)}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{t(item.descKey)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Workflow list */}
            <div className="flex-1 overflow-y-auto p-3">
              <h4 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t('workflows', 'Workflows')}
              </h4>
              <div className="space-y-1">
                {workflows.map((wf) => (
                  <button
                    key={wf.id}
                    onClick={() => loadWorkflow(wf.id)}
                    className={cn(
                      'group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors',
                      currentWorkflowId === wf.id
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <span className="truncate">{wf.name}</span>
                      {wf.id === TEMPLATE_WORKFLOW_ID && (
                        <span className="shrink-0 rounded bg-orange-100 px-1 py-0.5 text-[9px] font-semibold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                          {t('template.badge', 'Template')}
                        </span>
                      )}
                    </span>
                    {wf.id !== TEMPLATE_WORKFLOW_ID && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteWorkflow(wf.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </button>
                ))}
              </div>
              {/* New workflow input */}
              <div className="mt-3 flex gap-1">
                <Input
                  className="h-7 text-xs"
                  placeholder={t('newWorkflowName', 'New workflow...')}
                  value={newWorkflowName}
                  onChange={(e) => setNewWorkflowName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateWorkflow()}
                />
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleCreateWorkflow}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Left panel toggle */}
      <button
        onClick={() => setLeftPanelOpen(!leftPanelOpen)}
        className="flex w-5 items-center justify-center border-r bg-muted/30 hover:bg-muted transition-colors"
      >
        {leftPanelOpen ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>

      {/* ── 中央：React Flow 画布 ─────────────────────── */}
      <div className="relative flex-1">
        {/* Toolbar */}
        <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border bg-background/95 p-1.5 shadow-sm backdrop-blur">
          <Button
            variant={isRunning ? 'destructive' : 'default'}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleRunStop}
            disabled={!currentWorkflowId}
          >
            {isRunning ? (
              <>
                <Square className="h-3 w-3" /> {t('stop', 'Stop')}
              </>
            ) : (
              <>
                <Play className="h-3 w-3" /> {t('run', 'Run')}
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setShowGenerateDialog(true)}
          >
            <Sparkles className="h-3 w-3" />
            {t('generate', 'Generate')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleSave}
            disabled={!currentWorkflowId || saving}
          >
            <Save className="h-3 w-3" />
            {saving ? t('saving', 'Saving...') : t('save', 'Save')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleToggleDirection}
            title={layoutDirection === 'TB' ? t('switchToHorizontal', 'Horizontal layout') : t('switchToVertical', 'Vertical layout')}
          >
            {layoutDirection === 'TB' ? <ArrowLeftRight className="h-3 w-3" /> : <ArrowDownUp className="h-3 w-3" />}
          </Button>
        </div>

        {/* Canvas or empty state */}
        {currentWorkflowId ? (
          <LayoutDirectionProvider value={layoutDirection}>
          <ReactFlow
            key={currentWorkflowId}
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onInit={(instance) => { reactFlowRef.current = instance; }}
            nodeTypes={workflowNodeTypes}
            defaultEdgeOptions={{ type: 'smoothstep', animated: false }}
            fitView
            snapToGrid
            snapGrid={[16, 16]}
            className="bg-dots-pattern workflow-canvas"
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} />
            <Controls className="!border !bg-background/90 !shadow-sm" />
            <MiniMap
              className="!border !bg-background/90 !shadow-sm"
              nodeColor={(n) => {
                switch (n.type) {
                  case 'trigger':
                    return '#f97316';
                  case 'agent':
                    return '#3b82f6';
                  case 'skill':
                    return '#14b8a6';
                  case 'logic':
                    return '#a855f7';
                  case 'output':
                    return '#22c55e';
                  default:
                    return '#6b7280';
                }
              }}
            />
          </ReactFlow>
          </LayoutDirectionProvider>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <FolderOpen className="mb-3 h-12 w-12 opacity-30" />
            <p className="text-sm">{t('noWorkflowSelected', 'Create or select a workflow to start')}</p>
            <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={handleCreateWorkflow}>
              <Plus className="h-4 w-4" />
              {t('createWorkflow', 'New Workflow')}
            </Button>
          </div>
        )}
      </div>

      {/* ── 右侧：节点配置面板 ────────────────────────── */}
      {selectedNode && <NodeConfigPanel node={selectedNode} />}

      {/* ── 触发器输入对话框 ─────────────────────────── */}
      {showTriggerInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[480px] rounded-xl border bg-background p-6 shadow-2xl">
            <h3 className="text-base font-semibold">{t('triggerInputTitle', 'Workflow Input')}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('triggerInputDesc', 'Enter the message to trigger this workflow with:')}
            </p>
            <textarea
              className="mt-3 h-32 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder={t('triggerInputPlaceholder', 'Type your input message here...')}
              value={triggerMessage}
              onChange={(e) => setTriggerMessage(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleTriggerConfirm();
                }
              }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowTriggerInput(false)}>
                {t('cancel', 'Cancel')}
              </Button>
              <Button size="sm" onClick={handleTriggerConfirm}>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                {t('run', 'Run')}
              </Button>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground text-right">
              Ctrl+Enter {t('triggerInputShortcut', 'to run')}
            </p>
          </div>
        </div>
      )}

      <WorkflowGenerateDialog
        open={showGenerateDialog}
        agents={agents}
        defaultAgentId={currentAgentId}
        canGenerate={gatewayStatus.state === 'running'}
        onClose={() => setShowGenerateDialog(false)}
        onImport={handleImportGeneratedWorkflow}
      />
    </div>
  );
}

// ── 导出：用 ReactFlowProvider 包裹 ─────────────────────

export function Workflows() {
  return (
    <ReactFlowProvider>
      <WorkflowCanvas />
    </ReactFlowProvider>
  );
}
