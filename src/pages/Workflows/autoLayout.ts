import type { WorkflowEdge, WorkflowNode } from '@/stores/workflow';
import type { WorkflowNodeType } from '@/types/workflow';
import type { LayoutDirection } from './LayoutDirectionContext';

type NodeSize = { width: number; height: number };
type NodePosition = { x: number; y: number };

const DEFAULT_NODE_SIZES: Record<WorkflowNodeType, NodeSize> = {
  trigger: { width: 220, height: 120 },
  agent: { width: 260, height: 170 },
  skill: { width: 260, height: 170 },
  logic: { width: 220, height: 150 },
  output: { width: 220, height: 150 },
};

const NODE_TYPE_ORDER: Record<WorkflowNodeType, number> = {
  trigger: 0,
  agent: 1,
  skill: 2,
  logic: 3,
  output: 4,
};

function average(values: number[]): number | undefined {
  if (!values.length) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundPosition(value: number): number {
  return Math.round(value * 100) / 100;
}

function getNodeType(node: WorkflowNode): WorkflowNodeType {
  const type = node.data?.type;
  if (type && typeof type === 'string' && type in DEFAULT_NODE_SIZES) {
    return type as WorkflowNodeType;
  }
  return 'agent';
}

function getNodeSize(node: WorkflowNode): NodeSize {
  const fallback = DEFAULT_NODE_SIZES[getNodeType(node)];
  const measuredWidth = typeof node.measured?.width === 'number' ? node.measured.width : undefined;
  const measuredHeight = typeof node.measured?.height === 'number' ? node.measured.height : undefined;
  const width = typeof node.width === 'number' ? node.width : measuredWidth;
  const height = typeof node.height === 'number' ? node.height : measuredHeight;

  return {
    width: width ?? fallback.width,
    height: height ?? fallback.height,
  };
}

function getCrossSize(size: NodeSize, dir: LayoutDirection): number {
  return dir === 'TB' ? size.width : size.height;
}

function getMainSize(size: NodeSize, dir: LayoutDirection): number {
  return dir === 'TB' ? size.height : size.width;
}

function getCrossPosition(node: WorkflowNode, dir: LayoutDirection): number {
  return dir === 'TB' ? node.position.x : node.position.y;
}

function getMainPosition(node: WorkflowNode, dir: LayoutDirection): number {
  return dir === 'TB' ? node.position.y : node.position.x;
}

function compareNodes(a: WorkflowNode, b: WorkflowNode, dir: LayoutDirection): number {
  const typeDiff = NODE_TYPE_ORDER[getNodeType(a)] - NODE_TYPE_ORDER[getNodeType(b)];
  if (typeDiff !== 0) return typeDiff;

  const mainDiff = getMainPosition(a, dir) - getMainPosition(b, dir);
  if (mainDiff !== 0) return mainDiff;

  const crossDiff = getCrossPosition(a, dir) - getCrossPosition(b, dir);
  if (crossDiff !== 0) return crossDiff;

  return (a.data?.label ?? '').localeCompare(b.data?.label ?? '');
}

function buildGraph(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();

  for (const node of nodes) {
    parents.set(node.id, []);
    children.set(node.id, []);
  }

  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue;

    const nextChildren = children.get(edge.source) ?? [];
    if (!nextChildren.includes(edge.target)) {
      nextChildren.push(edge.target);
      children.set(edge.source, nextChildren);
    }

    const nextParents = parents.get(edge.target) ?? [];
    if (!nextParents.includes(edge.source)) {
      nextParents.push(edge.source);
      parents.set(edge.target, nextParents);
    }
  }

  return { nodeMap, parents, children };
}

function computeLayers(
  nodes: WorkflowNode[],
  parents: Map<string, string[]>,
  children: Map<string, string[]>,
  dir: LayoutDirection,
): string[][] {
  const sortedIds = nodes
    .slice()
    .sort((a, b) => compareNodes(a, b, dir))
    .map((node) => node.id);

  const indegree = new Map<string, number>(sortedIds.map((id) => [id, (parents.get(id) ?? []).length]));
  const workingIndegree = new Map(indegree);
  const layerById = new Map<string, number>();
  const processed = new Set<string>();

  let queue = sortedIds.filter((id) => (workingIndegree.get(id) ?? 0) === 0);
  if (!queue.length && sortedIds.length) {
    queue = [sortedIds[0]];
  }

  for (const rootId of queue) {
    layerById.set(rootId, 0);
  }

  while (queue.length) {
    const nodeId = queue.shift();
    if (!nodeId || processed.has(nodeId)) continue;

    processed.add(nodeId);
    const currentLayer = layerById.get(nodeId) ?? 0;

    for (const childId of children.get(nodeId) ?? []) {
      layerById.set(childId, Math.max(layerById.get(childId) ?? 0, currentLayer + 1));

      const nextInDegree = (workingIndegree.get(childId) ?? 0) - 1;
      workingIndegree.set(childId, nextInDegree);
      if (nextInDegree <= 0) {
        queue.push(childId);
      }
    }
  }

  if (processed.size !== sortedIds.length) {
    let fallbackLayer = Math.max(0, ...Array.from(layerById.values()));

    for (const nodeId of sortedIds) {
      if (processed.has(nodeId)) continue;

      const parentLayers = (parents.get(nodeId) ?? [])
        .map((parentId) => layerById.get(parentId))
        .filter((layer): layer is number => typeof layer === 'number');
      const nextLayer = parentLayers.length ? Math.max(...parentLayers) + 1 : fallbackLayer + 1;

      layerById.set(nodeId, nextLayer);
      processed.add(nodeId);
      fallbackLayer = Math.max(fallbackLayer, nextLayer);
    }
  }

  const maxLayer = Math.max(0, ...Array.from(layerById.values()));
  const layers = Array.from({ length: maxLayer + 1 }, () => [] as string[]);

  for (const nodeId of sortedIds) {
    const layerIndex = layerById.get(nodeId) ?? 0;
    layers[layerIndex].push(nodeId);
  }

  return layers.filter((layer) => layer.length > 0);
}

function buildOrderIndex(layers: string[][]): Map<string, number> {
  const orderIndex = new Map<string, number>();
  for (const layer of layers) {
    layer.forEach((nodeId, index) => {
      orderIndex.set(nodeId, index);
    });
  }
  return orderIndex;
}

function sortLayerByBarycenter(
  layer: string[],
  nodeMap: Map<string, WorkflowNode>,
  neighborMap: Map<string, string[]>,
  orderIndex: Map<string, number>,
  dir: LayoutDirection,
): string[] {
  return [...layer].sort((aId, bId) => {
    const aNeighbors = (neighborMap.get(aId) ?? [])
      .map((neighborId) => orderIndex.get(neighborId))
      .filter((index): index is number => typeof index === 'number');
    const bNeighbors = (neighborMap.get(bId) ?? [])
      .map((neighborId) => orderIndex.get(neighborId))
      .filter((index): index is number => typeof index === 'number');

    const aScore = average(aNeighbors) ?? (orderIndex.get(aId) ?? 0);
    const bScore = average(bNeighbors) ?? (orderIndex.get(bId) ?? 0);
    if (aScore !== bScore) return aScore - bScore;

    return compareNodes(nodeMap.get(aId)!, nodeMap.get(bId)!, dir);
  });
}

export function autoLayoutWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  dir: LayoutDirection,
): WorkflowNode[] {
  if (!nodes.length) return nodes;

  const { nodeMap, parents, children } = buildGraph(nodes, edges);
  let layers = computeLayers(nodes, parents, children, dir).map((layer) =>
    layer.sort((aId, bId) => compareNodes(nodeMap.get(aId)!, nodeMap.get(bId)!, dir)),
  );

  for (let sweep = 0; sweep < 4; sweep += 1) {
    const downOrder = buildOrderIndex(layers);
    for (let layerIndex = 1; layerIndex < layers.length; layerIndex += 1) {
      layers[layerIndex] = sortLayerByBarycenter(layers[layerIndex], nodeMap, parents, downOrder, dir);
    }

    const upOrder = buildOrderIndex(layers);
    for (let layerIndex = layers.length - 2; layerIndex >= 0; layerIndex -= 1) {
      layers[layerIndex] = sortLayerByBarycenter(layers[layerIndex], nodeMap, children, upOrder, dir);
    }
  }

  const spacing =
    dir === 'TB'
      ? { padding: 80, crossGap: 96, mainGap: 140 }
      : { padding: 80, crossGap: 112, mainGap: 180 };

  const positions = new Map<string, NodePosition>();
  const centers = new Map<string, number>();
  let mainCursor = 0;

  for (const layer of layers) {
    const layerSizes = layer.map((nodeId) => getNodeSize(nodeMap.get(nodeId)!));
    const layerMainSize = Math.max(0, ...layerSizes.map((size) => getMainSize(size, dir)));
    const provisionalPlacements: Array<{
      nodeId: string;
      crossSize: number;
      crossStart: number;
      idealCenter?: number;
    }> = [];

    let runningCross = 0;

    for (const nodeId of layer) {
      const nodeSize = getNodeSize(nodeMap.get(nodeId)!);
      const crossSize = getCrossSize(nodeSize, dir);
      const idealCenter = average(
        (parents.get(nodeId) ?? [])
          .map((parentId) => centers.get(parentId))
          .filter((center): center is number => typeof center === 'number'),
      );

      let crossStart = typeof idealCenter === 'number' ? idealCenter - crossSize / 2 : runningCross;
      const previous = provisionalPlacements[provisionalPlacements.length - 1];
      if (previous) {
        crossStart = Math.max(crossStart, previous.crossStart + previous.crossSize + spacing.crossGap);
      }

      provisionalPlacements.push({ nodeId, crossSize, crossStart, idealCenter });
      runningCross = crossStart + crossSize + spacing.crossGap;
    }

    const layerShift =
      average(
        provisionalPlacements
          .filter((placement): placement is typeof placement & { idealCenter: number } =>
            typeof placement.idealCenter === 'number')
          .map((placement) => placement.idealCenter - (placement.crossStart + placement.crossSize / 2)),
      ) ?? 0;

    for (const placement of provisionalPlacements) {
      const cross = placement.crossStart + layerShift;
      const position = dir === 'TB' ? { x: cross, y: mainCursor } : { x: mainCursor, y: cross };

      positions.set(placement.nodeId, position);
      centers.set(placement.nodeId, cross + placement.crossSize / 2);
    }

    mainCursor += layerMainSize + spacing.mainGap;
  }

  for (let layerIndex = layers.length - 2; layerIndex >= 0; layerIndex -= 1) {
    const layer = layers[layerIndex];
    const layerShift =
      average(
        layer
          .map((nodeId) => {
            const childCenters = (children.get(nodeId) ?? [])
              .map((childId) => centers.get(childId))
              .filter((center): center is number => typeof center === 'number');
            const currentCenter = centers.get(nodeId);
            if (!childCenters.length || typeof currentCenter !== 'number') {
              return undefined;
            }

            return average(childCenters)! - currentCenter;
          })
          .filter((shift): shift is number => typeof shift === 'number'),
      ) ?? 0;

    if (!layerShift) continue;

    for (const nodeId of layer) {
      const position = positions.get(nodeId);
      const center = centers.get(nodeId);
      if (!position || typeof center !== 'number') continue;

      const nextPosition =
        dir === 'TB'
          ? { x: position.x + layerShift, y: position.y }
          : { x: position.x, y: position.y + layerShift };

      positions.set(nodeId, nextPosition);
      centers.set(nodeId, center + layerShift);
    }
  }

  const minX = Math.min(...nodes.map((node) => positions.get(node.id)?.x ?? node.position.x));
  const minY = Math.min(...nodes.map((node) => positions.get(node.id)?.y ?? node.position.y));
  const offsetX = spacing.padding - minX;
  const offsetY = spacing.padding - minY;

  return nodes.map((node) => {
    const nextPosition = positions.get(node.id);
    if (!nextPosition) return node;

    return {
      ...node,
      position: {
        x: roundPosition(nextPosition.x + offsetX),
        y: roundPosition(nextPosition.y + offsetY),
      },
    };
  });
}
