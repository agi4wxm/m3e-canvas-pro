/* Made-up values from JSON Schema 2020-12, the same for the same seed. Each value is made by its field's hint (given by
 * the author, or read from the field's name, format and enum: lib/mocks/hints.ts) in the language chosen, within its
 * schema: formats (email, uuid, date-time, date, time, uri, binary…), enums and consts, minimum and maximum, lengths,
 * simple patterns, arrays between minItems and maxItems, nested objects, allOf / anyOf / oneOf, and references to
 * models, which may form cycles: a model nests inside itself only so deep, and every walk has a budget, so a hostile
 * schema (a billion minItems, a thousand references deep) still answers in a moment.
 *
 * The fields of one object share a person: a user's name, user name, email and avatar belong together. A field
 * named after another model's id (productId), or holding another model (an order's product), takes one of that
 * model's records when the caller can give them, so the data hangs together. */

import { followRef, isRecord, pointerRoot, resolvePointer } from "../api/schema";
import { refModel, type ApiSpec, type JsonSchema, type JsonSchemaObject } from "../api/types";
import { dataUrl, utf8 } from "./bytes";
import { fileFits, placeholderFile, svgPicture, type FileKind } from "./files";
import { mergeAllOf } from "./shape";
import { inferHint, typesOf, wordsOf } from "./hints";
import { EMAIL_DOMAINS, LATIN_WORDS, LOCALES, STATUS_WORDS, type LocaleData } from "./locales";
import { fromPattern, nestedRepeat, regexOf } from "./pattern";
import { base36Of, hash53, rngOf, uuidOf, type Rng } from "./rng";
import type { MockFile, MockHint, MockLocale } from "./types";

/** what a generator is given */
export type GenOptions = {
  api: ApiSpec;
  locale: MockLocale;
  /** the moment dates are made around (ms since 1970) */
  now: number;
  files?: readonly MockFile[];
  /** the author's hints of a model, by field path */
  hints?: (model: string) => Record<string, MockHint> | undefined;
  /** one record of another model, for a field holding one; undefined to make one in place */
  related?: (model: string, rng: Rng) => Record<string, unknown> | undefined;
  /** the id of one record of the model a field like productId names; undefined when there is none */
  relatedId?: (words: string[], rng: Rng) => string | number | undefined;
  /** how a file of the library is handed out: its data URL by default */
  fileUrl?: (file: MockFile) => string;
  /** how many values one call may make before it stops filling optional fields (5000) */
  budget?: number;
  /** how deep values may nest (10) */
  maxDepth?: number;
  /** how many times a model may appear inside itself (1) */
  selfDepth?: number;
  /** what is made: a response leaves writeOnly fields out, a request readOnly ones */
  direction?: "response" | "request";
  /** the contract's own examples (examples, example, default) first, wherever a schema gives one: one valid request
   *  the author would recognise (the contract tests), where made-up data varies (the mocks) */
  preferExamples?: boolean;
  /** only what is required, and what the contract gives an example of; lists as short as they may be */
  minimal?: boolean;
};

/** the generator's state through one call */
type Ctx = Omit<GenOptions, "budget"> & { root: Record<string, unknown>; words: LocaleData; budget: { left: number }; hintCache: Map<string, MockHint> };

/** where a value is: the key of its record, its model and path from the model, its field's name, how deep */
type At = {
  key: string;
  model?: string;
  path: string;
  name: string;
  depth: number;
  refs: string[];
  required: boolean;
  /** the object it belongs to, for the person its fields share */
  obj: string;
  /** a hint passed down through a reference (category: {$ref: Category}) */
  hint?: MockHint;
  /** the currency the object's prices are in, once it has one */
  currency?: string;
};

/** a field left out */
const SKIP = Symbol("skip");
type Out = unknown | typeof SKIP;

const DAY = 86_400_000;

/** what prices look like in a currency: from, to, the step they move by */
const PRICES: Record<string, readonly [number, number, number]> = {
  CNY: [9.9, 999, 0.1],
  USD: [4.99, 299, 0.01],
  EUR: [4.99, 299, 0.01],
  GBP: [3.99, 249, 0.01],
  JPY: [300, 30000, 10],
  KRW: [3000, 300000, 100],
  TWD: [99, 9999, 1],
  HKD: [29, 2999, 1],
};

/** a new generator's state */
function ctxOf(o: GenOptions): Ctx {
  return { ...o, root: pointerRoot(o.api), words: LOCALES[o.locale] ?? LOCALES.en, budget: { left: o.budget ?? 5000 }, hintCache: new Map() };
}

/** One value of a schema. `key` makes it what it is: the same key, the same value. `model` and `path` say where it
 *  is, for the hints; `name` is its field's name. */
export function generateValue(schema: JsonSchema | undefined, o: GenOptions, at: { key: string; model?: string; path?: string; name?: string; required?: boolean } = { key: "value" }): unknown {
  const ctx = ctxOf(o);
  const out = gen(schema, ctx, { key: at.key, model: at.model, path: at.path ?? "", name: at.name ?? at.model ?? "", depth: 0, refs: [], required: at.required ?? true, obj: at.key });
  return out === SKIP ? null : out;
}

/** one record of a model, as an object */
export function generateRecord(model: string, o: GenOptions, key: string): Record<string, unknown> {
  const schema = o.api.models?.find((m) => m.name === model)?.schema;
  const v = generateValue(schema, o, { key, model, name: model });
  return isRecord(v) ? v : {};
}

/* ---------- the walk ---------- */

function hintAt(ctx: Ctx, at: At, s: JsonSchemaObject): MockHint {
  const own = at.model ? ctx.hints?.(at.model)?.[at.path] : undefined;
  if (own && own.kind !== "auto") return own;
  if (at.hint && at.hint.kind !== "auto") return at.hint;
  const cacheKey = `${at.model ?? ""}|${at.path}|${at.name}`;
  let h = ctx.hintCache.get(cacheKey);
  if (!h) {
    h = inferHint(at.name, s, at.model);
    ctx.hintCache.set(cacheKey, h);
  }
  return own ? { ...h, ...own, kind: h.kind } : h;
}

const rngAt = (at: At, what = "") => rngOf(`${at.key}|${at.path}|${what}`);

/** a value for when nothing more may be made: the least its type allows */
function least(s: JsonSchemaObject | undefined): unknown {
  if (!s) return null;
  const t = typesOf(s)[0];
  if (Array.isArray(s.type) && s.type.includes("null")) return null;
  if (s.const !== undefined) return s.const;
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
  if (t === "string") return "";
  if (t === "integer" || t === "number") return typeof s.minimum === "number" ? s.minimum : 0;
  if (t === "boolean") return false;
  if (t === "array") return [];
  if (t === "object") return {};
  return null;
}

function gen(schema: JsonSchema | undefined, ctx: Ctx, at: At): Out {
  if (schema === false) return SKIP;
  if (ctx.budget.left-- <= 0 || at.depth > (ctx.maxDepth ?? 10)) return at.required ? least(isRecord(schema) ? schema : undefined) : SKIP;
  if (schema === undefined || schema === true) return word(ctx, rngAt(at));
  const s = schema;

  /* a reference: another model in its own right (hints of its own), or a record of it */
  if (typeof s.$ref === "string") {
    const model = refModel(s.$ref);
    const seen = at.refs.filter((r) => r === s.$ref).length;
    if (seen > (ctx.selfDepth ?? 1)) return at.required ? cycleStop(ctx, s) : SKIP;
    const target = resolvePointer(ctx.root, s.$ref);
    if (target === undefined || (typeof target !== "boolean" && !isRecord(target))) return at.required ? null : SKIP;
    if (model && at.depth > 0 && ctx.related) {
      const r = ctx.related(model, rngAt(at, "related"));
      if (r) return r;
    }
    /* a primitive model (an enum, a Money string) keeps the hint of the field that holds it */
    const passHint = isRecord(target) && !["object", "array"].includes(typesOf(target as JsonSchemaObject)[0] ?? "") ? hintAt(ctx, at, target as JsonSchemaObject) : undefined;
    return gen(target as JsonSchema, ctx, { ...at, model: model ?? at.model, path: model ? "" : at.path, depth: at.depth + 1, refs: [...at.refs, s.$ref], hint: passHint });
  }

  if (Array.isArray(s.allOf) && s.allOf.length) return gen(mergeAllOf(ctx, s, at.depth), ctx, { ...at, depth: at.depth + 1 });

  for (const k of ["oneOf", "anyOf"] as const) {
    const list = s[k];
    if (!Array.isArray(list) || !list.length) continue;
    const isNull = (x: JsonSchema) => isRecord(x) && (x.type === "null" || (Array.isArray(x.type) && x.type.length === 1 && x.type[0] === "null"));
    const real = list.filter((x) => !isNull(x as JsonSchema)) as JsonSchema[];
    const rng = rngAt(at, k);
    if (real.length < list.length && !ctx.minimal && rng.chance(nullRateOf(ctx, at, s))) return null;
    if (!real.length) return null;
    const i = Math.floor(rng.next() * real.length);
    const branch = real[i];
    const { [k]: _drop, ...rest } = s;
    void _drop;
    const merged = Object.keys(rest).some((x) => !["description", "title", "discriminator", "examples", "example", "default", "deprecated"].includes(x)) && isRecord(branch) ? { allOf: [rest, branch] } : branch;
    const out = gen(merged as JsonSchema, ctx, { ...at, depth: at.depth + 1 });
    /* the property that tells the shapes apart names the shape chosen */
    if (s.discriminator && isRecord(out) && typeof s.discriminator.propertyName === "string") {
      const ref = isRecord(branch) && typeof branch.$ref === "string" ? branch.$ref : undefined;
      const mapped = Object.entries(s.discriminator.mapping ?? {}).find(([, v]) => v === ref)?.[0] ?? (ref ? refModel(ref) : undefined);
      if (mapped) out[s.discriminator.propertyName] = mapped;
    }
    return out;
  }

  if (ctx.preferExamples) {
    if (Array.isArray(s.examples) && s.examples.length) return s.examples[0];
    if ("example" in s && s.example !== undefined) return s.example;
    if ("default" in s && s.default !== undefined) return s.default;
  }
  const hint = hintAt(ctx, at, s);
  if (hint.kind === "constant" && hint.value !== undefined) return hint.value;
  if (s.const !== undefined) return s.const;
  if (Array.isArray(s.enum) && s.enum.length) return pickEnum(s, hint, rngAt(at, "enum"), ctx);

  const all = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
  const nullable = all.includes("null");
  if (nullable && !ctx.minimal && rngAt(at, "null").chance(nullRateOf(ctx, at, s))) return null;
  const types = typesOf(s);
  const type = types.length > 1 ? rngAt(at, "type").pick(types) : types[0];

  switch (type) {
    case "object":
      return object(s, ctx, at);
    case "array":
      return array(s, ctx, at);
    case "integer":
    case "number":
      return number(s, hint, ctx, at, type === "integer");
    case "boolean":
      return boolean(hint, at);
    case "null":
      return null;
    default:
      return string(s, hint, ctx, at);
  }
}

/** what a model that would nest inside itself once too often becomes: null where it may be, else the least of it */
function cycleStop(ctx: Ctx, s: JsonSchemaObject): unknown {
  const target = followRef(ctx.api, s);
  return isRecord(target) ? least(target as JsonSchemaObject) : null;
}

const nullRateOf = (ctx: Ctx, at: At, s: JsonSchemaObject) => {
  const own = at.model ? ctx.hints?.(at.model)?.[at.path]?.nullRate : undefined;
  return own ?? at.hint?.nullRate ?? (at.required ? 0.08 : 0.15) + (isRecord(s) && s.default === null ? 0.3 : 0);
};

/* ---------- objects and arrays ---------- */

function object(s: JsonSchemaObject, ctx: Ctx, at: At): Out {
  const out: Record<string, unknown> = {};
  const props = isRecord(s.properties) ? (s.properties as Record<string, JsonSchema>) : {};
  const required = new Set(Array.isArray(s.required) ? s.required : []);
  const obj = `${at.key}|${at.path}|${at.depth}`;
  for (const [name, sub] of Object.entries(props)) {
    const subS = isRecord(sub) ? (sub as JsonSchemaObject) : undefined;
    if (ctx.direction === "request" && subS?.readOnly) continue;
    if (ctx.direction !== "request" && subS?.writeOnly) continue;
    const path = at.path ? `${at.path}.${name}` : name;
    const req = required.has(name);
    if (!req && ctx.minimal && !(subS && (Array.isArray(subS.examples) || subS.example !== undefined || subS.default !== undefined))) continue;
    if (!req) {
      const own = at.model ? ctx.hints?.(at.model)?.[path]?.nullRate : undefined;
      if (rngOf(`${at.key}|${path}|present`).chance(own ?? 0.12)) continue;
      if (ctx.budget.left < 50) continue;
    }
    const v = gen(sub, ctx, { key: at.key, model: at.model, path, name, depth: at.depth + 1, refs: at.refs, required: req, obj });
    if (v !== SKIP) Object.defineProperty(out, name, { value: v, enumerable: true, writable: true, configurable: true });
  }
  /* a placeholder file shows its record's title: a PDF of an invoice says the invoice's title */
  const title = ["title", "name", "subject", "headline", "fileName", "filename", "label"].map((k) => out[k]).find((v): v is string => typeof v === "string" && v.length > 0 && !v.startsWith("data:"));
  if (title)
    for (const [name, sub] of Object.entries(props)) {
      const v = out[name];
      const subS = isRecord(sub) ? (sub as JsonSchemaObject) : undefined;
      if (typeof v !== "string" || !v.startsWith("data:") || !subS) continue;
      const path = at.path ? `${at.path}.${name}` : name;
      const sub2: At = { key: at.key, model: at.model, path, name, depth: at.depth + 1, refs: at.refs, required: required.has(name), obj };
      const hint = hintAt(ctx, sub2, subS);
      const kind: FileKind | undefined = hint.kind === "file" ? "pdf" : hint.kind === "image" || hint.kind === "video" ? hint.kind : undefined;
      if (!kind || poolFor(ctx, kind, hint).length) continue;
      out[name] = fileFor(ctx, kind, hint, rngAt(sub2, "titled"), title, `${obj}|${path}|${kind}`);
    }
  /* a price and its currency belong together: the price is made again in the currency's own range */
  const currency = typeof out.currency === "string" && /^[A-Z]{3}$/.test(out.currency) ? out.currency : undefined;
  if (currency && PRICES[currency] && PRICES[currency] !== ctx.words.price)
    for (const [name, sub] of Object.entries(props)) {
      const subS = isRecord(sub) ? (sub as JsonSchemaObject) : undefined;
      if (typeof out[name] !== "number" || !subS) continue;
      const path = at.path ? `${at.path}.${name}` : name;
      const sub2: At = { key: at.key, model: at.model, path, name, depth: at.depth + 1, refs: at.refs, required: required.has(name), obj, currency };
      const hint = hintAt(ctx, sub2, subS);
      if (hint.kind === "price") out[name] = number(subS, hint, ctx, sub2, typesOf(subS)[0] === "integer");
    }
  if (!Object.keys(props).length && isRecord(s.additionalProperties)) {
    const rng = rngAt(at, "keys");
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const key = `${rng.pick(LATIN_WORDS)}${i ? i + 1 : ""}`;
      const v = gen(s.additionalProperties as JsonSchema, ctx, { ...at, path: `${at.path}.*`, name: key, depth: at.depth + 1, required: true, obj });
      if (v !== SKIP) out[key] = v;
    }
  }
  return out;
}

function array(s: JsonSchemaObject, ctx: Ctx, at: At): Out {
  const rng = rngAt(at, "length");
  const hint = at.model ? ctx.hints?.(at.model)?.[at.path] : undefined;
  const min = Math.max(0, Math.min(typeof s.minItems === "number" ? s.minItems : (hint?.min ?? 1), 100));
  const maxGiven = typeof s.maxItems === "number" ? s.maxItems : hint?.max ?? min + 3;
  const max = Math.max(min, Math.min(maxGiven, min + 20, 100));
  const n = ctx.minimal ? Math.max(min, Math.min(1, max)) : rng.int(min, max);
  const out: unknown[] = [];
  const prefix = Array.isArray(s.prefixItems) ? (s.prefixItems as JsonSchema[]) : [];
  const seen = new Set<string>();
  for (let i = 0; i < n + (s.uniqueItems ? 6 : 0) && out.length < n; i++) {
    if (ctx.budget.left <= 0) break;
    const item = i < prefix.length ? prefix[i] : s.items;
    const v = gen(item, ctx, { key: `${at.key}#${i}`, model: at.model, path: `${at.path}[]`, name: at.name, depth: at.depth + 1, refs: at.refs, required: true, obj: `${at.obj}#${i}` });
    if (v === SKIP) continue;
    if (s.uniqueItems) {
      const k = JSON.stringify(v);
      if (seen.has(k)) continue;
      seen.add(k);
    }
    out.push(v);
  }
  return out;
}

/* ---------- enums, numbers, booleans ---------- */

function pickEnum(s: JsonSchemaObject, hint: MockHint, rng: Rng, ctx: Ctx): unknown {
  const values = s.enum as unknown[];
  const weights = hint.weights;
  const locale = ctx.words.currency;
  return rng.weighted(values, (v) => {
    const key = String(v);
    if (weights && key in weights) return weights[key];
    if (weights) return 1;
    if (v === locale) return 12;
    if (s.default !== undefined && v === s.default) return values.includes(locale) ? 2 : 4;
    if (hint.kind === "status" && v === values[0]) return 2.5;
    return 1;
  });
}

/** the bounds a number may take, from its schema */
function bounds(s: JsonSchemaObject, integer: boolean): { lo?: number; hi?: number } {
  const step = integer ? 1 : 0.01;
  let lo = typeof s.minimum === "number" ? s.minimum : undefined;
  let hi = typeof s.maximum === "number" ? s.maximum : undefined;
  if (typeof s.exclusiveMinimum === "number") lo = Math.max(lo ?? -Infinity, s.exclusiveMinimum + step);
  if (typeof s.exclusiveMaximum === "number") hi = Math.min(hi ?? Infinity, s.exclusiveMaximum - step);
  return { lo, hi };
}

function number(s: JsonSchemaObject, hint: MockHint, ctx: Ctx, at: At, integer: boolean): number {
  const rng = rngAt(at, "number");
  const words = wordsOf(at.name);
  let lo: number;
  let hi: number;
  let decimals = integer ? 0 : 2;
  let nice: ((v: number) => number) | undefined;
  switch (hint.kind) {
    case "price": {
      const [from, to, step] = (at.currency ? PRICES[at.currency] : undefined) ?? ctx.words.price;
      lo = from;
      hi = to;
      decimals = step >= 1 || integer ? 0 : 2;
      nice = (v) => (step >= 1 ? Math.max(step, Math.round(v / (step * 10)) * step * 10) : Math.floor(v) + rng.pick(step === 0.1 ? [0.9, 0, 0.5, 0.8] : [0.99, 0.49, 0, 0.5, 0.95]));
      break;
    }
    case "rating":
      [lo, hi] = [1, 5];
      decimals = integer ? 0 : 1;
      /* most ratings are good ones */
      nice = (v) => (integer ? Math.round(v) : Math.min(5, Math.round((3 + (v - 1) / 2) * 10) / 10));
      break;
    case "percent":
      [lo, hi] = typeof s.maximum === "number" && s.maximum <= 1 ? [0, 1] : [0, 100];
      decimals = hi === 1 ? 2 : integer ? 0 : 1;
      break;
    case "age":
      [lo, hi] = [18, 72];
      decimals = 0;
      break;
    case "quantity":
      [lo, hi] = has(words, "stock", "inventory") ? [0, 240] : has(words, "likes", "views", "followers", "votes") ? [0, 5000] : has(words, "quantity", "qty") ? [1, 5] : [0, 60];
      decimals = 0;
      break;
    case "latitude":
      [lo, hi] = ({ zh: [22, 40], en: [30, 47], ja: [31, 43], ko: [34, 38] } as const)[ctx.locale] ?? [-60, 60];
      decimals = 6;
      break;
    case "longitude":
      [lo, hi] = ({ zh: [102, 122], en: [-122, -71], ja: [130, 141], ko: [126, 129] } as const)[ctx.locale] ?? [-180, 180];
      decimals = 6;
      break;
    case "dateTime":
    case "date": {
      const t = moment(ctx, hint, rng);
      return has(words, "ms", "millis", "milliseconds") ? t : Math.floor(t / 1000);
    }
    case "id":
      [lo, hi] = [1, 99_999];
      decimals = 0;
      break;
    default:
      [lo, hi] = integer ? [1, 100] : [0, 1000];
  }
  if (typeof hint.min === "number") lo = hint.min;
  if (typeof hint.max === "number") hi = hint.max;
  const b = bounds(s, integer);
  if (b.lo !== undefined) {
    lo = Math.max(lo, b.lo);
    if (hi < lo) hi = b.hi !== undefined ? Math.min(b.hi, lo + Math.max(10, Math.abs(lo))) : lo + Math.max(10, Math.abs(lo));
  }
  if (b.hi !== undefined) {
    hi = Math.min(hi, b.hi);
    if (lo > hi) lo = b.lo !== undefined ? b.lo : hi - Math.max(10, Math.abs(hi));
  }
  let v = rng.float(lo, hi);
  if (nice) v = nice(v);
  if (integer) v = Math.round(v);
  else v = Number(v.toFixed(decimals));
  if (typeof s.multipleOf === "number" && s.multipleOf > 0) v = Number((Math.round(v / s.multipleOf) * s.multipleOf).toFixed(integer ? 0 : 6));
  /* rounding may have stepped out of bounds */
  if (b.lo !== undefined && v < b.lo) v = integer ? Math.ceil(b.lo) : b.lo;
  if (b.hi !== undefined && v > b.hi) v = integer ? Math.floor(b.hi) : b.hi;
  return Number.isFinite(v) ? v : 0;
}

const has = (words: string[], ...any: string[]) => words.some((w) => any.includes(w));

function boolean(hint: MockHint, at: At): boolean {
  const words = wordsOf(at.name);
  const p = typeof hint.min === "number" ? hint.min : has(words, "deleted", "blocked", "banned", "archived", "disabled", "locked", "spam", "flagged", "suspended") ? 0.1 : has(words, "active", "enabled", "verified", "available", "visible", "public", "published", "online", "valid", "confirmed") ? 0.8 : 0.5;
  return rngAt(at, "bool").chance(p);
}

/* ---------- dates ---------- */

/** a moment in a hint's range, in ms */
function moment(ctx: Ctx, hint: MockHint, rng: Rng): number {
  const from = timeOf(hint.from ?? "-180d", ctx.now);
  const to = timeOf(hint.to ?? "now", ctx.now);
  const [a, b] = from <= to ? [from, to] : [to, from];
  /* whole minutes, in the day's waking hours more often than not */
  const t = a + rng.next() * (b - a);
  return Math.floor(t / 60_000) * 60_000;
}

/** "now", "-30d", "+2h", "-1y", an ISO date or a number of ms, as ms */
export function timeOf(v: string | number, now: number): number {
  if (typeof v === "number") return v;
  const t = v.trim();
  if (t === "now" || t === "") return now;
  const m = /^([+-]?)(\d+(?:\.\d+)?)\s*(s|m|min|h|d|w|mo|y)$/.exec(t);
  if (m) {
    const n = Number(m[2]) * (m[1] === "-" ? -1 : 1);
    const unit = { s: 1000, m: 60_000, min: 60_000, h: 3_600_000, d: DAY, w: 7 * DAY, mo: 30 * DAY, y: 365 * DAY }[m[3] as "s"];
    return now + n * unit;
  }
  const parsed = Date.parse(t);
  return Number.isFinite(parsed) ? parsed : now;
}

const iso = (t: number) => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");

/* ---------- strings ---------- */

/** the person an object's fields share */
type Person = { family: string; given: string; familyLatin: string; givenLatin: string; n: number };

function personOf(ctx: Ctx, at: At): Person {
  const rng = rngOf(`person|${at.obj}`);
  const [family, familyLatin] = rng.pick(ctx.words.family);
  const [given, givenLatin] = rng.pick(ctx.words.given);
  return { family, given, familyLatin, givenLatin, n: rng.int(1, 99) };
}

function word(ctx: Ctx, rng: Rng): string {
  return rng.pick(ctx.words.words);
}

/** the library's files a field of this kind may use */
const poolFor = (ctx: Ctx, kind: FileKind, hint: MockHint) => (ctx.files ?? []).filter((f) => (hint.files?.length ? hint.files.includes(f.id) : fileFits(f, kind)));

function fileFor(ctx: Ctx, kind: FileKind, hint: MockHint, rng: Rng, title: string, seed: string): string {
  const pool = poolFor(ctx, kind, hint);
  if (pool.length) {
    const f = rng.pick(pool);
    return ctx.fileUrl ? ctx.fileUrl(f) : f.data;
  }
  if (kind === "image" || kind === "avatar") return dataUrl("image/svg+xml", utf8(svgPicture({ seed, title, avatar: kind === "avatar", w: 480, h: 360 })));
  const f = placeholderFile(kind, { seed, title });
  return ctx.fileUrl ? ctx.fileUrl(f) : f.data;
}

function hex(rng: Rng): string {
  const h = rng.int(0, 359);
  const s = 0.45 + rng.next() * 0.35;
  const l = 0.4 + rng.next() * 0.25;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function string(s: JsonSchemaObject, hint: MockHint, ctx: Ctx, at: At): string {
  const rng = rngAt(at, "str");
  const L = ctx.words;
  const format = typeof s.format === "string" ? s.format : "";
  const words = wordsOf(at.name);
  const pick = (list: readonly string[]) => (hint.values?.length ? String(rng.pick(hint.values)) : rng.pick(list));
  const digits = (n: number) => Array.from({ length: n }, () => rng.int(0, 9)).join("");
  let v: string;
  switch (hint.kind) {
    case "id": {
      if (format === "uuid") v = uuidOf(rng);
      else {
        const related = ctx.relatedId?.(words, rng);
        if (related !== undefined) v = String(related);
        else {
          const base = (words.length > 1 && words[words.length - 1] === "id" ? words[words.length - 2] : at.model ?? "id").toLowerCase();
          v = `${abbreviation(base)}_${base36Of(rng, 10)}`;
        }
      }
      break;
    }
    case "uuid":
      v = uuidOf(rng);
      break;
    case "personName": {
      const p = personOf(ctx, at);
      v = hint.values?.length ? pick([]) : L.fullName(p.family, p.given);
      break;
    }
    case "firstName":
      v = personOf(ctx, at).given;
      break;
    case "lastName":
      v = personOf(ctx, at).family;
      break;
    case "username": {
      const p = personOf(ctx, at);
      v = `${p.givenLatin}${rng.chance(0.5) ? "_" : ""}${p.familyLatin.slice(0, rng.int(1, 3))}${p.n}`;
      break;
    }
    case "email": {
      const p = personOf(ctx, at);
      v = `${p.givenLatin}.${p.familyLatin}${p.n > 50 ? p.n : ""}@${EMAIL_DOMAINS[hash53(at.obj) % EMAIL_DOMAINS.length]}`;
      break;
    }
    case "avatar": {
      const p = personOf(ctx, at);
      v = fileFor(ctx, "avatar", hint, rng, L.fullName(p.family, p.given), `${at.obj}|avatar`);
      break;
    }
    case "phone":
      v = L.phone(digits(10));
      break;
    case "address":
    case "street": {
      const [town, region] = rng.pick(L.towns);
      const parts = { region, town, street: pick(L.streets), n: rng.int(1, 399), m: rng.int(1, 30), k: rng.int(0, 99) };
      v = hint.kind === "address" ? L.address(parts) : L.address({ ...parts, region: "", town: "" }).replace(/^[,\s]+/, "").replace(/,\s*,?\s*$/, "").split(",")[0].trim();
      break;
    }
    case "city":
      v = pick(L.towns.map((x) => x[0]));
      break;
    case "region":
      v = pick(L.towns.map((x) => x[1]));
      break;
    case "country":
      v = hint.values?.length ? pick([]) : L.country;
      break;
    case "postcode": {
      const t = rng.pick(L.towns);
      v = L.postcode(t[2], digits(6));
      break;
    }
    case "company":
      v = L.company(pick(L.companyStems), rng.pick(L.companyKinds), rng.int(0, 11));
      break;
    case "jobTitle":
      v = pick(L.jobTitles);
      break;
    case "productName":
      v = L.product(rng.pick(L.productAdjectives), pick(L.productNouns));
      break;
    case "category":
      v = pick(L.categories);
      break;
    case "tag":
      v = pick(L.tags);
      break;
    case "title":
      v = rng.pick(L.titles)(pick(L.words), rng.int(3, 9));
      break;
    case "sentence":
      v = some(rng, hint.values?.length ? hint.values.map(String) : L.sentences, rng.int(1, 2)).join(L.join);
      break;
    case "paragraph":
      v = some(rng, hint.values?.length ? hint.values.map(String) : L.sentences, rng.int(3, 5)).join(L.join);
      break;
    case "slug":
      v = `${rng.pick(LATIN_WORDS)}-${rng.pick(LATIN_WORDS)}-${rng.int(1, 99)}`;
      break;
    case "code":
      v = `${(at.model ?? words[0] ?? "ref").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "REF"}-${digits(5)}`;
      break;
    case "color":
      v = hex(rng);
      break;
    case "url":
      v = `https://${rng.pick(LATIN_WORDS)}.example.com/${rng.pick(LATIN_WORDS)}-${rng.int(1, 999)}`;
      break;
    case "image":
      v = fileFor(ctx, "image", hint, rng, at.model && at.depth <= 2 ? L.product(rng.pick(L.productAdjectives), rng.pick(L.productNouns)) : pick(L.words), `${at.obj}|${at.path}|image`);
      break;
    case "file":
      v = fileFor(ctx, "pdf", hint, rng, rng.pick(L.titles)(pick(L.words), rng.int(3, 9)), `${at.obj}|${at.path}|file`);
      break;
    case "audio":
      v = fileFor(ctx, "audio", hint, rng, pick(L.words), `${at.obj}|${at.path}|audio`);
      break;
    case "video":
      v = fileFor(ctx, "video", hint, rng, pick(L.words), `${at.obj}|${at.path}|video`);
      break;
    case "date":
      v = iso(moment(ctx, hint, rng)).slice(0, 10);
      break;
    case "dateTime":
      v = iso(moment(ctx, hint, rng));
      break;
    case "time":
      /* RFC 3339's full-time carries its offset */
      v = `${String(rng.int(7, 21)).padStart(2, "0")}:${String(rng.pick([0, 15, 30, 45])).padStart(2, "0")}:00Z`;
      break;
    case "status":
      v = hint.values?.length ? pick([]) : rng.weighted(STATUS_WORDS, (x) => (x === "active" ? 4 : x === "pending" ? 2 : 1));
      break;
    case "token":
      v = `${base36Of(rng, 8)}${base36Of(rng, 8).toUpperCase()}${base36Of(rng, 16)}`;
      break;
    case "password":
      v = `Mock-${base36Of(rng, 6)}!${rng.int(10, 99)}`;
      break;
    case "ip":
      v = format === "ipv6" ? `fd00::${base36Of(rng, 4).replace(/[g-z]/g, "a")}:${rng.int(1, 9999).toString(16)}` : `192.168.${rng.int(0, 254)}.${rng.int(1, 254)}`;
      break;
    case "version":
      v = `${rng.int(0, 3)}.${rng.int(0, 12)}.${rng.int(0, 20)}`;
      break;
    case "currency":
      v = hint.values?.length ? pick([]) : L.currency;
      break;
    case "enum":
      v = hint.values?.length ? pick([]) : pick(L.words);
      break;
    case "integer":
    case "number":
    case "price":
    case "quantity":
    case "rating":
    case "percent":
    case "age":
    case "latitude":
    case "longitude":
      v = String(number({ ...s, type: "number" }, hint, ctx, at, hint.kind !== "price" && hint.kind !== "rating"));
      break;
    case "boolean":
      v = String(boolean(hint, at));
      break;
    default:
      v = pick(L.words);
  }
  return fitString(v, s, rng);
}

/** n different items of a list, in a random order */
function some<T>(rng: Rng, list: readonly T[], n: number): T[] {
  const pool = [...list];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
  return out;
}

/** a string held to its schema's format, pattern and lengths */
function fitString(v: string, s: JsonSchemaObject, rng: Rng): string {
  const format = typeof s.format === "string" ? s.format : "";
  /* the format wins over a hint that disagrees with it */
  if (format === "uuid" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) v = uuidOf(rng);
  if (format === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) v = `${rng.pick(LATIN_WORDS)}${rng.int(1, 99)}@example.com`;
  if (format === "date-time" && Number.isNaN(Date.parse(v))) v = iso(Date.UTC(2026, 0, 1) + Math.floor(rng.next() * 300) * DAY);
  if (format === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) v = iso(Date.UTC(2026, 0, 1) + Math.floor(rng.next() * 300) * DAY).slice(0, 10);
  if ((format === "uri" || format === "url") && !/^[a-z][a-z0-9+.-]*:/i.test(v)) v = `https://${rng.pick(LATIN_WORDS)}.example.com/${encodeURIComponent(v).slice(0, 40)}`;
  const pattern = typeof s.pattern === "string" ? s.pattern : undefined;
  const minLength = typeof s.minLength === "number" ? Math.min(s.minLength, 2000) : 0;
  const maxLength = typeof s.maxLength === "number" ? Math.max(s.maxLength, 0) : undefined;
  if (pattern) {
    const re = regexOf(pattern);
    if (re && nestedRepeat(pattern)) {
      /* words made otherwise are never tested against a pattern that repeats a repeat: a near miss could take the
         engine exponential time (a 32-character token, seconds; 40, hours). What is made from the pattern fits it. */
      const made = fromPattern(pattern, rng, { minLength, maxLength });
      if (made !== undefined) return made;
    } else {
      if (re && !re.test(v)) v = fromPattern(pattern, rng, { minLength, maxLength }) ?? v;
      if (re && re.test(v)) return v;
    }
  }
  const chars = [...v];
  if (chars.length < minLength) {
    const fill = [...`${v} ${LATIN_WORDS.join(" ")}`];
    while (chars.length < minLength) chars.push(fill[chars.length % fill.length]);
    v = chars.join("");
  }
  if (maxLength !== undefined && [...v].length > maxLength) v = [...v].slice(0, maxLength).join("").trimEnd();
  return v;
}

/** a short prefix for ids of a model: product → prd, user → usr, order → ord */
export function abbreviation(word: string): string {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return "id";
  const rest = w.slice(1).replace(/[aeiou]/g, "");
  return (w[0] + rest).slice(0, 3).padEnd(2, w[1] ?? "x");
}
