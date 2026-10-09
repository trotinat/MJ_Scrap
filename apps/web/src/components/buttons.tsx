"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { btn } from "./ui";

export function SubmitButton({ children, variant = "primary", pendingLabel, className }: { children: ReactNode; variant?: keyof typeof btn; pendingLabel?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btn[variant]} ${className ?? ""}`}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

/** Submit button that asks for confirmation (used for deletions). */
export function ConfirmSubmit({ children, message, variant = "danger" }: { children: ReactNode; message: string; variant?: keyof typeof btn }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={btn[variant]}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
