"use client";

import { useActionState } from "react";
import type { AppSettings } from "@mdw/shared";
import { DEAL_PAGE_SUGGESTIONS } from "@mdw/shared";
import { SubmitButton } from "@/components/buttons";
import { Card, Field, input } from "@/components/ui";
import { changePasswordAction, saveNotificationSettingsAction, saveSettingsAction, type SettingsState } from "./actions";

function Feedback({ state }: { state: SettingsState }) {
  if (!state.message) return null;
  return <p className={`text-sm ${state.ok ? "text-proof" : "text-promo"}`}>{state.message}</p>;
}

const WEIGHT_LABELS: [keyof AppSettings["weights"], string][] = [
  ["price", "Prix par rapport à l'objectif"],
  ["observedDrop", "Baisse observée (historique)"],
  ["advertisedDiscount", "Remise annoncée par le site"],
  ["specs", "Spécifications préférées"],
  ["brand", "Marque préférée"],
  ["rating", "Avis clients"],
  ["seller", "Vendeur"],
  ["stock", "Disponibilité"],
];

export function AppSettingsForm({ settings }: { settings: AppSettings }) {
  const [state, action] = useActionState(saveSettingsAction, {});
  return (
    <form action={action} className="space-y-6">
      <Card title="Collecte">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              label="Pages promotions analysées à chaque collecte"
              hint={`Une par ligne. Suggestions : ${DEAL_PAGE_SUGGESTIONS.map((d) => d.path).join(", ")}`}
              htmlFor="dealPagePaths"
            >
              <textarea id="dealPagePaths" name="dealPagePaths" rows={4} className={input} defaultValue={settings.dealPagePaths.join("\n")} />
            </Field>
          </div>
          <Field label="Pages chargées par liste (« Voir plus »)" htmlFor="maxListingPagesPerPath">
            <input id="maxListingPagesPerPath" name="maxListingPagesPerPath" className={input} inputMode="numeric" defaultValue={settings.maxListingPagesPerPath} />
          </Field>
          <Field label="Pages produit consultées par collecte (max.)" hint="Limite la charge envoyée au site." htmlFor="maxDetailFetchesPerRun">
            <input id="maxDetailFetchesPerRun" name="maxDetailFetchesPerRun" className={input} inputMode="numeric" defaultValue={settings.maxDetailFetchesPerRun} />
          </Field>
          <Field label="Délai entre deux requêtes (secondes)" hint="1 s minimum ; 3 s recommandé." htmlFor="requestDelaySeconds">
            <input id="requestDelaySeconds" name="requestDelaySeconds" className={input} inputMode="decimal" defaultValue={settings.requestDelayMs / 1000} />
          </Field>
          <Field label="Collectes sans observation avant « plus listé »" htmlFor="missingAfterRuns">
            <input id="missingAfterRuns" name="missingAfterRuns" className={input} inputMode="numeric" defaultValue={settings.missingAfterRuns} />
          </Field>
          <Field label="Donnée considérée ancienne après (heures)" htmlFor="staleAfterHours">
            <input id="staleAfterHours" name="staleAfterHours" className={input} inputMode="numeric" defaultValue={settings.staleAfterHours} />
          </Field>
          <label className="mt-6 inline-flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" name="notificationsEnabled" defaultChecked={settings.notificationsEnabled} className="h-4 w-4 rounded border-paper-line" />
            Envoyer les alertes Telegram
          </label>
        </div>
      </Card>

      <Card title="Score des offres">
        <p className="mb-4 text-sm text-ink-mute">
          Le score (0–100) est une moyenne pondérée des composantes applicables. Une composante dont la donnée est absente n&apos;apporte aucun point. Les exigences obligatoires restent prioritaires quel que soit le score.
        </p>
        <div className="grid gap-4 sm:grid-cols-4">
          {WEIGHT_LABELS.map(([k, l]) => (
            <Field key={k} label={l} htmlFor={`w_${k}`}>
              <input id={`w_${k}`} name={`w_${k}`} className={input} inputMode="numeric" defaultValue={settings.weights[k]} />
            </Field>
          ))}
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Field label="Offre exceptionnelle à partir de" htmlFor="t_exceptional">
            <input id="t_exceptional" name="t_exceptional" className={input} inputMode="numeric" defaultValue={settings.thresholds.exceptional} />
          </Field>
          <Field label="Très bonne offre à partir de" htmlFor="t_veryGood">
            <input id="t_veryGood" name="t_veryGood" className={input} inputMode="numeric" defaultValue={settings.thresholds.veryGood} />
          </Field>
          <Field label="Offre intéressante à partir de" htmlFor="t_interesting">
            <input id="t_interesting" name="t_interesting" className={input} inputMode="numeric" defaultValue={settings.thresholds.interesting} />
          </Field>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Feedback state={state} />
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer les paramètres</SubmitButton>
      </div>
    </form>
  );
}

export function NotificationSettingsForm({ ns }: { ns: { enabled: boolean; sendImages: boolean; maxAttempts: number; maxPerRun: number } }) {
  const [state, action] = useActionState(saveNotificationSettingsAction, {});
  return (
    <form action={action}>
      <Card title="Livraison Telegram">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" name="enabled" defaultChecked={ns.enabled} className="h-4 w-4 rounded border-paper-line" /> Livraison activée
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" name="sendImages" defaultChecked={ns.sendImages} className="h-4 w-4 rounded border-paper-line" /> Joindre l&apos;image du produit
          </label>
          <Field label="Tentatives maximum par message" htmlFor="maxAttempts">
            <input id="maxAttempts" name="maxAttempts" className={input} inputMode="numeric" defaultValue={ns.maxAttempts} />
          </Field>
          <Field label="Messages maximum par collecte" htmlFor="maxPerRun">
            <input id="maxPerRun" name="maxPerRun" className={input} inputMode="numeric" defaultValue={ns.maxPerRun} />
          </Field>
        </div>
        <div className="mt-4 flex items-center justify-end gap-3">
          <Feedback state={state} />
          <SubmitButton variant="secondary">Enregistrer</SubmitButton>
        </div>
      </Card>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, {});
  return (
    <form action={action}>
      <Card title="Mot de passe administrateur">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Mot de passe actuel" htmlFor="current">
            <input id="current" name="current" type="password" autoComplete="current-password" className={input} required />
          </Field>
          <Field label="Nouveau mot de passe" hint="10 caractères minimum" htmlFor="next">
            <input id="next" name="next" type="password" autoComplete="new-password" className={input} required minLength={10} />
          </Field>
          <Field label="Confirmation" htmlFor="confirm">
            <input id="confirm" name="confirm" type="password" autoComplete="new-password" className={input} required minLength={10} />
          </Field>
        </div>
        <div className="mt-4 flex items-center justify-end gap-3">
          <Feedback state={state} />
          <SubmitButton variant="secondary">Changer le mot de passe</SubmitButton>
        </div>
      </Card>
    </form>
  );
}
