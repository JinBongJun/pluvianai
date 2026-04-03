"use client";

import { useCallback, useRef } from "react";
import { useEdgesState, useNodesState, useReactFlow } from "reactflow";

import { LV_GRID_SPACING_X, LV_GRID_SPACING_Y, saveLvPositions } from "./liveViewGraphLayout";
import { createDragAwareNodesChangeHandler } from "@/lib/react-flow/dragAwareNodeChanges";
import { buildGridLayout } from "@/lib/react-flow/graphNodes";
import { useGraphHistory } from "@/lib/react-flow/useGraphHistory";

export function useLiveViewGraphState(projectId: number) {
  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChangeBase] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
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
    setNodes(currentNodes => {
      const newNodes = buildGridLayout(currentNodes, {
        spacingX: LV_GRID_SPACING_X,
        spacingY: LV_GRID_SPACING_Y,
      });

      setTimeout(() => {
        commitHistory(newNodes);
        saveLvPositions(newNodes, projectId);
        setTimeout(() => fitView({ duration: 800, padding: 0.2 }), 50);
      }, 0);

      return newNodes;
    });
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

  return {
    nodes,
    setNodes,
    onNodesChange,
    edges,
    setEdges,
    onEdgesChange,
    fitView,
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
