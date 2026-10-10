"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { btn } from "./ui";

/** Submit button that asks for confirmation before deleting. */
export function DeleteButton({ message }: { message: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      className={`${btn.secondary} text-promo hover:border-promo/40`}
    >
      <Trash2 className="h-4 w-4" aria-hidden /> Supprimer
    </button>
  );
}
