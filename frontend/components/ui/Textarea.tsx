import React, { forwardRef, TextareaHTMLAttributes } from "react";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = "", error, ...props }, ref) => {
    return (
      <div className="w-full">
        <textarea
          ref={ref}
          className={`
                        w-full px-3 py-2 
                        bg-white/5 border border-white/10 rounded-lg
                        text-sm text-slate-200 placeholder:text-slate-500
                        focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50
                        disabled:opacity-50 disabled:cursor-not-allowed
                        transition-all
                        ${error ? "border-red-500/50 focus:ring-red-500/50 focus:border-red-500/50" : ""}
                        ${className}
                    `}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

export default Textarea;
