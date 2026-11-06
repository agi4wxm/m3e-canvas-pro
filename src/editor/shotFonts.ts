/* The web fonts a picture of a screen needs, and nothing more. A layer drawn into pixels by html-to-image is an SVG
 * image: it sees no font of the page, so its words fall back to whatever the system has, wider than the real faces,
 * and a tight label comes out cut short. Embedding every face of the page instead takes seconds (a Chinese face comes
 * in a hundred files per weight). So this reads which faces the layer's words would be drawn with: for each word,
 * its family list, weight and style, and the characters it holds, against the @font-face rules of the page's
 * stylesheets (their unicode-range too). Only those faces are fetched (from the browser's cache, since the page
 * itself drew those words with them), each once a session, and handed to html-to-image as `fontEmbedCSS`.
 *
 * The agent's and the MCP bridge's screenshots, the render page's (MCP file mode), the PNG export and the projects'
 * thumbnails all go through here, so they draw words alike, and as the canvas does. */

type Range = [number, number];
/** one @font-face rule, as far as choosing it goes */
export type Face = { family: string; weight: [number, number]; style: "normal" | "italic"; ranges: Range[] | null; src: string; format?: string; range?: string; stretch?: string };

/** the generic families a list ends with: past one of them the system draws */
const GENERIC = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "ui-rounded", "emoji", "math", "fangsong", "-apple-system", "blinkmacsystemfont"]);

const unquote = (s: string) => s.trim().replace(/^(['"])(.*)\1$/, "$2").trim().toLowerCase();

/** a family list as names, in order */
export function familiesOf(list: string): string[] {
  return (list.match(/"[^"]*"|'[^']*'|[^,]+/g) ?? []).map(unquote).filter(Boolean);
}

/** `400`, `100 900`, `bold`, `normal` as a range of weights */
function weightOf(v: string): [number, number] {
  const words = v.trim().toLowerCase().split(/\s+/).map((w) => (w === "bold" ? 700 : w === "normal" || w === "" ? 400 : Number(w)));
  const [a, b] = [words[0], words[1] ?? words[0]].map((n) => (Number.isFinite(n) ? n : 400));
  return [Math.min(a, b), Math.max(a, b)];
}

/** `U+0000-00FF, U+0131, U+4??` as ranges of code points; null for none given (every character) */
export function rangesOf(v: string | undefined): Range[] | null {
  if (!v?.trim()) return null;
  const out: Range[] = [];
  for (const part of v.split(",")) {
    const m = /u\+([0-9a-f?]+)(?:-([0-9a-f]+))?/i.exec(part.trim());
    if (!m) continue;
    if (m[1].includes("?")) out.push([parseInt(m[1].replace(/\?/g, "0"), 16), parseInt(m[1].replace(/\?/g, "f"), 16)]);
    else out.push([parseInt(m[1], 16), parseInt(m[2] ?? m[1], 16)]);
  }
  return out.length ? out : null;
}

const covers = (f: Face, cp: number) => !f.ranges || f.ranges.some(([a, b]) => cp >= a && cp <= b);

/** the src a face is fetched from: its first woff2, else its first url */
function srcOf(v: string, base: string): { src: string; format?: string } | null {
  const urls = [...v.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)\s*(?:format\(\s*['"]?([\w-]+)['"]?\s*\))?/g)].map((m) => ({ url: m[2], format: m[3] }));
  const pick = urls.find((u) => u.format === "woff2" || /\.woff2(\?|$)/.test(u.url)) ?? urls[0];
  if (!pick || pick.url.startsWith("data:")) return pick ? { src: pick.url, format: pick.format } : null;
  try {
    return { src: new URL(pick.url, base).href, format: pick.format };
  } catch {
    return null;
  }
}

/** a face from a rule's descriptors */
function faceOf(get: (k: string) => string, base: string): Face | null {
  const family = unquote(get("font-family"));
  const src = srcOf(get("src"), base);
  if (!family || !src) return null;
  const style = /italic|oblique/i.test(get("font-style")) ? "italic" : "normal";
  const range = get("unicode-range").trim() || undefined;
  const stretch = get("font-stretch").trim() || undefined;
  return { family, weight: weightOf(get("font-weight")), style, ranges: rangesOf(range), ...src, ...(range ? { range } : {}), ...(stretch ? { stretch } : {}) };
}

/** the @font-face rules of a stylesheet's text (one the page may not read itself, from another origin) */
export function facesInCss(text: string, base: string): Face[] {
  const out: Face[] = [];
  for (const m of text.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const decls = new Map<string, string>();
    for (const d of m[1].split(";")) {
      const i = d.indexOf(":");
      if (i > 0) decls.set(d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim());
    }
    const f = faceOf((k) => decls.get(k) ?? "", base);
    if (f) out.push(f);
  }
  return out;
}

/* ---------- the page's faces ---------- */

const sheetText = new Map<string, Promise<string>>();
const sheetFaces = new WeakMap<CSSStyleSheet, { n: number; faces: Face[] }>();

/** every face of a stylesheet, its imports and its media blocks included */
async function facesOfSheet(sheet: CSSStyleSheet): Promise<Face[]> {
  let rules: CSSRuleList;
  try {
    rules = sheet.cssRules;
  } catch {
    /* another origin's (Google Fonts): its text, fetched once a session, read here */
    const href = sheet.href;
    if (!href) return [];
    let text = sheetText.get(href);
    if (!text) {
      text = fetch(href, { cache: "force-cache" }).then((r) => (r.ok ? r.text() : ""), () => "");
      sheetText.set(href, text);
    }
    return facesInCss(await text, href);
  }
  const kept = sheetFaces.get(sheet);
  if (kept && kept.n === rules.length) return kept.faces;
  const base = sheet.href ?? document.baseURI;
  const faces: Face[] = [];
  const walk = async (list: CSSRuleList) => {
    for (const r of Array.from(list)) {
      if (r instanceof CSSFontFaceRule) {
        const f = faceOf((k) => r.style.getPropertyValue(k), base);
        if (f) faces.push(f);
      } else if (r instanceof CSSImportRule && r.styleSheet) faces.push(...(await facesOfSheet(r.styleSheet)));
      else if ("cssRules" in r && (r as CSSGroupingRule).cssRules) await walk((r as CSSGroupingRule).cssRules);
    }
  };
  await walk(rules);
  sheetFaces.set(sheet, { n: rules.length, faces });
  return faces;
}

/** every face the page's stylesheets declare, by family */
async function pageFaces(): Promise<Map<string, Face[]>> {
  const all = (await Promise.all(Array.from(document.styleSheets).map((s) => facesOfSheet(s).catch(() => [])))).flat();
  const by = new Map<string, Face[]>();
  for (const f of all) by.set(f.family, [...(by.get(f.family) ?? []), f]);
  return by;
}

/* ---------- what a layer's words need ---------- */

/** the words of a layer by how they are set: family list, weight, style, and the characters */
type Usage = Map<string, { families: string[]; weight: number; style: "normal" | "italic"; chars: Set<number> }>;

export function usageOf(root: HTMLElement): Usage {
  const out: Usage = new Map();
  const styles = new Map<Element, CSSStyleDeclaration>();
  const add = (el: Element, text: string) => {
    if (!text.trim()) return;
    let cs = styles.get(el);
    if (!cs) {
      cs = getComputedStyle(el);
      styles.set(el, cs);
    }
    const style = /italic|oblique/.test(cs.fontStyle) ? "italic" : "normal";
    const weight = Number(cs.fontWeight) || 400;
    const key = `${cs.fontFamily}|${weight}|${style}`;
    let u = out.get(key);
    if (!u) {
      u = { families: familiesOf(cs.fontFamily), weight, style, chars: new Set() };
      out.set(key, u);
    }
    for (const ch of text) u.chars.add(ch.codePointAt(0)!);
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.parentElement) add(n.parentElement, n.nodeValue ?? "");
  /* what a field shows is not in a text node */
  root.querySelectorAll("input, textarea").forEach((el) => {
    const f = el as HTMLInputElement;
    add(f, `${f.value ?? ""}${f.placeholder ?? ""}`);
  });
  return out;
}

/** the faces of one family the browser would take for a weight and style (CSS font matching, simplified) */
function closest(faces: Face[], weight: number, style: "normal" | "italic"): Face[] {
  const styled = faces.some((f) => f.style === style) ? faces.filter((f) => f.style === style) : faces;
  const gap = (f: Face) => (weight < f.weight[0] ? f.weight[0] - weight : weight > f.weight[1] ? weight - f.weight[1] : 0);
  const best = Math.min(...styled.map(gap));
  return styled.filter((f) => gap(f) === best);
}

/** The faces a layer's words are drawn with: for each character, the first family of its list that has a face for
 *  it (a family the page declares no face for is the system's, and passed over; a generic one ends the list). */
export function facesFor(usage: Usage, by: Map<string, Face[]>): Face[] {
  const out = new Set<Face>();
  for (const u of usage.values()) {
    for (const cp of u.chars) {
      if (cp <= 0x20) continue;
      for (const fam of u.families) {
        if (GENERIC.has(fam)) break;
        const faces = by.get(fam)?.filter((f) => covers(f, cp));
        if (!faces?.length) continue;
        for (const f of closest(faces, u.weight, u.style)) out.add(f);
        break;
      }
    }
  }
  return [...out];
}

/* ---------- embedding ---------- */

const fontData = new Map<string, Promise<string | null>>();

/** a font file as a data URL, fetched once a session (the page drew with it, so it is usually in the cache) */
function dataUrlOf(src: string): Promise<string | null> {
  if (src.startsWith("data:")) return Promise.resolve(src);
  let p = fontData.get(src);
  if (!p) {
    p = fetch(src, { cache: "force-cache" })
      .then((r) => (r.ok ? r.blob() : null))
      .then(
        (b) =>
          b &&
          new Promise<string | null>((resolve) => {
            const fr = new FileReader();
            fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : null);
            fr.onerror = () => resolve(null);
            fr.readAsDataURL(b);
          }),
      )
      .catch(() => null);
    /* one that failed is asked again next time */
    p.then((v) => v === null && fontData.delete(src));
    fontData.set(src, p);
  }
  return p;
}

const cssString = (s: string) => `"${s.replace(/["\\]/g, "\\$&")}"`;

/** The @font-face rules a layer needs, its fonts inside them as data URLs: what html-to-image's `fontEmbedCSS` takes.
 *  Empty when the layer's words use no web font. Never throws: a face that cannot be had is left to the fallback. */
export async function shotFontCss(root: HTMLElement): Promise<string> {
  try {
    const faces = facesFor(usageOf(root), await pageFaces());
    const rules = await Promise.all(
      faces.map(async (f) => {
        const data = await dataUrlOf(f.src);
        if (!data) return "";
        const weight = f.weight[0] === f.weight[1] ? `${f.weight[0]}` : `${f.weight[0]} ${f.weight[1]}`;
        return `@font-face{font-family:${cssString(f.family)};font-style:${f.style};font-weight:${weight};${f.stretch ? `font-stretch:${f.stretch};` : ""}src:url(${data})${f.format ? ` format(${cssString(f.format)})` : ""};${f.range ? `unicode-range:${f.range};` : ""}}`;
      }),
    );
    return rules.filter(Boolean).join("\n");
  } catch {
    return "";
  }
}
