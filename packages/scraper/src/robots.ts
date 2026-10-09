/**
 * Minimal robots.txt evaluator (RFC 9309): picks the group matching our
 * product token (or "*"), then applies the longest matching Allow/Disallow
 * rule, with support for "*" wildcards and "$" anchors.
 */
interface Rule {
  allow: boolean;
  pattern: string;
}

export class RobotsRules {
  constructor(private readonly rules: Rule[]) {}

  static allowAll(): RobotsRules {
    return new RobotsRules([]);
  }

  static parse(body: string, productToken: string): RobotsRules {
    const groups: { agents: string[]; rules: Rule[] }[] = [];
    let current: { agents: string[]; rules: Rule[] } | null = null;
    let lastWasAgent = false;
    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.replace(/#.*$/, "").trim();
      if (!line) continue;
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const key = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      if (key === "user-agent") {
        if (!current || !lastWasAgent) {
          current = { agents: [], rules: [] };
          groups.push(current);
        }
        current.agents.push(value.toLowerCase());
        lastWasAgent = true;
      } else if (key === "allow" || key === "disallow") {
        lastWasAgent = false;
        if (!current) continue;
        if (key === "disallow" && value === "") continue; // empty disallow = allow all
        current.rules.push({ allow: key === "allow", pattern: value });
      } else {
        lastWasAgent = false;
      }
    }
    const token = productToken.toLowerCase();
    const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
    const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
    return new RobotsRules(chosen.flatMap((g) => g.rules));
  }

  isAllowed(pathWithQuery: string): boolean {
    let best: Rule | null = null;
    for (const rule of this.rules) {
      if (!matches(rule.pattern, pathWithQuery)) continue;
      if (
        !best ||
        rule.pattern.length > best.pattern.length ||
        (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
      ) {
        best = rule;
      }
    }
    return best ? best.allow : true;
  }
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const regex = new RegExp(
    "^" +
      body
        .split("*")
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*") +
      (anchored ? "$" : ""),
  );
  return regex.test(path);
}
