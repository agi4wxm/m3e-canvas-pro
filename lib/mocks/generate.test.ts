/* The generator: the same seed gives the same data, in every language data that reads like real data (names, emails at
 * example domains, phone numbers in the country's form), every value valid against its own schema whatever the
 * schema says (formats, enums, bounds, lengths, patterns, arrays, allOf / oneOf, nullable), cycles and hostile schemas
 * bounded, and the placeholder files real files. */

import { describe, expect, it } from "vitest";
import { shopApi } from "../export/product.fixture";
import type { ApiSpec, JsonSchema } from "../api/types";
import { parseDataUrl } from "./bytes";
import { checkValue } from "./check";
import { MockData } from "./data";
import { pdfDocument, placeholderFile, wavTone } from "./files";
import { generateValue, type GenOptions } from "./generate";
import { inferHint } from "./hints";
import { fromPattern } from "./pattern";
import { rngOf } from "./rng";
import { MOCK_LOCALES, type MockLocale } from "./types";

const NOW = Date.UTC(2026, 9, 1, 12);
const api = shopApi();
const records = (model: string, o: { seed?: number; locale?: MockLocale } = {}, src: ApiSpec = api) => new MockData({ api: src }, { seed: o.seed ?? 1, locale: o.locale ?? "en", now: NOW }).records(model);
const opts = (extra: Partial<GenOptions> = {}): GenOptions => ({ api: { models: [] }, locale: "en", now: NOW, ...extra });

describe("the same seed, the same data", () => {
  it("makes identical records for a seed, other records for another", () => {
    for (const model of ["User", "Product", "Order"]) {
      expect(JSON.stringify(records(model))).toBe(JSON.stringify(records(model)));
      expect(JSON.stringify(records(model, { seed: 2 }))).not.toBe(JSON.stringify(records(model)));
    }
  });

  it("keeps the other fields of a record when a field is added to its model", () => {
    const more: ApiSpec = { ...api, models: api.models!.map((m) => (m.name === "User" ? { ...m, schema: { ...(m.schema as object), properties: { ...(m.schema as { properties: object }).properties, nickname: { type: "string" } } } } : m)) };
    const before = records("User");
    const after = records("User", {}, more);
    expect(after.map((u) => u.email)).toEqual(before.map((u) => u.email));
    expect(after.map((u) => u.id)).toEqual(before.map((u) => u.id));
  });

  it("gives every record of a model its own id", () => {
    const ids = records("Product").map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(24);
  });
});

describe("data that reads like real data, in four languages", () => {
  const NAME: Record<MockLocale, RegExp> = { zh: /^[一-鿿]{2,4}$/, en: /^[A-Z][a-z]+ [A-Z][a-z]+$/, ja: /^[一-鿿々]{1,3} [぀-ヿ一-鿿々]{1,3}$/, ko: /^[가-힣]{2,4}$/ };
  const PHONE: Record<MockLocale, RegExp> = { zh: /^1[35789]\d \d{4} \d{4}$/, en: /^\(\d{3}\) 555-01\d{2}$/, ja: /^0[789]0-\d{4}-\d{4}$/, ko: /^010-\d{4}-\d{4}$/ };
  it.each(MOCK_LOCALES)("%s: names, emails at example domains, phones, addresses, prices in the currency", (locale) => {
    const users = records("User", { locale });
    for (const u of users) {
      if (u.name !== undefined) expect(u.name, String(u.name)).toMatch(NAME[locale]);
      expect(u.email).toMatch(/^[a-z]+\.[a-z]+\d*@example\.(com|net|org)$/);
    }
    /* the name and the email are the same person's */
    const contact = { models: [{ name: "Contact", schema: { type: "object", properties: { fullName: { type: "string" }, phone: { type: "string" }, address: { type: "string" }, company: { type: "string" }, bio: { type: "string" }, createdAt: { type: "string", format: "date-time" } }, required: ["fullName", "phone", "address", "company", "bio", "createdAt"] } }] } as ApiSpec;
    for (const c of records("Contact", { locale }, contact).slice(0, 10)) {
      expect(c.fullName).toMatch(NAME[locale]);
      expect(c.phone).toMatch(PHONE[locale]);
      expect(String(c.address).length).toBeGreaterThan(6);
      expect(typeof c.company).toBe("string");
      const t = Date.parse(String(c.createdAt));
      expect(t).toBeLessThanOrEqual(NOW);
      expect(t).toBeGreaterThan(NOW - 200 * 86_400_000);
    }
    const currency = { zh: "CNY", en: "USD", ja: "JPY", ko: "KRW" }[locale];
    const prices = records("Product", { locale }).map((p) => p.price as { amount: number; currency: string });
    expect(prices.filter((p) => p.currency === currency).length).toBeGreaterThan(prices.length / 2);
    for (const p of prices.filter((x) => x.currency === "JPY" || x.currency === "KRW")) expect(Number.isInteger(p.amount)).toBe(true);
    for (const p of prices) expect(p.amount).toBeGreaterThan(0);
  });

  it("speaks the language in words too", () => {
    const zh = records("Product", { locale: "zh" })[0];
    const ko = records("Product", { locale: "ko" })[0];
    expect(String(zh.name)).toMatch(/[一-鿿]/);
    expect(String(ko.name)).toMatch(/[가-힣]/);
  });

  it("hands nested records out of the records there are: an order's product is one of the products", () => {
    const products = new Set(records("Product").map((p) => p.id));
    const items = records("Order").flatMap((o) => o.items as { product: { id: string } }[]);
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) expect(products.has(it.product.id)).toBe(true);
  });
});

describe("every value valid against its own schema", () => {
  const SCHEMAS: [string, JsonSchema][] = [
    ["email", { type: "string", format: "email" }],
    ["uuid", { type: "string", format: "uuid" }],
    ["date-time", { type: "string", format: "date-time" }],
    ["date", { type: "string", format: "date" }],
    ["time", { type: "string", format: "time" }],
    ["uri", { type: "string", format: "uri" }],
    ["url", { type: "string", format: "url" }],
    ["ipv4", { type: "string", format: "ipv4" }],
    ["binary", { type: "string", format: "binary" }],
    ["password", { type: "string", format: "password", minLength: 8 }],
    ["enum", { type: "string", enum: ["a", "b", "c"] }],
    ["const", { const: 42 }],
    ["integer bounds", { type: "integer", minimum: 3, maximum: 7 }],
    ["exclusive bounds", { type: "number", exclusiveMinimum: 0, exclusiveMaximum: 1 }],
    ["multipleOf", { type: "integer", multipleOf: 5, minimum: 10, maximum: 100 }],
    ["lengths", { type: "string", minLength: 30, maxLength: 40 }],
    ["short", { type: "string", maxLength: 3 }],
    ["pattern", { type: "string", pattern: "^[A-Z]{3}-\\d{4}$" }],
    ["pattern alternatives", { type: "string", pattern: "^(red|green|blue)-[a-f0-9]{2,4}$" }],
    ["array bounds", { type: "array", items: { type: "integer" }, minItems: 4, maxItems: 6 }],
    ["unique items", { type: "array", items: { type: "string", enum: ["x", "y", "z"] }, uniqueItems: true, minItems: 2 }],
    ["tuple", { type: "array", prefixItems: [{ type: "string" }, { type: "integer" }], minItems: 2, maxItems: 2 }],
    ["nullable", { type: ["string", "null"], format: "email" }],
    ["object", { type: "object", properties: { a: { type: "string" }, b: { type: "object", properties: { c: { type: "integer", minimum: 1 } }, required: ["c"] } }, required: ["a", "b"], additionalProperties: false }],
    ["map", { type: "object", additionalProperties: { type: "number", minimum: 0 } }],
    ["allOf", { allOf: [{ type: "object", properties: { a: { type: "string" } }, required: ["a"] }, { type: "object", properties: { b: { type: "boolean" } }, required: ["b"] }] }],
    ["oneOf", { oneOf: [{ type: "object", properties: { kind: { const: "cat" }, meow: { type: "boolean" } }, required: ["kind", "meow"] }, { type: "object", properties: { kind: { const: "dog" }, bark: { type: "integer" } }, required: ["kind", "bark"] }] }],
    ["anyOf", { anyOf: [{ type: "string", format: "uuid" }, { type: "integer" }] }],
  ];
  it.each(SCHEMAS)("%s", (_name, schema) => {
    for (let i = 0; i < 40; i++) {
      const v = generateValue(schema, opts(), { key: `k${i}`, name: "value" });
      expect(checkValue({}, schema, v, { locale: "en", direction: "response" }), JSON.stringify(v)).toEqual([]);
    }
  });

  it("makes the records of a real contract valid against their models", () => {
    for (const model of api.models!.map((m) => m.name).filter((m) => m !== "Category")) {
      const schema = { $ref: `#/components/schemas/${model}` };
      for (const r of records(model).slice(0, 8)) expect(checkValue(api, schema, r, { locale: "en", direction: "response" }), `${model} ${JSON.stringify(r).slice(0, 200)}`).toEqual([]);
    }
  });

  it("fills a pattern it can read and gives up on one it cannot", () => {
    const rng = rngOf("p");
    expect(fromPattern("^[a-z]{2}\\d{3}$", rng)).toMatch(/^[a-z]{2}\d{3}$/);
    expect(fromPattern("^(?<=a)b$", rng)).toBeUndefined();
    expect(fromPattern("(a)\\1", rng)).toBeUndefined();
  });
});

describe("cycles and hostile schemas, bounded", () => {
  it("stops a model that holds itself, and two that hold each other", () => {
    const tree: ApiSpec = {
      models: [
        { name: "Node", schema: { type: "object", properties: { name: { type: "string" }, children: { type: "array", items: { $ref: "#/components/schemas/Node" } }, parent: { $ref: "#/components/schemas/Node" } }, required: ["name", "children", "parent"] } },
        { name: "A", schema: { type: "object", properties: { b: { $ref: "#/components/schemas/B" } }, required: ["b"] } },
        { name: "B", schema: { type: "object", properties: { a: { $ref: "#/components/schemas/A" } }, required: ["a"] } },
      ],
    };
    const depth = (v: unknown, d = 0): number => (v && typeof v === "object" ? Math.max(d, ...Object.values(v).map((x) => depth(x, d + 1))) : d);
    for (const m of ["Node", "A", "B"]) {
      const v = generateValue({ $ref: `#/components/schemas/${m}` }, opts({ api: tree }), { key: m });
      expect(depth(v)).toBeLessThan(14);
    }
  });

  it("answers in a moment whatever the schema asks", () => {
    const chain: ApiSpec = { models: Array.from({ length: 1000 }, (_, i) => ({ name: `M${i}`, schema: { type: "object", properties: { next: { $ref: `#/components/schemas/M${i + 1}` }, n: { type: "integer" } }, required: ["next", "n"] } })) };
    const hostile: JsonSchema[] = [
      { type: "array", minItems: 1_000_000_000, items: { type: "string", minLength: 1_000_000 } },
      { type: "string", minLength: 100_000_000 },
      { type: "object", properties: Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`f${i}`, { type: "array", minItems: 50, items: { type: "object", properties: { x: { type: "array", minItems: 50, items: { type: "string" } } } } }])) },
      { type: "string", pattern: "^(a+)+$" },
      { type: "string", enum: Array.from({ length: 100_000 }, (_, i) => `v${i}`) },
      { $ref: "#/components/schemas/M0" },
    ];
    for (const schema of hostile) {
      const t0 = Date.now();
      const v = generateValue(schema, opts({ api: chain }), { key: "x" });
      expect(Date.now() - t0).toBeLessThan(1500);
      expect(JSON.stringify(v).length).toBeLessThan(5_000_000);
    }
  });

  it("keeps a thousand records of a large model quick", () => {
    const t0 = Date.now();
    const data = new MockData({ api, mocks: { models: [{ name: "Order", count: 1000 }] } }, { now: NOW });
    expect(data.records("Order")).toHaveLength(1000);
    expect(Date.now() - t0).toBeLessThan(8000);
  });
});

describe("hints", () => {
  it("reads what a field is from its name, its format and its enum", () => {
    const k = (name: string, schema: JsonSchema = { type: "string" }, model?: string) => inferHint(name, schema, model).kind;
    expect(k("email")).toBe("email");
    expect(k("contactEmail")).toBe("email");
    expect(k("avatar", { type: "string", format: "uri" })).toBe("avatar");
    expect(k("coverImage")).toBe("image");
    expect(k("images", { type: "array" })).toBe("auto");
    expect(k("name", { type: "string" }, "User")).toBe("personName");
    expect(k("name", { type: "string" }, "Product")).toBe("productName");
    expect(k("name", { type: "string" }, "Store")).toBe("company");
    expect(k("createdAt", { type: "string", format: "date-time" })).toBe("dateTime");
    expect(inferHint("expiresAt", { type: "string", format: "date-time" }).from).toBe("+0d");
    expect(k("status", { type: "string", enum: ["a", "b"] })).toBe("status");
    expect(k("price", { type: "number" })).toBe("price");
    expect(k("phoneNumber")).toBe("phone");
    expect(k("productId")).toBe("id");
    expect(k("description")).toBe("paragraph");
    expect(k("isActive", { type: "boolean" })).toBe("boolean");
    expect(k("zipCode")).toBe("postcode");
    expect(k("receipt", { type: "string", format: "uri" })).toBe("file");
    expect(k("voiceMessage", { type: "string", format: "binary" })).toBe("audio");
  });

  it("does what the author says over what the name says", () => {
    const spec: ApiSpec = { models: [{ name: "Post", schema: { type: "object", properties: { title: { type: "string" }, status: { type: "string", enum: ["draft", "live"] }, at: { type: "string", format: "date-time" }, score: { type: "integer" }, pic: { type: "string" } }, required: ["title", "status", "at", "score", "pic"] } }] };
    const data = new MockData(
      {
        api: spec,
        mocks: {
          models: [{ name: "Post", hints: { title: { kind: "constant", value: "Hello" }, status: { kind: "status", weights: { draft: 0, live: 1 } }, at: { kind: "dateTime", from: "-2d", to: "-1d" }, score: { kind: "integer", min: 90, max: 95 }, pic: { kind: "image", files: ["f1"] } } }],
          files: [{ id: "f1", name: "f1.png", type: "image/png", data: "data:image/png;base64,iVBORw0KGgo=" }, { id: "f2", name: "f2.png", type: "image/png", data: "data:image/png;base64,AAAA" }],
        },
      },
      { now: NOW },
    );
    for (const p of data.records("Post")) {
      expect(p.title).toBe("Hello");
      expect(p.status).toBe("live");
      const t = Date.parse(String(p.at));
      expect(t).toBeGreaterThanOrEqual(NOW - 2 * 86_400_000);
      expect(t).toBeLessThanOrEqual(NOW - 86_400_000);
      expect(p.score).toBeGreaterThanOrEqual(90);
      expect(p.score).toBeLessThanOrEqual(95);
      expect(p.pic).toBe("data:image/png;base64,iVBORw0KGgo=");
    }
  });
});

describe("placeholder files", () => {
  it("makes a PDF whose table of offsets is right", () => {
    const bytes = pdfDocument({ seed: "s", title: "Receipt 收据" });
    const text = String.fromCharCode(...bytes);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(xref, xref + 4)).toBe("xref");
    const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(text.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    /* the title in any language, as the document's own */
    expect(text).toContain("/Title <FEFF");
  });

  it("puts a record's title on its placeholder file", () => {
    const spec: ApiSpec = { models: [{ name: "Invoice", schema: { type: "object", properties: { title: { type: "string" }, receipt: { type: "string", format: "uri" } }, required: ["title", "receipt"] } }] };
    const data = new MockData({ api: spec, mocks: { models: [{ name: "Invoice", hints: { title: { kind: "constant", value: "March rent" } } }] } }, { now: NOW });
    const receipt = parseDataUrl(String(data.records("Invoice")[0].receipt))!;
    expect(receipt.type).toBe("application/pdf");
    expect(String.fromCharCode(...receipt.bytes)).toContain("(March rent) Tj");
  });

  it("makes a WAV, an MP4, an SVG and bytes", () => {
    const wav = wavTone({ seed: "s" });
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
    expect(new DataView(wav.buffer).getUint32(4, true)).toBe(wav.length - 8);
    const video = parseDataUrl(placeholderFile("video", { seed: "s" }).data)!;
    expect(video.type).toBe("video/mp4");
    expect(String.fromCharCode(...video.bytes.slice(4, 8))).toBe("ftyp");
    const svg = parseDataUrl(placeholderFile("avatar", { seed: "s", title: "Emma Smith" }).data)!;
    expect(String.fromCharCode(...svg.bytes)).toContain(">ES</text>");
    expect(placeholderFile("file", { seed: "s" }).type).toBe("application/octet-stream");
    expect(placeholderFile("pdf", { seed: "s", title: "x" }).name).toBe("x.pdf");
  });
});
