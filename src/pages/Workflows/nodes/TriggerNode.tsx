/**
 * TriggerNode – 工作流的入口节点
 *
 * 支持手动触发 / Cron 定时 / Webhook / 事件 四种模式。
 * 只有一个输出 Handle (source)。
 */
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Zap, Clock, Globe, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkflowNodeData, TriggerType } from '@/types/workflow';
import { NodeRunResultPanel } from './NodeRunResultPanel';
import { useLayoutDirection } from '../LayoutDirectionContext';

const triggerIcons: Record<TriggerType, React.ReactNode> = {
  manual: <Zap className="h-4 w-4" />,
  cron: <Clock className="h-4 w-4" />,
  webhook: <Globe className="h-4 w-4" />,
  event: <Radio className="h-4 w-4" />,
};

const triggerLabels: Record<TriggerType, string> = {
  manual: 'Manual',
  cron: 'Cron',
  webhook: 'Webhook',
  event: 'Event',
};

function TriggerNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData;
  const triggerType = nodeData.triggerConfig?.type ?? 'manual';
  const status = nodeData.runStatus;
  const result = nodeData.runResult;
  const dir = useLayoutDirection();
  const srcPos = dir === 'LR' ? Position.Right : Position.Bottom;

  return (
    <div
      className={cn(
        'relative min-w-[180px] max-w-[280px] rounded-xl border-2 bg-background shadow-md transition-all',
        selected ? 'border-primary ring-2 ring-primary/20' : 'border-orange-400/60',
        status === 'running' && 'animate-pulse border-blue-400',
        status === 'success' && 'border-green-500',
        status === 'failed' && 'border-red-500',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 rounded-t-[10px] bg-orange-50 px-3 py-2 dark:bg-orange-950/30">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-400/20 text-orange-600 dark:text-orange-400">
          {triggerIcons[triggerType]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-orange-700 dark:text-orange-300 truncate">
            {nodeData.label || 'Trigger'}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {triggerLabels[triggerType]}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2 text-xs text-muted-foreground">
        {triggerType === 'cron' && nodeData.triggerConfig?.cronExpression && (
          <div className="font-mono text-[11px]">{nodeData.triggerConfig.cronExpression}</div>
        )}
        {triggerType === 'webhook' && nodeData.triggerConfig?.webhookPath && (
          <div className="truncate font-mono text-[11px]">{nodeData.triggerConfig.webhookPath}</div>
        )}
        {triggerType === 'event' && nodeData.triggerConfig?.eventName && (
          <div className="truncate">{nodeData.triggerConfig.eventName}</div>
        )}
        {triggerType === 'manual' && !status && (
          <div className="italic">Click "Run" to start</div>
        )}

        {/* 运行结果面板 */}
        <NodeRunResultPanel status={status} result={result} accentColor="orange" />
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={srcPos}
        className="!h-3 !w-3 !border-2 !border-orange-400 !bg-background"
      />
    </div>
  );
}

export const TriggerNode = memo(TriggerNodeComponent);
