/**
 * SkillNode – Skill 执行节点
 *
 * 绑定一个 OpenClaw Skill，通过 Agent 执行后将结果传递给下游。
 * 有一个输入 Handle (target) 和一个输出 Handle (source)。
 */
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Sparkles, Timer, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkflowNodeData } from '@/types/workflow';
import { NodeRunResultPanel } from './NodeRunResultPanel';
import { useLayoutDirection } from '../LayoutDirectionContext';

function SkillNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData;
  const config = nodeData.skillConfig;
  const status = nodeData.runStatus;
  const result = nodeData.runResult;
  const dir = useLayoutDirection();
  const tgtPos = dir === 'LR' ? Position.Left : Position.Top;
  const srcPos = dir === 'LR' ? Position.Right : Position.Bottom;

  return (
    <div
      className={cn(
        'relative min-w-[200px] max-w-[300px] rounded-xl border-2 bg-background shadow-md transition-all',
        selected ? 'border-primary ring-2 ring-primary/20' : 'border-teal-400/60',
        status === 'running' && 'animate-pulse border-teal-400',
        status === 'success' && 'border-green-500',
        status === 'failed' && 'border-red-500',
      )}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={tgtPos}
        className="!h-3 !w-3 !border-2 !border-teal-400 !bg-background"
      />

      {/* Header */}
      <div className="flex items-center gap-2 rounded-t-[10px] bg-teal-50 px-3 py-2 dark:bg-teal-950/30">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-400/20 text-teal-600 dark:text-teal-400">
          {nodeData.emoji ? (
            <span className="text-base">{nodeData.emoji}</span>
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-teal-700 dark:text-teal-300 truncate">
            {nodeData.label || 'Skill'}
          </div>
          {config?.skillId && (
            <div className="text-[10px] text-muted-foreground truncate">
              {config.skillId}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="space-y-1 px-3 py-2">
        {config?.agentId && (
          <div className="text-[11px] text-muted-foreground truncate">
            <span className="font-medium">Agent:</span> {config.agentId}
          </div>
        )}

        {/* Metadata badges */}
        <div className="flex items-center gap-1.5">
          {config?.timeoutSeconds && (
            <div className="flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <Timer className="h-3 w-3" />
              {config.timeoutSeconds}s
            </div>
          )}
          {config?.retryCount && config.retryCount > 0 && (
            <div className="flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <RotateCw className="h-3 w-3" />
              ×{config.retryCount}
            </div>
          )}
        </div>

        {/* Prompt preview */}
        {config?.promptTemplate && (
          <div className="mt-1 rounded bg-muted/50 p-1.5 text-[10px] leading-tight text-muted-foreground line-clamp-2">
            {config.promptTemplate}
          </div>
        )}

        {/* 运行结果面板 */}
        <NodeRunResultPanel status={status} result={result} accentColor="teal" />
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={srcPos}
        className="!h-3 !w-3 !border-2 !border-teal-400 !bg-background"
      />
    </div>
  );
}

export const SkillNode = memo(SkillNodeComponent);
