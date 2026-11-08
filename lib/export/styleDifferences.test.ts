import { readFileSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../i18n";
import { KIT_RECIPES, RECIPE_KEYS, STYLE_SUPPORT, copyOfStyle, ruleTraits, setDocStyles, styleContext, styleDifferences, styleOf, type CustomStyle } from "../styles";
import { DEFAULT_THEME, makeItem, normalizeTheme, type Doc, type Group } from "../tokens";
import { buildProduct } from "./product";
import type { Product } from "./types";

/* What of a style each exported app draws (lib/styles/support.ts), and how the apps say what they do not: a custom
 * style with tokens of its own, a rule with a pseudo-element and one with a state, exported to all three. */

beforeAll(() => setGlobalLang("en"));

const base = copyOfStyle(styleOf("ios")!);
const style: CustomStyle = {
  ...base,
  key: "custom:ticket",
  name: { zh: "票根", en: "Ticket", ja: "Ticket", ko: "Ticket" },
  tokens: { ...base.tokens, navBg: "#FFF4E0", toggleOn: "#2E7D32" },
  rules: [
    /* a star drawn before every card's content: a pseudo-element */
    { selector: "[data-slot=card]::before", declarations: { content: '"★"', color: "var(--md-sys-color-primary)" } },
    /* a button lit on hover: a state, and a gradient */
    { selector: "[data-slot=button]:hover", declarations: { "background-image": "linear-gradient(#FFFFFF33, #0000)" } },
    /* the cards' corners: what `shape` and `control` can say */
    { selector: "[data-slot=card]", declarations: { "border-radius": "20px" } },
  ],
};

const part = (id: string, component: string, y: number, props: Record<string, unknown> = {}): Group => ({ id: `g-${id}`, x: 20, y, axis: "x", items: [{ ...makeItem(component), id, props }] });
const doc: Doc = {
  title: "Tickets",
  brief: "",
  paletteKey: "purple",
  frame: "phone",
  theme: { ...DEFAULT_THEME, style: style.key },
  styles: [style],
  frames: [
    { id: "home", name: "Home", x: 0, y: 0 },
    { id: "pay", name: "Pay", x: 500, y: 0 },
  ],
  groups: [part("card1", "card", 120), part("buy", "button", 400, { label: "Buy" }), part("pay1", "button", 120, { label: "Pay" })].map((g) => (g.id === "g-pay1" ? { ...g, x: 520 } : g)),
};

const fromDisk = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });
const text = (p: Product, path: string) => {
  const body = p.files[path]?.body;
  if (typeof body !== "string") throw new Error(`${path} is not a text file of the product`);
  return body;
};

describe("a custom style with tokens, a pseudo-element and a state, exported", () => {
  let product: Product;
  beforeAll(async () => {
    /* with nothing in reach: an export reads the document's own styles */
    setDocStyles(undefined);
    product = await buildProduct(doc, {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
  }, 120_000);

  it("is worn whole on the web: its tokens and every rule, in its scope", () => {
    const css = text(product, "apps/web/src/generated/style.css");
    expect(css).toContain("--st-nav-bg:#FFF4E0");
    expect(css).toContain('[data-slot=card]::before{content:"★";color:var(--md-sys-color-primary)}');
    expect(css).toContain("[data-slot=button]:hover{background-image:linear-gradient(#FFFFFF33, #0000)}");
    expect(product.differences.filter((d) => (d.app as string) === "web" && d.kind === "style")).toEqual([]);
  });

  it("carries its tokens to a phone and a mini-program, and reports each rule they do not draw, with its screens", () => {
    /* the structured part goes across */
    const mobileTheme = text(product, "apps/mobile/src/generated/theme.ts");
    expect(mobileTheme).toContain('"key": "custom:ticket"');
    expect(mobileTheme).toMatch(/"navBg": "#FFF4E0"/);
    expect(mobileTheme).toMatch(/"toggleOn": "#2E7D32"/);
    expect(text(product, "apps/miniapp/src/generated/theme.css")).toContain("--m3e-st-nav-bg: #fff4e0;");
    for (const app of ["mobile", "miniapp"] as const) {
      const style = product.differences.filter((d) => d.app === app && d.kind === "style");
      const rule = (n: number) => style.find((d) => d.detail.startsWith(`rule ${n} of custom:ticket`))!;
      /* the pseudo-element, on the one screen with a card */
      expect(rule(1)).toMatchObject({ screen: "Home", screens: ["Home"] });
      expect(rule(1).detail).toContain("[data-slot=card]::before { content, color }");
      expect(rule(1).detail).toContain("(it uses: pseudo-element)");
      /* the state, on both screens with a button; and the gradient it lays */
      expect(rule(2).screens).toEqual(["Home", "Pay"]);
      expect(rule(2).screen).toBeUndefined();
      expect(rule(2).detail).toContain("(it uses: state, gradient)");
      /* what can be said instead, and where code of one's own goes */
      expect(rule(3).detail).toContain("Instead: shape / control / pill");
      expect(rule(1).detail).toContain(`apps/${app}/src/custom/`);
      /* the CSS of iOS it is copied from is its own rules here: no `extends`, so nothing more of that */
      expect(style.some((d) => d.detail.includes("which custom:ticket extends"))).toBe(false);
      /* the app's own list says the same */
      const listed = JSON.parse(text(product, `apps/${app}/src/generated/warnings.json`)) as { kind: string; detail: string }[];
      expect(listed.filter((w) => w.kind === "style").map((w) => w.detail)).toEqual(style.map((d) => d.detail));
    }
    expect(product.differences.find((d) => d.app === "mobile" && d.detail.startsWith("rule 1"))?.detail).toContain("React Native has no stylesheet");
    expect(product.differences.find((d) => d.app === "miniapp" && d.detail.startsWith("rule 1"))?.detail).toContain("WXSS has ::before/::after only on the kit's own classes");
  });
});

describe("what of a style each app draws", () => {
  const screens = [{ name: "Home", slugs: new Set(["card", "tabs"]) }, { name: "Pay", slugs: new Set(["button"]) }];
  const read = (s: CustomStyle, app: "mobile" | "miniapp") => styleDifferences({ theme: normalizeTheme({ style: s.key }, styleContext([s])), styles: styleContext([s]), docStyles: [s], screens }, app);

  it("reports the recipes a kit has no build for, a screen's backdrop, and the CSS a custom style extends", () => {
    const extending: CustomStyle = { ...style, key: "custom:more", extends: "ios", rules: [], recipes: { ...style.recipes, tooltip: "dark", screen: "paper", divider: "dashed" }, screen: "linear-gradient(#FFF, #EEE)" };
    const phone = read(extending, "mobile").map((d) => d.detail);
    expect(phone.some((d) => d.startsWith("recipe tooltip: dark is drawn on the web only"))).toBe(true);
    expect(phone.some((d) => d.startsWith("recipe screen: paper") && d.includes("screens: Home, Pay"))).toBe(true);
    /* the mini-program's kit builds dividers its recipe's way; the phone's does not */
    expect(phone.some((d) => d.startsWith("recipe divider:"))).toBe(true);
    expect(read(extending, "miniapp").some((d) => d.detail.startsWith("recipe divider:"))).toBe(false);
    expect(phone.some((d) => d.startsWith("the style's screen backdrop (linear-gradient(#FFF, #EEE))"))).toBe(true);
    expect(phone.some((d) => d.startsWith("the CSS of ios, which custom:more extends, is drawn on the web only"))).toBe(true);
    /* a style with nothing a kit lacks has nothing to say */
    expect(styleDifferences({ theme: normalizeTheme(undefined), styles: styleContext(undefined), screens }, "mobile")).toEqual([]);
  });

  it("reads what a rule relies on", () => {
    expect(ruleTraits({ selector: "[data-slot=card]::after", declarations: { content: '""' } })).toEqual(["pseudo-element"]);
    expect(ruleTraits({ selector: "[data-slot=tabs] [data-slot=tabs-trigger]:focus-visible", declarations: { "box-shadow": "0 0 0 2px red", transition: "box-shadow .2s" } })).toEqual(["state", "complex", "shadow", "motion"]);
    expect(ruleTraits({ selector: ":is([data-slot=card],[data-slot=sheet])", declarations: { "backdrop-filter": "blur(8px)", "--st-x": "1px" } })).toEqual(["complex", "effect", "variable"]);
    expect(ruleTraits({ selector: "&", declarations: { "background-image": "radial-gradient(#0001 1px, #0000 1px)" } })).toEqual(["gradient"]);
    expect(ruleTraits({ selector: "[data-slot=card]", declarations: { "border-radius": "8px" } })).toEqual([]);
  });

  it("knows the recipe kinds each kit builds by, as the kits' sources read them", () => {
    const read = (dir: string) => {
      const out = new Set<string>();
      const walk = (path: string) => {
        for (const entry of readdirOf(path)) {
          if (entry.dir) walk(entry.path);
          else if (/\.(ts|tsx)$/.test(entry.path)) for (const m of readFileSync(entry.path, "utf8").matchAll(/recipeOf\([\w.]+, "([a-z]+)"\)/g)) out.add(m[1]);
        }
      };
      walk(dir);
      return [...out].sort();
    };
    expect(read("rn/src/kit")).toEqual([...KIT_RECIPES.mobile].sort());
    expect(read("miniapp-kit/src/kit")).toEqual([...KIT_RECIPES.miniapp].sort());
    for (const k of [...KIT_RECIPES.mobile, ...KIT_RECIPES.miniapp]) expect(RECIPE_KEYS).toContain(k);
  });

  it("is the table the style guide shows", () => {
    const guide = readFileSync("docs/风格清单.md", "utf8");
    for (const row of STYLE_SUPPORT) expect(guide, row.what).toContain(`| ${row.zh} |`);
  });
});

function readdirOf(dir: string) {
  return readdirSync(dir).map((name) => {
    const path = join(dir, name);
    return { path, dir: statSync(path).isDirectory() };
  });
}
