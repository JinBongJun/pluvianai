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
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "110%", opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className={clsx(
            "fixed top-6 right-6 bottom-6 w-[1100px] bg-[#0d0d0f]/90 backdrop-blur-3xl border border-white/10 shadow-[0_30px_90px_rgba(0,0,0,0.9)] rounded-[48px] z-inspector overflow-hidden flex flex-col",
            className
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-10 py-8 border-b border-white/5 bg-black/40">
            <div className="space-y-1">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
                Unit Diagnostics
              </span>
              <h2 className="text-3xl font-black text-white tracking-tighter">{title}</h2>
            </div>
            <div className="flex items-center gap-6">
              {headerActions}
              <button
                onClick={onClose}
                className="p-3 rounded-full hover:bg-white/5 text-slate-400 hover:text-white transition-all active:scale-90"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Navigation Tabs (Optional) */}
          {tabs && tabs.length > 0 && (
            <div className="border-b border-white/5 bg-black/20 pt-4">
              <nav className="flex gap-12 px-10">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      tab.onClick?.();
                      onTabChange?.(tab.id);
                    }}
                    className={clsx(
                      "px-8 py-6 text-[15px] font-black uppercase tracking-[0.2em] border-b-[4px] transition-all relative outline-none",
                      activeTab === tab.id
                        ? "text-white border-white"
                        : "text-slate-500 hover:text-slate-300 border-transparent hover:border-slate-700/50"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>
          )}

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-0">{children}</div>

          {/* Functional Footer */}
          <div className="p-6 px-10 border-t border-white/5 bg-black/40 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-pluvian-bio-500 animate-pulse" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                Clinical System Active
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RailwaySidePanel;
