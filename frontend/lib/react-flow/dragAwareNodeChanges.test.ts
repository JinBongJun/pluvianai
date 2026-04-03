import { afterEach, describe, expect, it, vi } from "vitest";
import type { Node, NodeChange } from "reactflow";

import { createDragAwareNodesChangeHandler } from "./dragAwareNodeChanges";

describe("createDragAwareNodesChangeHandler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("filters select changes while dragging", () => {
    const onNodesChangeBase = vi.fn();
    const setNodes = vi.fn();
    const commitHistory = vi.fn();
    const persistPositions = vi.fn();
    const isDraggingRef = { current: false };
    const didActuallyDragRef = { current: false };

    const handleChange = createDragAwareNodesChangeHandler({
      onNodesChangeBase,
      setNodes,
      commitHistory,
      persistPositions,
      isDraggingRef,
      didActuallyDragRef,
    });

    handleChange([
      { id: "a", type: "position", position: { x: 10, y: 20 }, dragging: true } as NodeChange,
      { id: "a", type: "select", selected: true } as NodeChange,
    ]);

    expect(isDraggingRef.current).toBe(true);
    expect(didActuallyDragRef.current).toBe(true);
    expect(onNodesChangeBase).toHaveBeenCalledWith([
      { id: "a", type: "position", position: { x: 10, y: 20 }, dragging: true },
    ]);
  });

  it("persists positions after a committed drag change", () => {
    vi.useFakeTimers();

    const currentNodes: Node[] = [
      {
        id: "a",
        type: "agentCard",
        position: { x: 30, y: 40 },
        data: { label: "a" },
      },
    ];
    const onNodesChangeBase = vi.fn();
    const commitHistory = vi.fn();
    const persistPositions = vi.fn();
    const isDraggingRef = { current: false };
    const didActuallyDragRef = { current: false };

    const setNodes = vi.fn((updater: (nodes: Node[]) => Node[]) => updater(currentNodes));
    const handleChange = createDragAwareNodesChangeHandler({
      onNodesChangeBase,
      setNodes,
      commitHistory,
      persistPositions,
      isDraggingRef,
      didActuallyDragRef,
    });

    handleChange([
      { id: "a", type: "position", position: { x: 30, y: 40 }, dragging: false } as NodeChange,
    ]);
    vi.runAllTimers();

    expect(setNodes).toHaveBeenCalledTimes(1);
    expect(commitHistory).toHaveBeenCalledWith(currentNodes);
    expect(persistPositions).toHaveBeenCalledWith(currentNodes);
  });

  it("clears drag refs when position commits with dragging:false and notifies drag end", () => {
    vi.useFakeTimers();
    const onPositionDragEnd = vi.fn();
    const isDraggingRef = { current: true };
    const didActuallyDragRef = { current: true };
    const onNodesChangeBase = vi.fn();
    const setNodes = vi.fn();
    const commitHistory = vi.fn();
    const persistPositions = vi.fn();

    const handleChange = createDragAwareNodesChangeHandler({
      onNodesChangeBase,
      setNodes,
      commitHistory,
      persistPositions,
      isDraggingRef,
      didActuallyDragRef,
      onPositionDragEnd,
    });

    handleChange([
      { id: "a", type: "position", position: { x: 1, y: 2 }, dragging: false } as NodeChange,
    ]);
    expect(isDraggingRef.current).toBe(false);
    expect(onPositionDragEnd).toHaveBeenCalledTimes(1);
    expect(didActuallyDragRef.current).toBe(true);
    vi.runAllTimers();
    expect(didActuallyDragRef.current).toBe(false);
  });
});
