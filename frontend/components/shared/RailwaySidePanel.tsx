// Shared components - RailwaySidePanel
import React from "react";
import { X } from "lucide-react";
import { clsx } from "clsx";
import { motion, AnimatePresence } from "framer-motion";

interface Tab {
  id: string;
  label: string;
  onClick?: () => void;
}

interface RailwaySidePanelProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  tabs?: Tab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  children: React.ReactNode;
  className?: string;
  headerActions?: React.ReactNode;
  /** Panel width (default 1100px). Use a smaller value (e.g. 400) for split left/right layout. */
  width?: number;
  /** If true, show close (X) button prominently in header. */
  showCloseButton?: boolean;
  /** Which side the panel is on (for slide animation direction). */
  side?: "left" | "right";
  /** Optional test id prefix for tab buttons (e.g. "rg-data-tab"). */
  tabTestIdPrefix?: string;
  contentClassName?: string;
  contentScrollable?: boolean;
  /** Small label above the title (defaults to "Unit Diagnostics"). */
  headerEyebrow?: string;
  /** Status line in the footer (defaults to legacy clinical copy for existing screens). */
  footerStatusLabel?: string;
}

const RailwaySidePanel: React.FC<RailwaySidePanelProps> = ({
  title,
  isOpen,
  onClose,
  tabs,
  activeTab,
  onTabChange,
  children,
  className = "",
  headerActions,
  width = 1100,
  showCloseButton = true,
  side = "right",
  tabTestIdPrefix,
  contentClassName = "",
  contentScrollable = true,
  headerEyebrow = "Unit Diagnostics",
  footerStatusLabel = "Clinical System Active",
}) => {
  const isLeft = side === "left";
  const slideFrom = isLeft ? "-100%" : "100%";
  const slideExit = isLeft ? "-110%" : "110%";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: slideFrom, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: slideExit, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className={clsx(
            "fixed top-6 bottom-6 bg-[#0c0c0f]/95 backdrop-blur-3xl border border-white/[0.08] shadow-[0_20px_60px_rgba(0,0,0,0.85)] rounded-[28px] z-[9999] overflow-hidden flex flex-col",
            isLeft ? "left-6" : "right-6",
            className
          )}
          style={{ width: width }}
          onWheelCapture={event => {
            event.stopPropagation();
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06] bg-black/30">
            <div className="flex-1 min-w-0">
              <span className="text-[9px] font-semibold text-slate-600 uppercase tracking-[0.22em] block">
                {headerEyebrow}
              </span>
              {title && (
                <h2 className="text-[13px] font-semibold text-white/85 tracking-tight truncate mt-0.5">{title}</h2>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {headerActions}
              {showCloseButton && (
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-white/[0.07] text-slate-500 hover:text-slate-300 transition-all active:scale-90"
                  title="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Navigation Tabs (Optional) */}
          {tabs && tabs.length > 0 && (
            <div className="border-b border-white/[0.06] bg-black/10">
              <nav className="flex">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    data-testid={tabTestIdPrefix ? `${tabTestIdPrefix}-${tab.id}` : undefined}
                    onClick={() => {
                      tab.onClick?.();
                      onTabChange?.(tab.id);
                    }}
                    className={clsx(
                      "flex-1 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] border-b-2 transition-all outline-none",
                      activeTab === tab.id
                        ? "text-white/90 border-white/60"
                        : "text-slate-500 hover:text-slate-400 border-transparent"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>
          )}

          {/* Content Area */}
          <div
            className={clsx(
              "flex h-0 flex-1 min-h-0 flex-col p-0",
              contentScrollable && "overflow-y-auto custom-scrollbar",
              contentClassName
            )}
            onWheelCapture={event => {
              event.stopPropagation();
            }}
          >
            {children}
          </div>

          {/* Functional Footer */}
          <div className="px-5 py-2.5 border-t border-white/[0.06] bg-black/30 flex items-center">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-pluvian-bio-500 animate-pulse" />
              <span className="text-[9px] font-medium text-slate-600 uppercase tracking-widest">
                {footerStatusLabel}
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RailwaySidePanel;
