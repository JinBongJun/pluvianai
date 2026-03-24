"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { useEffect } from "react";

/**
 * While `open` is true, closes on the next document click outside `rootRef`.
 * Uses bubble-phase `click` so the control that opened the UI can toggle without immediate close.
 */
export function useDismissOnDocumentClickOutside(
  open: boolean,
  rootRef: RefObject<HTMLElement | null>,
  setOpen: Dispatch<SetStateAction<boolean>>
): void {
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open, rootRef, setOpen]);
}
