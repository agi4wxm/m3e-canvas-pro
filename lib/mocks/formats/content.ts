/* What a mock file is filled with: the record it belongs to (an invoice's PDF shows the invoice's fields), the rows
 * of a list (a CSV or a spreadsheet of the products), or, with neither, a small table made from the seed. Every
 * format reads the same content through these few helpers, so a record says the same thing as JSON, as a table, as
 * a document or as slides. */

import { rngOf } from "../rng";
import type { MockLocale } from "../types";

export type FileContent = {
  /** what the file is made from: the same seed, the same bytes */
  seed: string;
  /** what it is called: the record's title, a list's name */
  title?: string;
  /** the record the file belongs to */
  record?: Record<string, unknown>;
  /** the records of a list, for a table */
  rows?: readonly Record<string, unknown>[];
  /** the model of the records */
  model?: string;
  locale?: MockLocale;
  /** how much to make, 1 at most: less when the schema allows the file only so many bytes */
  scale?: number;
};

export type Cell = string | number | boolean | null;

/** the words a document's made-up text is made of (the same as lib/mocks/locales.ts LATIN_WORDS, kept here so a PDF
 *  needs nothing of the locales) */
const WORDS = ["amber", "breeze", "cedar", "delta", "ember", "fable", "grove", "harbor", "iris", "jade", "koi", "lumen", "maple", "nova", "orbit", "pixel", "quartz", "river", "sable", "tidal", "umber", "violet", "willow", "zephyr"];

/** a color of hue, saturation and lightness (0–1), as 0–255 */
export function hslRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round((l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return [f(0), f(8), f(4)];
}
export type Table = { columns: string[]; rows: Cell[][] };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** a value as one cell: files by their type, lists of words joined, anything else as JSON */
export function cellOf(v: unknown): Cell {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v.startsWith("data:") ? `[${/^data:([^;,]*)/.exec(v)?.[1] || "file"}]` : v;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v;
  if (Array.isArray(v) && v.every((x) => x === null || ["string", "number", "boolean"].includes(typeof x))) return v.map((x) => String(cellOf(x) ?? "")).join(", ");
  try {
    return JSON.stringify(v, (_k, x) => (typeof x === "string" && x.startsWith("data:") ? cellOf(x) : x));
  } catch {
    return String(v);
  }
}

/** a cell as text */
export const textOf = (c: Cell): string => (c === null ? "" : String(c));

/** a record's fields as one level: nested objects by dotted names (customer.name), two levels deep */
export function flatten(rec: Record<string, unknown>, prefix = "", depth = 0, out: Record<string, Cell> = {}): Record<string, Cell> {
  for (const [k, v] of Object.entries(rec)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isObj(v) && depth < 1 && Object.keys(v).length <= 12) flatten(v, key, depth + 1, out);
    else out[key] = cellOf(v);
  }
  return out;
}

/** the records as a table: their fields in the order they first come, at most 40 columns */
export function tableOf(rows: readonly Record<string, unknown>[], maxRows = 1000): Table {
  const flat = rows.slice(0, maxRows).map((r) => flatten(r));
  const columns: string[] = [];
  for (const r of flat) for (const k of Object.keys(r)) if (!columns.includes(k) && columns.length < 40) columns.push(k);
  return { columns, rows: flat.map((r) => columns.map((c) => (c in r ? r[c] : null))) };
}

const TITLE_KEYS = ["title", "name", "subject", "headline", "fileName", "filename", "label", "displayName", "fullName", "code", "number", "id"];

/** what a record is called */
export function titleOfRecord(rec: Record<string, unknown> | undefined): string | undefined {
  if (!rec) return undefined;
  for (const k of TITLE_KEYS) {
    const v = rec[k];
    if ((typeof v === "string" && v && !v.startsWith("data:")) || typeof v === "number") return String(v);
  }
  return undefined;
}

/** the title of a file's content */
export const titleOf = (c: FileContent): string => c.title || titleOfRecord(c.record) || c.model || "Document";

/** A small table made from a seed, for a file that has no record: items with a quantity, a price and a date. */
export function sampleRows(seed: string, n = 8): Record<string, unknown>[] {
  const rng = rngOf(`rows:${seed}`);
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  const day = Date.UTC(2026, 0, 5);
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    item: `${cap(rng.pick(WORDS))} ${rng.pick(WORDS)}`,
    quantity: rng.int(1, 12),
    price: Math.round(rng.float(2, 120) * 100) / 100,
    date: new Date(day + rng.int(0, 120) * 86_400_000).toISOString().slice(0, 10),
    done: rng.chance(0.5),
  }));
}

/** the rows a table of the content shows: the list's, the record alone, or the sample */
export function rowsOf(c: FileContent, sample = 8): readonly Record<string, unknown>[] {
  const n = Math.max(1, Math.round(sample * Math.min(1, c.scale ?? 1)));
  if (c.rows?.length) return c.rows.slice(0, Math.max(1, Math.round(c.rows.length * Math.min(1, c.scale ?? 1))));
  if (c.record) return [c.record];
  return sampleRows(c.seed, n);
}

/** the label and value of each field of the record (or of the first row) */
export function fieldsOf(c: FileContent): [string, string][] {
  const rec = c.record ?? c.rows?.[0];
  if (!rec) return [];
  return Object.entries(flatten(rec)).map(([k, v]) => [k, textOf(v)]);
}

/** sentences of Latin words, for the body of a document */
export function paragraphsOf(seed: string, n: number): string[] {
  const rng = rngOf(`text:${seed}`);
  return Array.from({ length: n }, () => {
    const sentences = Array.from({ length: rng.int(3, 5) }, () => {
      const words = Array.from({ length: rng.int(6, 13) }, () => rng.pick(WORDS));
      return `${words[0][0].toUpperCase()}${words.join(" ").slice(1)}.`;
    });
    return sentences.join(" ");
  });
}

/** the coordinates a record holds (lat/lng fields, a location object, a [lng, lat] pair), when it holds any */
export function coordinatesOf(rec: Record<string, unknown> | undefined): [number, number] | undefined {
  if (!rec) return undefined;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const pick = (o: Record<string, unknown>): [number, number] | undefined => {
    const lat = num(o.lat ?? o.latitude);
    const lng = num(o.lng ?? o.lon ?? o.long ?? o.longitude);
    if (lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return [lng, lat];
    const pair = o.coordinates;
    if (Array.isArray(pair) && pair.length >= 2 && num(pair[0]) !== undefined && num(pair[1]) !== undefined) return [num(pair[0])!, num(pair[1])!];
    return undefined;
  };
  const own = pick(rec);
  if (own) return own;
  for (const k of ["location", "geo", "position", "coords", "coordinates", "point", "address", "place"]) if (isObj(rec[k])) {
    const inner = pick(rec[k] as Record<string, unknown>);
    if (inner) return inner;
  }
  return undefined;
}

/** a place to put points that have none: a city of the locale */
export const CENTERS: Record<MockLocale, [number, number]> = { zh: [121.47, 31.23], en: [-122.42, 37.77], ja: [139.69, 35.68], ko: [126.98, 37.57] };

/** XML text, escaped, with the characters XML 1.0 may not hold left out */
export const xmlText = (s: string) =>
  [...s]
    .filter((c) => {
      const n = c.charCodeAt(0);
      return n === 9 || n === 10 || n === 13 || (n >= 0x20 && n !== 0xfffe && n !== 0xffff);
    })
    .join("")
    .replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
