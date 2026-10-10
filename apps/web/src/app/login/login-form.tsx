"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/buttons";
import { Field, input } from "@/components/ui";
import { login } from "./actions";

export function LoginForm() {
  const [state, action] = useActionState(login, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Adresse e-mail" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="username" required className={input} defaultValue={state.email} />
      </Field>
      <Field label="Mot de passe" htmlFor="password">
        <input id="password" name="password" type="password" autoComplete="current-password" required className={input} />
      </Field>
      {state.error && <p className="rounded-lg bg-promo-soft px-3 py-2 text-sm text-promo">{state.error}</p>}
      <SubmitButton className="w-full" pendingLabel="Connexion…">
        Se connecter
      </SubmitButton>
    </form>
  );
}
