/**
 * NodeRunResultPanel — 节点运行结果展示面板
 *
 * 参考 Coze 工作流界面，在每个节点下方显示运行状态详情：
 *   - 成功/失败/运行中 状态标识
 *   - 执行耗时
 *   - 输入数据 (可折叠)
 *   - 输出数据 (可折叠)
 *   - 错误信息
 */
import { memo, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  SkipForward,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NodeRunResult, NodeRunStatus } from '@/types/workflow';

interface Props {
  status?: NodeRunStatus;
  result?: NodeRunResult;
  /** 节点颜色主题 */
  accentColor?: 'orange' | 'blue' | 'teal' | 'purple' | 'green';
}

/** 格式化耗时 */
function formatDuration(ms?: number): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** 简洁显示 JSON 值 */
function formatValue(val: unknown): string {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'string') {
    // 截断长字符串
    return val.length > 200 ? val.slice(0, 200) + '…' : val;
  }
  if (typeof val === 'object') {
    const str = JSON.stringify(val, null, 2);
    return str.length > 500 ? str.slice(0, 500) + '…' : str;
  }
  return String(val);
}

const accentColors = {
  orange: {
    success: 'border-green-400/50 bg-green-50/50 dark:bg-green-950/20',
    failed: 'border-red-400/50 bg-red-50/50 dark:bg-red-950/20',
    running: 'border-blue-400/50 bg-blue-50/50 dark:bg-blue-950/20',
    skipped: 'border-gray-300/50 bg-gray-50/50 dark:bg-gray-950/20',
  },
  blue: {
    success: 'border-green-400/50 bg-green-50/50 dark:bg-green-950/20',
    failed: 'border-red-400/50 bg-red-50/50 dark:bg-red-950/20',
    running: 'border-blue-400/50 bg-blue-50/50 dark:bg-blue-950/20',
    skipped: 'border-gray-300/50 bg-gray-50/50 dark:bg-gray-950/20',
  },
  teal: {
    success: 'border-green-400/50 bg-green-50/50 dark:bg-green-950/20',
    failed: 'border-red-400/50 bg-red-50/50 dark:bg-red-950/20',
    running: 'border-teal-400/50 bg-teal-50/50 dark:bg-teal-950/20',
    skipped: 'border-gray-300/50 bg-gray-50/50 dark:bg-gray-950/20',
  },
  purple: {
    success: 'border-green-400/50 bg-green-50/50 dark:bg-green-950/20',
    failed: 'border-red-400/50 bg-red-50/50 dark:bg-red-950/20',
    running: 'border-blue-400/50 bg-blue-50/50 dark:bg-blue-950/20',
    skipped: 'border-gray-300/50 bg-gray-50/50 dark:bg-gray-950/20',
  },
  green: {
    success: 'border-green-400/50 bg-green-50/50 dark:bg-green-950/20',
    failed: 'border-red-400/50 bg-red-50/50 dark:bg-red-950/20',
    running: 'border-blue-400/50 bg-blue-50/50 dark:bg-blue-950/20',
    skipped: 'border-gray-300/50 bg-gray-50/50 dark:bg-gray-950/20',
  },
};

function NodeRunResultPanelComponent({ status, result, accentColor = 'blue' }: Props) {
  const [outputExpanded, setOutputExpanded] = useState(false);

  // 不在执行中/无结果时不显示
  if (!status || status === 'idle') return null;

  const isPending = status === 'pending';
  const isRunning = status === 'running';
  const isSuccess = status === 'success';
  const isFailed = status === 'failed';
  const isSkipped = status === 'skipped';

  // pending 状态只显示小标识
  if (isPending) {
    return (
      <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-yellow-300/50 bg-yellow-50/50 px-2.5 py-1 text-[10px] dark:bg-yellow-950/20">
        <div className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
        <span className="text-yellow-600 dark:text-yellow-400 font-medium">等待中…</span>
      </div>
    );
  }

  const colorKey = isFailed ? 'failed' : isSuccess ? 'success' : isSkipped ? 'skipped' : 'running';
  const colors = accentColors[accentColor][colorKey];

  return (
    <div className={cn('mt-1 rounded-lg border px-2.5 py-1.5 text-[10px]', colors)}>
      {/* Status header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {isRunning && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
          {isSuccess && <CheckCircle2 className="h-3 w-3 text-green-500" />}
          {isFailed && <XCircle className="h-3 w-3 text-red-500" />}
          {isSkipped && <SkipForward className="h-3 w-3 text-gray-400" />}
          <span className={cn(
            'font-medium',
            isRunning && 'text-blue-600 dark:text-blue-400',
            isSuccess && 'text-green-600 dark:text-green-400',
            isFailed && 'text-red-600 dark:text-red-400',
            isSkipped && 'text-gray-500',
          )}>
            {isRunning && '运行中…'}
            {isSuccess && '运行成功'}
            {isFailed && '运行失败'}
            {isSkipped && '已跳过'}
          </span>
        </div>
        {result?.durationMs !== undefined && (
          <div className="flex items-center gap-0.5 text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            <span>{formatDuration(result.durationMs)}</span>
          </div>
        )}
      </div>

      {/* Error message */}
      {isFailed && result?.error && (
        <div className="mt-1.5 flex items-start gap-1 rounded bg-red-100/80 px-2 py-1 dark:bg-red-950/40">
          <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0 text-red-500" />
          <span className="text-red-700 dark:text-red-300 break-all leading-relaxed">
            {result.error}
          </span>
        </div>
      )}

      {/* Output data (collapsible) */}
      {isSuccess && result?.output && Object.keys(result.output).length > 0 && (
        <div className="mt-1.5">
          <button
            className="flex w-full items-center gap-1 text-left text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setOutputExpanded(!outputExpanded);
            }}
          >
            {outputExpanded ? (
              <ChevronDown className="h-2.5 w-2.5" />
            ) : (
              <ChevronRight className="h-2.5 w-2.5" />
            )}
            <span className="font-medium">输出</span>
            <span className="text-[9px] opacity-60">({Object.keys(result.output).length} 字段)</span>
          </button>

          {outputExpanded && (
            <div className="mt-1 max-h-[200px] overflow-auto rounded bg-muted/50 px-2 py-1.5 font-mono text-[9px] leading-relaxed">
              {Object.entries(result.output).map(([key, value]) => (
                <div key={key} className="mb-1 last:mb-0">
                  <span className="font-semibold text-foreground/70">{key}</span>
                  <span className="text-muted-foreground"> : </span>
                  <span className="text-foreground/90 break-all whitespace-pre-wrap">
                    {formatValue(value)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const NodeRunResultPanel = memo(NodeRunResultPanelComponent);
