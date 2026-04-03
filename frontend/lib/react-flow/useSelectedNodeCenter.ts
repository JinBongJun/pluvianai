"use client";

import { useEffect } from "react";
import type { MutableRefObject } from "react";
import type { Node } from "reactflow";

export function useSelectedNodeCenter(options: {
  selectedNodeId: string | null;
  nodes: Node[];
  setCenter: (
    x: number,
    y: number,
    options?: { zoom?: number; duration?: number }
  ) => void;
  zoom: number;
  durationMs: number;
  offsetX?: number;
  offsetY?: number;
  fallbackWidth?: number;
  fallbackHeight?: number;
  suppressRef?: MutableRefObject<boolean>;
}) {
  const {
    selectedNodeId,
    nodes,
    setCenter,
    zoom,
    durationMs,
    offsetX = 0,
    offsetY = 0,
    fallbackWidth = 340,
    fallbackHeight = 200,
    suppressRef,
  } = options;

  useEffect(() => {
    if (!selectedNodeId) return;
    if (suppressRef?.current) return;

    const node = nodes.find(currentNode => currentNode.id === selectedNodeId);
    if (!node) return;

    const width = node.width ?? fallbackWidth;
    const height = node.height ?? fallbackHeight;
    setCenter(node.position.x + width / 2 + offsetX, node.position.y + height / 2 + offsetY, {
      zoom,
      duration: durationMs,
    });
  }, [
    selectedNodeId,
    nodes,
    setCenter,
    zoom,
    durationMs,
    offsetX,
    offsetY,
    fallbackWidth,
    fallbackHeight,
    suppressRef,
  ]);
}
