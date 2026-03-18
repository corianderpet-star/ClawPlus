/**
 * LayoutDirectionContext
 *
 * 为工作流画布中的所有自定义节点提供当前布局方向 (TB / LR)，
 * 节点据此调整 Handle 位置，实现纵向 ↔ 横向切换。
 */
import { createContext, useContext } from 'react';

export type LayoutDirection = 'TB' | 'LR';

const LayoutDirectionContext = createContext<LayoutDirection>('TB');

export const LayoutDirectionProvider = LayoutDirectionContext.Provider;

export function useLayoutDirection(): LayoutDirection {
  return useContext(LayoutDirectionContext);
}
