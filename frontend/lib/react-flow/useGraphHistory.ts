"use client";

import { useCallback, useRef, useState } from "react";
import type { Node } from "reactflow";

import { cloneNodeSnapshots } from "./graphNodes";

const DEFAULT_HISTORY_CAP = 20;

export function useGraphHistory(historyCap = DEFAULT_HISTORY_CAP) {
  const [history, setHistory] = useState<Node[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyRef = useRef(history);
  historyRef.current = history;
  const historyIndexRef = useRef(historyIndex);
  historyIndexRef.current = historyIndex;

  const commitHistory = useCallback(
    (nodes: Node[]) => {
      const snapshot = cloneNodeSnapshots(nodes);
      const currentIndex = historyIndexRef.current;
      setHistory(prev => [...prev.slice(0, currentIndex + 1), snapshot].slice(-historyCap));
      setHistoryIndex(prev => Math.min(prev + 1, historyCap - 1));
    },
    [historyCap]
  );

  const resetHistory = useCallback(() => {
    historyRef.current = [];
    setHistory([]);
    setHistoryIndex(-1);
  }, []);

  const initializeHistory = useCallback((nodes: Node[]) => {
    if (nodes.length === 0 || historyRef.current.length > 0) return;
    const snapshot = cloneNodeSnapshots(nodes);
    historyRef.current = [snapshot];
    setHistory([snapshot]);
    setHistoryIndex(0);
  }, []);

  const undo = useCallback(
    (setNodes: (nodes: Node[]) => void) => {
      if (historyIndexRef.current <= 0) return;
      const nextIndex = historyIndexRef.current - 1;
      setHistoryIndex(nextIndex);
      const target = history[nextIndex];
      if (target) setNodes(target);
    },
    [history]
  );

  const redo = useCallback(
    (setNodes: (nodes: Node[]) => void) => {
      if (historyIndexRef.current >= history.length - 1) return;
      const nextIndex = historyIndexRef.current + 1;
      setHistoryIndex(nextIndex);
      const target = history[nextIndex];
      if (target) setNodes(target);
    },
    [history]
  );

  return {
    history,
    setHistory,
    historyIndex,
    setHistoryIndex,
    historyIndexRef,
    commitHistory,
    resetHistory,
    initializeHistory,
    undo,
    redo,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
  };
}
