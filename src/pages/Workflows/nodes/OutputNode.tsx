/**
 * OutputNode – 频道输出节点
 *
 * 将工作流执行结果发送到指定的消息频道（如 Telegram / QQ Bot / Discord 等）。
 * 只有一个输入 Handle (target)，没有输出 Handle。
 */
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Send, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkflowNodeData } from '@/types/workflow';
import { NodeRunResultPanel } from './NodeRunResultPanel';
import { useLayoutDirection } from '../LayoutDirectionContext';

/** 频道类型到显示名称的映射 */
const channelDisplayNames: Record<string, string> = {
  telegram: 'Telegram',
  discord: 'Discord',
  qqbot: 'QQ Bot',
  whatsapp: 'WhatsApp',
  dingtalk: 'DingTalk',
  feishu: 'Feishu / Lark',
  signal: 'Signal',
  slack: 'Slack',
  msteams: 'MS Teams',
};

function OutputNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData;
  const config = nodeData.outputConfig;
  const status = nodeData.runStatus;
  const result = nodeData.runResult;
  const dir = useLayoutDirection();
  const tgtPos = dir === 'LR' ? Position.Left : Position.Top;
  const channelLabel = config?.channelType
    ? channelDisplayNames[config.channelType] || config.channelType
    : '';

  return (
    <div
      className={cn(
        'relative min-w-[180px] max-w-[280px] rounded-xl border-2 bg-background shadow-md transition-all',
        selected ? 'border-primary ring-2 ring-primary/20' : 'border-green-400/60',
        status === 'running' && 'animate-pulse border-blue-400',
        status === 'success' && 'border-green-500',
        status === 'failed' && 'border-red-500',
      )}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={tgtPos}
        className="!h-3 !w-3 !border-2 !border-green-400 !bg-background"
      />

      {/* Header */}
      <div className="flex items-center gap-2 rounded-t-[10px] bg-green-50 px-3 py-2 dark:bg-green-950/30">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-400/20 text-green-600 dark:text-green-400">
          {nodeData.emoji ? (
            <span className="text-base">{nodeData.emoji}</span>
          ) : (
            <Send className="h-4 w-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-green-700 dark:text-green-300 truncate">
            {nodeData.label || 'Output'}
          </div>
          {channelLabel && (
            <div className="text-[10px] text-muted-foreground truncate">
              → {channelLabel}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="space-y-1 rounded-b-[10px] bg-green-50/30 px-3 py-2 dark:bg-green-950/10">
        {config?.agentId && (
          <div className="text-[11px] text-muted-foreground truncate">
            <span className="font-medium">Agent:</span> {config.agentId}
          </div>
        )}

        {config?.deliveryTarget && (
          <div className="text-[11px] text-muted-foreground truncate">
            <span className="font-medium">To:</span> {config.deliveryTarget}
          </div>
        )}

        {!config?.channelType && (
          <div className="flex items-center gap-1 text-[11px] text-orange-500">
            <MessageSquare className="h-3 w-3" />
            <span>No channel configured</span>
          </div>
        )}

        {/* Message template preview */}
        {config?.messageTemplate && (
          <div className="mt-1 rounded bg-muted/50 p-1.5 text-[10px] leading-tight text-muted-foreground line-clamp-2">
            {config.messageTemplate}
          </div>
        )}

        {/* 运行结果面板 */}
        <NodeRunResultPanel status={status} result={result} accentColor="green" />
      </div>
    </div>
  );
}

export const OutputNode = memo(OutputNodeComponent);
