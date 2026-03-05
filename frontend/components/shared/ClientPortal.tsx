"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface ClientPortalProps {
  children: React.ReactNode;
}

export const ClientPortal: React.FC<ClientPortalProps> = ({ children }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Ensure we are mounted and document.body is available
  if (!mounted || typeof document === "undefined" || !document.body) {
    return null;
  }

  return createPortal(children, document.body);
};
