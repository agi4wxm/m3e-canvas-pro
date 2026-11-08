import { afterEach, describe, expect, it, vi } from "vitest";
import { isoDateTime, localDateTime, pickFiles, webStorage, withUploads } from "./platform";

/* What only a browser has, as every product's web app has it (apps/web/src/generated/platform.ts), tested here as the
 * editor's own code. */

describe("the web app's platform pieces", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the session's tokens in the tab's sessionStorage, and lasts as long as the page where storage is refused", () => {
    const kept = new Map<string, string>();
    vi.stubGlobal("window", { sessionStorage: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) } });
    const s = webStorage();
    s.set("t", "1");
    expect(s.get("t")).toBe("1");
    s.remove("t");
    expect(s.get("t")).toBeNull();
    const refuse = () => {
      throw new Error("denied");
    };
    vi.stubGlobal("window", { sessionStorage: { getItem: refuse, setItem: refuse, removeItem: refuse } });
    expect(() => webStorage().set("t", "1")).not.toThrow();
    expect(webStorage().get("t")).toBeNull();
  });

  it("shows a date and time in this place's time and writes it back as the contract does", () => {
    const iso = new Date(2026, 10, 8, 9, 5).toISOString();
    expect(localDateTime(iso)).toBe("2026-11-08T09:05");
    expect(isoDateTime("2026-11-08T09:05")).toBe(iso);
    expect(localDateTime("not a date")).toBe("");
    expect(isoDateTime("")).toBe("");
  });

  it("hands over what a file input picked: its file, or its files", () => {
    const files = [new File(["a"], "a.txt"), new File(["b"], "b.txt")];
    const got: unknown[] = [];
    const event = { target: { type: "file", files: Object.assign([...files], { item: (i: number) => files[i] }) } };
    pickFiles(false, (f) => got.push(f))(event as never);
    pickFiles(true, (f) => got.push(f))(event as never);
    expect(got).toEqual([files[0], files]);
  });

  it("sends what carries no file through the transport it wraps", async () => {
    const inner = { request: vi.fn(async () => ({ status: 200, headers: {}, body: "inner" })) };
    const out = await withUploads(inner, "/api").request({ method: "POST", path: "/a", body: { name: "Lamp" } });
    expect(out.body).toBe("inner");
    expect(inner.request).toHaveBeenCalledTimes(1);
  });
});
