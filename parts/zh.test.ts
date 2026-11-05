import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getLang, setGlobalLang, type Lang } from "../lib/i18n";
import { choiceLabelOf, labelOf, nameOf } from "./labels";
import { PARTS, viewOf } from "./registry";

/* The page in Chinese: nothing a part shows or a panel offers is left in English. What stays in Latin
 * letters is what has no Chinese: names of products and formats, addresses, code, a code value a tree
 * passes on. */

/** props of a tree that are code, not words on the page */
const CODE_PROPS = new Set(["className", "style", "name", "src", "variant", "size", "icon", "type", "value", "defaultValue", "align", "side", "render", "href", "id", "role", "orientation", "language", "code", "kind", "color", "layout", "mode", "target", "rel", "dataKey", "nameKey", "shape", "fill", "stroke", "trigger", "collapsible", "state", "status", "side", "alignItemWithTrigger"]);

const KEPT = [
  /^[A-Z]{2,3}$/, // AI, API, TK, MB…
  /^(INV-\d+|Wi-Fi|Ctrl|Material Design|@material|TypeScript|Markdown 文档|shadcn|Next\.js|SvelteKit|Nuxt|Remix|Astro|React|Svelte|Vue|Cargo\.toml|Budget|main\.(rs|ts)|src|ui)$/,
  /^\s*[-+]?\s*(const|console)\b/, // a diff
  /^(https?:|mailto:|you@example|npm |animation\.json|report\.pdf)/,
  /\.(pdf|jpg|xlsx|toml|rs|ts|json)$/,
  /^\d[\d.,]*\s*(KB|MB|GB)$/,
  /^[#_]|^var\(/,
  /[一-鿿]/, // Chinese with a product's name in it
  /^[a-z][a-z0-9_-]*$/, // one lower-case word is a code value a tree passes on: an icon's name, a position
];
const kept = (s: string) => KEPT.some((r) => r.test(s));
const latin = (s: unknown): s is string => typeof s === "string" && /[A-Za-z]{2,}/.test(s) && !kept(s.trim());

function wordsIn(v: unknown, out: Set<string>) {
  if (typeof v === "string") {
    if (latin(v)) out.add(v);
  } else if (Array.isArray(v)) {
    for (const x of v) wordsIn(x, out);
  } else if (v && typeof v === "object") {
    const n = v as { type?: unknown; props?: Record<string, unknown>; children?: unknown[] };
    if ("$raw" in n || "$wrap" in n || n.type === "Icon") return;
    if (typeof n.type === "string") {
      for (const [k, x] of Object.entries(n.props ?? {})) if (!CODE_PROPS.has(k) && !k.startsWith("data-") && !/^(on[A-Z]|default[A-Z])/.test(k)) wordsIn(x, out);
      wordsIn(n.children, out);
    } else {
      /* an array of rows handed to a widget: its code fields are lower case, its words are not */
      for (const [k, x] of Object.entries(n)) if (typeof x !== "string" ? true : /[A-Z ]/.test(x) && !CODE_PROPS.has(k)) wordsIn(x, out);
    }
  }
}

describe("the page in Chinese", () => {
  let before: Lang;
  beforeAll(() => {
    before = getLang();
    setGlobalLang("zh");
  });
  afterAll(() => setGlobalLang(before));

  it("calls every part and offers every choice in Chinese", () => {
    const left = new Set<string>();
    for (const d of PARTS) {
      if (latin(nameOf(d, "zh"))) left.add(nameOf(d, "zh"));
      for (const p of d.props) {
        if (latin(labelOf(p, "zh")) && !/ok、warn/.test(labelOf(p, "zh")) && !/dp\)/.test(labelOf(p, "zh"))) left.add(labelOf(p, "zh"));
        if (p.kind === "enum") for (const c of p.options) if (latin(choiceLabelOf(c, "zh")) && !/^(Mac|Windows)$/.test(choiceLabelOf(c, "zh"))) left.add(choiceLabelOf(c, "zh"));
      }
    }
    expect([...left]).toEqual([]);
  });

  it("has every part start out in Chinese", () => {
    const left = new Map<string, Set<string>>();
    for (const d of PARTS) {
      const out = new Set<string>();
      wordsIn(viewOf(d, undefined), out);
      for (const s of out) left.set(s, (left.get(s) ?? new Set()).add(d.slug));
    }
    expect([...left].map(([s, slugs]) => `${s} <- ${[...slugs].slice(0, 2).join(",")}`).sort()).toEqual([]);
  });
});
