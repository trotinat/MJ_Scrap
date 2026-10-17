import { UserCog } from "lucide-react";
import { getDb, getUserProfile, listUserShops } from "@mdw/database";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Mon profil" };

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await getUserProfile(getDb(), user.id);
  const shops = await listUserShops(getDb(), user.id);
  return (
    <>
      <PageHeader
        title="Mon profil"
        description="Vos pointures, tailles, couleurs et budget aident Hawta à repérer les offres qui vous correspondent dans vos boutiques disponibles."
      />
      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-tag-deep/30 bg-tag-soft px-4 py-3 text-sm text-ink-soft">
        <UserCog className="mt-0.5 h-5 w-5 shrink-0 text-tag-deep" aria-hidden />
        <p>
          Quand vous créez une recherche, cochez <span className="font-semibold text-ink">« Utiliser mon profil »</span> : les rayons mode (vêtements, chaussures, sport,
          boutiques de marque) sont automatiquement filtrés par genre, pointure, taille et couleur, et vos marques, vendeurs et budget sont appliqués partout.
        </p>
      </div>
      <ProfileForm initial={profile} />
      <section className="mt-6 rounded-2xl border border-paper-line bg-paper-card p-4 sm:p-5" aria-labelledby="shops-title">
        <h2 id="shops-title" className="text-base font-bold text-ink">Mes boutiques disponibles</h2>
        <p className="mt-1 text-sm text-ink-mute">Les recherches et résultats de votre compte utilisent uniquement ces boutiques.</p>
        <ul className="mt-3 flex flex-wrap gap-2">{shops.map(shop => <li key={shop.id} className="rounded-full border border-brand-100 bg-brand-50 px-3 py-2 text-sm font-semibold text-ink">{shop.name}</li>)}</ul>
      </section>
    </>
  );
}
