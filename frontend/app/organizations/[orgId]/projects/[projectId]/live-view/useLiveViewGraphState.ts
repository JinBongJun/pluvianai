"use client";

import { useCallback, useRef, useState } from "react";
import { useEdgesState, useNodesState } from "reactflow";

import { LV_GRID_SPACING_X, LV_GRID_SPACING_Y, saveLvPositions } from "./liveViewGraphLayout";
import { createDragAwareNodesChangeHandler } from "@/lib/react-flow/dragAwareNodeChanges";
import { buildGridLayout } from "@/lib/react-flow/graphNodes";
import { useGraphHistory } from "@/lib/react-flow/useGraphHistory";

export function useLiveViewGraphState(projectId: number) {
  const [nodes, setNodes, onNodesChangeBase] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [fitRequestVersion, setFitRequestVersion] = useState(0);
  const [idleFitRequestVersion, setIdleFitRequestVersion] = useState(0);
  const {
    history,
    setHistory,
    historyIndex,
    setHistoryIndex,
    commitHistory,
    resetHistory,
    initializeHistory,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useGraphHistory();

  const isDraggingRef = useRef(false);
  const didActuallyDragRef = useRef(false);

  function onAutoLayout() {
    const newNodes = buildGridLayout(nodes, {
      spacingX: LV_GRID_SPACING_X,
      spacingY: LV_GRID_SPACING_Y,
    });
    setNodes(newNodes);
    commitHistory(newNodes);
    saveLvPositions(newNodes, projectId);
    setFitRequestVersion(prev => prev + 1);
  }

  const onNodesChange = useCallback(
    createDragAwareNodesChangeHandler({
      onNodesChangeBase,
      setNodes,
      commitHistory,
      persistPositions: currentNodes => saveLvPositions(currentNodes, projectId),
      isDraggingRef,
      didActuallyDragRef,
    }),
    [onNodesChangeBase, setNodes, commitHistory, projectId]
  );

  const handleUndo = useCallback(() => {
    undo(setNodes);
  }, [undo, setNodes]);

  const handleRedo = useCallback(() => {
    redo(setNodes);
  }, [redo, setNodes]);

  const requestFitView = useCallback(() => {
    setFitRequestVersion(prev => prev + 1);
  }, []);

  const requestIdleFitView = useCallback(() => {
    setIdleFitRequestVersion(prev => prev + 1);
  }, []);

  return {
    nodes,
    setNodes,
    onNodesChange,
    edges,
    setEdges,
    onEdgesChange,
    fitRequestVersion,
    idleFitRequestVersion,
    requestFitView,
    requestIdleFitView,
    history,
    setHistory,
    historyIndex,
    setHistoryIndex,
    resetHistory,
    initializeHistory,
    onAutoLayout,
    undo: handleUndo,
    redo: handleRedo,
    canUndo,
    canRedo,
    isDraggingRef,
    didActuallyDragRef,
  };
}
