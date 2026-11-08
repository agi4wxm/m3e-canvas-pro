import { deflateRawSync, inflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DOC_PARAM, DOCZ_PARAM, hasShareHash, readShareHash, readShareLink, SHARE_LIMITS, shareable, shareItems, shareLink, ShareLinkError } from "./share";
import type { Doc, Item } from "./tokens";

const doc = (): Doc => ({
  title: "設計 中文 한국어 🎨 + & # %", brief: "First line\nSecond line", paletteKey: "purple", frame: "phone",
  frames: [{ id: "f", name: "Home", x: 0, y: 0, w: 1280, h: 800, note: "Keep frame note", noteHistory: ["Private frame draft"] }],
  groups: [{ id: "g", x: -10, y: 20, axis: "x", items: [
    { id: "i", kind: "component", component: "image", label: "画像", icon: null, variant: "filled", props: { src: "data:image/png;base64,AAAA" }, note: "Keep item note", noteHistory: ["Private item draft"] },
    { id: "remote", kind: "component", component: "image", label: "Public image", icon: null, variant: "filled", props: { src: "https://example.test/image.png" } },
  ] }],
});
const plainHash = (value: unknown) => `#doc=${encodeURIComponent(JSON.stringify(value))}`;
const packedHash = (text: string) => `#docz=${deflateRawSync(Buffer.from(text)).toString("base64url")}`;

afterEach(() => vi.unstubAllGlobals());

describe("shareable", () => {
  it("removes every frame/item history and local image while keeping authored content", () => {
    const value = doc();
    value.frames.push({ ...value.frames[0], id: "f2" });
    value.groups.push({ ...structuredClone(value.groups[0]), id: "g2" });
    const result = shareable(value);
    expect(result).toEqual({
      ...value,
      frames: value.frames.map(({ noteHistory: _history, ...frame }) => frame),
      groups: value.groups.map((group) => ({ ...group, items: [
        { id: "i", kind: "component", component: "image", label: "画像", icon: null, variant: "filled", props: {}, note: "Keep item note" },
        { id: "remote", kind: "component", component: "image", label: "Public image", icon: null, variant: "filled", props: { src: "https://example.test/image.png" } },
      ] })),
    });
  });

  it.each(["http://example.test/a.png", "https://example.test/a.png?x=1&y=2"])("preserves public source %s", (src) => {
    const value = doc();
    value.groups[0].items[0].props = { src };
    expect(shareable(value).groups[0].items[0].props?.src).toBe(src);
  });

  it.each([undefined, "data:image/png;base64,AAAA"])("omits non-public source %s", (src) => {
    const value = doc();
    value.groups[0].items[0].props = src === undefined ? {} : { src };
    expect(shareable(value).groups[0].items[0].props).not.toHaveProperty("src");
  });

  it("does not mutate or reuse the edited document's frame/group/item objects", () => {
    const value = doc();
    const before = structuredClone(value);
    const result = shareable(value);
    expect(value).toEqual(before);
    expect(result).not.toBe(value);
    expect(result.frames).not.toBe(value.frames);
    expect(result.groups).not.toBe(value.groups);
    expect(result.frames[0]).not.toBe(value.frames[0]);
    expect(result.groups[0]).not.toBe(value.groups[0]);
    expect(result.groups[0].items).not.toBe(value.groups[0].items);
    result.groups[0].items.forEach((item: Item, index) => expect(item).not.toBe(value.groups[0].items[index]));
    expect(shareable(result)).toEqual(result);
  });

  it("supports an empty canvas", () => {
    const value = { ...doc(), groups: [], frames: [] };
    expect(shareable(value)).toEqual(value);
  });

  it("keeps a group's lock flag", () => {
    const value = { ...doc(), groups: [{ ...doc().groups[0], locked: true }] };
    expect(shareable(value).groups[0].locked).toBe(true);
  });

  it("drops a component's picked image but keeps one on the web", () => {
    const value = doc();
    value.groups[0].items = [
      { id: "picked", kind: "component", component: "avatar", label: "", icon: null, variant: "filled", props: { image: "data:image/webp;base64,AAAA", initials: "TK" } },
      { id: "linked", kind: "component", component: "avatar", label: "", icon: null, variant: "filled", props: { image: "https://example.test/me.png" } },
    ];
    const result = shareable(value);
    expect(result.groups[0].items[0].props).toEqual({ initials: "TK" });
    expect(result.groups[0].items[1].props).toEqual({ image: "https://example.test/me.png" });
    expect(value.groups[0].items[0].props).toEqual({ image: "data:image/webp;base64,AAAA", initials: "TK" });
  });

  it("leaves a component without image props untouched", () => {
    const value = doc();
    value.groups[0].items = [{ id: "b", kind: "component", component: "button", label: "", icon: null, variant: "filled", props: { label: "Go" } }];
    expect(shareable(value).groups[0].items[0].props).toEqual({ label: "Go" });
  });
});

describe("shareLink and readShareHash", () => {
  it("preserves navigation rail states through compressed and plain share links", async () => {
    const value = doc();
    const rail = (id: string, props?: Record<string, unknown>): Item => ({ id, kind: "component", component: "navigation-rail", label: "", icon: null, variant: "filled", ...(props ? { props } : {}) });
    value.groups[0].items = [
      rail("unset"),
      rail("collapsed", { expanded: false, modal: false }),
      rail("expanded", { expanded: true, modal: true }),
      rail("modal-only", { modal: true }),
    ];
    const link = await shareLink(value, "https://example.test/canvas/");
    const result = await readShareHash(new URL(link).hash);
    expect(result?.groups[0].items).toEqual(value.groups[0].items);
    expect(result?.groups[0].items[0]).not.toHaveProperty("props");
    const plain = await readShareHash(plainHash(value));
    expect(plain?.groups[0].items).toEqual(value.groups[0].items);
  });

  it("keeps the public wire parameter names stable", () => {
    expect(DOC_PARAM).toBe("doc");
    expect(DOCZ_PARAM).toBe("docz");
  });

  it("round-trips Unicode with native raw-deflate streams and unpadded base64url", async () => {
    const value = doc();
    const before = structuredClone(value);
    const base = "https://example.test/canvas/?mode=edit";
    // No mock or conditional skip: supported Node must exercise real Web Streams.
    const link = await shareLink(value, base);
    expect(link).toMatch(/^https:\/\/example\.test\/canvas\/\?mode=edit#docz=[A-Za-z0-9_-]+$/);
    const hash = new URL(link).hash;
    const bytes = Buffer.from(hash.slice("#docz=".length), "base64url");
    expect(JSON.parse(inflateRawSync(bytes).toString("utf8"))).toEqual(shareable(value));
    await expect(readShareHash(hash)).resolves.toEqual(shareable(value));
    expect(value).toEqual(before);
  });

  it("round-trips percent-encoded JSON when CompressionStream is unavailable", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    vi.stubGlobal("DecompressionStream", undefined);
    const value = doc();
    const base = "https://example.test/subdir/?keep=1";
    const link = await shareLink(value, base);
    expect(link).toBe(`${base}#doc=${encodeURIComponent(JSON.stringify(shareable(value)))}`);
    await expect(readShareHash(new URL(link).hash)).resolves.toEqual(shareable(value));
  });

  it("uses a plain link when CompressionStream exists but rejects raw deflate", async () => {
    vi.stubGlobal("CompressionStream", class {
      constructor(format: string) {
        expect(format).toBe("deflate-raw");
        throw new TypeError("Unsupported compression format");
      }
    });
    const value = doc();
    const before = structuredClone(value);
    const base = "https://example.test/subdir/?keep=1";
    const link = await shareLink(value, base);
    expect(link).toBe(`${base}#doc=${encodeURIComponent(JSON.stringify(shareable(value)))}`);
    await expect(readShareHash(new URL(link).hash)).resolves.toEqual(shareable(value));
    expect(value).toEqual(before);
  });

  it("uses a plain link if the compressor stream fails", async () => {
    vi.stubGlobal("CompressionStream", class {
      constructor() {
        return new TransformStream({ start(controller) { controller.error(new Error("Compression failed")); } });
      }
    });
    const value = doc();
    const link = await shareLink(value, "https://example.test/canvas/");
    expect(new URL(link).hash).toMatch(/^#doc=/);
    await expect(readShareHash(new URL(link).hash)).resolves.toEqual(shareable(value));
  });

  it("reads independently generated raw-deflate payloads", async () => {
    await expect(readShareHash(packedHash(JSON.stringify(doc())))).resolves.toEqual(doc());
  });

  it("reads plain JSON with or without a leading hash and alongside unrelated parameters", async () => {
    const hash = plainHash(doc());
    await expect(readShareHash(hash.slice(1))).resolves.toEqual(doc());
    await expect(readShareHash(`#other=1&${hash.slice(1)}&last=2`)).resolves.toEqual(doc());
  });

  it("accepts a minimal document without adding defaults", async () => {
    const minimal = { groups: [], frames: [] };
    await expect(readShareHash(plainHash(minimal))).resolves.toEqual(minimal);
  });

  it("prefers a nonempty compressed document to a plain document", async () => {
    const packed = { ...doc(), title: "Compressed wins" };
    await expect(readShareHash(`${plainHash(doc())}&${packedHash(JSON.stringify(packed)).slice(1)}`)).resolves.toEqual(packed);
  });

  it("uses plain JSON when the compressed parameter is empty", async () => {
    await expect(readShareHash(`${plainHash(doc())}&docz=`)).resolves.toEqual(doc());
  });

  it("does not silently fall back to plain JSON after compressed corruption", async () => {
    await expect(readShareHash(`${plainHash(doc())}&docz=!!!`)).resolves.toBeNull();
  });

  it.each(["", "#", "#unrelated=1", "#doc=", "#docz=", "#doc=%7B", "#doc=%FF", "#docz=!!!", "#docz=A", "#docz=AAAA"])("returns null for missing or broken payload %s", async (hash) => {
    await expect(readShareHash(hash)).resolves.toBeNull();
  });

  it.each([null, [], {}, { groups: [], frames: null },
    { ...doc(), groups: [{ ...doc().groups[0], items: [] }] },
  ].map((value) => [value]))("rejects non-project JSON in either encoding: %# %o", async (value) => {
    await expect(readShareHash(plainHash(value))).resolves.toBeNull();
    await expect(readShareHash(packedHash(JSON.stringify(value)))).resolves.toBeNull();
  });

  it("returns null for valid deflate containing invalid JSON", async () => {
    await expect(readShareHash(packedHash("not JSON"))).resolves.toBeNull();
  });

  it("returns null for a truncated compressed stream", async () => {
    const bytes = deflateRawSync(Buffer.from(JSON.stringify(doc())));
    await expect(readShareHash(`#docz=${bytes.subarray(0, bytes.length - 8).toString("base64url")}`)).resolves.toBeNull();
  });

  it("returns null for compressed input when decompression is unavailable", async () => {
    vi.stubGlobal("DecompressionStream", undefined);
    await expect(readShareHash(packedHash(JSON.stringify(doc())))).resolves.toBeNull();
  });
});

describe("what a link carries", () => {
  /** a product: a list repeating a collection, an API whose examples and a mock library whose records hold
   *  something that must not leave the author's machine */
  const product = (): Doc =>
    ({
      ...doc(),
      groups: [{ id: "list", x: 0, y: 0, axis: "y", repeat: { collection: "people" }, items: [{ id: "row", kind: "component", component: "text", label: "", icon: null, variant: "filled", props: { text: "{{name}}" } }] }],
      collections: [{ id: "people", name: "People", fields: ["name", "email"], rows: [["Ann", "ann@private.test"]] }],
      api: {
        info: { title: "Shop" },
        servers: [{ name: "prod", url: "https://internal.private.test/v1" }],
        models: [{ name: "User", schema: { type: "object", properties: { email: { type: "string", example: "SENSITIVE-EXAMPLE@private.test" }, examples: { type: "array" } } } }],
        endpoints: [{ operationId: "me", method: "get", path: "/me", responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/User" }, examples: { real: { value: { token: "SENSITIVE-TOKEN" } } } } } } } }],
        auth: { schemes: { bearer: { type: "http", scheme: "bearer" } } },
      },
      mocks: {
        seed: 3,
        models: [{ name: "User", count: 5, fixtures: [{ email: "SENSITIVE-FIXTURE@private.test" }] }],
        files: [{ id: "f", name: "contract.pdf", type: "application/pdf", data: "data:application/pdf;base64,AAAA" }],
        auth: { accept: [{ email: "me@private.test", password: "SENSITIVE-PASSWORD" }] },
      },
    }) as unknown as Doc;
  const keys = (d: Doc, o?: Parameters<typeof shareItems>[1]) => shareItems(d, o).filter((i) => i.included).map((i) => i.key);

  it("lists what beyond the screens a link could carry, with how much of each and which scope carries it", () => {
    expect(shareItems(product()).map(({ key, count, scope }) => [key, count, scope])).toEqual([
      ["collection:people", 1, "look"],
      ["api:models", 1, "samples"],
      ["api:endpoints", 1, "full"],
      ["api:auth", 1, "full"],
      ["api:servers", 1, "full"],
      ["api:examples", 2, "samples"],
      ["mocks:fixtures:User", 1, "samples"],
      ["mocks:files", 1, "samples"],
      ["mocks:auth", 1, "samples"],
    ]);
  });

  it("carries the design alone, with its sample data, or with the whole contract, as chosen", () => {
    const look = shareable(product(), { scope: "look" });
    expect(look.api).toBeUndefined();
    expect(look.mocks).toBeUndefined();
    expect(look.collections).toEqual(product().collections);
    expect(keys(product(), { scope: "look" })).toEqual(["collection:people"]);

    const samples = shareable(product(), { scope: "samples" });
    expect(Object.keys(samples.api!)).toEqual(["info", "models"]);
    expect(samples.mocks).toEqual(product().mocks);
    expect(keys(product(), { scope: "samples" })).toEqual(["collection:people", "api:models", "api:examples", "mocks:fixtures:User", "mocks:files", "mocks:auth"]);

    expect(shareable(product(), { scope: "full" })).toEqual(shareable(product()));
    expect(shareable(product()).api).toEqual(product().api);
  });

  it("leaves out the examples, records and sign-in values asked, and nothing else", () => {
    const omit = ["api:examples", "mocks:fixtures:User", "mocks:auth", "api:servers"];
    const out = shareable(product(), { scope: "full", omit });
    const text = JSON.stringify(out);
    expect(text).not.toContain("SENSITIVE");
    expect(text).not.toContain("internal.private.test");
    /* a property that is called "examples" is a name, not an example */
    expect(out.api!.models![0].schema).toEqual({ type: "object", properties: { email: { type: "string" }, examples: { type: "array" } } });
    expect(out.api!.endpoints![0].responses["200"]).toEqual({ description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } });
    expect(out.mocks).toEqual({ seed: 3, models: [{ name: "User", count: 5 }], files: product().mocks!.files, auth: {} });
    expect(out.api!.auth).toEqual(product().api!.auth);
    expect(keys(product(), { scope: "full", omit })).toEqual(["collection:people", "api:models", "api:endpoints", "api:auth", "mocks:files"]);
  });

  it("keeps what the rest needs: a collection's fields for the list that repeats it, the models the endpoints refer to", () => {
    const out = shareable(product(), { omit: ["collection:people", "api:models"] });
    expect(out.collections).toEqual([{ id: "people", name: "People", fields: ["name", "email"], rows: [] }]);
    expect(out.groups[0].repeat).toEqual({ collection: "people" });
    expect(out.api!.models).toEqual(product().api!.models);
    expect(shareItems(product(), { omit: ["api:models"] }).find((i) => i.key === "api:models")).toMatchObject({ included: true, locked: true });
    /* without the endpoints, the models can go */
    expect(shareable(product(), { omit: ["api:models", "api:endpoints"] }).api!.models).toBeUndefined();
  });

  it("goes through a link and back as chosen", async () => {
    const link = await shareLink(product(), "https://example.test/", { scope: "samples", omit: ["mocks:fixtures:User"] });
    const back = await readShareHash(new URL(link).hash);
    expect(back?.api?.endpoints).toBeUndefined();
    expect(JSON.stringify(back)).not.toContain("SENSITIVE-FIXTURE");
    expect(back?.collections).toEqual(product().collections);
  });
});

describe("limits on a link", () => {
  const small = { ...SHARE_LIMITS, linkChars: 50_000, packedBytes: 20_000, jsonBytes: 200_000, depth: 32, nodes: 5_000 };

  it("stops inflating a link that would come to more than allowed, long before it would all be held", async () => {
    /* 16 MB of the same byte, some 16 kB compressed */
    const bomb = deflateRawSync(Buffer.alloc(16 * 1024 * 1024, 0x20));
    expect(bomb.length).toBeLessThan(small.packedBytes);
    let produced = 0;
    const Real = DecompressionStream;
    vi.stubGlobal(
      "DecompressionStream",
      class {
        readable: ReadableStream<Uint8Array>;
        writable: WritableStream;
        constructor(format: CompressionFormat) {
          const inner = new Real(format);
          this.writable = inner.writable;
          this.readable = inner.readable.pipeThrough(
            new TransformStream<Uint8Array, Uint8Array>({
              transform(chunk, c) {
                produced += chunk.byteLength;
                c.enqueue(chunk);
              },
            }),
          );
        }
      },
    );
    await expect(readShareLink(`#docz=${bomb.toString("base64url")}`, small)).resolves.toEqual({ doc: null, problem: "too-large" });
    expect(produced).toBeLessThan(4 * 1024 * 1024);
  });

  it("refuses a link nested too deep, holding too many values, too long, or too large before reading it", async () => {
    const deep = `{"groups":[],"frames":[],"x":${"[".repeat(500)}${"]".repeat(500)}}`;
    await expect(readShareLink(plainHash(JSON.parse(deep)), small)).resolves.toEqual({ doc: null, problem: "too-deep" });
    await expect(readShareLink(packedHash(deep), small)).resolves.toEqual({ doc: null, problem: "too-deep" });
    const many = { groups: [], frames: [], x: Array.from({ length: 20_000 }, () => 0) };
    await expect(readShareLink(packedHash(JSON.stringify(many)), small)).resolves.toEqual({ doc: null, problem: "too-many" });
    await expect(readShareLink(`#doc=${"x".repeat(60_000)}`, small)).resolves.toEqual({ doc: null, problem: "too-long" });
    const packed = Buffer.from(Array.from({ length: 30_000 }, (_, i) => (i * 7919) & 0xff)).toString("base64url");
    await expect(readShareLink(`#docz=${packed}`, small)).resolves.toEqual({ doc: null, problem: "too-large" });
    /* brackets inside strings are words, not nesting */
    await expect(readShareLink(plainHash({ ...doc(), brief: "[".repeat(500) }), small)).resolves.toMatchObject({ doc: { brief: "[".repeat(500) } });
  });

  it("says a broken link is broken, and one without a design carries none", async () => {
    await expect(readShareLink("#docz=!!!")).resolves.toEqual({ doc: null, problem: "broken" });
    await expect(readShareLink("#doc=%7B")).resolves.toEqual({ doc: null, problem: "broken" });
    await expect(readShareLink("#other=1")).resolves.toEqual({ doc: null });
  });

  it("will not make a link longer than a link can be", async () => {
    const big = { ...doc(), brief: Array.from({ length: 40_000 }, (_, i) => String.fromCharCode(0x4e00 + ((i * 7919) % 20000))).join("") };
    await expect(shareLink(big, "https://example.test/", {}, small)).rejects.toBeInstanceOf(ShareLinkError);
    await expect(shareLink(doc(), "https://example.test/", {}, small)).resolves.toMatch(/#docz=/);
  });
});

describe("hasShareHash", () => {
  it.each(["#doc=", "#docz=", "doc=x", "docz=x", "#other=1&doc=bad", "#docz=!!!"])("recognizes parameter presence without validating %s", (hash) => {
    expect(hasShareHash(hash)).toBe(true);
  });

  it.each(["", "#", "#other=doc", "#document=x", "#DOC=x", "#other=docz%3Dx", "#mydoc=x"])("does not mistake unrelated hash %s for a project", (hash) => {
    expect(hasShareHash(hash)).toBe(false);
  });
});
