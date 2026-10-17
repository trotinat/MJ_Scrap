/**
 * Site structure observed on marjanemall.ma (October 2026). Used only as
 * suggestions in the UI — every path stays editable by the user.
 */
export const CATEGORY_SUGGESTIONS: { path: string; label: string }[] = [
  { path: "/tv-son-photo", label: "TV, Son & Photo" },
  { path: "/tv-son-photo/tv-home-cinema/televiseur", label: "Téléviseurs" },
  { path: "/tv-son-photo/tv-home-cinema/home-cinema-barre-de-son", label: "Home cinéma, barres de son" },
  { path: "/tv-son-photo/audio-hifi-musique/casque-ecouteur", label: "Casques & écouteurs" },
  { path: "/tv-son-photo/audio-hifi-musique/enceintes-hifi-radio", label: "Enceintes, Hi-Fi, radio" },
  { path: "/tv-son-photo/photo-camera", label: "Photo & caméras" },
  { path: "/informatique-gaming", label: "Informatique & Gaming" },
  { path: "/telephone-objets-connectes", label: "Téléphones & objets connectés" },
  { path: "/electromenager", label: "Électroménager" },
  { path: "/electromenager/cuisine-et-cuisson/airfryer", label: "Friteuses sans huile" },
  { path: "/maison-cuisine-deco", label: "Maison, cuisine & déco" },
  { path: "/beaute-sante", label: "Beauté & santé" },
  { path: "/sport", label: "Sport" },
  { path: "/bebe-jouets", label: "Bébé & jouets" },
  { path: "/auto-moto", label: "Auto & moto" },
  { path: "/brico-jardin-animalerie", label: "Brico, jardin & animalerie" },
  { path: "/vetements-chaussures-bijoux-accessoires", label: "Mode & accessoires" },
  { path: "/librairie", label: "Librairie" },
  { path: "/epicerie-fine", label: "Épicerie fine" },
];

/**
 * Browsable department tree observed on marjanemall.ma (October 2026). Powers
 * the visual category picker so people pick a rayon instead of pasting a URL.
 * Every path stays editable, and pasting a filtered URL still works.
 */
export interface CategoryNode {
  path: string;
  label: string;
  icon: string;
  children: { path: string; label: string }[];
}

export const CATEGORY_TREE: CategoryNode[] = [
  {
    path: "/telephone-objets-connectes",
    label: "Téléphones & objets connectés",
    icon: "smartphone",
    children: [
      { path: "/telephone-objets-connectes/smartphone-telephone/smartphone", label: "Smartphones" },
      { path: "/telephone-objets-connectes/objets-connectes/montres-connectees", label: "Montres connectées" },
      { path: "/telephone-objets-connectes/objets-connectes/ecouteurs", label: "Écouteurs" },
      { path: "/telephone-objets-connectes/accessoires/accessoires", label: "Accessoires" },
    ],
  },
  {
    path: "/tv-son-photo",
    label: "TV, Son & Photo",
    icon: "tv",
    children: [
      { path: "/tv-son-photo/tv-home-cinema/televiseur", label: "Téléviseurs" },
      { path: "/tv-son-photo/tv-home-cinema/home-cinema-barre-de-son", label: "Home cinéma & barres de son" },
      { path: "/tv-son-photo/audio-hifi-musique/casque-ecouteur", label: "Casques & écouteurs" },
      { path: "/tv-son-photo/audio-hifi-musique/enceintes-hifi-radio", label: "Enceintes & Hi-Fi" },
      { path: "/tv-son-photo/photo-camera", label: "Photo & caméras" },
    ],
  },
  {
    path: "/informatique-gaming",
    label: "Informatique & Gaming",
    icon: "laptop",
    children: [
      { path: "/informatique-gaming/ordinateur", label: "Ordinateurs" },
      { path: "/informatique-gaming/gaming", label: "Gaming" },
      { path: "/informatique-gaming/tablette/tablette-tactile", label: "Tablettes" },
      { path: "/informatique-gaming/accessoires-peripheriques", label: "Accessoires & périphériques" },
      { path: "/informatique-gaming/accessoires-peripheriques/wifi-reseau", label: "Wifi & réseau" },
      { path: "/informatique-gaming/imprimante-scanner/imprimante-scanner", label: "Imprimantes & scanners" },
      { path: "/informatique-gaming/composants", label: "Composants" },
    ],
  },
  {
    path: "/electromenager",
    label: "Électroménager",
    icon: "plug",
    children: [
      { path: "/electromenager/cuisine-et-cuisson", label: "Cuisine & cuisson" },
      { path: "/electromenager/cuisine-et-cuisson/airfryer", label: "Friteuses sans huile" },
      { path: "/electromenager/cuisine-et-cuisson/robot-de-cuisine", label: "Robots de cuisine" },
      { path: "/electromenager/cuisine-et-cuisson/barbecue-plancha", label: "Barbecue & plancha" },
      { path: "/electromenager/cuisine-et-cuisson/petit-dejeuner-cafe", label: "Petit-déjeuner & café" },
      { path: "/electromenager/entretien-de-la-maison", label: "Entretien de la maison" },
      { path: "/electromenager/chauffage-climatisation/climatiseur-traitement-de-l-air", label: "Climatiseurs" },
      { path: "/electromenager/beaute-hygiene-sante", label: "Beauté, hygiène & santé" },
    ],
  },
  {
    path: "/maison-cuisine-deco",
    label: "Maison, Cuisine & Déco",
    icon: "home",
    children: [
      { path: "/maison-cuisine-deco/cuisine", label: "Cuisine" },
      { path: "/maison-cuisine-deco/meuble", label: "Meubles" },
      { path: "/maison-cuisine-deco/decoration", label: "Décoration" },
      { path: "/maison-cuisine-deco/luminaire", label: "Luminaires" },
      { path: "/maison-cuisine-deco/linge-de-maison", label: "Linge de maison" },
      { path: "/maison-cuisine-deco/linge-de-maison/linge-de-lit", label: "Linge de lit" },
      { path: "/maison-cuisine-deco/rangement-et-organisation", label: "Rangement" },
    ],
  },
  {
    path: "/beaute-sante",
    label: "Beauté & Santé",
    icon: "sparkles",
    children: [
      { path: "/beaute-sante/maquillage", label: "Maquillage" },
      { path: "/beaute-sante/soin-visage", label: "Soin du visage" },
      { path: "/beaute-sante/soin-corps", label: "Soin du corps" },
      { path: "/beaute-sante/cheveux", label: "Cheveux" },
      { path: "/beaute-sante/hygiene", label: "Hygiène" },
      { path: "/beaute-sante/vitamines-mineraux-complements", label: "Vitamines & compléments" },
      { path: "/beaute-sante/solaire", label: "Solaire" },
    ],
  },
  {
    path: "/vetements-chaussures-bijoux-accessoires",
    label: "Mode & Accessoires",
    icon: "shirt",
    children: [
      { path: "/vetements-chaussures-bijoux-accessoires/vetements-homme", label: "Vêtements Homme" },
      { path: "/vetements-chaussures-bijoux-accessoires/vetements-femme", label: "Vêtements Femme" },
      { path: "/vetements-chaussures-bijoux-accessoires/vetements-homme/vetements-traditionnels", label: "Traditionnel Hommes" },
      { path: "/vetements-chaussures-bijoux-accessoires/vetements-femme/vetements-traditionnels", label: "Traditionnel Femmes" },
      { path: "/vetements-chaussures-bijoux-accessoires/bebe-enfant", label: "Bébé & Enfant" },
      { path: "/vetements-chaussures-bijoux-accessoires/sportswear", label: "Sportswear" },
      { path: "/vetements-chaussures-bijoux-accessoires/bagagerie-maroquinerie", label: "Bagagerie & maroquinerie" },
      { path: "/vetements-chaussures-bijoux-accessoires/bijoux-accessoires", label: "Bijoux & accessoires" },
    ],
  },
  {
    path: "/sport",
    label: "Sport",
    icon: "dumbbell",
    children: [
      { path: "/sport/vetements-chaussures-de-sport", label: "Vêtements & chaussures" },
      { path: "/sport/fitness-musculation", label: "Fitness & musculation" },
      { path: "/sport/nutrition-sport", label: "Nutrition sport" },
      { path: "/sport/cyclisme-velo", label: "Cyclisme & vélo" },
      { path: "/sport/sports-de-nature", label: "Sports de nature" },
      { path: "/sport/sports-d-eau", label: "Sports d’eau" },
      { path: "/sport/sports-collectifs", label: "Sports collectifs" },
      { path: "/sport/sports-de-raquettes", label: "Sports de raquettes" },
    ],
  },
  {
    path: "/bebe-jouets",
    label: "Bébé & Jouets",
    icon: "baby",
    children: [
      { path: "/bebe-jouets/jeux-jouets", label: "Jeux & jouets" },
      { path: "/bebe-jouets/hygiene-toilette-bebe", label: "Hygiène & toilette bébé" },
      { path: "/vetements-chaussures-bijoux-accessoires/bebe-enfant", label: "Vêtements bébé" },
      { path: "/bebe-jouets/maternite-allaitement/maternite-future-maman", label: "Maternité" },
      { path: "/bebe-jouets/repas-bebe", label: "Repas bébé" },
      { path: "/bebe-jouets/eveil-bebe", label: "Éveil bébé" },
      { path: "/bebe-jouets/poussette", label: "Poussettes" },
      { path: "/bebe-jouets/siege-auto", label: "Sièges auto" },
      { path: "/bebe-jouets/sortie-voyage", label: "Sortie & voyage" },
      { path: "/bebe-jouets/chambre-bebe", label: "Chambre bébé" },
    ],
  },
  {
    path: "/auto-moto",
    label: "Auto & Moto",
    icon: "car",
    children: [
      { path: "/auto-moto/moto", label: "Moto" },
      { path: "/auto-moto/equipement-auto/accessoires-auto", label: "Accessoires auto" },
      { path: "/auto-moto/pieces-auto/pieces-auto", label: "Pièces auto" },
      { path: "/auto-moto/huiles-fluides/huiles-fluides", label: "Huiles & fluides" },
      { path: "/auto-moto/electronique", label: "Électronique" },
      { path: "/auto-moto/pieces-auto/pneus-jantes", label: "Pneus & jantes" },
    ],
  },
  {
    path: "/brico-jardin-animalerie",
    label: "Brico, Jardin & Animalerie",
    icon: "hammer",
    children: [
      { path: "/brico-jardin-animalerie/animalerie", label: "Animalerie" },
      { path: "/brico-jardin-animalerie/droguerie", label: "Droguerie" },
      { path: "/brico-jardin-animalerie/plomberie-chauffage", label: "Plomberie & chauffage" },
      { path: "/brico-jardin-animalerie/peinture-revetement/revetement-papier-peint", label: "Revêtement & papier peint" },
      { path: "/brico-jardin-animalerie/jardin-plein-air", label: "Jardin & plein air" },
      { path: "/brico-jardin-animalerie/quincaillerie-outillage", label: "Quincaillerie & outillage" },
    ],
  },
  {
    path: "/librairie",
    label: "Librairie",
    icon: "book",
    children: [
      { path: "/librairie/bande-dessinee-manga-humour", label: "BD, manga & humour" },
      { path: "/librairie/loisirs-creatifs-et-papeterie", label: "Loisirs créatifs & papeterie" },
      { path: "/librairie/jeunesse", label: "Jeunesse" },
      { path: "/librairie/roman", label: "Romans" },
      { path: "/librairie/bien-etre-vie-pratique", label: "Bien-être & vie pratique" },
    ],
  },
  {
    path: "/epicerie-fine",
    label: "Épicerie fine",
    icon: "grocery",
    children: [],
  },
];

/**
 * Marjane Mall's clearance hub and its four departments (observed Oct 2026).
 * These feed the dedicated "Déstockage" page, crawled like the other deal
 * pages so they stay available without a search criterion.
 */
export const DESTOCKAGE_PATHS: { path: string; label: string }[] = [
  { path: "/destockage", label: "Tout le déstockage" },
  { path: "/destockage/mode-sport", label: "Mode & Sport" },
  { path: "/destockage/high-tech", label: "High-Tech" },
  { path: "/destockage/maison", label: "Maison & Famille" },
  { path: "/destockage/beaute", label: "Beauté & Santé" },
];

export const DEAL_PAGE_SUGGESTIONS: { path: string; label: string }[] = [
  { path: "/ventes-flash", label: "Ventes flash" },
  { path: "/destockage", label: "Déstockage" },
  { path: "/les-deals-de-l-automne", label: "Les deals de l'automne" },
  { path: "/tout-a-moins-de-200-dh", label: "Tout à moins de 200 DH" },
  { path: "/trouvailles-marjane-mall", label: "Trouvailles Marjane Mall" },
  { path: "/panier-malin", label: "Panier malin" },
];
