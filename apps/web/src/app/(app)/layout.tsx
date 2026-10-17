import { Nav } from "@/components/nav";
import { CollecteWatcher } from "@/components/collecte-watcher";
import { isLocalNoAuth, requireUser } from "@/lib/session";
import { logout } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const noAuth = await isLocalNoAuth();
  return (
    <div className="min-h-screen">
      <Nav email={noAuth ? "Ce PC" : user.email} logout={noAuth ? null : logout} />
      <main className="pb-24 lg:pb-0 lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</div>
        <footer className="mx-auto max-w-7xl px-4 pb-10 pt-4 text-center text-xs text-ink-mute sm:px-6 lg:px-10">
          Conçu par Houssam Haraf
        </footer>
      </main>
      <CollecteWatcher />
    </div>
  );
}
