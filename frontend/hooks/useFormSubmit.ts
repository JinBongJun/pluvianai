"use client";

import { useState, useCallback } from "react";

interface UseFormSubmitOptions {
  onSubmit: () => Promise<void>;
}

export function useFormSubmit({ onSubmit }: UseFormSubmitOptions) {
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  );

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      try {
        await onSubmit();
      } finally {
        setSubmitting(false);
      }
    },
    [onSubmit, submitting]
  );

  return { submitting, handleSubmit, idempotencyKey };
}
