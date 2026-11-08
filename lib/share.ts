import { Doc, Frame, Group, Item } from "./tokens";
import { openProject, projectFile } from "./project";
import { partBySlug, withoutPickedImages } from "../parts/registry";

/* A design travels in a link: the document as JSON, deflated and base64url-encoded
 * after `#docz=`, or plain JSON after `#doc=` for tools that cannot compress. The
 * fragment never reaches the server, so the static site stays static. It is not
 * hidden either: whoever has the link (and the page it is opened in) can read it.
 *
 * What a link carries is chosen, not assumed (`ShareScope`): the design alone, with its
 * sample data, or with the whole contract with the back end; `shareItems` lists what
 * that comes to, and any of it can be left out (`omit`). A link read back is held to
 * limits on its length, its compressed and its inflated size, how deep it nests and
 * how many values it holds, so a crafted one stops before it costs memory. */

export const DOC_PARAM = "doc";
export const DOCZ_PARAM = "docz";

/** How much of the document a link carries:
 *  - `look`: the screens, parts, components, styles, variables and the data collections the screens show;
 *  - `samples`: that, and the sample data behind it: the API's data models and the mock library;
 *  - `full`: everything, the whole API contract (endpoints, channels, auth, servers) too. */
export type ShareScope = "look" | "samples" | "full";
export const SHARE_SCOPES: readonly ShareScope[] = ["look", "samples", "full"];
const SCOPE_RANK: Record<ShareScope, number> = { look: 0, samples: 1, full: 2 };

/** One piece of a document a link may carry, as the share dialog lists it. */
export type ShareItem = {
  /** what `omit` names it by */
  key: string;
  kind: "collection" | "api" | "mocks";
  /** the part of the API or the mock library (`models`, `fixtures`…), or the collection's or model's name */
  label: string;
  /** what it holds: rows, models, endpoints, records, files */
  count: number;
  /** the smallest scope that carries it */
  scope: ShareScope;
  /** carried with the scope and options given */
  included: boolean;
  /** carried although left out, because what else is carried needs it (endpoints need their models) */
  locked?: boolean;
};

export type ShareOptions = {
  /** `full` when left out: everything the document holds, as links always carried */
  scope?: ShareScope;
  /** items (`ShareItem.key`) to leave out */
  omit?: Iterable<string>;
};

/* ---------- what a document holds ---------- */

const API_PARTS = ["models", "endpoints", "channels", "auth", "servers"] as const;
const API_PART_SCOPE: Record<(typeof API_PARTS)[number], ShareScope> = { models: "samples", endpoints: "full", channels: "full", auth: "full", servers: "full" };
const MOCK_PARTS = ["files", "auth", "scenarios", "realtime"] as const;

/** The keys under which JSON Schema, OpenAPI and AsyncAPI keep names rather than fields: `examples` there is a name. */
const NAME_MAPS = new Set(["properties", "patternProperties", "$defs", "definitions", "parameters", "headers", "responses", "content", "schemas", "securitySchemes", "variables", "messages", "scopes", "encoding", "links", "callbacks"]);
const isExampleKey = (k: string, parent: string | undefined) => (k === "example" || k === "examples") && !(parent !== undefined && NAME_MAPS.has(parent));

/** how many `example` / `examples` fields a value holds (iteratively: an API can nest deep) */
function countExamples(value: unknown): number {
  let n = 0;
  const stack: [unknown, string | undefined][] = [[value, undefined]];
  while (stack.length) {
    const [v, parent] = stack.pop()!;
    if (Array.isArray(v)) for (const x of v) stack.push([x, undefined]);
    else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) {
        if (isExampleKey(k, parent)) n++;
        else stack.push([x, k]);
      }
  }
  return n;
}

/** the value without its `example` / `examples` fields (the names of properties, parameters… stay) */
function withoutExamples<T>(value: T, parent?: string): T {
  if (Array.isArray(value)) return value.map((v) => withoutExamples(v)) as T;
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (isExampleKey(k, parent)) continue;
    Object.defineProperty(out, k, { value: withoutExamples(v, k), enumerable: true, writable: true, configurable: true });
  }
  return out as T;
}

const len = (v: unknown) => (Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : v === undefined ? 0 : 1);

/** Everything in the document a link could carry beyond its screens, with whether it does under `o`. */
export function shareItems(doc: Doc, o: ShareOptions = {}): ShareItem[] {
  const rank = SCOPE_RANK[o.scope ?? "full"];
  const omit = new Set(o.omit ?? []);
  const items: Omit<ShareItem, "included">[] = [];
  for (const c of doc.collections ?? []) items.push({ key: `collection:${c.id}`, kind: "collection", label: c.name || c.id, count: c.rows?.length ?? 0, scope: "look" });
  const api = doc.api;
  if (api) {
    for (const part of API_PARTS) {
      const value = part === "auth" ? api.auth?.schemes : api[part];
      if (len(value)) items.push({ key: `api:${part}`, kind: "api", label: part, count: len(value), scope: API_PART_SCOPE[part] });
    }
    const examples = countExamples(api);
    if (examples) items.push({ key: "api:examples", kind: "api", label: "examples", count: examples, scope: "samples" });
  }
  const mocks = doc.mocks;
  if (mocks) {
    for (const m of mocks.models ?? []) if (m.fixtures?.length) items.push({ key: `mocks:fixtures:${m.name}`, kind: "mocks", label: m.name, count: m.fixtures.length, scope: "samples" });
    for (const part of MOCK_PARTS) {
      const value = part === "auth" ? mocks.auth?.accept : mocks[part];
      if (len(value)) items.push({ key: `mocks:${part}`, kind: "mocks", label: part, count: len(value), scope: "samples" });
    }
  }
  const carried = (i: Omit<ShareItem, "included">) => SCOPE_RANK[i.scope] <= rank && !omit.has(i.key);
  /* endpoints and channels refer to the models: carrying them carries the models */
  const needsModels = items.some((i) => (i.key === "api:endpoints" || i.key === "api:channels") && carried(i));
  return items.map((i) => {
    const included = carried(i);
    if (i.key === "api:models" && !included && needsModels && SCOPE_RANK[i.scope] <= rank) return { ...i, included: true, locked: true };
    return { ...i, included };
  });
}

/* ---------- what a link carries ---------- */

/** the item without what a link should not carry: an image prop that is a picked file's data
 *  (a web address stays), and the AI rewrite history */
function shareableItem({ noteHistory: _h, ...out }: Item): Item {
  const def = out.props ? partBySlug(out.component) : undefined;
  return def && out.props ? { ...out, props: withoutPickedImages(def, out.props) } : out;
}

/** a group a link can carry: what an instance overrides with a picked file goes the way the file's own prop does */
const shareableGroup = (g: Group): Group => {
  const overrides = g.overrides && Object.fromEntries(Object.entries(g.overrides).filter(([, v]) => !(typeof v === "string" && v.startsWith("data:"))));
  return { ...g, items: g.items.map(shareableItem), ...(overrides ? { overrides } : {}) };
};

/** a screen a link can carry: a picture to trace that is a picked file's data goes, as a part's does */
const shareableFrame = ({ noteHistory: _h, ...f }: Frame): Frame => {
  if (!f.backgroundImage?.startsWith("data:")) return f;
  const { backgroundImage: _picked, backgroundOpacity: _shown, ...rest } = f;
  return rest;
};

/** The document a link carries: never a picked picture or the AI's rewrite history; of the rest, what the scope and
 *  `omit` say. A collection left out keeps its fields and loses its rows, so the lists that repeat it still find it. */
export function shareable(doc: Doc, o: ShareOptions = {}): Doc {
  const out: Doc = {
    ...doc,
    frames: doc.frames.map(shareableFrame),
    groups: doc.groups.map(shareableGroup),
    ...(doc.components ? { components: doc.components.map((c) => ({ ...c, groups: c.groups.map(shareableGroup) })) } : {}),
  };
  const items = shareItems(doc, o);
  const carried = new Map(items.map((i) => [i.key, i.included]));
  const has = (key: string) => carried.get(key) !== false;
  if (doc.collections) out.collections = doc.collections.map((c) => (has(`collection:${c.id}`) ? c : { ...c, rows: [] }));
  const rank = SCOPE_RANK[o.scope ?? "full"];
  if (doc.api) {
    if (rank < SCOPE_RANK.samples) delete out.api;
    else {
      let api = { ...doc.api };
      if (rank < SCOPE_RANK.full) api = { ...(api.info ? { info: api.info } : {}), ...(api.models ? { models: api.models } : {}) };
      for (const part of API_PARTS) if (!has(`api:${part}`)) delete api[part];
      if (!has("api:examples")) api = withoutExamples(api);
      /* an API that had something and has nothing left goes; one the author left empty stays as it was */
      if (Object.keys(api).length || !Object.keys(doc.api).length) out.api = api;
      else delete out.api;
    }
  }
  if (doc.mocks) {
    if (rank < SCOPE_RANK.samples) delete out.mocks;
    else {
      const mocks = { ...doc.mocks };
      if (mocks.models) mocks.models = mocks.models.map((m) => (has(`mocks:fixtures:${m.name}`) ? m : (({ fixtures: _f, ...rest }) => rest)(m)));
      for (const part of MOCK_PARTS) {
        if (has(`mocks:${part}`)) continue;
        if (part === "auth") {
          if (mocks.auth) {
            const { accept: _a, ...auth } = mocks.auth;
            mocks.auth = auth;
          }
        } else delete mocks[part];
      }
      out.mocks = mocks;
    }
  }
  return out;
}

/* ---------- limits ---------- */

/** What a link may come to. A design without picked pictures is small; these are far above any real one and far
 *  below what would make a tab struggle. */
export const SHARE_LIMITS = {
  /** the hash as a whole, in characters (about what browsers keep of an address) */
  linkChars: 2_000_000,
  /** the compressed document, in bytes */
  packedBytes: 1_500_000,
  /** the document's JSON once inflated, in bytes */
  jsonBytes: 8 * 1024 * 1024,
  /** objects and lists inside one another */
  depth: 128,
  /** values (objects, lists, numbers, strings…) */
  nodes: 400_000,
};
export type ShareLimits = typeof SHARE_LIMITS;

/** why a link was not made or not read: too long an address, more than the limits once inflated, nested too deep,
 *  too many values, or not a design at all */
export type ShareProblem = "too-long" | "too-large" | "too-deep" | "too-many" | "broken";

export class ShareLinkError extends Error {
  constructor(readonly problem: ShareProblem) {
    super(`share link: ${problem}`);
  }
}

/** Checks a JSON text's nesting and size in one pass before it is parsed, so a hostile one costs no object graph. */
function checkShape(json: string, limits: ShareLimits) {
  let depth = 0;
  let nodes = 1;
  let inString = false;
  for (let i = 0; i < json.length; i++) {
    const c = json.charCodeAt(i);
    if (inString) {
      if (c === 92) i++; // backslash: the next character is escaped
      else if (c === 34) inString = false;
      continue;
    }
    if (c === 34) inString = true;
    else if (c === 123 || c === 91) {
      if (++depth > limits.depth) throw new ShareLinkError("too-deep");
      if (++nodes > limits.nodes) throw new ShareLinkError("too-many");
    } else if (c === 125 || c === 93) depth--;
    else if (c === 44 && ++nodes > limits.nodes) throw new ShareLinkError("too-many");
  }
}

/* ---------- the wire ---------- */

const toBase64Url = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (s: string) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** Runs bytes through a (de)compression stream, reading what comes out chunk by chunk: past `max` bytes the stream
 *  is cancelled, before what it would come to is ever held. */
async function pipe(bytes: Uint8Array, stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream }, max = Infinity): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  /* the writer's own promises reject too on bad input (or once the read is cancelled); the read reports the failure */
  writer.write(bytes).catch(() => {});
  writer.close().catch(() => {});
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new ShareLinkError("too-large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** The link that opens `doc` at `base` (the app URL without a hash), carrying what `o` says (everything when left
 *  out). Throws a `ShareLinkError` ("too-long") when it would be longer than a link can be. The design goes in its
 *  envelope, which says the format version it is written in (lib/migrations.ts): a later version reading the link
 *  migrates it from there, and an earlier one knows it is newer than itself and opens it read-only. */
export async function shareLink(doc: Doc, base: string, o: ShareOptions = {}, limits: ShareLimits = SHARE_LIMITS): Promise<string> {
  const json = JSON.stringify(projectFile(shareable(doc, o)));
  let link: string | null = null;
  if (typeof CompressionStream !== "undefined") {
    try {
      const packed = await pipe(new TextEncoder().encode(json), new CompressionStream("deflate-raw"));
      link = `${base}#${DOCZ_PARAM}=${toBase64Url(packed)}`;
    } catch {
      // An available CompressionStream may not support raw deflate. The plain
      // encoding below carries the same filtered document without compression.
    }
  }
  link ??= `${base}#${DOC_PARAM}=${encodeURIComponent(json)}`;
  if (link.length - base.length > limits.linkChars) throw new ShareLinkError("too-long");
  return link;
}

/** what a hash carried: the design, or why there is none (no `problem` when it carried none at all) */
export type ShareRead = { doc: Doc; problem?: undefined } | { doc: null; problem?: ShareProblem };

/** The document a hash carries, read within `limits`; a broken or oversized one says why, and costs no more than
 *  the limits allow. */
export async function readShareLink(hash: string, limits: ShareLimits = SHARE_LIMITS): Promise<ShareRead> {
  if (hash.length > limits.linkChars) return { doc: null, problem: "too-long" };
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  try {
    let json: string | null = null;
    const packed = params.get(DOCZ_PARAM);
    if (packed) {
      const bytes = fromBase64Url(packed);
      if (bytes.length > limits.packedBytes) return { doc: null, problem: "too-large" };
      json = new TextDecoder().decode(await pipe(bytes, new DecompressionStream("deflate-raw"), limits.jsonBytes));
    } else {
      json = params.get(DOC_PARAM);
      if (json !== null && json.length > limits.jsonBytes) return { doc: null, problem: "too-large" };
    }
    if (!json) return { doc: null, ...(params.has(DOCZ_PARAM) || params.has(DOC_PARAM) ? { problem: "broken" as const } : {}) };
    checkShape(json, limits);
    const doc = openProject(JSON.parse(json));
    return doc ? { doc } : { doc: null, problem: "broken" };
  } catch (e) {
    return { doc: null, problem: e instanceof ShareLinkError ? e.problem : "broken" };
  }
}

/** the document a hash carries, or null when it carries none or a broken one */
export async function readShareHash(hash: string, limits: ShareLimits = SHARE_LIMITS): Promise<Doc | null> {
  return (await readShareLink(hash, limits)).doc;
}

/** whether a hash claims to carry a document at all */
export const hasShareHash = (hash: string) => {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return params.has(DOCZ_PARAM) || params.has(DOC_PARAM);
};
