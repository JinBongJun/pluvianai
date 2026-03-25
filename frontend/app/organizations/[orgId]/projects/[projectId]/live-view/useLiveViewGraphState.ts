"use client";

import { useCallback, useRef, useState } from "react";
import type { Node, NodeChange } from "reactflow";
import { useEdgesState, useNodesState, useReactFlow } from "reactflow";

import {
  LV_GRID_SPACING_X,
  LV_GRID_SPACING_Y,
  saveLvPositions,
} from "./liveViewGraphLayout";

const HISTORY_CAP = 20;
const MAX_HISTORY_INDEX = HISTORY_CAP - 1;

export function useLiveViewGraphState(projectId: number) {
  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChangeBase] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [history, setHistory] = useState<Node[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const isDraggingRef = useRef(false);
  const didActuallyDragRef = useRef(false);
  const [dragEndCounter, setDragEndCounter] = useState(0);

  function commitHistory(newNodes: Node[]) {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      const snapshot = newNodes.map(n => ({ ...n, position: { ...n.position } }));
      return [...newHistory, snapshot].slice(-HISTORY_CAP);
    });
    setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY_INDEX));
  }

  function onAutoLayout() {
    setNodes(currentNodes => {
      const cols = Math.max(1, Math.ceil(Math.sqrt(currentNodes.length)));

      const newNodes = currentNodes.map((n, idx) => ({
        ...n,
        position: {
          x: LV_GRID_SPACING_X * (idx % cols),
          y: LV_GRID_SPACING_Y * Math.floor(idx / cols),
        },
      }));

      setTimeout(() => {
        commitHistory(newNodes);
        saveLvPositions(newNodes, projectId);
        setTimeout(() => fitView({ duration: 800, padding: 0.2 }), 50);
      }, 0);

      return newNodes;
    });
  }

  function onNodesChange(changes: NodeChange[]) {
    const dragging = changes.some(
      c => c.type === "position" && (c as { dragging?: boolean }).dragging
    );
    if (dragging) {
      isDraggingRef.current = true;
      didActuallyDragRef.current = true;
    }
    const filtered = changes.filter(c => {
      if (c.type === "select" && isDraggingRef.current) return false;
      return true;
    });
    onNodesChangeBase(filtered);

    const hasPositionChange = changes.some(
      c => c.type === "position" && !(c as { dragging?: boolean }).dragging
    );
    if (hasPositionChange) {
      setTimeout(() => {
        setNodes(currentNodes => {
          commitHistory(currentNodes);
          saveLvPositions(currentNodes, projectId);
          return currentNodes;
        });
      }, 0);
    }
  }

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setNodes(history[newIndex]);
    }
  }, [historyIndex, history, setNodes]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setNodes(history[newIndex]);
    }
  }, [historyIndex, history, setNodes]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

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
    onAutoLayout,
    undo,
    redo,
    canUndo,
    canRedo,
    isDraggingRef,
    didActuallyDragRef,
    dragEndCounter,
    setDragEndCounter,
  };
}
