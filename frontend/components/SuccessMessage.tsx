"use client";

import { CheckCircle, X } from "lucide-react";
import { useState } from "react";

interface SuccessMessageProps {
  title?: string;
  message: string;
  onDismiss?: () => void;
  className?: string;
}

export default function SuccessMessage({
  title = "Success",
  message,
  onDismiss,
  className = "",
}: SuccessMessageProps) {
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
      className={`bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3 ${className}`}
      role="alert"
    >
      <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-green-800 mb-1">{title}</h3>
        <p className="text-sm text-green-700">{message}</p>
      </div>
      {onDismiss && (
        <button
          onClick={handleDismiss}
          className="text-green-400 hover:text-green-600 transition-colors"
          aria-label="Dismiss success message"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
