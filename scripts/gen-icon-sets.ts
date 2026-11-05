/* bun run gen:icon-sets        write the bundled icon sets (components/m3e/icon-sets/data)
 * bun run gen:icon-sets --check  only say whether they are up to date with the code and the tables
 *
 * The canvas, the preview, the gallery and exported projects draw icons offline from these subsets of
 * the @iconify-json packages: Material Symbols (Rounded, Light, Sharp) for every name the code uses and
 * the most common others, and each icon family's glyph for every name its table maps. A family's set is
 * split into shards of about SHARD_BYTES, by a hash of the Material name, so a document loads only its
 * family, and each shard is its own chunk. A name a family's table lacks is drawn from Rounded. */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { COMMON, FAMILIES, RENAMED, TABLES, type TableFamily } from "./icon-tables";
import { usedIconNames } from "./icon-names";
import { shardOf } from "../components/m3e/icon-sets/shard";

type Icon = { body: string; left?: number; top?: number; width?: number; height?: number; rotate?: number; hFlip?: boolean; vFlip?: boolean };
type Collection = { prefix: string; icons: Record<string, Icon>; aliases?: Record<string, { parent: string } & Partial<Icon>>; width?: number; height?: number };
type Shard = { map?: Record<string, [string, string]>; sets: Collection[] };

/** a shard's size before gzip; the chunk a browser fetches is about a third of it */
const SHARD_BYTES = 110_000;
/** what the picker shows of each family */
export const PREVIEW = ["home", "search", "favorite", "chat", "settings"];
/* How much bigger or smaller a set's glyphs draw than Material Rounded's at the same size: the median,
 * over 25 common names, of the inked box's longest side, measured once by rasterizing both in a
 * browser. Each glyph's box is widened (or cut) by it, so a 24px icon looks the same size in every
 * family; the stroke thins (or thickens) with it, which keeps a set's own weight. Pixelarticons keep
 * their grid: scaled, their squares would blur. */
const SCALE: Partial<Record<string, number>> = { sf: 0.9, lucide: 0.91, game: 0.91, ant: 0.95, codicon: 0.95, emoji: 0.95, light: 1.1 };

const root = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(root, "components/m3e/icon-sets/data");
const MANIFEST = join(root, "components/m3e/icon-sets/manifest.ts");

const cache = new Map<string, Collection>();
function collection(prefix: string): Collection {
  let c = cache.get(prefix);
  if (!c) {
    c = JSON.parse(readFileSync(join(root, "node_modules/@iconify-json", prefix, "icons.json"), "utf8")) as Collection;
    cache.set(prefix, c);
  }
  return c;
}
const exists = (prefix: string, name: string) => {
  const c = collection(prefix);
  return name in c.icons || name in (c.aliases ?? {});
};

const material = (n: string) => exists("material-symbols", `${n}-rounded`) || exists("material-symbols", `${n}-outline-rounded`);

/** every Material name that is bundled, in Iconify's spelling */
export function bundledNames(at = root): string[] {
  const names = new Set([...usedIconNames(at, material), ...COMMON.filter(material), ...Object.values(RENAMED).filter(material)]);
  return [...names].sort();
}

/** a glyph out of its package, with what an alias needs to be drawn: its parent, and the dimensions the package gives every icon */
function take(prefix: string, name: string, into: Collection, scale = 1, as = name) {
  const c = collection(prefix);
  const defaults = { width: c.width ?? 16, height: c.height ?? 16 };
  const sized = (icon: Icon): Icon => {
    const width = icon.width ?? defaults.width;
    const height = icon.height ?? defaults.height;
    if (scale === 1) return { ...icon, width, height };
    const round = (v: number) => Math.round(v * 1000) / 1000;
    const w = width / scale;
    const h = height / scale;
    return { ...icon, left: round((icon.left ?? 0) + (width - w) / 2), top: round((icon.top ?? 0) + (height - h) / 2), width: round(w), height: round(h) };
  };
  if (c.icons[name]) {
    into.icons[as] = sized(c.icons[name]);
    return;
  }
  const alias = c.aliases?.[name];
  if (!alias) throw new Error(`${prefix}:${name} is not in @iconify-json/${prefix}`);
  /* an alias is drawn as its own glyph: the parent's body with the alias's turn or flip, so a shard needs no chains */
  let parent = alias.parent;
  const extra: Partial<Icon> = { ...alias };
  delete (extra as { parent?: string }).parent;
  while (!c.icons[parent]) {
    const next = c.aliases?.[parent];
    if (!next) throw new Error(`${prefix}:${name} points at ${parent}, which is not there`);
    parent = next.parent;
  }
  into.icons[as] = sized({ ...c.icons[parent], ...extra } as Icon);
}

/** the ids that draw a name in a set, outlined then filled; nothing when the set has no drawing of it */
function idsOf(set: string, name: string): [string, string] | undefined {
  if (set === "rounded" || set === "sharp" || set === "light") {
    const prefix = set === "light" ? "material-symbols-light" : "material-symbols";
    const cut = set === "sharp" ? "sharp" : "rounded";
    const outline = `${name}-outline-${cut}`;
    const filled = `${name}-${cut}`;
    const o = exists(prefix, outline) ? outline : exists(prefix, filled) ? filled : undefined;
    const f = exists(prefix, filled) ? filled : o;
    return o && f ? [`${prefix}:${o}`, `${prefix}:${f}`] : undefined;
  }
  const family = set as TableFamily;
  const spec = FAMILIES[family];
  const entry = TABLES[family][name];
  if (entry === undefined) return undefined;
  const first = (names: string[]) => names.find((n) => exists(spec.prefix, n));
  const outline = typeof entry === "string" ? first(spec.outline(entry)) : entry[0];
  const filled = typeof entry === "string" ? ((spec.filled && first(spec.filled(entry))) ?? outline) : entry[1];
  for (const n of [outline, filled]) if (!n || !exists(spec.prefix, n)) throw new Error(`${family}: "${name}" maps to ${spec.prefix}:${n ?? entry}, which @iconify-json/${spec.prefix} does not have`);
  return [`${spec.prefix}:${outline!}`, `${spec.prefix}:${filled!}`];
}

const DIMS = ["left", "top", "width", "height"] as const;

/** a collection in a stable order, with the box its glyphs share said once, at its root */
function tidy(c: Collection): Collection {
  const icons = Object.entries(c.icons).sort(([a], [b]) => a.localeCompare(b));
  const box = (i: Icon) => DIMS.map((d) => i[d] ?? (d === "left" || d === "top" ? 0 : undefined)).join(",");
  const shared = icons.length && icons.every(([, i]) => box(i) === box(icons[0][1])) ? icons[0][1] : undefined;
  const root: Partial<Icon> = {};
  if (shared) for (const d of DIMS) if (shared[d] !== undefined && shared[d] !== 0) root[d] = shared[d];
  const strip = (i: Icon) => (shared ? (Object.fromEntries(Object.entries(i).filter(([k]) => !(DIMS as readonly string[]).includes(k))) as Icon) : i);
  return {
    prefix: c.prefix,
    ...root,
    icons: Object.fromEntries(icons.map(([n, i]) => [n, strip(i)])),
    ...(c.aliases ? { aliases: Object.fromEntries(Object.entries(c.aliases).sort(([a], [b]) => a.localeCompare(b))) } : {}),
  };
}

/** the ids Icon asks for when it draws a name in a Material set: what it is filed under, whichever glyph draws it */
const materialKeys = (set: string, name: string): [string, string] => {
  const prefix = set === "light" ? "material-symbols-light" : "material-symbols";
  const cut = set === "sharp" ? "sharp" : "rounded";
  return [`${prefix}:${name}-outline-${cut}`, `${prefix}:${name}-${cut}`];
};

/** one set's shards: every name it draws, in the shard its hash says */
function shardsOf(set: string, names: string[]): Shard[] {
  const table = set in TABLES;
  const drawn = names.flatMap((name) => {
    const ids = idsOf(set, name);
    return ids ? [{ name, ids, keys: table ? ids : materialKeys(set, name) }] : [];
  });
  /* a renamed name draws what its new name draws */
  for (const [old, now] of Object.entries(RENAMED)) {
    const hit = drawn.find((d) => d.name === now);
    if (hit) drawn.push({ name: old, ids: hit.ids, keys: table ? hit.ids : materialKeys(set, old) });
  }
  const build = (count: number) => {
    const shards: Shard[] = Array.from({ length: count }, () => ({ ...(table ? { map: {} } : {}), sets: [] }));
    /* which package glyph each filed name was taken from */
    const filed = new Map<Collection, Record<string, string>>();
    for (const { name, ids, keys } of drawn) {
      const shard = shards[shardOf(name, count)];
      if (table) shard.map![name] = ids;
      ids.forEach((id, i) => {
        const [prefix, glyph] = id.split(":");
        const key = keys[i].split(":")[1];
        let c = shard.sets.find((s) => s.prefix === prefix);
        if (!c) shard.sets.push((c = { prefix, icons: {} }));
        if (c.icons[key] || c.aliases?.[key]) return;
        /* the same glyph filed under a second name is an alias of the first, not a second copy */
        const twin = Object.entries(filed.get(c) ?? {}).find(([, source]) => source === glyph)?.[0];
        if (twin) (c.aliases ??= {})[key] = { parent: twin };
        else take(prefix, glyph, c, SCALE[set] ?? 1, key);
        filed.set(c, { ...filed.get(c), [key]: glyph });
      });
    }
    for (const s of shards) s.sets = s.sets.map(tidy);
    return shards;
  };
  let count = 1;
  for (;;) {
    const shards = build(count);
    if (shards.every((s) => JSON.stringify(s).length <= SHARD_BYTES) || count >= 16) return shards;
    count++;
  }
}

/** the picker's few glyphs of every family, outlined */
function previewOf(): Shard {
  const map: Record<string, [string, string]> = {};
  const sets: Collection[] = [];
  for (const set of ["rounded", "light", "sharp", ...Object.keys(TABLES)]) {
    for (const name of PREVIEW) {
      const ids = idsOf(set, name) ?? (set === "pixel" ? idsOf("sharp", name) : undefined);
      if (!ids) continue;
      map[`${set}/${name}`] = ids;
      for (const id of new Set(set === "rounded" ? ids : [ids[0]])) {
        const [prefix, glyph] = id.split(":");
        let c = sets.find((s) => s.prefix === prefix);
        if (!c) sets.push((c = { prefix, icons: {} }));
        if (!c.icons[glyph]) take(prefix, glyph, c, SCALE[set] ?? 1);
      }
    }
  }
  return { map, sets: sets.map(tidy) };
}

const CHECK = process.argv.includes("--check");
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const names = bundledNames();
  for (const [family, table] of Object.entries(TABLES)) for (const key of Object.keys(table)) if (!names.includes(key)) console.warn(`${family}: "${key}" is not a bundled name; it is never drawn`);
  const files = new Map<string, string>();
  const counts: Record<string, number> = {};
  const report: string[] = [];
  for (const set of ["rounded", "light", "sharp", ...Object.keys(TABLES)]) {
    const shards = shardsOf(set, names);
    counts[set] = shards.length;
    const mapped = set in TABLES ? shards.reduce((n, s) => n + Object.keys(s.map!).length, 0) : names.filter((n) => idsOf(set, n)).length;
    let raw = 0;
    let zipped = 0;
    shards.forEach((s, i) => {
      const text = JSON.stringify(s);
      raw += text.length;
      zipped += gzipSync(text).length;
      files.set(`${set}-${i}.json`, `${text}\n`);
    });
    report.push(`${set.padEnd(9)} ${String(mapped).padStart(4)} names  ${shards.length} shard(s)  ${(raw / 1024).toFixed(0).padStart(4)} KB  (${(zipped / 1024).toFixed(0)} KB gzip)`);
  }
  const preview = JSON.stringify(previewOf());
  files.set("preview.json", `${preview}\n`);
  report.push(`preview   ${(preview.length / 1024).toFixed(0)} KB (${(gzipSync(preview).length / 1024).toFixed(0)} KB gzip)`);
  const sources: Record<string, string> = {
    rounded: "Material Symbols Rounded, Google (Apache-2.0)",
    light: "Material Symbols Light, Google (Apache-2.0)",
    sharp: "Material Symbols Sharp, Google (Apache-2.0)",
    ...Object.fromEntries(Object.entries(FAMILIES).map(([k, f]) => [k, `${f.source} (${f.license})`])),
  };
  const manifest = `// Generated by scripts/gen-icon-sets.ts (bun run gen:icon-sets). Do not edit.
/** how many shards each set is split into; a name's shard is \`shardOf(name, count)\` */
export const SHARDS = ${JSON.stringify(counts, null, 2)} as const

/** where each set's glyphs come from, and their license (see NOTICE) */
export const SOURCES: Record<keyof typeof SHARDS, string> = ${JSON.stringify(sources, null, 2)}

/** the Material names bundled in every set */
export const BUNDLED = ${names.length}
`;
  const stale = [...files].filter(([f, text]) => !existsSync(join(OUT, f)) || readFileSync(join(OUT, f), "utf8") !== text).map(([f]) => f);
  const extra = existsSync(OUT) ? readdirSync(OUT).filter((f) => !files.has(f)) : [];
  const manifestStale = !existsSync(MANIFEST) || readFileSync(MANIFEST, "utf8") !== manifest;
  if (CHECK) {
    if (stale.length || extra.length || manifestStale) {
      console.log(`the icon sets are out of date (${[...stale, ...extra].join(", ") || "manifest"}), run: bun run gen:icon-sets`);
      process.exitCode = 1;
    } else console.log(`the icon sets are up to date (${names.length} names)`);
  } else {
    mkdirSync(OUT, { recursive: true });
    for (const f of extra) rmSync(join(OUT, f));
    for (const [f, text] of files) writeFileSync(join(OUT, f), text);
    writeFileSync(MANIFEST, manifest);
    console.log(`${names.length} Material names\n${report.join("\n")}`);
  }
}
