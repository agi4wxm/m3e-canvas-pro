/* The Material Symbol names this codebase draws, found by reading its sources: the generator bundles
 * these (scripts/gen-icon-sets.ts) and every icon family maps them. A name counts when it sits where an
 * icon is named (an `icon`-like key or attribute, `<Icon name>`, `ic("x")`, the default of an icon
 * field, a `// @icons a b c` line) and Material Symbols has it, so a word that only looks like an icon
 * name is dropped. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** the folders whose sources name icons a document can show */
export const ICON_SOURCES = ["parts", "components/m3e", "lib", "src"];

/** keys and attributes whose string value is an icon name */
const KEY = String.raw`(?:\w*[iI]con\w*|leading|trailing\d?|glyph|symbol|badgeIcon|fallback)`;

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) {
      if (f.name === "node_modules" || f.name === "icon-sets" || p.endsWith("components/ui")) continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(f.name) && !/icon-data|\.test\.|\.gen\.|generated/.test(f.name)) out.push(p);
  }
  return out;
}

const strings = (text: string) => [...text.matchAll(/"([a-z][a-z0-9_]*)"/g)].map((m) => m[1]);

/** the candidate names one source spells out; `valid` drops the ones that are not icons */
export function candidatesIn(src: string): Set<string> {
  const out = new Set<string>();
  const add = (n: string) => out.add(n);
  /* `icon: "x"`, `leading: "x"`, `icon = "x"` (a default parameter), `icon="x"` and the ternaries after them */
  for (const m of src.matchAll(new RegExp(String.raw`\b${KEY}\s*[:=]\s*([^,;}\n]*)`, "g"))) strings(m[1]).forEach(add);
  for (const m of src.matchAll(new RegExp(String.raw`\b${KEY}=\{([^{}]*)\}`, "g"))) strings(m[1]).forEach(add);
  /* `<Icon name="x">`, `<WidgetIcon name={a ? "x" : "y"}>` */
  for (const tag of src.matchAll(/<(?:Widget)?Icon\b[^>]*>/g)) for (const m of tag[0].matchAll(/\bname=(?:"([a-z0-9_]+)"|\{([^{}]*)\})/g)) (m[1] ? [m[1]] : strings(m[2])).forEach(add);
  /* the printers' `ic("x")`, and `part("icon", { name: "x" })` */
  for (const m of src.matchAll(/\bic\(\s*"([a-z0-9_]+)"/g)) add(m[1]);
  for (const m of src.matchAll(/part\(\s*"icon"\s*,\s*\{[^}]*\bname:\s*"([a-z0-9_]+)"/g)) add(m[1]);
  /* an icon field's default: `kind: "icon", default: "x"` in either order */
  for (const m of src.matchAll(/\{[^{}]*kind:\s*"icon"[^{}]*\}/g)) for (const d of m[0].matchAll(/default:\s*"([a-z0-9_]+)"/g)) add(d[1]);
  /* a table of names by kind: `Record<string, string> = { pdf: "picture_as_pdf", … }` named *ICON* */
  for (const m of src.matchAll(/\b[A-Z_]*ICONS?[A-Z_]*\b[^=\n]*=\s*\{([^}]*)\}/g)) strings(m[1]).forEach(add);
  /* names built at run time */
  for (const m of src.matchAll(/\/\/\s*@icons\s+([a-z0-9_ ]+)/g)) m[1].trim().split(/\s+/).forEach(add);
  /* `["x", "Label"]` pairs */
  for (const m of src.matchAll(/\["([a-z0-9_]+)",\s*"[A-Z]/g)) add(m[1]);
  return out;
}

/** every icon name the sources under `root` use, kept to the ones `valid` knows */
export function usedIconNames(root: string, valid: (name: string) => boolean): string[] {
  const found = new Set<string>();
  for (const dir of ICON_SOURCES) for (const file of walk(join(root, dir))) for (const n of candidatesIn(readFileSync(file, "utf8"))) found.add(n.replaceAll("_", "-"));
  return [...found].filter(valid).sort();
}
