"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function CenteredDialog({ children, label, onClose, className = "" }: { children: ReactNode; label: string; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => { dialog?.close(); document.body.style.overflow = previous; };
  }, []);
  return <dialog ref={ref} className={`centered-notice ${className}`.trim()} aria-label={label}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    {children}
  </dialog>;
}
