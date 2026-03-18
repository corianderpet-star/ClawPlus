/**
 * Import Agent Dialog
 *
 * Allows one-click agent import from predefined templates.
 * Flow:
 *   1. Browse available templates
 *   2. Select one → shows details + skill dependencies
 *   3. If missing skills → show warning with install links
 *   4. Confirm → creates agent with template config + SOUL.md
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  X, Download, Loader2, ChevronRight, AlertTriangle,
  CheckCircle2, Package, ArrowLeft,
  Shield, ShieldCheck, Code, Eye, MessageSquare, ShieldOff, XCircle,
  Crown, Boxes, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { useAgentsStore, type CreateAgentInput } from '@/stores/agents';
import { useSkillsStore } from '@/stores/skills';
import {
  AGENT_TEMPLATES,
  getTemplateName,
  getTemplateDescription,
  type AgentTemplate,
} from '@/lib/agent-templates';

interface ImportAgentDialogProps {
  open: boolean;
  onClose: () => void;
  onImported?: (agentId: string) => void;
}

type DialogStep = 'browse' | 'detail';

/** Capitalise first letter for i18n key mapping, e.g. "coding" → "Coding". */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Icon component per tool profile. */
const PROFILE_ICON: Record<string, React.ReactElement> = {
  default: <Shield className="h-5 w-5 text-blue-500" />,
  full: <ShieldCheck className="h-5 w-5 text-purple-500" />,
  coding: <Code className="h-5 w-5 text-orange-500" />,
  minimal: <Eye className="h-5 w-5 text-slate-500" />,
  messaging: <MessageSquare className="h-5 w-5 text-green-500" />,
  none: <ShieldOff className="h-5 w-5 text-gray-400" />,
};

/** Color ring per tool profile (for the icon container). */
const PROFILE_RING: Record<string, string> = {
  default: 'bg-blue-100 dark:bg-blue-900/30',
  full: 'bg-purple-100 dark:bg-purple-900/30',
  coding: 'bg-orange-100 dark:bg-orange-900/30',
  minimal: 'bg-slate-100 dark:bg-slate-900/30',
  messaging: 'bg-green-100 dark:bg-green-900/30',
  none: 'bg-gray-100 dark:bg-gray-800/30',
};

/**
 * Permissions implied by each tool profile.
 * Keys reference i18n keys: `agents:import.permXxx`.
 */
const PROFILE_PERMISSIONS: Record<string, string[]> = {
  default: ['permFileRead', 'permFileWrite', 'permShell', 'permWebAccess'],
  full: ['permFileRead', 'permFileWrite', 'permShell', 'permWebAccess', 'permMessaging'],
  coding: ['permFileRead', 'permFileWrite', 'permShell'],
  minimal: ['permFileRead'],
  messaging: ['permMessaging'],
  none: [],
};

export function ImportAgentDialog({ open, onClose, onImported }: ImportAgentDialogProps) {
  const { t, i18n } = useTranslation(['agents', 'common']);
  const createAgent = useAgentsStore((s) => s.createAgent);
  const agents = useAgentsStore((s) => s.agents);
  const saving = useAgentsStore((s) => s.saving);

  const skills = useSkillsStore((s) => s.skills);
  const fetchSkills = useSkillsStore((s) => s.fetchSkills);
  const installSkill = useSkillsStore((s) => s.installSkill);

  const [step, setStep] = useState<DialogStep>('browse');
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
  const [customId, setCustomId] = useState('');
  const [customName, setCustomName] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 层级选择状态
  const [customRole, setCustomRole] = useState<'lead' | 'sub' | undefined>(undefined);
  const [customParentId, setCustomParentId] = useState<string | undefined>(undefined);
  const [allowCrossComm, setAllowCrossComm] = useState(false);

  // 技能安装状态
  const [installingSkills, setInstallingSkills] = useState<Set<string>>(new Set());
  const [installedSkills, setInstalledSkills] = useState<Set<string>>(new Set());

  const lang = i18n.language;

  // Fetch skills on open
  useEffect(() => {
    if (open) {
      fetchSkills();
      setStep('browse');
      setSelectedTemplate(null);
      setError(null);
      setCustomRole(undefined);
      setCustomParentId(undefined);
      setAllowCrossComm(false);
      setInstallingSkills(new Set());
      setInstalledSkills(new Set());
    }
  }, [open, fetchSkills]);

  // Check which required skills are missing for the selected template
  const missingSkills = useMemo(() => {
    if (!selectedTemplate?.requiredSkills?.length) return [];
    const installedSlugs = new Set(skills.map((s) => s.slug || s.id));
    return selectedTemplate.requiredSkills.filter((slug) => !installedSlugs.has(slug));
  }, [selectedTemplate, skills]);

  // Check if the suggested agent ID is already taken
  const isIdTaken = useMemo(() => {
    const checkId = customId || selectedTemplate?.suggestedId || '';
    return agents.some((a) => a.id === checkId);
  }, [customId, selectedTemplate, agents]);

  const handleSelectTemplate = useCallback((template: AgentTemplate) => {
    setSelectedTemplate(template);
    setCustomId(template.suggestedId);
    setCustomName(getTemplateName(template, lang));
    setCustomRole(template.role);
    setCustomParentId(undefined);
    setAllowCrossComm(false);
    setInstalledSkills(new Set());
    setError(null);
    setStep('detail');
  }, [lang]);

  const handleBack = useCallback(() => {
    setStep('browse');
    setSelectedTemplate(null);
    setError(null);
  }, []);

  const handleImport = useCallback(async () => {
    if (!selectedTemplate) return;
    // 仍有未安装的必要技能时阻止导入
    const stillMissing = missingSkills.filter((s) => !installedSkills.has(s));
    if (stillMissing.length > 0) {
      setError(t('agents:import.missingSkillsError'));
      return;
    }

    const agentId = customId.trim() || selectedTemplate.suggestedId;
    if (!agentId || !/^[a-zA-Z0-9_-]+$/.test(agentId)) {
      setError(t('agents:form.errorIdInvalid'));
      return;
    }
    if (isIdTaken) {
      setError(t('agents:import.idTaken', { id: agentId }));
      return;
    }

    setImporting(true);
    setError(null);
    try {
      const input: CreateAgentInput = {
        id: agentId,
        name: customName.trim() || getTemplateName(selectedTemplate, lang),
        description: getTemplateDescription(selectedTemplate, lang),
        model: selectedTemplate.model,
        soulMd: selectedTemplate.soulMd,
        role: customRole,
        parentId: customRole === 'sub' ? customParentId : undefined,
        allowCrossComm: customRole === 'lead' ? allowCrossComm : undefined,
        emoji: selectedTemplate.emoji,
      };

      const ok = await createAgent(input);
      if (ok) {
        // After creation, update tools config if the template specifies any
        if (selectedTemplate.toolProfile || selectedTemplate.toolAllow || selectedTemplate.toolDeny) {
          const updateAgent = useAgentsStore.getState().updateAgent;
          await updateAgent({
            agentId,
            tools: {
              profile: selectedTemplate.toolProfile,
              allow: selectedTemplate.toolAllow,
              deny: selectedTemplate.toolDeny,
            },
          });
        }
        onImported?.(agentId);
        onClose();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setImporting(false);
    }
  }, [selectedTemplate, customId, customName, customRole, customParentId, allowCrossComm, missingSkills, installedSkills, isIdTaken, lang, createAgent, onImported, onClose, t]);

  const handleClose = useCallback(() => {
    if (importing) return;
    onClose();
  }, [importing, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-2xl mx-4 rounded-xl border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-2.5">
            {step === 'detail' && (
              <Button variant="ghost" size="icon" className="h-8 w-8 mr-1" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white">
              <Download className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold">
                {step === 'browse' ? t('agents:import.title') : t('agents:import.detailTitle')}
              </h2>
              <p className="text-xs text-muted-foreground">
                {step === 'browse' ? t('agents:import.desc') : t('agents:import.detailDesc')}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose} disabled={importing}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 'browse' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {AGENT_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  className="flex items-start gap-3 rounded-lg border bg-card p-4 text-left hover:bg-accent/50 transition-colors group"
                  onClick={() => handleSelectTemplate(template)}
                >
                  <span className="text-2xl shrink-0 mt-0.5">{template.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold group-hover:text-primary transition-colors">
                        {getTemplateName(template, lang)}
                      </span>
                      {template.role && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {template.role}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {getTemplateDescription(template, lang)}
                    </p>
                    {template.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {template.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          )}

          {step === 'detail' && selectedTemplate && (
            <div className="space-y-5">
              {/* Template Header */}
              <div className="flex items-center gap-3">
                <span className="text-3xl">{selectedTemplate.emoji}</span>
                <div>
                  <h3 className="text-lg font-semibold">{getTemplateName(selectedTemplate, lang)}</h3>
                  <p className="text-sm text-muted-foreground">{getTemplateDescription(selectedTemplate, lang)}</p>
                </div>
              </div>

              {/* Customization */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t('agents:form.id')}</label>
                  <input
                    type="text"
                    value={customId}
                    onChange={(e) => setCustomId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                    placeholder={selectedTemplate.suggestedId}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  {isIdTaken && (
                    <p className="text-xs text-destructive">{t('agents:import.idTaken', { id: customId || selectedTemplate.suggestedId })}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t('agents:form.name')}</label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder={getTemplateName(selectedTemplate, lang)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>

              {/* 层级角色选择 */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">{t('agents:form.role')}</h4>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => { setCustomRole(customRole === 'lead' ? undefined : 'lead'); setCustomParentId(undefined); }}
                    className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${customRole === 'lead' ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' : 'border-transparent bg-muted/30 hover:bg-muted/50'}`}
                  >
                    <Crown className={`h-6 w-6 ${customRole === 'lead' ? 'text-amber-500' : 'text-muted-foreground'}`} />
                    <span className="text-sm font-medium">{t('agents:form.roleLead')}</span>
                    <span className="text-[10px] text-muted-foreground text-center">{t('agents:form.roleLeadDesc')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCustomRole(customRole === 'sub' ? undefined : 'sub'); }}
                    className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${customRole === 'sub' ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-transparent bg-muted/30 hover:bg-muted/50'}`}
                  >
                    <Boxes className={`h-6 w-6 ${customRole === 'sub' ? 'text-blue-500' : 'text-muted-foreground'}`} />
                    <span className="text-sm font-medium">{t('agents:form.roleSub')}</span>
                    <span className="text-[10px] text-muted-foreground text-center">{t('agents:form.roleSubDesc')}</span>
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">{t('agents:form.roleHint')}</p>

                {/* 上级智能体选择 (Sub 模式) */}
                {customRole === 'sub' && agents.filter((a) => a.id !== 'main' && a.role !== 'sub').length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t('agents:form.parentAgent')}</label>
                    <select
                      value={customParentId || ''}
                      onChange={(e) => setCustomParentId(e.target.value || undefined)}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      <option value="">{t('agents:form.selectParent')}</option>
                      {agents.filter((a) => a.id !== 'main' && a.role !== 'sub').map((a) => (
                        <option key={a.id} value={a.id}>{a.identity?.emoji || '🤖'} {a.name || a.id}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 跨 Agent 通信 (Lead 模式) */}
                {customRole === 'lead' && (
                  <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/30 transition-colors">
                    <Users className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{t('agents:form.crossComm')}</p>
                      <p className="text-xs text-muted-foreground">{t('agents:form.crossCommDesc')}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={allowCrossComm}
                      onChange={(e) => setAllowCrossComm(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </label>
                )}
              </div>

              {/* Template Config Summary */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold">{t('agents:import.configSummary')}</h4>

                {/* Basic Info (model, role) */}
                {(selectedTemplate.model || selectedTemplate.role) && (
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      {selectedTemplate.model && (
                        <>
                          <span className="text-muted-foreground">{t('agents:settings.modelLabel')}</span>
                          <span className="font-mono">{selectedTemplate.model}</span>
                        </>
                      )}
                      {selectedTemplate.role && (
                        <>
                          <span className="text-muted-foreground">{t('agents:form.role')}</span>
                          <span>{selectedTemplate.role === 'lead' ? t('agents:form.roleLead') : t('agents:form.roleSub')}</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Tool Profile Card — skill-marketplace style */}
                {selectedTemplate.toolProfile && (
                  <div className="rounded-lg border bg-card p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full shrink-0 ${PROFILE_RING[selectedTemplate.toolProfile] ?? 'bg-muted'}`}>
                        {PROFILE_ICON[selectedTemplate.toolProfile] ?? <Shield className="h-5 w-5 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">
                            {t(`agents:settings.profile${capitalize(selectedTemplate.toolProfile)}`)}
                          </span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                            {selectedTemplate.toolProfile}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {t(`agents:import.profileDesc${capitalize(selectedTemplate.toolProfile)}`)}
                        </p>
                      </div>
                    </div>

                    {/* Included permission badges */}
                    {(PROFILE_PERMISSIONS[selectedTemplate.toolProfile]?.length ?? 0) > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                          {t('agents:import.includedPerms')}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {(PROFILE_PERMISSIONS[selectedTemplate.toolProfile] ?? []).map((perm) => (
                            <Badge
                              key={perm}
                              variant="outline"
                              className="text-[10px] px-2 py-0.5 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400"
                            >
                              <CheckCircle2 className="h-2.5 w-2.5 mr-1 shrink-0" />
                              {t(`agents:import.${perm}`)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Allowed Tools */}
                {selectedTemplate.toolAllow && selectedTemplate.toolAllow.length > 0 && (
                  <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-900/10 p-3 space-y-1.5">
                    <h5 className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      {t('agents:import.allowedTools')}
                    </h5>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTemplate.toolAllow.map((tool) => (
                        <Badge
                          key={tool}
                          className="text-[11px] px-2.5 py-0.5 font-mono bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 hover:bg-emerald-200 dark:hover:bg-emerald-900/40"
                        >
                          {tool}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Denied Tools */}
                {selectedTemplate.toolDeny && selectedTemplate.toolDeny.length > 0 && (
                  <div className="rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10 p-3 space-y-1.5">
                    <h5 className="text-xs font-medium text-red-700 dark:text-red-400 flex items-center gap-1.5">
                      <XCircle className="h-3.5 w-3.5 shrink-0" />
                      {t('agents:import.deniedTools')}
                    </h5>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTemplate.toolDeny.map((tool) => (
                        <Badge
                          key={tool}
                          variant="destructive"
                          className="text-[11px] px-2.5 py-0.5 font-mono"
                        >
                          {tool}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Skill Dependencies — 支持一键安装 */}
              {selectedTemplate.requiredSkills && selectedTemplate.requiredSkills.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">{t('agents:import.requiredSkills')}</h4>
                  <div className="space-y-1">
                    {selectedTemplate.requiredSkills.map((slug) => {
                      const installed = skills.some((s) => (s.slug || s.id) === slug) || installedSkills.has(slug);
                      const isInstalling = installingSkills.has(slug);
                      return (
                        <div key={slug} className="flex items-center gap-2 rounded-md border px-3 py-2">
                          <Package className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-mono flex-1">{slug}</span>
                          {installed ? (
                            <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">
                              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                              {t('agents:import.installed')}
                            </Badge>
                          ) : isInstalling ? (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" />
                              {t('agents:import.installing')}
                            </Badge>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2"
                              onClick={async () => {
                                setInstallingSkills((prev) => new Set(prev).add(slug));
                                try {
                                  await installSkill(slug);
                                  setInstalledSkills((prev) => new Set(prev).add(slug));
                                  // 刷新技能列表
                                  await fetchSkills();
                                } catch {
                                  // 安装失败时保持原状
                                } finally {
                                  setInstallingSkills((prev) => {
                                    const next = new Set(prev);
                                    next.delete(slug);
                                    return next;
                                  });
                                }
                              }}
                            >
                              <Download className="h-2.5 w-2.5 mr-0.5" />
                              {t('common:actions.install')}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {missingSkills.filter((s) => !installedSkills.has(s)).length > 0 && (
                    <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                            {t('agents:import.missingSkillsWarning', { count: missingSkills.filter((s) => !installedSkills.has(s)).length })}
                          </p>
                          <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                            {t('agents:import.installAllHint')}
                          </p>
                        </div>
                        {/* 一键安装所有缺失技能 */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/30"
                          disabled={installingSkills.size > 0}
                          onClick={async () => {
                            const toInstall = missingSkills.filter((s) => !installedSkills.has(s));
                            setInstallingSkills(new Set(toInstall));
                            for (const slug of toInstall) {
                              try {
                                await installSkill(slug);
                                setInstalledSkills((prev) => new Set(prev).add(slug));
                              } catch {
                                // 继续安装下一个
                              }
                            }
                            setInstallingSkills(new Set());
                            await fetchSkills();
                          }}
                        >
                          {installingSkills.size > 0 ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Download className="h-3 w-3 mr-1" />
                          )}
                          {t('agents:import.installAll')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SOUL.md Preview */}
              <div className="space-y-1.5">
                <h4 className="text-sm font-semibold">{t('agents:import.soulPreview')}</h4>
                <div className="rounded-md border bg-muted/30 p-3 max-h-48 overflow-y-auto">
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                    {selectedTemplate.soulMd.slice(0, 500)}
                    {selectedTemplate.soulMd.length > 500 && '...'}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="px-6 pb-2">
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t shrink-0">
          <Button variant="outline" size="sm" onClick={handleClose} disabled={importing || saving}>
            {t('common:actions.close')}
          </Button>
          {step === 'detail' && selectedTemplate && (
            <Button
              size="sm"
              onClick={handleImport}
              disabled={importing || saving || isIdTaken || missingSkills.filter((s) => !installedSkills.has(s)).length > 0}
            >
              {importing || saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  {t('agents:import.importing')}
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  {t('agents:import.importBtn')}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
