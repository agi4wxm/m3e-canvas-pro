/* How a transport reads an answer (body.ts): the types that are JSON, text or files, a file's name from
 * Content-Disposition or the path, and base64 and UTF-8 by hand where the platform has neither btoa nor TextDecoder.
 * The transports themselves, printed by the export, are run in lib/export/transports.test.ts. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { FORMATS } from "../mocks/formats/table";
import { bytesToBase64, dispositionFileName, extensionOfType, isFileDisposition, isJsonMediaType, isTextMediaType, readBody, responseFileName, utf8Bytes, utf8Text } from "./body";

afterEach(() => vi.unstubAllGlobals());

describe("an answer's type", () => {
  it("is JSON, text or a file: every format the mock library makes is the same kind here, and saved with its extension", () => {
    for (const f of FORMATS) {
      const kind = isJsonMediaType(f.type) ? "json" : isTextMediaType(f.type) ? "text" : "file";
      const want = ["image", "audio", "video", "model", "pdf", "document", "presentation", "archive", "file"].includes(f.family) || !f.text ? "file" : f.type === "application/json" || f.type.endsWith("+json") ? "json" : "text";
      expect(kind, f.type).toBe(want);
      expect(extensionOfType(f.type), f.type).toBe(f.ext);
    }
    expect(isJsonMediaType("application/problem+json; charset=utf-8")).toBe(true);
    expect(isTextMediaType("Text/CSV")).toBe(true);
    expect(extensionOfType("application/x-unknown-thing")).toBe("bin");
  });
});

describe("a file's name", () => {
  it("is Content-Disposition's: filename* in UTF-8 or Latin-1 first, a quoted filename, never a path", () => {
    expect(dispositionFileName("attachment; filename=\"a.pdf\"; filename*=UTF-8''%E6%94%B6%E6%8D%AE.pdf")).toBe("收据.pdf");
    expect(dispositionFileName("attachment; filename*=iso-8859-1'en'caf%E9.txt")).toBe("café.txt");
    expect(dispositionFileName('inline; filename="say \\"hi\\".txt"')).toBe('say _hi_.txt');
    expect(dispositionFileName('attachment; filename="../../etc/passwd"')).toBe("passwd");
    expect(dispositionFileName("attachment; filename=..")).toBeUndefined();
    expect(dispositionFileName("attachment")).toBeUndefined();
    expect(isFileDisposition("attachment")).toBe(true);
    expect(isFileDisposition('inline; filename="a.png"')).toBe(true);
    expect(isFileDisposition("inline")).toBe(false);
  });

  it("is else the path's last piece, with the type's extension when it has none", () => {
    expect(responseFileName({}, "/orders/42/receipt?x=1", "application/pdf")).toBe("receipt.pdf");
    expect(responseFileName({}, "/files/report%202026.xlsx", "application/octet-stream")).toBe("report 2026.xlsx");
    expect(responseFileName({}, "/", "image/jpeg")).toBe("file.jpg");
    expect(responseFileName({ "Content-Disposition": "attachment; filename=x.glb" }, "/m", "model/gltf-binary")).toBe("x.glb");
  });
});

describe("bytes by hand", () => {
  const all = new Uint8Array(70_000).map((_, i) => (i * 7 + (i >> 8)) & 0xff);

  it("are base64 the same with btoa and without", () => {
    const withBtoa = bytesToBase64(all);
    expect(withBtoa).toBe(Buffer.from(all).toString("base64"));
    vi.stubGlobal("btoa", undefined);
    for (const n of [0, 1, 2, 3, 4, 5, 70_000]) expect(bytesToBase64(all.subarray(0, n))).toBe(Buffer.from(all.subarray(0, n)).toString("base64"));
  });

  it("are UTF-8 the same with TextDecoder and without: a byte-order mark dropped, a bad byte U+FFFD", () => {
    const words = "id,名前,🎨\r\n1,ランプ,é\n";
    const cases = [utf8Bytes(words), Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8Bytes(words)]), Uint8Array.from([0x61, 0xff, 0x62, 0xc3, 0x28, 0xe2, 0x82]), Uint8Array.from([0xc0, 0xaf, 0xed, 0xa0, 0x80])];
    const native = cases.map(utf8Text);
    expect(native[0]).toBe(words);
    expect(native[1]).toBe(words);
    vi.stubGlobal("TextDecoder", undefined);
    expect(cases.map(utf8Text)).toEqual(native);
    expect(new TextEncoder().encode(words)).toEqual(utf8Bytes(words));
  });

  it("read a whole answer the same without either", () => {
    const pdf = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0, 0xff, 0x80]);
    const read = () => [readBody({ method: "GET", path: "/r", status: 200, headers: { "content-type": "application/pdf" }, bytes: pdf }), readBody({ method: "GET", path: "/t", status: 200, headers: {}, bytes: utf8Bytes("ランプ") }), readBody({ method: "GET", path: "/b", status: 200, headers: {}, bytes: pdf })];
    const native = read();
    vi.stubGlobal("btoa", undefined);
    vi.stubGlobal("TextDecoder", undefined);
    expect(read()).toEqual(native);
    expect(native[1]).toBe("ランプ");
    expect(native[2]).toMatchObject({ name: "b.bin", type: "application/octet-stream" });
  });
});
