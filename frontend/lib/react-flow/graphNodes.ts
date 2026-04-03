import type { Node } from "reactflow";

export function cloneNodeSnapshots(nodes: Node[]): Node[] {
  return nodes.map(node => ({
    ...node,
    position: { ...node.position },
  }));
}

export function buildGridLayout(
  nodes: Node[],
  options: { spacingX: number; spacingY: number; cols?: number }
): Node[] {
  const cols = Math.max(1, options.cols ?? Math.ceil(Math.sqrt(nodes.length)));
  return nodes.map((node, index) => ({
    ...node,
    position: {
      x: options.spacingX * (index % cols),
      y: options.spacingY * Math.floor(index / cols),
    },
  }));
}

export function syncNodeSelectionState(
  nodes: Node[],
  selectedNodeId: string | null
): Node[] {
  return nodes.map(node => ({
    ...node,
    selected: node.id === selectedNodeId,
    data: {
      ...node.data,
      blur: !!selectedNodeId && node.id !== selectedNodeId,
    },
  }));
}
