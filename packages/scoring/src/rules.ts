import {
  describeSpec,
  normalizeText,
  phraseMatches,
  RESOLUTION_RANK,
  specAttribute,
  SPEC_OPERATOR_LABELS,
  type MatchableProduct,
  type NormalizedSpecs,
  type Resolution,
  type SpecRule,
} from "@mdw/shared";

export type RuleOutcome = "pass" | "fail" | "unknown";

export interface RuleResult {
  outcome: RuleOutcome;
  /** French description: "écran 55 pouces" when passed, otherwise the reason. */
  text: string;
}

function parseResolution(v: string): Resolution | null {
  const s = normalizeText(v).replace(/\s/g, "");
  if (["8k"].includes(s)) return "8K";
  if (["4k", "uhd", "ultrahd", "2160p"].includes(s)) return "4K";
  if (["qhd", "wqhd", "2k", "1440p"].includes(s)) return "QHD";
  if (["fhd", "fullhd", "1080p"].includes(s)) return "FHD";
  if (["hd", "720p", "hdready"].includes(s)) return "HD";
  return null;
}

function parseBool(v: string): boolean | null {
  const s = normalizeText(v);
  if (["oui", "true", "1", "yes", "vrai"].includes(s)) return true;
  if (["non", "false", "0", "no", "faux"].includes(s)) return false;
  return null;
}

function haystack(p: MatchableProduct): string {
  return `${p.title} ${Object.entries(p.rawSpecs)
    .map(([k, v]) => `${k} ${v}`)
    .join(" ")}`;
}

/** Evaluates one requirement. Missing product data yields "unknown", never "pass". */
export function evaluateRule(rule: SpecRule, p: MatchableProduct): RuleResult {
  const def = specAttribute(rule.attribute);
  const label = def?.label.replace(/\s*\(.*\)$/, "").toLowerCase() ?? rule.attribute;
  const opLabel = SPEC_OPERATOR_LABELS[rule.operator];
  const unit = def?.unit ? ` ${def.unit}` : "";

  if (!def || rule.attribute === "text") {
    const found = phraseMatches(haystack(p), rule.value);
    const ok = rule.operator === "not_contains" ? !found : found;
    return {
      outcome: ok ? "pass" : "fail",
      text: ok
        ? rule.operator === "not_contains"
          ? `sans « ${rule.value} »`
          : `« ${rule.value} »`
        : rule.operator === "not_contains"
          ? `contient « ${rule.value} »`
          : `« ${rule.value} » absent`,
    };
  }

  const value = (p.specs as Record<string, unknown>)[rule.attribute as keyof NormalizedSpecs];

  if (value === undefined || value === null) {
    // For "does not contain" on a text facet, an absent facet cannot violate it… but
    // we cannot prove it either: stay conservative.
    return { outcome: "unknown", text: `${label} non vérifiable (information absente)` };
  }

  const describeOk = () => describeSpec(rule.attribute, value);
  const describeFail = () => `${label} : ${opLabel} ${rule.value}${unit} exigé, trouvé ${String(value)}${unit}`;

  switch (def.kind) {
    case "number": {
      const target = Number(rule.value.replace(",", "."));
      const v = Number(value);
      if (!Number.isFinite(target)) return { outcome: "unknown", text: `${label} : valeur de critère invalide` };
      let ok: boolean;
      if (rule.operator === "eq" || rule.operator === "contains") ok = Math.abs(v - target) <= (rule.attribute === "screen_size_in" ? 0.6 : 0.001);
      else if (rule.operator === "gte") ok = v >= target;
      else if (rule.operator === "lte") ok = v <= target;
      else ok = Math.abs(v - target) > 0.001; // not_contains -> "différent de"
      return { outcome: ok ? "pass" : "fail", text: ok ? describeOk() : describeFail() };
    }
    case "resolution": {
      const want = parseResolution(rule.value);
      const have = value as Resolution;
      if (!want) return { outcome: "unknown", text: `${label} : valeur de critère invalide` };
      const diff = RESOLUTION_RANK[have] - RESOLUTION_RANK[want];
      let ok: boolean;
      if (rule.operator === "gte") ok = diff >= 0;
      else if (rule.operator === "lte") ok = diff <= 0;
      else if (rule.operator === "not_contains") ok = diff !== 0;
      else ok = diff === 0;
      return { outcome: ok ? "pass" : "fail", text: ok ? describeOk() : describeFail() };
    }
    case "boolean": {
      const want = parseBool(rule.value) ?? true;
      const ok = rule.operator === "not_contains" ? Boolean(value) !== want : Boolean(value) === want;
      return { outcome: ok ? "pass" : "fail", text: ok ? describeOk() : describeFail() };
    }
    default: {
      const have = normalizeText(String(value));
      const want = normalizeText(rule.value);
      let ok: boolean;
      if (rule.operator === "eq") ok = have === want;
      else if (rule.operator === "not_contains") ok = !have.includes(want);
      else ok = have.includes(want);
      return { outcome: ok ? "pass" : "fail", text: ok ? describeOk() : describeFail() };
    }
  }
}
