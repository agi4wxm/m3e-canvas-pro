/* The document's own icons (`Doc.icons`): drawings kept by id and named `svg:<id>` wherever a part takes an icon name
 * (an icon, a button, a tab of a nav bar, a list row), beside the Material Symbols names. A drawing from generate_svg,
 * or one written by hand, becomes one. Each is held to what the vector atom allows (parts/svg.ts `sanitizeSvg`) and
 * written out again from what was kept, whenever a document comes in; what is not a drawing is dropped.
 *
 * They are drawn by the same icon component as every other name (components/m3e/icon.tsx), as an Iconify collection
 * of their own (`m3e-doc`): on the canvas and in the preview (parts/icons.ts registers them as they change), and in an
 * exported project (src/doc-icons.ts registers them at start). Plain data: no DOM here. */

import { cleanToMarkup, sanitizeSvg } from "../parts/svg";

/** what a part's icon name starts with when it is one of the document's own */
export const DOC_ICON_PREFIX = "svg:";
/** the Iconify collection they are drawn from */
export const DOC_ICON_SET = "m3e-doc";
/** what an id may be: what Iconify takes for a name (lowercase words joined by single dashes), up to 40 characters */
export const DOC_ICON_ID = /^(?=.{1,40}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** how many a document keeps, and how long each one's markup may be */
export const MAX_DOC_ICONS = 200;
export const MAX_DOC_ICON_CHARS = 60_000;

export type DocIcons = Record<string, string>;

/** whether an icon name is one of the document's own */
export const isDocIconName = (name: unknown): name is string => typeof name === "string" && name.startsWith(DOC_ICON_PREFIX) && DOC_ICON_ID.test(name.slice(DOC_ICON_PREFIX.length));
/** the id a name of the document's own icons names */
export const docIconId = (name: string) => name.slice(DOC_ICON_PREFIX.length);
/** the name an id is used by */
export const docIconName = (id: string) => `${DOC_ICON_PREFIX}${id}`;

/** A drawing as the document keeps it: sanitized and written out again, or null when nothing drawable is left or
 *  it is too large to be an icon. */
export function cleanDocIcon(markup: unknown): string | null {
  if (typeof markup !== "string" || markup.length > MAX_DOC_ICON_CHARS * 4) return null;
  const clean = sanitizeSvg(markup);
  if (!clean) return null;
  const out = cleanToMarkup(clean);
  return out.length <= MAX_DOC_ICON_CHARS ? out : null;
}

/** The icons of a document as it comes in (a file, a link, a model): ids that are ids, markup cleaned, at most
 *  MAX_DOC_ICONS; undefined when none is left. What is kept already clean comes back as the same object. */
export function cleanDocIcons(v: unknown): DocIcons | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: DocIcons = {};
  let same = true;
  for (const [id, markup] of Object.entries(v as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_DOC_ICONS) {
      same = false;
      break;
    }
    const clean = DOC_ICON_ID.test(id) ? cleanDocIcon(markup) : null;
    if (clean === null) {
      same = false;
      continue;
    }
    if (clean !== markup) same = false;
    out[id] = clean;
  }
  if (!Object.keys(out).length) return undefined;
  return same ? (v as DocIcons) : out;
}

/** a free id from some words (a prompt): its first few latin words, or `icon`, numbered when taken */
export function docIconIdFor(words: string, taken: Readonly<DocIcons> | undefined): string {
  const base =
    words
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9\s_-]/g, " ")
      .trim()
      .split(/[\s_-]+/)
      .filter((w) => w && !/^(a|an|the|of|for|with|and|icon|simple|flat|small|one|color)$/.test(w))
      .slice(0, 3)
      .join("-")
      .slice(0, 32)
      .replace(/^-+|-+$/g, "") || "icon";
  const id = base.replace(/-{2,}/g, "-");
  if (!taken?.[id]) return id;
  for (let n = 2; ; n++) if (!taken[`${id}-${n}`]) return `${id}-${n}`;
}

/* ---------- drawn by Iconify ---------- */

/** the paint an outer svg element sets for everything in it, carried onto a group around its inside */
const PAINT = ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "fill-rule", "clip-rule", "opacity", "fill-opacity", "stroke-opacity", "color"];

export type IconifyIcon = { body: string; left?: number; top?: number; width: number; height: number };

/** One kept drawing as an Iconify icon: its viewBox for the box, its inside for the body, the outer element's paint on
 *  a group around it. Null for markup that is not a kept drawing. */
export function iconifyIconOf(markup: string): IconifyIcon | null {
  const open = /^<svg\b([^>]*)>/.exec(markup);
  if (!open || !markup.endsWith("</svg>")) return null;
  const attrs = open[1];
  const vb = /\sviewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(attrs);
  const [left, top, width, height] = vb ? vb.slice(1).map(Number) : [0, 0, 24, 24];
  if (!(width > 0 && height > 0)) return null;
  const paint = PAINT.map((k) => new RegExp(`\\s${k}="([^"]*)"`).exec(attrs)).flatMap((m, i) => (m ? [` ${PAINT[i]}="${m[1]}"`] : []));
  const inner = markup.slice(open[0].length, -"</svg>".length);
  return { body: paint.length ? `<g${paint.join("")}>${inner}</g>` : inner, ...(left ? { left } : {}), ...(top ? { top } : {}), width, height };
}

/** The document's icons as an Iconify collection (what `registerIcons` takes), each cleaned once more. */
export function iconifySetOf(icons: Readonly<DocIcons> | undefined): { prefix: string; icons: Record<string, IconifyIcon> } {
  const out: Record<string, IconifyIcon> = {};
  for (const [id, markup] of Object.entries(icons ?? {})) {
    const clean = DOC_ICON_ID.test(id) ? cleanDocIcon(markup) : null;
    const icon = clean && iconifyIconOf(clean);
    if (icon) out[id] = icon;
  }
  return { prefix: DOC_ICON_SET, icons: out };
}
