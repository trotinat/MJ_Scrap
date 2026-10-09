"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import { SubmitButton } from "@/components/buttons";
import { sendTestNotification } from "./actions";

export function TestNotificationForm() {
  const [state, action] = useActionState(sendTestNotification, {});
  return (
    <form action={action} className="flex flex-col items-start gap-2 sm:items-end">
      <SubmitButton pendingLabel="Envoi…">
        <Send className="h-4 w-4" /> Envoyer une notification de test
      </SubmitButton>
      {state.message && <p className={`text-sm ${state.ok ? "text-emerald-700" : "text-rose-600"}`}>{state.message}</p>}
    </form>
  );
}
