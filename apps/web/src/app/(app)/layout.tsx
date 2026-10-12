import { Nav } from "@/components/nav";
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
      </main>
    </div>
  );
}
