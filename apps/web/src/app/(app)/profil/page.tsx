import { UserCog } from "lucide-react";
import { getAppSettings, getDb } from "@mdw/database";
import { PageHeader } from "@/components/ui";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Mon profil" };

export default async function ProfilePage() {
  const settings = await getAppSettings(getDb());
  return (
    <>
      <PageHeader
        title="Mon profil"
        description="Vos pointures, tailles, couleurs et budget. Le deal watcher s'en sert pour pré-filtrer les rayons mode sur Marjane Mall et pour classer les offres qui vous correspondent en premier."
      />
      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-tag-deep/30 bg-tag-soft px-4 py-3 text-sm text-ink-soft">
        <UserCog className="mt-0.5 h-5 w-5 shrink-0 text-tag-deep" aria-hidden />
        <p>
          Quand vous créez une recherche, cochez <span className="font-semibold text-ink">« Utiliser mon profil »</span> : les rayons mode (vêtements, chaussures, sport,
          boutiques de marque) sont automatiquement filtrés par genre, pointure, taille et couleur, et vos marques, vendeurs et budget sont appliqués partout.
        </p>
      </div>
      <ProfileForm initial={settings.shopperProfile} />
    </>
  );
}
