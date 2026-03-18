import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type ReactFlowInstance,
} from '@xyflow/react';
import {
  AlertCircle,
  Bot,
  Check,
  Download,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { invokeIpc, toUserMessage } from '@/lib/api-client';
import { useSkillsStore } from '@/stores/skills';
import type { Agent } from '@/types/agent';
import type {
  WorkflowDefinition,
  WorkflowGenerationApproval,
  WorkflowGenerationApprovalDecision,
  WorkflowGenerationMessage,
  WorkflowGenerationResult,
  WorkflowGenerationSkillOption,
} from '@/types/workflow';
import type { WorkflowEdge, WorkflowNode } from '@/stores/workflow';
import { useTranslation } from 'react-i18next';
import { LayoutDirectionProvider } from './LayoutDirectionContext';
import { autoLayoutWorkflow } from './autoLayout';
import { workflowNodeTypes } from './nodeTypes';

interface WorkflowGenerateDialogProps {
  open: boolean;
  agents: Agent[];
  defaultAgentId?: string;
  canGenerate: boolean;
  onClose: () => void;
  onImport: (workflow: WorkflowDefinition) => Promise<void>;
}

type ChatMessage = WorkflowGenerationMessage & {
  id: string;
  warnings?: string[];
};

function createMessageId(role: ChatMessage['role']): string {
  return `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePreviewEdges(edges: WorkflowDefinition['edges']): WorkflowEdge[] {
  return edges.map((edge) => ({
    ...edge,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
    label: edge.label ?? undefined,
    type: typeof edge.type === 'string' ? edge.type : 'smoothstep',
    animated: typeof edge.animated === 'boolean' ? edge.animated : false,
  })) as WorkflowEdge[];
}

function applyPreviewLayout(workflow: WorkflowDefinition): {
  workflow: WorkflowDefinition;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
} {
  const previewNodes = workflow.nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      runStatus: undefined,
      runResult: undefined,
    },
  })) as WorkflowNode[];
  const previewEdges = normalizePreviewEdges(workflow.edges);
  const laidOutNodes = autoLayoutWorkflow(previewNodes, previewEdges, 'TB');

  return {
    workflow: {
      ...workflow,
      nodes: laidOutNodes.map((node) => ({
        id: node.id,
        type: node.type!,
        position: node.position,
        data: node.data,
      })),
      edges: previewEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? undefined,
        targetHandle: edge.targetHandle ?? undefined,
        label: typeof edge.label === 'string' ? edge.label : undefined,
        type: typeof edge.type === 'string' ? edge.type : 'smoothstep',
        animated: typeof edge.animated === 'boolean' ? edge.animated : false,
      })),
    },
    nodes: laidOutNodes,
    edges: previewEdges,
  };
}

export function WorkflowGenerateDialog({
  open,
  agents,
  defaultAgentId,
  canGenerate,
  onClose,
  onImport,
}: WorkflowGenerateDialogProps) {
  const { t } = useTranslation('workflows');
  const previewRef = useRef<ReactFlowInstance<WorkflowNode, WorkflowEdge> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const wasOpenRef = useRef(false);
  const skills = useSkillsStore((state) => state.skills);
  const fetchSkills = useSkillsStore((state) => state.fetchSkills);

  const availableAgents = useMemo(
    () => (
      agents.length > 0
        ? agents
        : [{ id: 'main', name: 'Main Agent', isMain: true } satisfies Agent]
    ),
    [agents],
  );
  const availableSkills = useMemo<WorkflowGenerationSkillOption[]>(
    () =>
      skills
        .filter((skill) => skill.enabled)
        .map((skill) => ({
          id: skill.slug || skill.id,
          name: skill.name,
          description: skill.description || undefined,
          enabled: skill.enabled,
        })),
    [skills],
  );
  const availableSkillMap = useMemo(
    () => new Map(availableSkills.map((skill) => [skill.id, skill])),
    [availableSkills],
  );

  const [selectedAgentId, setSelectedAgentId] = useState(defaultAgentId || availableAgents[0]?.id || 'main');
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [previewWorkflow, setPreviewWorkflow] = useState<WorkflowDefinition | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [approvals, setApprovals] = useState<WorkflowGenerationApproval[]>([]);
  const [approvalDecisions, setApprovalDecisions] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const preparedPreview = useMemo(
    () => (previewWorkflow ? applyPreviewLayout(previewWorkflow) : null),
    [previewWorkflow],
  );
  const preferredAgentId = useMemo(() => {
    if (defaultAgentId && availableAgents.some((agent) => agent.id === defaultAgentId)) {
      return defaultAgentId;
    }
    return availableAgents[0]?.id || 'main';
  }, [defaultAgentId, availableAgents]);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setSelectedAgentId(preferredAgentId);
      setDraft('');
      setMessages([]);
      setPreviewWorkflow(null);
      setWarnings([]);
      setApprovals([]);
      setApprovalDecisions({});
      setError(null);
      setIsGenerating(false);
      setIsImporting(false);
    }

    wasOpenRef.current = open;
  }, [open, preferredAgentId]);

  useEffect(() => {
    if (!open) return;
    if (availableAgents.some((agent) => agent.id === selectedAgentId)) return;
    setSelectedAgentId(preferredAgentId);
  }, [open, availableAgents, preferredAgentId, selectedAgentId]);

  useEffect(() => {
    if (!open || skills.length > 0) return;
    fetchSkills().catch(() => {});
  }, [open, skills.length, fetchSkills]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isGenerating]);

  useEffect(() => {
    if (!open || !preparedPreview) return;
    const timer = setTimeout(() => {
      previewRef.current?.fitView({ padding: 0.18, duration: 250 });
    }, 60);
    return () => clearTimeout(timer);
  }, [open, preparedPreview]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const selectedAgent = availableAgents.find((agent) => agent.id === selectedAgentId) || availableAgents[0];
  const approvalDecisionList: WorkflowGenerationApprovalDecision[] = Object.entries(approvalDecisions).map(
    ([approvalId, approved]) => ({
      approvalId,
      approved,
    }),
  );
  const approvalGateActive = approvals.length > 0;

  const handleReset = () => {
    setDraft('');
    setMessages([]);
    setPreviewWorkflow(null);
    setWarnings([]);
    setApprovals([]);
    setApprovalDecisions({});
    setError(null);
  };

  type RunGenerationOptions = {
    preservePreviewOnFallback?: boolean;
    fallbackError?: string;
  };

  const runGeneration = async (
    nextMessages: ChatMessage[],
    nextApprovalDecisions = approvalDecisionList,
    options?: RunGenerationOptions,
  ) => {
    setMessages(nextMessages);
    setDraft('');
    setError(null);
    setIsGenerating(true);

    try {
      const result = await invokeIpc<WorkflowGenerationResult>('workflow:generate', {
        agentId: selectedAgentId,
        messages: nextMessages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        approvalDecisions: nextApprovalDecisions,
        availableSkills,
      });

      if (!result.success || !result.workflow) {
        throw new Error(result.error || t('generateFailed', '生成工作流草稿失败'));
      }

      if (options?.preservePreviewOnFallback && result.draftMode === 'fallback' && previewWorkflow) {
        setError(
          options.fallbackError
          || result.warnings?.[0]
          || t(
            'generateApprovalRetryFallback',
            '审批后的重新生成暂时失败，当前草稿已保留，请稍后再试。',
          ),
        );
        return false;
      }

      const assistantMessage: ChatMessage = {
        id: createMessageId('assistant'),
        role: 'assistant',
        content:
          result.assistantReply
          || t('generateAssistantFallback', '已生成一个工作流草稿，你可以继续补充修改意见。'),
        warnings: result.warnings,
      };

      setMessages([...nextMessages, assistantMessage]);
      setPreviewWorkflow(result.workflow);
      setWarnings(result.warnings ?? []);
      setApprovals(result.approvals ?? []);
      return true;
    } catch (generationError) {
      setError(toUserMessage(generationError));
      return false;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerate = async () => {
    const trimmedDraft = draft.trim();
    const nextMessages = trimmedDraft
      ? [...messages, { id: createMessageId('user'), role: 'user' as const, content: trimmedDraft }]
      : messages;

    if (!nextMessages.some((message) => message.role === 'user')) {
      setError(t('generateNeedPrompt', '请先输入你的需求。'));
      return;
    }

    await runGeneration(nextMessages);
  };

  const handleApprovalDecision = async (approval: WorkflowGenerationApproval, approved: boolean) => {
    const previousApprovalDecisions = approvalDecisions;
    const nextApprovalDecisions = [
      ...approvalDecisionList.filter((decision) => decision.approvalId !== approval.id),
      { approvalId: approval.id, approved },
    ];

    const nodeLabel = approval.nodeLabel || approval.skillName || approval.skillId || approval.title;
    const skillLabel = approval.skillName || approval.skillId || t('skill', 'Skill');
    const approvalMessage = approved
      ? t(
          'generateApprovalApproveMessage',
          '我同意在节点“{{nodeLabel}}”中使用技能“{{skillLabel}}”，请按这个方向更新草稿。',
          { nodeLabel, skillLabel },
        )
      : t(
          'generateApprovalRejectMessage',
          '我不同意新增技能“{{skillLabel}}”，请把节点“{{nodeLabel}}”改成普通智能体或现有能力实现。',
          { nodeLabel, skillLabel },
        );

    setApprovalDecisions((current) => ({
      ...current,
      [approval.id]: approved,
    }));

    const nextMessages = [
      ...messages,
      { id: createMessageId('user'), role: 'user' as const, content: approvalMessage },
    ];

    const updated = await runGeneration(
      nextMessages,
      nextApprovalDecisions,
      {
        preservePreviewOnFallback: true,
        fallbackError: t(
          'generateApprovalRetryFallback',
          '审批后的重新生成暂时失败，当前草稿已保留，请稍后再试。',
        ),
      },
    );

    if (!updated) {
      setApprovalDecisions(previousApprovalDecisions);
    }
  };

  const handleImport = async () => {
    if (!preparedPreview || approvalGateActive) return;

    setIsImporting(true);
    setError(null);
    try {
      await onImport(preparedPreview.workflow);
    } catch (importError) {
      setError(toUserMessage(importError));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workflow-generate-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex h-[min(860px,calc(100vh-32px))] w-[min(1280px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
        <div className="shrink-0 flex items-start justify-between border-b px-6 py-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 id="workflow-generate-title" className="text-lg font-semibold">
                {t('generateTitle', 'AI 生成工作流')}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {t(
                'generateDescription',
                '选择一个智能体，把你的需求告诉它，它会先生成一个可预览的工作流草稿。',
              )}
            </p>
            {!canGenerate && (
              <div className="flex items-center gap-2 text-xs text-amber-600">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>
                  {t(
                    'generateOfflineHint',
                    '当前网关未连接，将优先生成基础草稿；网关恢复后会得到更贴合需求的结果。',
                  )}
                </span>
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[420px_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col overflow-hidden border-r">
            <div className="shrink-0 space-y-4 border-b px-6 py-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t('generateAgentLabel', '生成智能体')}</label>
                <Select value={selectedAgentId} onChange={(event) => setSelectedAgentId(event.target.value)}>
                  {availableAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} ({agent.id})
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t(
                    'generateAgentHint',
                    '生成过程会调用该智能体来理解你的需求并规划节点。',
                  )}
                </p>
              </div>

              <div className="rounded-xl border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2 font-medium text-foreground/80">
                  <Bot className="h-3.5 w-3.5" />
                  <span>{selectedAgent?.name || selectedAgentId}</span>
                </div>
                <div className="mt-1">
                  {selectedAgent?.description || selectedAgentId}
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-5">
              <div className="mb-3 shrink-0 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium">{t('generateConversation', '需求对话')}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(
                      'generateConversationHint',
                      '描述你想自动化的流程，也可以继续补充修改意见。',
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={handleReset}
                  disabled={isGenerating || (!messages.length && !previewWorkflow && !draft)}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t('generateReset', '重置对话')}
                </Button>
              </div>

              <div
                ref={scrollRef}
                className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl border bg-muted/10 p-3"
              >
                {messages.length === 0 && !isGenerating && (
                  <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                    <p>{t('generateConversationEmpty', '输入你的目标，例如“生成一个客服分流工作流”。')}</p>
                  </div>
                )}

                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'rounded-2xl px-4 py-3 text-sm shadow-sm',
                      message.role === 'user'
                        ? 'ml-8 bg-primary text-primary-foreground'
                        : 'mr-8 border bg-background',
                    )}
                  >
                    <div className="mb-1 text-[11px] font-medium uppercase tracking-wide opacity-70">
                      {message.role === 'user'
                        ? t('generateUser', '你')
                        : t('generateAssistant', '智能体')}
                    </div>
                    <div className="whitespace-pre-wrap leading-6">{message.content}</div>
                    {message.warnings && message.warnings.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className="text-[11px] font-medium text-amber-600">
                          {t('generateWarnings', '已自动修正')}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {message.warnings.map((warning, index) => (
                            <Badge
                              key={`${message.id}_warning_${index}`}
                              variant="secondary"
                              className="max-w-full whitespace-normal rounded-full border-0 bg-amber-100 text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                            >
                              {warning}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {isGenerating && (
                  <div className="mr-8 rounded-2xl border bg-background px-4 py-3 text-sm shadow-sm">
                    <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t('generateAssistant', '智能体')}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>{t('generateSubmitting', '生成中...')}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 shrink-0 space-y-3">
                {error && (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={t(
                    'generatePlaceholder',
                    '例如：当用户提到退款时，先判断紧急程度，再分流给售后或人工升级处理。',
                  )}
                  className="min-h-[120px] resize-none"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      void handleGenerate();
                    }
                  }}
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Ctrl+Enter {t('generateShortcut', '生成预览')}
                  </p>
                  <Button
                    className="gap-2"
                    onClick={() => void handleGenerate()}
                    disabled={isGenerating || isImporting}
                  >
                    <Send className="h-4 w-4" />
                    {isGenerating
                      ? t('generateSubmitting', '生成中...')
                      : t('generateSubmit', '生成预览')}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between border-b px-6 py-5">
              <div>
                <h3 className="text-sm font-medium">{t('generatePreview', '预览草稿')}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {preparedPreview
                    ? t('generatePreviewSummary', '{{nodes}} 个节点 · {{edges}} 条连线', {
                      nodes: preparedPreview.workflow.nodes.length,
                      edges: preparedPreview.workflow.edges.length,
                    })
                    : t('generatePreviewEmpty', '生成后会在这里显示工作流预览。')}
                </p>
              </div>
              {preparedPreview && (
                <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
                  {preparedPreview.workflow.name}
                </Badge>
              )}
            </div>

            {preparedPreview ? (
              <>
                <div className="shrink-0 space-y-3 border-b px-6 py-4">
                  {preparedPreview.workflow.description && (
                    <p className="text-sm text-muted-foreground">
                      {preparedPreview.workflow.description}
                    </p>
                  )}

                  {approvals.length > 0 && (
                    <div className="space-y-2 rounded-xl border border-amber-300/50 bg-amber-50/60 p-3 dark:border-amber-800/60 dark:bg-amber-950/20">
                      <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                        <AlertCircle className="h-4 w-4" />
                        <span>{t('generateApprovalTitle', '待审批建议')}</span>
                      </div>
                      <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                        {t(
                          'generateApprovalHint',
                          '系统建议补充技能等外部能力时，会先征得你的同意；处理完这些审批项后才能导入。',
                        )}
                      </p>
                      <div className="space-y-2">
                        {approvals.map((approval) => {
                          const knownSkill = approval.skillId
                            ? availableSkillMap.get(approval.skillId)
                            : undefined;
                          const decision = approvalDecisions[approval.id];

                          return (
                            <div
                              key={approval.id}
                              className="rounded-lg border border-amber-200/80 bg-background/80 p-3 dark:border-amber-900/60"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="text-sm font-medium text-foreground">
                                    {approval.title}
                                  </div>
                                  <div className="text-xs leading-5 text-muted-foreground">
                                    {approval.description}
                                  </div>
                                  <div className="flex flex-wrap gap-2 pt-1">
                                    {approval.skillId && (
                                      <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-[10px]">
                                        {knownSkill?.name || approval.skillName || approval.skillId}
                                      </Badge>
                                    )}
                                    <Badge
                                      variant="secondary"
                                      className={cn(
                                        'rounded-full px-2.5 py-0.5 text-[10px]',
                                        approval.available === false
                                          ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
                                      )}
                                    >
                                      {approval.available === false
                                        ? t('generateApprovalSkillMissing', '当前未安装')
                                        : t('generateApprovalSkillReady', '当前可用')}
                                    </Badge>
                                    {typeof decision === 'boolean' && isGenerating && (
                                      <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-[10px]">
                                        {decision
                                          ? t('generateApprovalProcessingApprove', '正在按批准重生')
                                          : t('generateApprovalProcessingReject', '正在按拒绝重生')}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <Button
                                    size="sm"
                                    className="h-8 gap-1.5"
                                    onClick={() => void handleApprovalDecision(approval, true)}
                                    disabled={isGenerating || isImporting}
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                    {t('generateApprovalApprove', '同意')}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8"
                                    onClick={() => void handleApprovalDecision(approval, false)}
                                    disabled={isGenerating || isImporting}
                                  >
                                    {t('generateApprovalReject', '拒绝')}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {warnings.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {warnings.map((warning, index) => (
                        <Badge
                          key={`preview_warning_${index}`}
                          variant="secondary"
                          className="max-w-full whitespace-normal rounded-full border-0 bg-amber-100 text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                        >
                          {warning}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="min-h-0 flex-1">
                  <LayoutDirectionProvider value="TB">
                    <ReactFlowProvider>
                      <ReactFlow
                        key={preparedPreview.workflow.id}
                        nodes={preparedPreview.nodes}
                        edges={preparedPreview.edges}
                        onInit={(instance) => {
                          previewRef.current = instance;
                        }}
                        nodeTypes={workflowNodeTypes}
                        fitView
                        panOnDrag
                        zoomOnScroll
                        nodesDraggable={false}
                        nodesConnectable={false}
                        elementsSelectable={false}
                        className="h-full w-full bg-dots-pattern"
                        defaultEdgeOptions={{ type: 'smoothstep', animated: false }}
                        proOptions={{ hideAttribution: true }}
                      >
                        <Background gap={16} size={1} />
                        <Controls className="!border !bg-background/90 !shadow-sm" />
                      </ReactFlow>
                    </ReactFlowProvider>
                  </LayoutDirectionProvider>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                <div className="space-y-3">
                  <Sparkles className="mx-auto h-10 w-10 opacity-30" />
                  <p>{t('generatePreviewEmpty', '生成后会在这里显示工作流预览。')}</p>
                </div>
              </div>
            )}

            <div className="shrink-0 flex items-center justify-between border-t px-6 py-4">
              <p
                className={cn(
                  'text-xs',
                  approvalGateActive ? 'text-amber-600' : 'text-muted-foreground',
                )}
              >
                {approvalGateActive
                  ? t(
                      'generateImportBlocked',
                      '还有待审批建议未处理，请先同意或拒绝这些建议，再导入工作流。',
                    )
                  : t(
                      'generateImportHint',
                      '满意后点击导入，会自动创建新工作流并切换到该草稿。',
                    )}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={onClose} disabled={isGenerating || isImporting}>
                  {t('generateClose', '暂不导入')}
                </Button>
                <Button
                  className="gap-2"
                  onClick={() => void handleImport()}
                  disabled={!preparedPreview || approvalGateActive || isGenerating || isImporting}
                >
                  <Download className="h-4 w-4" />
                  {isImporting
                    ? t('generateImporting', '导入中...')
                    : t('generateImport', '导入工作流')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
