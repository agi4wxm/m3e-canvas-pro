/* The exported product's transports read an answer the same way, and the way the mocks answer: the fetch transport of
 * packages/api (the web app's and the React Native app's), the React Native app's uploads over XMLHttpRequest and the
 * mini-program's Taro.request transport, each printed by the export and run here as it is against a fake of its
 * platform (fetch, XMLHttpRequest, Taro.request) answering bytes: a PDF and a picture arrive as files with their bytes
 * whole, JSON parsed, text as text, nothing for a HEAD. Then the contract: what the mock library answers a download
 * with is what the fetch transport makes of the same download sent over HTTP, as the mocks' service worker sends it. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readBody } from "../api/body";
import type { Transport, TransportRequest, TransportResponse } from "../api/transport";
import { setGlobalLang } from "../i18n";
import { fromBase64 } from "../mocks/bytes";
import { FORMATS } from "../mocks/formats/table";
import { createMockTransport } from "../mocks/transport";
import { MOCK_FILES_PATH } from "../mocks/types";
import type { Doc } from "../tokens";
import { buildProduct } from "./product";
import { boundShopDoc, RECEIPT_ORDER } from "./product.fixture";
import type { Product } from "./types";

const fromDisk = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });

let shop: Product;
let doc: Doc;
let dir: string;
/** the printed modules, imported from where they were written */
let fetchMod: { createFetchTransport(o: { baseUrl: string; fetch?: unknown }): Transport };
let nativeMod: { createNativeTransport(o: { baseUrl: string }): Transport };
let taroMod: { createTaroTransport(o: { baseUrl: string }): Transport };
/** what the fake Taro.request answers next, and what it was asked */
let taro: { answer: { statusCode: number; data: unknown; header: Record<string, string> }; asked: Record<string, unknown>[] };

const text = (path: string) => {
  const body = shop.files[path]?.body;
  if (typeof body !== "string") throw new Error(`${path} is not a text file of the product`);
  return body;
};

/** writes the product's files under `from` into the folder at `to`, each through `edit` */
function copy(from: string, to: string, edit: (s: string) => string = (s) => s) {
  for (const path of Object.keys(shop.files).filter((p) => p.startsWith(from) && /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p))) {
    const out = join(dir, to, path.slice(from.length));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, edit(text(path)));
  }
}

beforeAll(async () => {
  setGlobalLang("en");
  doc = boundShopDoc().doc;
  shop = await buildProduct(doc, {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
  dir = mkdtempSync(join(tmpdir(), "m3e-transports-"));
  /* packages/api as it is; the mobile app's transport over it, React Native's Platform a stand-in */
  copy("packages/api/src/", "api");
  copy("packages/app-runtime/src/engine/", "runtime/engine");
  writeFileSync(join(dir, "rn.ts"), 'export const Platform = { OS: "ios" }\n');
  writeFileSync(join(dir, "transport.ts"), text("apps/mobile/src/generated/transport.ts").replace('from "react-native"', 'from "./rn"').replace('from "@shop/api"', 'from "./api/index"'));
  /* the mini-program's transport over the runtime's copy of body.ts, Taro a stand-in that answers what it is told */
  writeFileSync(join(dir, "runtime/index.ts"), 'export { readBody, textBody } from "./engine/api/body"\n');
  writeFileSync(join(dir, "taro.ts"), "export const taro = { answer: { statusCode: 200, data: new ArrayBuffer(0), header: {} }, asked: [] }\nexport default { request: async (o) => (taro.asked.push(o), taro.answer) }\n");
  writeFileSync(join(dir, "taroTransport.ts"), text("apps/miniapp/src/kit/app/transport.ts").replace('from "@tarojs/taro"', 'from "./taro"').replace('from "@shop/app-runtime"', 'from "./runtime/index"'));
  const load = <T>(name: string) => import(pathToFileURL(join(dir, name)).href) as Promise<T>;
  fetchMod = await load("api/fetch.ts");
  nativeMod = await load("transport.ts");
  taroMod = await load("taroTransport.ts");
  taro = (await load<{ taro: typeof taro }>("taro.ts")).taro;
}, 120_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));
afterEach(() => vi.unstubAllGlobals());

/* ---------- answers ---------- */

/** bytes no text decoder keeps: a PDF's head, a NUL, bytes above 0x7f that are not UTF-8 */
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, 0x00, 0xff, 0x80, 0xc3, 0x28, 0x0a]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0xfe, 0xed]);
const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");
const utf8 = (s: string) => new Uint8Array(Buffer.from(s, "utf8"));

type Answer = { status?: number; headers?: Record<string, string>; bytes?: Uint8Array };

/** the answers every transport is asked to read, and what each must make of it */
const CASES: { name: string; method?: string; path: string; answer: Answer; body: unknown }[] = [
  {
    name: "a PDF named by Content-Disposition, in UTF-8",
    path: "/orders/7/receipt",
    answer: { headers: { "content-type": "application/pdf", "content-disposition": "attachment; filename=\"receipt.pdf\"; filename*=UTF-8''%E6%94%B6%E6%8D%AE%201.pdf" }, bytes: PDF },
    body: { name: "收据 1.pdf", type: "application/pdf", dataUrl: `data:application/pdf;base64,${b64(PDF)}`, size: PDF.length },
  },
  { name: "a picture named by its path", path: "/products/1/photo", answer: { headers: { "content-type": "image/png" }, bytes: PNG }, body: { name: "photo.png", type: "image/png", dataUrl: `data:image/png;base64,${b64(PNG)}`, size: PNG.length } },
  { name: "an SVG, a picture whatever its syntax", path: "/logo", answer: { headers: { "content-type": "image/svg+xml" }, bytes: utf8("<svg/>") }, body: { name: "logo.svg", type: "image/svg+xml", dataUrl: `data:image/svg+xml;base64,${b64(utf8("<svg/>"))}`, size: 6 } },
  { name: "a CSV the server sends as a file", path: "/orders/export", answer: { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment" }, bytes: utf8("id\n1\n") }, body: { name: "export.csv", type: "text/csv", dataUrl: `data:text/csv;base64,${b64(utf8("id\n1\n"))}`, size: 5 } },
  { name: "JSON", path: "/products", answer: { headers: { "content-type": "application/json; charset=utf-8" }, bytes: utf8('{"items":[{"name":"ランプ"}]}') }, body: { items: [{ name: "ランプ" }] } },
  { name: "problem details", method: "POST", path: "/products", answer: { status: 422, headers: { "content-type": "application/problem+json" }, bytes: utf8('{"title":"Nope","errors":[{"pointer":"#/name"}]}') }, body: { title: "Nope", errors: [{ pointer: "#/name" }] } },
  { name: "words that only claim to be JSON", path: "/broken", answer: { headers: { "content-type": "application/json" }, bytes: utf8("not json") }, body: "not json" },
  { name: "a CSV as text", path: "/orders.csv", answer: { headers: { "content-type": "text/csv; charset=utf-8" }, bytes: utf8("id,名前\n1,ランプ\n") }, body: "id,名前\n1,ランプ\n" },
  { name: "XML as text", path: "/feed", answer: { headers: { "content-type": "application/atom+xml" }, bytes: utf8("<feed/>") }, body: "<feed/>" },
  { name: "text with no type", path: "/ping", answer: { bytes: utf8("pong") }, body: "pong" },
  { name: "bytes with no type", path: "/blob", answer: { bytes: PDF }, body: { name: "blob.bin", type: "application/octet-stream", dataUrl: `data:application/octet-stream;base64,${b64(PDF)}`, size: PDF.length } },
  { name: "nothing for a HEAD", method: "HEAD", path: "/orders/7/receipt", answer: { headers: { "content-type": "application/pdf" } }, body: undefined },
  { name: "nothing for a 204", method: "DELETE", path: "/products/1", answer: { status: 204 }, body: undefined },
];

/** a fetch that answers with the bytes it is told, as the platform's Response holds them */
const fetchAnswering = (a: Answer) =>
  vi.fn(async (_url: string, _init: unknown) => new Response(a.bytes && a.bytes.length ? a.bytes.slice() : null, { status: a.status ?? 200, headers: a.headers ?? {} }));

describe("the fetch transport (packages/api)", () => {
  it.each(CASES)("reads $name", async (c) => {
    const transport = fetchMod.createFetchTransport({ baseUrl: "https://api.example.com/", fetch: fetchAnswering(c.answer) });
    const res = await transport.request({ method: (c.method ?? "GET") as TransportRequest["method"], path: c.path });
    expect(res.status).toBe(c.answer.status ?? 200);
    expect(res.body).toEqual(c.body);
  });

  it("reads the same without btoa or TextDecoder, as in Hermes or a mini-program", async () => {
    vi.stubGlobal("btoa", undefined);
    vi.stubGlobal("TextDecoder", undefined);
    for (const c of CASES) {
      const transport = fetchMod.createFetchTransport({ baseUrl: "https://api.example.com", fetch: fetchAnswering(c.answer) });
      expect((await transport.request({ method: (c.method ?? "GET") as TransportRequest["method"], path: c.path })).body, c.name).toEqual(c.body);
    }
  });

  it("still reads JSON from a fetch that only gives text", async () => {
    const fetch = async () => ({ status: 200, headers: new Headers({ "content-type": "application/json" }), text: async () => '{"ok":true}' });
    expect((await fetchMod.createFetchTransport({ baseUrl: "/api", fetch }).request({ method: "GET", path: "/x" })).body).toEqual({ ok: true });
  });

  it("asks as it did: the request is not changed", async () => {
    const fetch = fetchAnswering({ headers: { "content-type": "application/json" }, bytes: utf8("{}") });
    await fetchMod.createFetchTransport({ baseUrl: "https://api.example.com/v1/", fetch }).request({ method: "POST", path: "/products", query: { tag: ["a", "b"] }, body: { name: "Lamp" } });
    expect(fetch.mock.calls[0]).toEqual(["https://api.example.com/v1/products?tag=a&tag=b", { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: '{"name":"Lamp"}', signal: undefined }]);
  });
});

/** an XMLHttpRequest that answers as a platform does: the bytes when asked for an arraybuffer, else their text */
function fakeXhr(a: Answer) {
  const made: { responseType: string; sent: unknown }[] = [];
  class Xhr {
    responseType = "";
    status = 0;
    response: unknown = null;
    upload: { onprogress?: (e: { loaded: number; total: number }) => void } = {};
    onload?: () => void;
    onerror?: () => void;
    open() {}
    setRequestHeader() {}
    getAllResponseHeaders() {
      return Object.entries(a.headers ?? {})
        .map(([k, v]) => `${k}: ${v}\r\n`)
        .join("");
    }
    getResponseHeader(name: string) {
      return Object.entries(a.headers ?? {}).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? null;
    }
    get responseText() {
      if (this.responseType !== "" && this.responseType !== "text") throw new Error("InvalidStateError: responseText is only there for text");
      return new TextDecoder().decode(a.bytes ?? new Uint8Array(0));
    }
    send(body: unknown) {
      made.push({ responseType: this.responseType, sent: body });
      this.status = a.status ?? 200;
      if (this.responseType === "arraybuffer") this.response = (a.bytes ?? new Uint8Array(0)).slice().buffer;
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal("XMLHttpRequest", Xhr);
  return made;
}

describe("the React Native app's transport", () => {
  const upload = (t: Transport, path: string) => t.request({ method: "POST", path, headers: { "content-type": "multipart/form-data" }, body: { file: { name: "a.png", type: "image/png", dataUrl: `data:image/png;base64,${b64(PNG)}`, uri: "file:///a.png" }, alt: "A lamp" } });

  it.each(CASES.filter((c) => !c.method))("reads an upload's answer, $name, from its bytes", async (c) => {
    const made = fakeXhr(c.answer);
    const res = await upload(nativeMod.createNativeTransport({ baseUrl: "https://api.example.com" }), c.path);
    expect(made[0].responseType).toBe("arraybuffer");
    expect(res.body).toEqual(c.body);
  });

  it("reads every other answer through packages/api's fetch transport", async () => {
    vi.stubGlobal("fetch", fetchAnswering(CASES[0].answer));
    expect((await nativeMod.createNativeTransport({ baseUrl: "https://api.example.com" }).request({ method: "GET", path: CASES[0].path })).body).toEqual(CASES[0].body);
  });
});

describe("the mini-program's transport (Taro.request)", () => {
  it.each(CASES)("reads $name from the bytes it asks for", async (c) => {
    taro.asked.length = 0;
    taro.answer = { statusCode: c.answer.status ?? 200, data: (c.answer.bytes ?? new Uint8Array(0)).slice().buffer, header: c.answer.headers ?? {} };
    const res = await taroMod.createTaroTransport({ baseUrl: "https://api.example.com" }).request({ method: (c.method ?? "GET") as TransportRequest["method"], path: c.path });
    expect(taro.asked[0]).toMatchObject({ responseType: "arraybuffer", dataType: "text" });
    expect(res.body).toEqual(c.body);
  });
});

/* ---------- the contract: the mocks and the network give the same ---------- */

const isFile = (v: unknown): v is { dataUrl: string } => !!v && typeof v === "object" && typeof (v as { dataUrl?: unknown }).dataUrl === "string";

/** An answer of the mocks sent over HTTP as packages/mocks' service worker sends it (lib/export/targets/mocks.ts MSW):
 *  a file as its bytes under its headers, nothing as nothing, text as text, the rest as JSON. */
function overHttp(out: TransportResponse): Response {
  const init = { status: out.status, headers: out.headers as Record<string, string> };
  if (isFile(out.body)) return new Response(fromBase64(out.body.dataUrl.slice(out.body.dataUrl.indexOf(",") + 1)).slice(), init);
  if (out.body === undefined || out.status === 204 || out.status === 304) return new Response(null, init);
  if (typeof out.body === "string" && !/json/i.test(out.headers["content-type"] ?? "")) return new Response(out.body, init);
  return Response.json(out.body, init);
}

/** the fetch transport over the mocks, through HTTP */
const throughHttp = (mocks: Transport) => fetchMod.createFetchTransport({ baseUrl: "https://api.example.com", fetch: async (url: string, init: { method: string; headers: Record<string, string> }) => overHttp(await mocks.request({ method: init.method as TransportRequest["method"], path: new URL(url).pathname, headers: init.headers })) });

describe("a download", () => {
  const requests: [string, TransportRequest][] = [
    ["the shop's receipt, a PDF", { operationId: "getOrderReceipt", method: "GET", path: `/orders/${RECEIPT_ORDER}/receipt` }],
    ["the receipt's HEAD", { method: "HEAD", path: `/orders/${RECEIPT_ORDER}/receipt` }],
    ["a file of the mock library", { method: "GET", path: `${MOCK_FILES_PATH}/receipt` }],
    ["a picture of the mock library", { method: "GET", path: `${MOCK_FILES_PATH}/sneaker` }],
    ["a page of products, JSON", { operationId: "listProducts", method: "GET", path: "/products" }],
  ];

  it.each(requests)("is the same from the mocks and from the network: %s", async (_name, request) => {
    const direct = await createMockTransport(doc, { latency: false }).request(request);
    const fetched = await throughHttp(createMockTransport(doc, { latency: false })).request(request);
    expect(fetched.status).toBe(direct.status);
    expect(fetched.body).toEqual(direct.body);
    if (request.operationId === "getOrderReceipt") expect(direct.body).toMatchObject({ type: "application/pdf", dataUrl: expect.stringMatching(/^data:application\/pdf;base64,JVBERi0/) });
  });

  it("is the same in every format the mock library makes, as a file to keep or as text", async () => {
    /* an export in each format, and text the operation answers with (text/plain): a file and a string alike */
    const endpoints = [
      ...FORMATS.map((f, i) => ({ operationId: `export${i}`, method: "get" as const, path: `/exports/${i}`, responses: { "200": { description: "it", content: { [f.type]: { schema: { type: "string" as const, format: "binary" } } } } } })),
      { operationId: "motto", method: "get" as const, path: "/motto", responses: { "200": { description: "words", content: { "text/plain": { schema: { type: "string" as const } } } } } },
    ];
    /* and a file of the library whose name is anything but plain ASCII */
    const named = { id: "named", name: 'Q3: 收据 "final" ½.pdf', type: "application/pdf", data: `data:application/pdf;base64,${b64(PDF)}` };
    const source = { api: { endpoints }, mocks: { files: [named] } };
    const requests: TransportRequest[] = [...endpoints.map((e): TransportRequest => ({ operationId: e.operationId, method: "GET", path: e.path })), { method: "GET", path: `${MOCK_FILES_PATH}/named` }];
    for (const request of requests) {
      const direct = await createMockTransport(source, { latency: false }).request(request);
      const fetched = await throughHttp(createMockTransport(source, { latency: false })).request(request);
      expect(fetched.body, request.path).toEqual(direct.body);
      expect(typeof direct.body, request.path).toBe(request.operationId === "motto" ? "string" : "object");
    }
    expect((await throughHttp(createMockTransport(source)).request(requests.at(-1)!)).body).toMatchObject({ name: named.name });
  });

  it("reads as the editor's own lib/api/body.ts reads it: packages/api's copy is that file", async () => {
    expect(text("packages/api/src/body.ts")).toBe(await fromDisk("lib/api/body.ts"));
    expect(text("packages/app-runtime/src/engine/api/body.ts")).toBe(await fromDisk("lib/api/body.ts"));
    expect(readBody({ method: "GET", path: "/a", status: 200, headers: { "Content-Type": "application/pdf" }, bytes: PDF })).toEqual({ name: "a.pdf", type: "application/pdf", dataUrl: `data:application/pdf;base64,${b64(PDF)}`, size: PDF.length });
  });
});
