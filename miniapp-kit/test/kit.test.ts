/* The kit's pure pieces, under bun's test runner (no mini-program here: Taro's API is a fake that records what it is
 * asked): colors as CSS variables, a part's look as CSS, icons as pictures, the transport over Taro.request and
 * Taro.uploadFile, the tokens in Taro's storage, the pages' addresses, the variables' types. */
import { describe, expect, it, mock } from "bun:test";

type Call = { api: string; o: Record<string, unknown> };
const calls: Call[] = [];
const storage = new Map<string, string>();
const written: { filePath: string; data: string; encoding: string }[] = [];
let answer: { statusCode: number; data: unknown; header: Record<string, string> } = { statusCode: 200, data: "{}", header: { "Content-Type": "application/json" } };

mock.module("@tarojs/taro", () => {
  const taro = {
    request: async (o: Record<string, unknown>) => (calls.push({ api: "request", o }), answer),
    uploadFile: (o: Record<string, unknown>) => {
      calls.push({ api: "uploadFile", o });
      let hear: ((p: { totalBytesSent: number; totalBytesExpectedToSend: number }) => void) | undefined;
      const done = Promise.resolve().then(() => {
        hear?.({ totalBytesSent: 5, totalBytesExpectedToSend: 10 });
        return { statusCode: 201, data: '{"url":"https://cdn.example.com/a.png"}', header: {} };
      });
      return Object.assign(done, { progress: (fn: typeof hear) => void (hear = fn) });
    },
    getStorage: async ({ key }: { key: string }) => (storage.has(key) ? { data: storage.get(key) } : Promise.reject(new Error("none"))),
    setStorage: async ({ key, data }: { key: string; data: string }) => void storage.set(key, data),
    removeStorage: async ({ key }: { key: string }) => void storage.delete(key),
    env: { USER_DATA_PATH: "wxfile://usr" },
    getFileSystemManager: () => ({
      writeFile: (o: { filePath: string; data: string; encoding: string; success: () => void }) => {
        written.push({ filePath: o.filePath, data: o.data, encoding: o.encoding });
        o.success();
      },
    }),
    getCurrentPages: () => [],
    getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375, screenHeight: 812, safeArea: { bottom: 778 } }),
  };
  return { default: taro, ...taro };
});

/* the components draw nothing here: only the pure pieces are under test */
mock.module("@tarojs/components", () => {
  const none = () => null;
  return { View: none, Image: none, Text: none, Input: none, Textarea: none, Slider: none, Picker: none };
});

const { c, ca, css, inkVars } = await import("../src/kit/color");
const { paint } = await import("../src/kit/look");
const { base64, svgUrl } = await import("../src/kit/icons");
const { createTaroTransport, queryString, taroStorage } = await import("../src/kit/app/transport");
const { readQuery, urlOf } = await import("../src/kit/app/nav");
const { coerce } = await import("../src/kit/app/vars");
const { optionIndex, rowsOf } = await import("../src/kit/app/values");
const { firstOf } = await import("../src/kit/split");

describe("colors", () => {
  it("names a role, a role with an opacity and a hex as CSS", () => {
    expect(c("primary")).toBe("var(--md-sys-color-primary)");
    expect(ca("on-surface", 0.12)).toBe("rgba(var(--md-sys-color-on-surface-rgb), 0.12)");
    expect(css("outline/20")).toBe("rgba(var(--md-sys-color-outline-rgb), 0.2)");
    expect(css("#ff0000")).toBe("#ff0000");
    expect(css("url(x)")).toBeUndefined();
  });

  it("repaints the words' roles without pointing a role at itself", () => {
    const own = inkVars("on-surface-variant");
    expect(own["--md-sys-color-on-surface"]).toBe(c("on-surface-variant"));
    expect(own).not.toHaveProperty("--md-sys-color-on-surface-variant");
    expect(inkVars("#112233")["--md-sys-color-on-surface-rgb"]).toBe("17, 34, 51");
  });
});

describe("a look", () => {
  it("is CSS: a fill role, the words over it, an inside stroke as a ring, gradients", () => {
    const p = paint({ fill: "primaryContainer", look: { stroke: { width: 2, color: "primary" }, fills: [{ type: "linear", angle: 90, stops: [{ color: "primary", at: 0 }, { color: "tertiary/50", at: 100 }] }] } });
    expect(p.style.backgroundColor).toBe(c("primary-container"));
    expect(p.ink).toBe("on-primary-container");
    expect(p.style.boxShadow).toBe(`inset 0 0 0 2px ${c("primary")}`);
    expect(p.style.backgroundImage).toBe(`linear-gradient(90deg, ${c("primary")} 0%, ${ca("tertiary", 0.5)} 100%)`);
  });
});

describe("icons", () => {
  it("are pictures: base64 by hand, the color painted in", () => {
    expect(base64("<svg>é</svg>")).toBe(Buffer.from("<svg>é</svg>", "utf8").toString("base64"));
    const url = svgUrl('<svg fill="currentColor"/>', "#6750A4");
    expect(Buffer.from(url.slice("data:image/svg+xml;base64,".length), "base64").toString("utf8")).toBe('<svg fill="#6750A4"/>');
  });
});

describe("the transport over Taro.request", () => {
  it("sends JSON to the API's address with its query and headers, and reads the answer by its type", async () => {
    calls.length = 0;
    answer = { statusCode: 200, data: '{"items":[1]}', header: { "Content-Type": "application/json" } };
    const t = createTaroTransport({ baseUrl: "https://api.example.com/v1/" });
    const res = await t.request({ method: "POST", path: "/products", query: { page: 2, tag: ["a", "b"], none: undefined }, headers: { Authorization: "Bearer t" }, body: { name: "Lamp" } });
    expect(res).toEqual({ status: 200, headers: { "content-type": "application/json" }, body: { items: [1] } });
    expect(calls[0].o).toMatchObject({ url: "https://api.example.com/v1/products?page=2&tag=a&tag=b", method: "POST", data: '{"name":"Lamp"}', dataType: "text" });
    expect(calls[0].o.header).toMatchObject({ Authorization: "Bearer t", "content-type": "application/json" });
    expect(queryString({ q: "a b" })).toBe("q=a%20b");
  });

  it("sends a file with Taro.uploadFile, the other fields as form data, and tells how far it has gone", async () => {
    calls.length = 0;
    const heard: number[] = [];
    const t = createTaroTransport({ baseUrl: "https://api.example.com" });
    const res = await t.request({ method: "POST", path: "/products/1/images", body: { file: { path: "wxfile://tmp/a.png", name: "a.png" }, alt: "A lamp" }, onUploadProgress: (sent, total) => heard.push(sent / total) });
    expect(calls[0]).toMatchObject({ api: "uploadFile", o: { url: "https://api.example.com/products/1/images", filePath: "wxfile://tmp/a.png", name: "file", formData: { alt: "A lamp" } } });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ url: "https://cdn.example.com/a.png" });
    expect(heard).toEqual([0.5]);
  });

  it("uploads a file the client carries as a data URL from a temporary file, the platform writing the content type", async () => {
    calls.length = 0;
    const t = createTaroTransport({ baseUrl: "https://api.example.com" });
    await t.request({ method: "POST", path: "/up", headers: { "content-type": "multipart/form-data" }, body: { file: { name: "a b.png", type: "image/png", dataUrl: "data:image/png;base64,AAAA" } } });
    expect(written).toEqual([{ filePath: expect.stringMatching(/^wxfile:\/\/usr\/m3e-upload-\d+-0-a_b\.png$/), data: "AAAA", encoding: "base64" }]);
    expect(calls[0]).toMatchObject({ api: "uploadFile", o: { filePath: written[0].filePath, name: "file", fileName: "a b.png" } });
    expect(Object.keys(calls[0].o.header as Record<string, string>).map((k) => k.toLowerCase())).not.toContain("content-type");
  });

  it("asks for the answer's bytes and reads them as JSON, text or a file, never as broken text", async () => {
    const t = createTaroTransport({ baseUrl: "https://api.example.com" });
    const bytes = (b: Uint8Array | string) => (typeof b === "string" ? new TextEncoder().encode(b) : b).slice().buffer;
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0xe2, 0xe3, 0xcf, 0xd3, 0x00, 0xff, 0x80]);
    calls.length = 0;
    answer = { statusCode: 200, data: bytes(pdf), header: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=\"receipt.pdf\"; filename*=UTF-8''%E6%94%B6%E6%8D%AE.pdf" } };
    const file = await t.request({ method: "GET", path: "/orders/7/receipt" });
    expect(calls[0].o).toMatchObject({ responseType: "arraybuffer" });
    expect(file.body).toEqual({ name: "收据.pdf", type: "application/pdf", dataUrl: `data:application/pdf;base64,${Buffer.from(pdf).toString("base64")}`, size: pdf.length });
    answer = { statusCode: 200, data: bytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2])), header: { "content-type": "image/png" } };
    expect((await t.request({ method: "GET", path: "/products/1/photo" })).body).toMatchObject({ name: "photo.png", type: "image/png", size: 7 });
    answer = { statusCode: 422, data: bytes('{"title":"Nope","errors":[{"pointer":"#/name"}]}'), header: { "content-type": "application/problem+json" } };
    expect((await t.request({ method: "POST", path: "/products", body: {} })).body).toEqual({ title: "Nope", errors: [{ pointer: "#/name" }] });
    answer = { statusCode: 200, data: bytes("id,名前\n1,ランプ\n"), header: { "content-type": "text/csv; charset=utf-8" } };
    expect((await t.request({ method: "GET", path: "/orders.csv" })).body).toBe("id,名前\n1,ランプ\n");
    answer = { statusCode: 200, data: bytes(pdf), header: { "content-type": "application/pdf" } };
    expect((await t.request({ method: "HEAD", path: "/orders/7/receipt" })).body).toBeUndefined();
    answer = { statusCode: 204, data: new ArrayBuffer(0), header: {} };
    expect((await t.request({ method: "DELETE", path: "/products/1" })).body).toBeUndefined();
  });

  it("keeps the session's tokens in Taro's storage", async () => {
    await taroStorage.set("shop:session", "{}");
    expect(await taroStorage.get("shop:session")).toBe("{}");
    await taroStorage.remove("shop:session");
    expect(await taroStorage.get("shop:session")).toBeNull();
  });
});

describe("pages", () => {
  const spec = { screens: { list: { path: "pages/list/index" }, detail: { path: "pages/detail/index", params: [{ name: "id" }] }, home: { path: "pages/home/index", tab: 0 } }, start: "list", vars: [], calls: {}, status: {} };
  it("carry a screen's params in their query, encoded, and read them back", () => {
    expect(urlOf(spec, { screen: "detail", params: { id: "a b&c", n: 2 } })).toBe("/pages/detail/index?id=a%20b%26c&n=2");
    expect(urlOf(spec, { screen: "home", params: { id: "x" } })).toBe("/pages/home/index");
    expect(urlOf(spec, { screen: "nowhere" })).toBeUndefined();
    expect(readQuery({ id: "a%20b%26c", n: "2", $taroTimestamp: "1" })).toEqual({ id: "a b&c", n: "2" });
    expect(readQuery({ pct: "50%" })).toEqual({ pct: "50%" });
  });
});

describe("variables and values", () => {
  it("keep to their types", () => {
    expect(coerce("3", "number")).toBe(3);
    expect(coerce("", "number")).toBeNull();
    expect(coerce("false", "bool")).toBe(false);
    expect(coerce(5, "text")).toBe("5");
    expect(coerce("url(x)", "color")).toBeNull();
  });

  it("make rows of a list and find a choice", () => {
    expect(rowsOf([{ name: "A", icon: "home" }, "B"], [])).toEqual([{ label: "A", icon: "home" }, { label: "B" }]);
    expect(rowsOf("no", [{ label: "x" }])).toEqual([{ label: "x" }]);
    expect(optionIndex(["CNY", "USD"], "USD")).toBe(1);
    expect(optionIndex(["CNY"], undefined)).toBe(-1);
  });
});

describe("a split view", () => {
  const none = { min: [0, 0] as [number, number], max: [0, 0] as [number, number], collapsible: "none" as const, collapsedSize: 0, collapsed: false };

  it("sizes its first pane as the editor's layout does: the share, inside both panes' limits", () => {
    expect(firstOf(30, 1000, none)).toEqual({ first: 300, folded: false });
    expect(firstOf(10, 1000, { ...none, min: [240, 0] })).toEqual({ first: 240, folded: false });
    expect(firstOf(90, 1000, { ...none, min: [0, 300] })).toEqual({ first: 700, folded: false });
    expect(firstOf(90, 1000, { ...none, max: [400, 0] })).toEqual({ first: 400, folded: false });
  });

  it("folds the pane that folds, below half way to its least", () => {
    const rail = { ...none, min: [200, 0] as [number, number], collapsible: "first" as const, collapsedSize: 64 };
    expect(firstOf(12, 1000, rail)).toEqual({ first: 64, folded: true });
    expect(firstOf(15, 1000, rail)).toEqual({ first: 200, folded: false });
    expect(firstOf(30, 1000, { ...rail, collapsed: true })).toEqual({ first: 64, folded: true });
  });
});
