/* The records of a document's models, as the mocks hand them out: first the records pinned by hand (the model's
 * fixtures, then the rows of the data collections linked to it), then made-up ones up to the model's count. Made
 * lazily, a model at a time, and the same for the same seed. Records of one model refer to records of another that
 * exist (an order's product is one of the products, a post's authorId one of the users), as far as that does not
 * go round in a circle. */

import { isRecord } from "../api/schema";
import type { ApiSpec, JsonSchema, JsonSchemaObject } from "../api/types";
import { generateValue, type GenOptions } from "./generate";
import { clone, DEFAULT_COUNT, idFieldOf, modelShape, listedModels } from "./shape";
import { typesOf } from "./hints";
import type { Rng } from "./rng";
import { MAX_COUNT, type MockLocale, type MockSpec } from "./types";

/** the values one made-up record may take, the values all of a model's made-up records may take together, and the
 *  least a record is given however many there are */
const RECORD_BUDGET = 4000;
const MODEL_BUDGET = 1_000_000;
const RECORD_BUDGET_LEAST = 150;

/** a data collection of the document, as far as the mocks read it (Doc.collections) */
export type MockCollection = { id: string; name: string; fields: string[]; rows: string[][]; model?: string };

/** what the mocks are made from: the contract, the mock settings and the collections */
export type MockSource = { api?: ApiSpec; mocks?: MockSpec; collections?: readonly MockCollection[] };

export type DataOptions = {
  seed?: number;
  locale?: MockLocale;
  now?: number;
  /** counts by model ("*" for all), over the models' own */
  counts?: Record<string, number>;
  fileUrl?: GenOptions["fileUrl"];
};

/** a collection's cell, as the type its model's field has */
function cellValue(text: string, schema: JsonSchema | undefined): unknown {
  const s = isRecord(schema) ? (schema as JsonSchemaObject) : {};
  const t = typesOf(s)[0];
  const trimmed = text.trim();
  if ((t === "integer" || t === "number") && trimmed !== "" && Number.isFinite(Number(trimmed))) return Number(trimmed);
  if (t === "boolean" && (trimmed === "true" || trimmed === "false")) return trimmed === "true";
  if ((t === "array" || t === "object") && /^[[{]/.test(trimmed)) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return text;
    }
  }
  if (t === "array") return trimmed ? trimmed.split(/\s*[,，、]\s*/) : [];
  return text;
}

export class MockData {
  readonly api: ApiSpec;
  readonly spec: MockSpec;
  readonly seed: number;
  readonly locale: MockLocale;
  readonly now: number;
  private readonly source: MockSource;
  private readonly counts: Record<string, number>;
  private readonly cache = new Map<string, Record<string, unknown>[]>();
  private readonly making = new Set<string>();
  readonly gen: GenOptions;

  constructor(source: MockSource, o: DataOptions = {}) {
    this.source = source;
    this.api = source.api ?? {};
    this.spec = source.mocks ?? {};
    this.seed = o.seed ?? this.spec.seed ?? 1;
    this.locale = o.locale ?? this.spec.locale ?? "en";
    this.now = o.now ?? Date.now();
    this.counts = o.counts ?? {};
    this.gen = {
      api: this.api,
      locale: this.locale,
      now: this.now,
      files: this.spec.files ?? [],
      hints: (model) => this.spec.models?.find((m) => m.name === model)?.hints,
      related: (model, rng) => this.related(model, rng),
      relatedId: (words, rng) => this.relatedId(words, rng),
      fileUrl: o.fileUrl,
    };
  }

  /** how many records a model has */
  countOf(model: string): number {
    const own = this.spec.models?.find((m) => m.name === model)?.count;
    const n = this.counts[model] ?? this.counts["*"] ?? own ?? DEFAULT_COUNT;
    return Math.max(0, Math.min(MAX_COUNT, Math.floor(n)));
  }

  /** the records pinned by hand: the model's fixtures, then the rows of the collections linked to it */
  pinned(model: string): Record<string, unknown>[] {
    const own = (this.spec.models?.find((m) => m.name === model)?.fixtures ?? []).filter(isRecord).map((r) => clone(r));
    const shape = modelShape(this.api, model);
    const props = isRecord(shape?.properties) ? (shape!.properties as Record<string, JsonSchema>) : {};
    const rows = (this.source.collections ?? [])
      .filter((c) => c.model === model)
      .flatMap((c) =>
        c.rows.map((row) => {
          const out: Record<string, unknown> = {};
          c.fields.forEach((f, i) => {
            if (f && row[i] !== undefined) out[f] = cellValue(row[i], props[f]);
          });
          return out;
        }),
      );
    return [...own, ...rows];
  }

  /** a model's records: pinned ones first, then made-up ones up to its count */
  records(model: string): Record<string, unknown>[] {
    const have = this.cache.get(model);
    if (have) return have;
    if (this.making.has(model)) return [];
    this.making.add(model);
    try {
      const pinned = this.pinned(model);
      const n = Math.max(0, this.countOf(model) - pinned.length);
      const config = this.spec.models?.find((m) => m.name === model);
      const schema = this.api.models?.find((m) => m.name === model)?.schema;
      const idField = idFieldOf(this.api, model);
      const idProps = (modelShape(this.api, model)?.properties ?? {}) as Record<string, JsonSchemaObject>;
      const idType = idField ? typesOf(idProps[idField] ?? {})[0] : undefined;
      const taken = new Set(pinned.map((r) => (idField ? String(r[idField]) : "")));
      let next = Math.max(0, ...pinned.map((r) => (idField && typeof r[idField] === "number" ? (r[idField] as number) : 0)));
      const made: Record<string, unknown>[] = [];
      /* the records of a model share a budget: as many as a model may have, each as wide as its schema may make it,
         would otherwise be millions of values the preview makes before it answers (a usual count keeps the whole
         budget of a record, so its records are the same) */
      const budget = Math.max(RECORD_BUDGET_LEAST, Math.min(RECORD_BUDGET, Math.floor(MODEL_BUDGET / Math.max(1, n))));
      for (let i = 0; i < n; i++) {
        const v = generateValue(schema, { ...this.gen, budget }, { key: `${this.seed}:${model}:${config?.seed ?? 0}:${i}`, model, name: model });
        const rec = isRecord(v) ? v : { value: v };
        if (idField) {
          if (idType === "integer" || idType === "number") rec[idField] = ++next;
          else if (taken.has(String(rec[idField]))) rec[idField] = `${String(rec[idField])}-${i + 1}`;
          taken.add(String(rec[idField]));
        }
        made.push(rec);
      }
      const all = [...pinned, ...made];
      this.cache.set(model, all);
      return all;
    } finally {
      this.making.delete(model);
    }
  }

  /** a record of a model, when it has records to give and is not being made right now */
  private related(model: string, rng: Rng): Record<string, unknown> | undefined {
    if (this.making.has(model) || !this.isResource(model)) return undefined;
    const list = this.records(model);
    return list.length ? clone(list[Math.floor(rng.next() * list.length)]) : undefined;
  }

  /** the id of a record of the model a field like productId or authorId names */
  private relatedId(words: string[], rng: Rng): string | number | undefined {
    if (words.length < 2 || words[words.length - 1] !== "id") return undefined;
    const owner = words.slice(0, -1).join("");
    const people = ["author", "owner", "creator", "sender", "recipient", "assignee", "reviewer", "host", "seller", "buyer"];
    const names = this.api.models?.map((m) => m.name) ?? [];
    const match =
      names.find((n) => n.toLowerCase() === owner || n.toLowerCase() === `${owner}s`) ??
      (people.includes(owner) ? names.find((n) => ["user", "member", "account", "profile", "customer", "person"].includes(n.toLowerCase())) : undefined);
    if (!match || this.making.has(match)) return undefined;
    const idField = idFieldOf(this.api, match);
    if (!idField) return undefined;
    const list = this.records(match);
    if (!list.length) return undefined;
    const v = list[Math.floor(rng.next() * list.length)][idField];
    return typeof v === "string" || typeof v === "number" ? v : undefined;
  }

  /** models whose records are handed out as a whole (a list, a detail): the ones a nested reference picks from */
  private resources?: Set<string>;
  isResource(model: string): boolean {
    if (!this.resources) {
      this.resources = new Set<string>();
      for (const m of this.spec.models ?? []) if (m.count !== undefined || m.fixtures?.length) this.resources.add(m.name);
      for (const c of this.source.collections ?? []) if (c.model) this.resources.add(c.model);
      for (const e of this.api.endpoints ?? []) {
        if (e.method !== "get") continue;
        for (const r of Object.values(e.responses)) {
          const content = (r as { content?: unknown }).content;
          const media = isRecord(content) ? Object.values(content)[0] : undefined;
          const schema = isRecord(media) ? (media.schema as JsonSchema | undefined) : undefined;
          for (const m of listedModels(this.api, schema)) this.resources.add(m);
        }
      }
    }
    return this.resources.has(model);
  }

  /** one value of a schema, made for an operation's answer */
  value(schema: JsonSchema | undefined, key: string, o: { model?: string; name?: string; direction?: "request" | "response" } = {}): unknown {
    return generateValue(schema, { ...this.gen, direction: o.direction }, { key: `${this.seed}:${key}`, model: o.model, name: o.name ?? o.model ?? "" });
  }
}

export { clone, DEFAULT_COUNT, idFieldOf, listedModels, modelShape };
