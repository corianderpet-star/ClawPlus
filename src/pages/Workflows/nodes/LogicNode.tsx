/**
 * LogicNode – 逻辑控制节点
 *
 * 支持三种逻辑类型：
 *   - branch: 条件分支 (多个输出 Handle)
 *   - merge:  汇聚节点 (多个输入, 一个输出)
 *   - delay:  延时等待
 */
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { GitBranch, Combine, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkflowNodeData } from '@/types/workflow';
import { NodeRunResultPanel } from './NodeRunResultPanel';
import { useLayoutDirection } from '../LayoutDirectionContext';

const logicIcons = {
  branch: <GitBranch className="h-4 w-4" />,
  merge: <Combine className="h-4 w-4" />,
  delay: <Timer className="h-4 w-4" />,
};

const logicLabels = {
  branch: 'Branch',
  merge: 'Merge',
  delay: 'Delay',
};

function LogicNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData;
  const logicType = nodeData.logicConfig?.logicType ?? 'branch';
  const status = nodeData.runStatus;
  const result = nodeData.runResult;
  const conditions = nodeData.logicConfig?.conditions ?? [];
  const dir = useLayoutDirection();
  const tgtPos = dir === 'LR' ? Position.Left : Position.Top;
  const srcPos = dir === 'LR' ? Position.Right : Position.Bottom;

  return (
    <div
      className={cn(
        'relative min-w-[180px] max-w-[280px] rounded-xl border-2 bg-background shadow-md transition-all',
        selected ? 'border-primary ring-2 ring-primary/20' : 'border-purple-400/60',
        status === 'running' && 'animate-pulse border-blue-400',
        status === 'success' && 'border-green-500',
        status === 'failed' && 'border-red-500',
      )}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={tgtPos}
        className="!h-3 !w-3 !border-2 !border-purple-400 !bg-background"
      />

      {/* Header */}
      <div className="flex items-center gap-2 rounded-t-[10px] bg-purple-50 px-3 py-2 dark:bg-purple-950/30">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-400/20 text-purple-600 dark:text-purple-400">
          {logicIcons[logicType]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-purple-700 dark:text-purple-300 truncate">
            {nodeData.label || logicLabels[logicType]}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {logicLabels[logicType]}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2 text-xs text-muted-foreground">
        {logicType === 'branch' && conditions.length > 0 && (
          <div className="space-y-1">
            {conditions.map((c) => (
              <div key={c.id} className="flex items-center gap-1 text-[11px]">
                <span className="inline-block h-2 w-2 rounded-full bg-purple-400" />
                <span className="truncate">{c.label || c.field}</span>
              </div>
            ))}
            {nodeData.logicConfig?.defaultHandle && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                <span className="inline-block h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                <span>Default</span>
              </div>
            )}
          </div>
        )}
        {logicType === 'delay' && (
          <div className="font-mono text-[11px]">
            {nodeData.logicConfig?.delaySeconds ?? 0}s delay
          </div>
        )}
        {logicType === 'merge' && (
          <div className="italic text-[11px]">Wait for all inputs</div>
        )}

        {/* 运行结果面板 */}
        <NodeRunResultPanel status={status} result={result} accentColor="purple" />
      </div>

      {/* Output Handle(s) */}
      {logicType === 'branch' ? (
        <>
          {/* 为每个条件创建独立的 Source Handle */}
          {conditions.map((c, i) => {
            // 均匀分布: 在节点右侧 (LR) 或底部 (TB) 按比例分布
            const total = conditions.length + 1; // +1 for default
            const pct = ((i + 1) / (total + 1)) * 100;
            return (
              <Handle
                key={c.id}
                type="source"
                position={srcPos}
                id={c.targetHandle}
                className="!h-3 !w-3 !border-2 !border-purple-400 !bg-background"
                style={dir === 'LR' ? { top: `${pct}%`, right: -6 } : { left: `${pct}%`, bottom: -6 }}
              />
            );
          })}
          {/* Default output handle */}
          {(() => {
            const total = conditions.length + 1;
            const pct = (total / (total + 1)) * 100;
            return (
              <Handle
                type="source"
                position={srcPos}
                id={nodeData.logicConfig?.defaultHandle ?? 'default'}
                className="!h-3 !w-3 !border-2 !border-gray-400 !bg-background"
                style={dir === 'LR' ? { top: `${pct}%`, right: -6 } : { left: `${pct}%`, bottom: -6 }}
              />
            );
          })()}
        </>
      ) : (
        <Handle
          type="source"
          position={srcPos}
          className="!h-3 !w-3 !border-2 !border-purple-400 !bg-background"
        />
      )}
    </div>
  );
}

export const LogicNode = memo(LogicNodeComponent);
