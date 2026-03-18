/**
 * NodeConfigPanel – 右侧节点属性配置面板
 *
 * 根据选中节点类型显示不同的配置表单。
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Zap,
  GitBranch,
  Combine,
  Timer,
  Plus,
  Trash2,
  X,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Variable,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWorkflowStore, type WorkflowNode } from '@/stores/workflow';
import type {
  WorkflowNodeData,
  TriggerType,
  AgentNodeConfig,
  SkillNodeConfig,
  LogicNodeConfig,
  BranchCondition,
  OutputNodeConfig,
} from '@/types/workflow';
import { useTranslation } from 'react-i18next';
import { useAgentsStore } from '@/stores/agents';
import { useChannelsStore } from '@/stores/channels';
import { useSkillsStore } from '@/stores/skills';

interface Props {
  node: WorkflowNode;
}

export function NodeConfigPanel({ node }: Props) {
  const { t } = useTranslation('workflows');
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const removeNode = useWorkflowStore((s) => s.removeNode);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);

  const nodeData = node.data as WorkflowNodeData;

  const update = useCallback(
    (patch: Partial<WorkflowNodeData>) => {
      updateNodeData(node.id, patch);
    },
    [node.id, updateNodeData],
  );

  return (
    <div className="flex h-full w-72 flex-col border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{t('nodeConfig', 'Node Config')}</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedNode(null)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Common: Label */}
        <div>
          <label className="text-xs font-medium text-muted-foreground">{t('label', 'Label')}</label>
          <Input
            className="mt-1 h-8 text-sm"
            value={nodeData.label}
            onChange={(e) => update({ label: e.target.value })}
          />
        </div>

        {/* Common: Description */}
        <div>
          <label className="text-xs font-medium text-muted-foreground">{t('description', 'Description')}</label>
          <Input
            className="mt-1 h-8 text-sm"
            value={nodeData.description ?? ''}
            onChange={(e) => update({ description: e.target.value })}
          />
        </div>

        {/* Type-specific configs */}
        {nodeData.type === 'trigger' && <TriggerConfig data={nodeData} update={update} />}
        {nodeData.type === 'agent' && <AgentConfig nodeId={node.id} data={nodeData} update={update} />}
        {nodeData.type === 'skill' && <SkillConfig nodeId={node.id} data={nodeData} update={update} />}
        {nodeData.type === 'logic' && <LogicConfig data={nodeData} update={update} />}
        {nodeData.type === 'output' && <OutputConfig nodeId={node.id} data={nodeData} update={update} />}
      </div>

      {/* Footer: Delete node */}
      <div className="border-t p-3">
        <Button
          variant="destructive"
          size="sm"
          className="w-full gap-2"
          onClick={() => {
            removeNode(node.id);
            setSelectedNode(null);
          }}
        >
          <Trash2 className="h-4 w-4" />
          {t('deleteNode', 'Delete Node')}
        </Button>
      </div>
    </div>
  );
}

// ── 上游可用变量计算 + 点击插入组件 ──────────────────────

/** 节点输出变量定义 */
interface VarEntry {
  /** 变量名: 用于 {{name}} 插值 */
  name: string;
  /** 所属节点标签 */
  source: string;
  /** 简短说明 */
  hint: string;
}

/**
 * 根据 DAG 边找到指定节点的所有上游节点，并推导它们的输出变量列表。
 */
function useUpstreamVariables(nodeId: string): VarEntry[] {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);

  return useMemo(() => {
    const vars: VarEntry[] = [];
    const visited = new Set<string>();

    // BFS：收集所有直接 + 间接上游节点
    const queue = edges.filter((e) => e.target === nodeId).map((e) => e.source);
    while (queue.length > 0) {
      const srcId = queue.shift()!;
      if (visited.has(srcId)) continue;
      visited.add(srcId);
      // 继续往上找
      edges.filter((e) => e.target === srcId).forEach((e) => queue.push(e.source));
    }

    // 对每个上游节点，根据类型推导输出变量
    for (const id of visited) {
      const n = nodes.find((nd) => nd.id === id);
      if (!n) continue;
      const d = n.data as WorkflowNodeData;
      const label = d.label || id;

      switch (d.type) {
        case 'trigger':
          vars.push({ name: 'message', source: label, hint: 'trigger input text' });
          vars.push({ name: 'input', source: label, hint: 'alias of message' });
          break;
        case 'agent':
          vars.push({ name: 'response', source: label, hint: 'agent reply text' });
          // 若 agent 回复是 JSON，其字段会被展开到顶层
          if (d.agentConfig?.agentId) {
            vars.push({ name: 'agentId', source: label, hint: d.agentConfig.agentId });
          }
          break;
        case 'skill':
          vars.push({ name: 'response', source: label, hint: 'skill execution result' });
          if (d.skillConfig?.skillId) {
            vars.push({ name: 'skillId', source: label, hint: d.skillConfig.skillId });
          }
          break;
        case 'logic':
          if (d.logicConfig?.logicType === 'branch') {
            vars.push({ name: 'matchedHandle', source: label, hint: 'chosen branch handle' });
          }
          break;
        // output nodes don't produce downstream vars
      }
    }

    return vars;
  }, [nodeId, nodes, edges]);
}

/**
 * 可用变量提示面板: 以 chip 的形式展示上游变量，点击即插入到 textarea。
 */
function UpstreamVariableHints({
  nodeId,
  textareaRef,
  value,
  onChange,
}: {
  nodeId: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (newValue: string) => void;
}) {
  const { t } = useTranslation('workflows');
  const vars = useUpstreamVariables(nodeId);

  const insertVariable = useCallback(
    (varName: string) => {
      const ta = textareaRef.current;
      const token = `{{${varName}}}`;
      if (ta) {
        const start = ta.selectionStart ?? value.length;
        const end = ta.selectionEnd ?? start;
        const newVal = value.slice(0, start) + token + value.slice(end);
        onChange(newVal);
        // 恢复光标位置
        requestAnimationFrame(() => {
          ta.focus();
          const pos = start + token.length;
          ta.setSelectionRange(pos, pos);
        });
      } else {
        onChange(value + token);
      }
    },
    [textareaRef, value, onChange],
  );

  if (vars.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground italic">
        {t('noUpstreamVars', 'Connect upstream nodes to see available variables')}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Variable className="h-3 w-3" />
        <span>{t('availableVars', 'Available variables')} — {t('clickToInsert', 'click to insert')}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {vars.map((v, i) => (
          <button
            key={`${v.name}-${i}`}
            type="button"
            onClick={() => insertVariable(v.name)}
            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] font-mono text-primary hover:bg-primary/15 transition-colors"
            title={`${v.source}: ${v.hint}`}
          >
            {'{{'}
            {v.name}
            {'}}'}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── 触发器配置 ───────────────────────────────────────────

function TriggerConfig({
  data,
  update,
}: {
  data: WorkflowNodeData;
  update: (p: Partial<WorkflowNodeData>) => void;
}) {
  const { t } = useTranslation('workflows');
  const cfg = data.triggerConfig ?? { type: 'manual' as TriggerType };
  const setTrigger = (patch: Partial<typeof cfg>) =>
    update({ triggerConfig: { ...cfg, ...patch } });

  const types: { value: TriggerType; label: string; icon: React.ReactNode }[] = [
    { value: 'manual', label: 'Manual', icon: <Zap className="h-3.5 w-3.5" /> },
    { value: 'cron', label: 'Cron', icon: <Timer className="h-3.5 w-3.5" /> },
    { value: 'webhook', label: 'Webhook', icon: <GitBranch className="h-3.5 w-3.5" /> },
    { value: 'event', label: 'Event', icon: <Combine className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-3">
      <label className="text-xs font-medium text-muted-foreground">{t('triggerType', 'Trigger Type')}</label>
      <div className="grid grid-cols-2 gap-1.5">
        {types.map((tt) => (
          <button
            key={tt.value}
            onClick={() => setTrigger({ type: tt.value })}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors ${
              cfg.type === tt.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {tt.icon}
            {tt.label}
          </button>
        ))}
      </div>

      {cfg.type === 'cron' && (
        <div>
          <label className="text-xs font-medium text-muted-foreground">Cron Expression</label>
          <Input
            className="mt-1 h-8 font-mono text-xs"
            placeholder="0 * * * *"
            value={cfg.cronExpression ?? ''}
            onChange={(e) => setTrigger({ cronExpression: e.target.value })}
          />
        </div>
      )}
      {cfg.type === 'webhook' && (
        <div>
          <label className="text-xs font-medium text-muted-foreground">Webhook Path</label>
          <Input
            className="mt-1 h-8 font-mono text-xs"
            placeholder="/hooks/my-workflow"
            value={cfg.webhookPath ?? ''}
            onChange={(e) => setTrigger({ webhookPath: e.target.value })}
          />
        </div>
      )}
      {cfg.type === 'event' && (
        <div>
          <label className="text-xs font-medium text-muted-foreground">Event Name</label>
          <Input
            className="mt-1 h-8 text-xs"
            placeholder="user.created"
            value={cfg.eventName ?? ''}
            onChange={(e) => setTrigger({ eventName: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

// ── Agent 配置 ──────────────────────────────────────────

function AgentConfig({
  nodeId,
  data,
  update,
}: {
  nodeId: string;
  data: WorkflowNodeData;
  update: (p: Partial<WorkflowNodeData>) => void;
}) {
  const { t } = useTranslation('workflows');
  const agents = useAgentsStore((s) => s.agents);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const cfg: AgentNodeConfig = data.agentConfig ?? {
    agentId: '',
    inputMappings: [],
  };
  const setAgent = (patch: Partial<AgentNodeConfig>) =>
    update({ agentConfig: { ...cfg, ...patch } });

  return (
    <div className="space-y-3">
      {/* Agent selector */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">{t('agent', 'Agent')}</label>
        <select
          className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-xs"
          value={cfg.agentId}
          onChange={(e) => setAgent({ agentId: e.target.value })}
        >
          <option value="">{t('selectAgent', 'Select an agent...')}</option>
          {agents.map((a) => (
            <option key={a.id ?? a.name} value={a.id ?? a.name}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {/* Model override */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">{t('modelOverride', 'Model Override')}</label>
        <Input
          className="mt-1 h-8 text-xs"
          placeholder="e.g. claude-sonnet-4-20250514"
          value={cfg.modelOverride ?? ''}
          onChange={(e) => setAgent({ modelOverride: e.target.value || undefined })}
        />
      </div>

      {/* Prompt template */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">{t('promptTemplate', 'Prompt Template')}</label>
        <textarea
          ref={promptRef}
          className="mt-1 h-20 w-full resize-none rounded-md border bg-background px-2 py-1.5 text-xs"
          placeholder={t('promptPlaceholder', 'Use {{variable}} for inputs...')}
          value={cfg.promptTemplate ?? ''}
          onChange={(e) => setAgent({ promptTemplate: e.target.value })}
        />
        <UpstreamVariableHints
          nodeId={nodeId}
          textareaRef={promptRef}
          value={cfg.promptTemplate ?? ''}
          onChange={(v) => setAgent({ promptTemplate: v })}
        />
      </div>

      {/* Timeout */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="text-xs font-medium text-muted-foreground">{t('timeout', 'Timeout (s)')}</label>
          <Input
            type="number"
            className="mt-1 h-8 text-xs"
            value={cfg.timeoutSeconds ?? ''}
            onChange={(e) => setAgent({ timeoutSeconds: e.target.value ? Number(e.target.value) : undefined })}
          />
        </div>
        <div className="flex-1">
          <label className="text-xs font-medium text-muted-foreground">{t('retries', 'Retries')}</label>
          <Input
            type="number"
            className="mt-1 h-8 text-xs"
            min={0}
            max={5}
            value={cfg.retryCount ?? 0}
            onChange={(e) => setAgent({ retryCount: Number(e.target.value) })}
          />
        </div>
      </div>
    </div>
  );
}

// ── Skill 配置 ──────────────────────────────────────────

function SkillConfig({
  nodeId,
  data,
  update,
}: {
  nodeId: string;
  data: WorkflowNodeData;
  update: (p: Partial<WorkflowNodeData>) => void;
}) {
  const { t } = useTranslation('workflows');
  const skills = useSkillsStore((s) => s.skills);
  const fetchSkills = useSkillsStore((s) => s.fetchSkills);
  const agents = useAgentsStore((s) => s.agents);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const cfg: SkillNodeConfig = data.skillConfig ?? {
    skillId: '',
    inputMappings: [],
  };
  const setSkill = (patch: Partial<SkillNodeConfig>) =>
    update({ skillConfig: { ...cfg, ...patch } });

  // 初始化加载 skills 列表
  useEffect(() => {
    if (skills.length === 0) {
      fetchSkills();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 当前选中的 skill 信息
  const selectedSkill = useMemo(
    () => skills.find((s) => s.id === cfg.skillId || s.slug === cfg.skillId),
    [skills, cfg.skillId],
  );

  return (
    <div className="space-y-3">
      {/* Skill selector */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">{t('skill', 'Skill')}</label>
        <select
          className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-xs"
          value={cfg.skillId}
          onChange={(e) => setSkill({ skillId: e.target.value })}
        >
          <option value="">{t('selectSkill', 'Select a skill...')}</option>
          {skills.filter((s) => s.enabled).map((s) => (
            <option key={s.id} value={s.slug || s.id}>
              {s.icon ? `${s.icon} ` : ''}{s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Skill info */}
      {selectedSkill && (
        <div className="rounded-md border border-teal-300/50 bg-teal-50/50 px-3 py-2 text-xs text-teal-700 dark:border-teal-800 dark:bg-teal-950/20 dark:text-teal-300">
          <div className="font-medium">{selectedSkill.icon ? `${selectedSkill.icon} ` : ''}{selectedSkill.name}</div>
          {selectedSkill.description && (
            <div className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">{selectedSkill.description}</div>
          )}
          {selectedSkill.version && (
            <div className="mt-0.5 text-[10px] text-muted-foreground">v{selectedSkill.version}</div>
          )}
        </div>
      )}

      {/* Agent selector (which agent to run the skill with) */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">{t('skillAgent', 'Execute via Agent')}</label>
        <select
          className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-xs"
          value={cfg.agentId ?? ''}
          onChange={(e) => setSkill({ agentId: e.target.value || undefined })}
        >
          <option value="">main ({t('defaultAgent', 'Default')})</option>
          {agents.map((a) => (
            <option key={a.id ?? a.name} value={a.id ?? a.name}>
              {a.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {t('skillAgentHint', 'The agent that will use this skill to execute the task')}
        </p>
      </div>

      {/* Prompt template */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">{t('skillPrompt', 'Skill Instruction')}</label>
        <textarea
          ref={promptRef}
          className="mt-1 h-24 w-full resize-none rounded-md border bg-background px-2 py-1.5 text-xs"
          placeholder={t('skillPromptPlaceholder', 'e.g. Use the {{skillId}} skill to generate a post about {{message}} and publish it')}
          value={cfg.promptTemplate ?? ''}
          onChange={(e) => setSkill({ promptTemplate: e.target.value })}
        />
        <UpstreamVariableHints
          nodeId={nodeId}
          textareaRef={promptRef}
          value={cfg.promptTemplate ?? ''}
          onChange={(v) => setSkill({ promptTemplate: v })}
        />
      </div>

      {/* Timeout / Retries */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="text-xs font-medium text-muted-foreground">{t('timeout', 'Timeout (s)')}</label>
          <Input
            type="number"
            className="mt-1 h-8 text-xs"
            value={cfg.timeoutSeconds ?? ''}
            onChange={(e) => setSkill({ timeoutSeconds: e.target.value ? Number(e.target.value) : undefined })}
          />
        </div>
        <div className="flex-1">
          <label className="text-xs font-medium text-muted-foreground">{t('retries', 'Retries')}</label>
          <Input
            type="number"
            className="mt-1 h-8 text-xs"
            min={0}
            max={5}
            value={cfg.retryCount ?? 0}
            onChange={(e) => setSkill({ retryCount: Number(e.target.value) })}
          />
        </div>
      </div>
    </div>
  );
}

// ── 逻辑节点配置 ────────────────────────────────────────

function LogicConfig({
  data,
  update,
}: {
  data: WorkflowNodeData;
  update: (p: Partial<WorkflowNodeData>) => void;
}) {
  const { t } = useTranslation('workflows');
  const cfg: LogicNodeConfig = data.logicConfig ?? { logicType: 'branch' };
  const setLogic = (patch: Partial<LogicNodeConfig>) =>
    update({ logicConfig: { ...cfg, ...patch } });

  const conditions = cfg.conditions ?? [];

  const addCondition = () => {
    const id = `cond_${Date.now()}`;
    setLogic({
      conditions: [
        ...conditions,
        {
          id,
          label: `Condition ${conditions.length + 1}`,
          field: '',
          operator: 'equals',
          value: '',
          targetHandle: `handle_${id}`,
        },
      ],
    });
  };

  const updateCondition = (idx: number, patch: Partial<BranchCondition>) => {
    const updated = conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    setLogic({ conditions: updated });
  };

  const removeCondition = (idx: number) => {
    setLogic({ conditions: conditions.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-3">
      {/* Logic type selector */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">{t('logicType', 'Logic Type')}</label>
        <div className="mt-1 grid grid-cols-3 gap-1.5">
          {(['branch', 'merge', 'delay'] as const).map((lt) => (
            <button
              key={lt}
              onClick={() => setLogic({ logicType: lt })}
              className={`flex flex-col items-center gap-0.5 rounded-md border px-2 py-1.5 text-[11px] transition-colors ${
                cfg.logicType === lt
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {lt === 'branch' && <GitBranch className="h-3.5 w-3.5" />}
              {lt === 'merge' && <Combine className="h-3.5 w-3.5" />}
              {lt === 'delay' && <Timer className="h-3.5 w-3.5" />}
              {lt.charAt(0).toUpperCase() + lt.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Branch conditions */}
      {cfg.logicType === 'branch' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">{t('conditions', 'Conditions')}</label>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={addCondition}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {conditions.map((c, i) => (
            <div key={c.id} className="space-y-1 rounded-md border p-2">
              <div className="flex items-center gap-1">
                <Input
                  className="h-7 flex-1 text-[11px]"
                  placeholder="Label"
                  value={c.label}
                  onChange={(e) => updateCondition(i, { label: e.target.value })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => removeCondition(i)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <Input
                className="h-7 text-[11px]"
                placeholder="Field path"
                value={c.field}
                onChange={(e) => updateCondition(i, { field: e.target.value })}
              />
              <div className="flex gap-1">
                <select
                  className="h-7 flex-1 rounded border bg-background px-1 text-[11px]"
                  value={c.operator}
                  onChange={(e) => updateCondition(i, { operator: e.target.value as BranchCondition['operator'] })}
                >
                  <option value="equals">==</option>
                  <option value="notEquals">!=</option>
                  <option value="contains">contains</option>
                  <option value="greaterThan">&gt;</option>
                  <option value="lessThan">&lt;</option>
                  <option value="isEmpty">empty</option>
                  <option value="isNotEmpty">not empty</option>
                </select>
                <Input
                  className="h-7 flex-1 text-[11px]"
                  placeholder="Value"
                  value={c.value}
                  onChange={(e) => updateCondition(i, { value: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delay seconds */}
      {cfg.logicType === 'delay' && (
        <div>
          <label className="text-xs font-medium text-muted-foreground">{t('delaySeconds', 'Delay (seconds)')}</label>
          <Input
            type="number"
            className="mt-1 h-8 text-xs"
            min={0}
            value={cfg.delaySeconds ?? 0}
            onChange={(e) => setLogic({ delaySeconds: Number(e.target.value) })}
          />
        </div>
      )}
    </div>
  );
}

// ── 输出节点配置 ────────────────────────────────────────

/** 静态频道类型列表 (未配置的频道也可选) */
const CHANNEL_TYPE_OPTIONS = [
  { value: 'telegram', label: 'Telegram' },
  { value: 'discord', label: 'Discord' },
  { value: 'qqbot', label: 'QQ Bot' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'dingtalk', label: 'DingTalk' },
  { value: 'feishu', label: 'Feishu / Lark' },
  { value: 'signal', label: 'Signal' },
  { value: 'slack', label: 'Slack' },
  { value: 'msteams', label: 'MS Teams' },
];

function OutputConfig({
  nodeId,
  data,
  update,
}: {
  nodeId: string;
  data: WorkflowNodeData;
  update: (p: Partial<WorkflowNodeData>) => void;
}) {
  const { t } = useTranslation('workflows');
  const agents = useAgentsStore((s) => s.agents);
  const channels = useChannelsStore((s) => s.channels);
  const bindings = useChannelsStore((s) => s.bindings);
  const fetchChannels = useChannelsStore((s) => s.fetchChannels);
  const fetchBindings = useChannelsStore((s) => s.fetchBindings);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const cfg: OutputNodeConfig = data.outputConfig ?? {
    channelType: '',
    messageTemplate: '',
    inputMappings: [],
  };

  // 选择频道时同时更新 channelType 和 channelAccountId
  const handleChannelSelect = (value: string) => {
    if (!value) {
      setOutput({ channelType: '', channelAccountId: undefined });
      return;
    }
    // value 格式: "channelType::accountId" 或 "channelType"
    const [chType, acctId] = value.split('::');
    setOutput({
      channelType: chType,
      channelAccountId: acctId || undefined,
    });
  };

  // 当前选中值 (用于 select 回显)
  const selectedChannelValue = cfg.channelType
    ? cfg.channelAccountId
      ? `${cfg.channelType}::${cfg.channelAccountId}`
      : cfg.channelType
    : '';

  const setOutput = (patch: Partial<OutputNodeConfig>) =>
    update({ outputConfig: { ...cfg, ...patch } });

  // 初始化时获取频道和绑定数据
  useEffect(() => {
    fetchChannels();
    fetchBindings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 构建频道选项：已配置的实例 + 未配置的类型
  const channelOptions = useMemo(() => {
    const options: Array<{ value: string; label: string; configured: boolean; connected: boolean }> = [];
    const coveredTypes = new Set<string>();

    // 1. 已配置的频道实例（从 channels store）
    for (const ch of channels) {
      const value = ch.accountId && ch.accountId !== 'default'
        ? `${ch.type}::${ch.accountId}`
        : ch.type;
      const typeName = CHANNEL_TYPE_OPTIONS.find((o) => o.value === ch.type)?.label || ch.type;
      const label = ch.name !== ch.type
        ? `${ch.name} (${typeName})`
        : typeName;
      options.push({
        value,
        label,
        configured: true,
        connected: ch.status === 'connected',
      });
      coveredTypes.add(ch.type);
    }

    // 2. 未配置的频道类型（供用户提前选择）
    for (const opt of CHANNEL_TYPE_OPTIONS) {
      if (!coveredTypes.has(opt.value)) {
        options.push({
          value: opt.value,
          label: `${opt.label} (${t('channelNotConfigured', 'Not configured')})`,
          configured: false,
          connected: false,
        });
      }
    }

    return options;
  }, [channels, t]);

  // 当前选中的频道状态
  const channelStatus = useMemo(() => {
    if (!cfg.channelType) return null;
    // 精确匹配：先匹配 channelType + accountId
    let ch = cfg.channelAccountId
      ? channels.find((c) => c.type === cfg.channelType && c.accountId === cfg.channelAccountId)
      : channels.find((c) => c.type === cfg.channelType);
    if (!ch) {
      ch = channels.find((c) => c.type === cfg.channelType);
    }
    if (!ch) return { configured: false, connected: false, status: 'not_configured' as const, name: '' };
    return {
      configured: true,
      connected: ch.status === 'connected',
      status: ch.status,
      name: ch.name,
    };
  }, [cfg.channelType, cfg.channelAccountId, channels]);

  // 检查选择的 Agent 是否绑定到选择的频道
  const bindingStatus = useMemo(() => {
    if (!cfg.channelType) return null;
    const effectiveAgentId = cfg.agentId || 'main';
    const binding = bindings.find(
      (b) => b.channelType === cfg.channelType &&
        (!cfg.channelAccountId || b.accountId === cfg.channelAccountId),
    );
    if (!binding) {
      return {
        bound: effectiveAgentId === 'main',
        boundAgentId: 'main',
        isDefault: true,
      };
    }
    return {
      bound: binding.agentId === effectiveAgentId,
      boundAgentId: binding.agentId,
      isDefault: false,
    };
  }, [cfg.channelType, cfg.agentId, cfg.channelAccountId, bindings]);

  return (
    <div className="space-y-3">
      {/* Channel selector — 显示实际配置的频道实例 */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">{t('outputChannel', 'Target Channel')}</label>
        <select
          className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-xs"
          value={selectedChannelValue}
          onChange={(e) => handleChannelSelect(e.target.value)}
        >
          <option value="">{t('selectChannel', 'Select a channel...')}</option>
          {/* 已配置（在线） */}
          {channelOptions.filter((o) => o.connected).length > 0 && (
            <optgroup label={`✅ ${t('channelConnected', 'Connected')}`}>
              {channelOptions.filter((o) => o.connected).map((ch) => (
                <option key={ch.value} value={ch.value}>{ch.label}</option>
              ))}
            </optgroup>
          )}
          {/* 已配置（离线） */}
          {channelOptions.filter((o) => o.configured && !o.connected).length > 0 && (
            <optgroup label={`⚠️ ${t('channelDisconnected', 'Configured')}`}>
              {channelOptions.filter((o) => o.configured && !o.connected).map((ch) => (
                <option key={ch.value} value={ch.value}>{ch.label}</option>
              ))}
            </optgroup>
          )}
          {/* 未配置 */}
          {channelOptions.filter((o) => !o.configured).length > 0 && (
            <optgroup label={`❌ ${t('channelNotConfigured', 'Not configured')}`}>
              {channelOptions.filter((o) => !o.configured).map((ch) => (
                <option key={ch.value} value={ch.value}>{ch.label}</option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {/* 频道配置状态指示器 */}
      {cfg.channelType && channelStatus && (
        <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
          !channelStatus.configured
            ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400'
            : channelStatus.connected
              ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400'
              : 'border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400'
        }`}>
          {!channelStatus.configured ? (
            <XCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          ) : channelStatus.connected ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          )}
          <div>
            {!channelStatus.configured ? (
              <span>{t('channelNotConfigured', 'Channel not configured in Channels page')}</span>
            ) : channelStatus.connected ? (
              <span>{t('channelConnected', 'Channel connected')}{channelStatus.name ? ` — ${channelStatus.name}` : ''}</span>
            ) : (
              <span>{t('channelDisconnected', 'Channel configured but not connected')}
                {channelStatus.status === 'connecting' && (
                  <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />
                )}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Agent selector (which agent to send through) */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">{t('outputAgent', 'Send via Agent')}</label>
        <select
          className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-xs"
          value={cfg.agentId ?? ''}
          onChange={(e) => setOutput({ agentId: e.target.value || undefined })}
        >
          <option value="">main ({t('defaultAgent', 'Default')})</option>
          {agents.map((a) => (
            <option key={a.id ?? a.name} value={a.id ?? a.name}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">{t('deliveryTarget', 'Delivery Target')}</label>
        <Input
          className="mt-1 h-8 text-xs"
          placeholder={t('deliveryTargetPlaceholder', 'User / group / channel ID, leave empty to use default target')}
          value={cfg.deliveryTarget ?? ''}
          onChange={(e) => setOutput({ deliveryTarget: e.target.value || undefined })}
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          {t('deliveryTargetHint', 'Used as the real recipient. Leave empty to fall back to the channel default target.')}
        </p>
      </div>

      {/* Agent 绑定状态指示器 */}
      {cfg.channelType && channelStatus?.configured && bindingStatus && (
        <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
          bindingStatus.bound
            ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400'
            : 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-400'
        }`}>
          {bindingStatus.bound ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          )}
          <div>
            {bindingStatus.bound ? (
              <span>
                {t('bindingMatched', 'Agent matches channel binding')}
                {bindingStatus.isDefault && ` (${t('defaultAgent', 'Default')})`}
              </span>
            ) : (
              <span>
                {t('bindingMismatch', 'Channel is bound to agent "{{agentId}}"', { agentId: bindingStatus.boundAgentId })}
                {' — '}
                {t('bindingMismatchHint', 'Go to Channels page to change binding or select the matching agent')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Message template */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">{t('messageTemplate', 'Message Template')}</label>
        <textarea
          ref={messageRef}
          className="mt-1 h-24 w-full resize-none rounded-md border bg-background px-2 py-1.5 text-xs"
          placeholder={t('messagePlaceholder', 'Use {{response}} to insert agent reply...')}
          value={cfg.messageTemplate}
          onChange={(e) => setOutput({ messageTemplate: e.target.value })}
        />
        <UpstreamVariableHints
          nodeId={nodeId}
          textareaRef={messageRef}
          value={cfg.messageTemplate}
          onChange={(v) => setOutput({ messageTemplate: v })}
        />
      </div>

      {/* Channel account ID (auto-populated from selection, editable for override) */}
      {cfg.channelAccountId && (
        <div>
          <label className="text-xs font-medium text-muted-foreground">{t('channelAccountId', 'Account ID')}</label>
          <Input
            className="mt-1 h-8 text-xs"
            value={cfg.channelAccountId ?? ''}
            onChange={(e) => setOutput({ channelAccountId: e.target.value || undefined })}
          />
        </div>
      )}
    </div>
  );
}
