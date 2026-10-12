"use client";

import { useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { requestRunAction } from "@/app/(app)/collectes/actions";
import { btn } from "./ui";
import { RUN_REQUESTED_EVENT } from "./collecte-watcher";

/**
 * "Vérifier maintenant": files a run request and immediately tells the global
 * watcher to start polling, so the loading banner appears at once and the page
 * refreshes by itself when the collection finishes.
 */
export function CheckNowButton({ variant = "secondary", label = "Vérifier maintenant" }: { variant?: keyof typeof btn; label?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={btn[variant]}
      onClick={() =>
        start(async () => {
          await requestRunAction();
          window.dispatchEvent(new CustomEvent(RUN_REQUESTED_EVENT));
        })
      }
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
      {label}
    </button>
  );
}
