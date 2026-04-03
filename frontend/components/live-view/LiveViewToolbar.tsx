"use client";

import clsx from "clsx";
import { LayoutGrid, Maximize, Minus, Plus, Redo, Undo } from "lucide-react";
import { useReactFlow } from "reactflow";

/**
 * Floating canvas controls (zoom, fit, undo/redo stack, auto-layout).
 * Must render under {@link LiveViewFlowShell} / `ReactFlowProvider`.
 */
export interface LiveViewToolbarProps {
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onAutoLayout: () => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export function LiveViewToolbar({
  onUndo,
  onRedo,
  onAutoLayout,
  canUndo,
  canRedo,
}: LiveViewToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  const groupBase =
    "flex flex-col bg-[#1C1C1E] border border-[#3A3A3C] shadow-lg rounded-[18px] overflow-hidden relative group transition-all duration-300";
  const btnBase =
    "flex items-center justify-center w-[46px] h-[46px] text-[#8E8E93] hover:text-white hover:bg-white/[0.05] transition-all duration-200 relative z-10";

  return (
    <div className="absolute left-6 top-[180px] z-50 flex flex-col gap-3.5">
      <div className={groupBase}>
        <button
          type="button"
          data-testid="live-view-auto-layout-btn"
          className={btnBase}
          onClick={onAutoLayout}
          title="Auto Layout"
        >
          <LayoutGrid className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </button>
      </div>

      <div className={groupBase}>
        <button type="button" className={btnBase} onClick={() => zoomIn({ duration: 300 })}>
          <Plus className="w-[20px] h-[20px]" strokeWidth={1.5} />
        </button>
        <button type="button" className={btnBase} onClick={() => zoomOut({ duration: 300 })}>
          <Minus className="w-[20px] h-[20px]" strokeWidth={1.5} />
        </button>
        <button type="button" className={btnBase} onClick={() => fitView({ duration: 800 })}>
          <Maximize className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </button>
      </div>

      <div className={groupBase}>
        <button
          type="button"
          className={clsx(btnBase, !canUndo && "opacity-20 pointer-events-none grayscale")}
          onClick={onUndo}
          disabled={!canUndo}
        >
          <Undo className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          className={clsx(btnBase, !canRedo && "opacity-20 pointer-events-none grayscale")}
          onClick={onRedo}
          disabled={!canRedo}
        >
          <Redo className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
