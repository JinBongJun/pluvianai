import type { MutableRefObject } from "react";
import type { Node, NodeChange } from "reactflow";

export function createDragAwareNodesChangeHandler(options: {
  onNodesChangeBase: (changes: NodeChange[]) => void;
  setNodes: (updater: (nodes: Node[]) => Node[]) => void;
  commitHistory: (nodes: Node[]) => void;
  persistPositions: (nodes: Node[]) => void;
  isDraggingRef: MutableRefObject<boolean>;
  didActuallyDragRef: MutableRefObject<boolean>;
  onPositionDragEnd?: () => void;
}) {
  const {
    onNodesChangeBase,
    setNodes,
    commitHistory,
    persistPositions,
    isDraggingRef,
    didActuallyDragRef,
    onPositionDragEnd,
  } = options;

  return (changes: NodeChange[]) => {
    const isDragging = changes.some(
      change => change.type === "position" && (change as { dragging?: boolean }).dragging
    );
    if (isDragging) {
      isDraggingRef.current = true;
      didActuallyDragRef.current = true;
    }

    const hasExplicitDragEnd = changes.some(
      change =>
        change.type === "position" && (change as { dragging?: boolean }).dragging === false
    );
    if (hasExplicitDragEnd) {
      isDraggingRef.current = false;
      onPositionDragEnd?.();
      globalThis.setTimeout(() => {
        didActuallyDragRef.current = false;
      }, 0);
    }

    const filtered = changes.filter(change => {
      if (change.type === "select" && isDraggingRef.current) return false;
      return true;
    });
    onNodesChangeBase(filtered);

    const hasPositionCommit = changes.some(
      change => change.type === "position" && !(change as { dragging?: boolean }).dragging
    );
    if (!hasPositionCommit) return;

    setTimeout(() => {
      setNodes(currentNodes => {
        commitHistory(currentNodes);
        persistPositions(currentNodes);
        return currentNodes;
      });
    }, 0);
  };
}
