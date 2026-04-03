"use client";

import { useEffect, useRef } from "react";
import { useNodesInitialized } from "reactflow";
import type { Node } from "reactflow";

type FitViewFn = (options?: { duration?: number; padding?: number }) => void;
type SetCenterFn = (
  x: number,
  y: number,
  options?: { zoom?: number; duration?: number }
) => void;

export function useGraphCameraController(options: {
  nodes: Node[];
  selectedNodeId: string | null;
  fitView: FitViewFn;
  setCenter?: SetCenterFn;
  fitRequestVersion?: number;
  idleFitRequestVersion?: number;
  fitDurationMs?: number;
  fitPadding?: number;
  focusZoom?: number;
  focusDurationMs?: number;
  focusOffsetX?: number;
  focusOffsetY?: number;
  fallbackWidth?: number;
  fallbackHeight?: number;
  suppressSelectedCenter?: boolean;
  onFitApplied?: () => void;
}) {
  const {
    nodes,
    selectedNodeId,
    fitView,
    setCenter,
    fitRequestVersion = 0,
    idleFitRequestVersion = 0,
    fitDurationMs = 800,
    fitPadding = 0.2,
    focusZoom = 1,
    focusDurationMs = 800,
    focusOffsetX = 0,
    focusOffsetY = 0,
    fallbackWidth = 340,
    fallbackHeight = 200,
    suppressSelectedCenter = false,
    onFitApplied,
  } = options;

  const nodesInitialized = useNodesInitialized();
  const lastAppliedFitRequestRef = useRef(0);
  const lastAppliedIdleFitRequestRef = useRef(0);

  useEffect(() => {
    if (!nodesInitialized) return;
    if (fitRequestVersion <= 0) return;
    if (fitRequestVersion === lastAppliedFitRequestRef.current) return;
    lastAppliedFitRequestRef.current = fitRequestVersion;
    fitView({ duration: fitDurationMs, padding: fitPadding });
    onFitApplied?.();
  }, [nodesInitialized, fitRequestVersion, fitView, fitDurationMs, fitPadding, onFitApplied]);

  useEffect(() => {
    if (!nodesInitialized) return;
    if (nodes.length === 0 || selectedNodeId) return;
    if (idleFitRequestVersion <= 0) return;
    if (idleFitRequestVersion === lastAppliedIdleFitRequestRef.current) return;
    lastAppliedIdleFitRequestRef.current = idleFitRequestVersion;
    fitView({ duration: fitDurationMs, padding: fitPadding });
  }, [
    nodesInitialized,
    nodes.length,
    selectedNodeId,
    idleFitRequestVersion,
    fitView,
    fitDurationMs,
    fitPadding,
  ]);

  useEffect(() => {
    if (!nodesInitialized) return;
    if (!selectedNodeId || !setCenter || suppressSelectedCenter) return;

    const node = nodes.find(currentNode => currentNode.id === selectedNodeId);
    if (!node) return;

    const width = node.width ?? fallbackWidth;
    const height = node.height ?? fallbackHeight;
    setCenter(
      node.position.x + width / 2 + focusOffsetX,
      node.position.y + height / 2 + focusOffsetY,
      {
        zoom: focusZoom,
        duration: focusDurationMs,
      }
    );
  }, [
    nodesInitialized,
    selectedNodeId,
    setCenter,
    suppressSelectedCenter,
    nodes,
    fallbackWidth,
    fallbackHeight,
    focusOffsetX,
    focusOffsetY,
    focusZoom,
    focusDurationMs,
  ]);

  return { nodesInitialized };
}
