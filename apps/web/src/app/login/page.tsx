import { redirect } from "next/navigation";
import { Activity } from "lucide-react";
import { countUsers, getDb } from "@mdw/database";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connexion" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  let users = 1;
  try {
    users = await countUsers(getDb());
  } catch {
    users = 1;
  }
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Activity className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="text-lg font-semibold">Hawta</h1>
        </div>
        <div className="rounded-2xl border border-paper-line bg-paper-card p-6">
          {users === 0 ? (
            <div className="text-sm text-ink-soft">
              <p className="font-medium text-ink">Aucun administrateur n&apos;existe encore.</p>
              <p className="mt-2">
                Définissez <code className="rounded bg-paper px-1">ADMIN_EMAIL</code> et <code className="rounded bg-paper px-1">ADMIN_PASSWORD</code> dans{" "}
                <code className="rounded bg-paper px-1">.env</code> puis relancez le service <code className="rounded bg-paper px-1">migrate</code>, ou exécutez :
              </p>
              <pre className="mt-2 overflow-x-auto rounded bg-ink p-3 text-xs text-paper">docker compose run --rm migrate node dist/cli.js create-admin vous@exemple.ma</pre>
            </div>
          ) : (
            <LoginForm />
          )}
        </div>
      </div>
    </main>
  );
}
