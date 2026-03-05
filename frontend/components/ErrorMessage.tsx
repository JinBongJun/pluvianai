"use client";

import { AlertCircle, X } from "lucide-react";
import { useState } from "react";

interface ErrorMessageProps {
  title?: string;
  message: string;
  onDismiss?: () => void;
  className?: string;
}

export default function ErrorMessage({
  title = "Error",
  message,
  onDismiss,
  className = "",
}: ErrorMessageProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    if (onDismiss) {
      onDismiss();
    }
  };

  return (
    <div
      className={`bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 ${className}`}
      role="alert"
    >
      <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-red-800 mb-1">{title}</h3>
        <p className="text-sm text-red-700">{message}</p>
      </div>
      {onDismiss && (
        <button
          onClick={handleDismiss}
          className="text-red-400 hover:text-red-600 transition-colors"
          aria-label="Dismiss error"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
