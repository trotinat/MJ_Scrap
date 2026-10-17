import snapshot from "./category-catalog.generated.json";
import { CATEGORY_TREE } from "./site";

export interface CatalogNode {
  path: string;
  label: string;
  selectable: boolean;
  children: CatalogNode[];
}

const words: Record<string, string> = {
  bebe: "bébé", beaute: "beauté", vetements: "vêtements", electromenager: "électroménager",
  ecouteurs: "écouteurs", ecran: "écran", epicerie: "épicerie", deco: "déco",
  hygiene: "hygiène", materiel: "matériel", menager: "ménager", feminin: "féminin",
  telephones: "téléphones", electronique: "électronique", numerique: "numérique",
  cafe: "café", sante: "santé", eclairage: "éclairage", interieur: "intérieur",
  poele: "poêle", seche: "sèche", refrigerateur: "réfrigérateur", pieces: "pièces",
  cinema: "cinéma", reseau: "réseau", equipement: "équipement", securite: "sécurité",
  telephone: "téléphone", preparation: "préparation", menage: "ménage", electrique: "électrique",
  tv: "TV", pc: "PC", wifi: "Wi-Fi", gps: "GPS", usb: "USB", hifi: "Hi-Fi", bd: "BD",
};

function labelFromPath(path: string): string {
  const slug = path.split("/").at(-1) ?? path;
  const label = slug.split("-").map((word) => words[word] ?? word).join(" ");
  return label.charAt(0).toLocaleUpperCase("fr") + label.slice(1);
}

const overrides = new Map<string, string>();
for (const [path, label] of Object.entries({
  "/tv-son-photo/tv-home-cinema": "TV & home cinéma",
  "/tv-son-photo/audio-hifi-musique": "Audio, Hi-Fi & musique",
  "/telephone-objets-connectes/objets-connectes": "Objets connectés",
  "/telephone-objets-connectes/smartphone-telephone": "Smartphones & téléphones",
  "/auto-moto/pieces-auto": "Pièces auto",
  "/auto-moto/equipement-auto": "Équipement auto",
})) overrides.set(path, label);
for (const root of CATEGORY_TREE) {
  overrides.set(root.path, root.label);
  for (const child of root.children) overrides.set(child.path, child.label);
}

/** Official sitemap snapshot plus category links checked on the live landing pages. */
export const CATEGORY_CATALOG: CatalogNode[] = (() => {
  const selectable = new Set([...snapshot.paths, ...CATEGORY_TREE.flatMap((root) => [root.path, ...root.children.map((child) => child.path)])]);
  const nodes = new Map<string, CatalogNode>();
  const ensure = (path: string): CatalogNode => {
    const existing = nodes.get(path);
    if (existing) return existing;
    const node: CatalogNode = { path, label: overrides.get(path) ?? labelFromPath(path), selectable: selectable.has(path), children: [] };
    nodes.set(path, node);
    const parentPath = path.slice(0, path.lastIndexOf("/"));
    if (parentPath) ensure(parentPath).children.push(node);
    return node;
  };
  for (const path of selectable) ensure(path);
  for (const node of nodes.values()) node.children.sort((a, b) => a.label.localeCompare(b.label, "fr"));
  return CATEGORY_TREE.map((root) => nodes.get(root.path)!).filter(Boolean);
})();

export const CATEGORY_CATALOG_PATH_COUNT = snapshot.paths.length;
export const CATEGORY_CATALOG_CHECKED_AT = snapshot.checkedAt;
