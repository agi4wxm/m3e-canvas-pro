/* Headless screenshots with a browser played by the test: one deadline for the whole screenshot, the caller's stop, a
 * page given up on or broken replaced by a fresh one, and the request policy the page is opened with. The static
 * server of the app build answers a malformed address with 400. (e2e/mcp.e2e.ts takes real screenshots in Chromium
 * against a local server that records what reaches it.) */

import { mkdirSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stateOf } from "../../lib/core";
import { ToolFailure } from "../../lib/tools/types";
import { silentLog } from "./log";
import { HeadlessRenderer, mayLoad, serveDir, type Playwright } from "./render";
import { scratchDir } from "./testkit";

type Mode = "draw" | "hang" | "throw";

/** a Playwright whose page draws, hangs until it is closed, or throws, as the test says */
function fakeBrowser() {
  const seen = { launches: 0, contexts: 0, closed: 0, options: [] as unknown[], routes: [] as ((route: unknown) => unknown)[], jobs: [] as Record<string, unknown>[] };
  let mode: Mode = "draw";
  let connected = true;
  const browser = {
    isConnected: () => connected,
    close: async () => {
      connected = false;
    },
    newContext: async (o: unknown) => {
      seen.contexts++;
      seen.options.push(o);
      const pages: { closed: boolean; gone: (() => void)[] }[] = [];
      let closed = false;
      return {
        route: async (_url: string, handler: (route: unknown) => unknown) => void seen.routes.push(handler),
        close: async () => {
          if (closed) return;
          closed = true;
          seen.closed++;
          for (const p of pages) {
            p.closed = true;
            for (const f of p.gone.splice(0)) f();
          }
        },
        newPage: async () => {
          const p = { closed: false, gone: [] as (() => void)[] };
          pages.push(p);
          return {
            goto: async () => {},
            waitForFunction: async () => {},
            isClosed: () => p.closed,
            close: async () => {
              p.closed = true;
            },
            evaluate: (_f: unknown, job: Record<string, unknown>) => {
              seen.jobs.push(job);
              if (mode === "throw") return Promise.reject(new Error("the page crashed"));
              if (mode === "hang") return new Promise((_, reject) => p.gone.push(() => reject(new Error("Target page, context or browser has been closed"))));
              return Promise.resolve("id" in job ? { png: "data:image/png;base64,AAAA", skipped: [], blocked: [] } : {});
            },
          };
        },
      };
    },
  };
  const pw: Playwright = {
    chromium: {
      launch: async () => {
        seen.launches++;
        connected = true;
        return browser as never;
      },
    },
  };
  return { pw, seen, set: (m: Mode) => (mode = m) };
}

const STATE = stateOf({ groups: [], frames: [{ id: "home", name: "Home", x: 0, y: 0 }] });

let closing: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of closing) await c();
  closing = [];
});

function renderer(o: { deadlineMs?: number; outside?: string[] } = {}) {
  const b = fakeBrowser();
  const r = new HeadlessRenderer({ url: "http://127.0.0.1:4173" }, "en", silentLog, () => b.pw, o);
  closing.push(() => r.close());
  return { r, ...b };
}

describe("a headless screenshot", () => {
  it("is given up past its deadline, and the next one is drawn on a fresh page", async () => {
    const { r, seen, set } = renderer({ deadlineMs: 150 });
    set("hang");
    const started = Date.now();
    const err = await r.shoot(STATE, "home", 1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ToolFailure);
    expect((err as ToolFailure).code).toBe("aborted");
    expect((err as ToolFailure).message).toMatch(/within 0 s|given up/);
    expect(Date.now() - started).toBeLessThan(2000);
    await new Promise((r) => setTimeout(r, 20));
    expect(seen.closed).toBe(1);
    set("draw");
    expect(await r.shoot(STATE, "home", 1)).toMatch(/^data:image\/png/);
    expect(seen.contexts).toBe(2);
    expect(seen.launches).toBe(1);
  });

  it("stops when its caller stops, and the next one still works", async () => {
    const { r, seen, set } = renderer();
    set("hang");
    const stop = new AbortController();
    const pending = r.shoot(STATE, "home", 1, undefined, undefined, stop.signal).catch((e: unknown) => e);
    await new Promise((res) => setTimeout(res, 50));
    stop.abort();
    const err = await pending;
    expect((err as ToolFailure).code).toBe("aborted");
    expect((err as ToolFailure).message).toMatch(/Stopped by the client/);
    set("draw");
    expect(await r.shoot(STATE, "home", 1)).toMatch(/^data:image\/png/);
    expect(seen.contexts).toBe(2);
    /* one already stopped is not taken at all */
    const before = seen.jobs.length;
    const already = new AbortController();
    already.abort();
    expect(((await r.shoot(STATE, "home", 1, undefined, undefined, already.signal).catch((e: unknown) => e)) as ToolFailure).code).toBe("aborted");
    expect(seen.jobs.length).toBe(before);
  });

  it("replaces a page that failed", async () => {
    const { r, seen, set } = renderer();
    set("throw");
    const err = await r.shoot(STATE, "home", 1).catch((e: unknown) => e);
    expect((err as ToolFailure).code).toBe("failed");
    set("draw");
    expect(await r.shoot(STATE, "home", 1)).toMatch(/^data:image\/png/);
    expect(seen.contexts).toBe(2);
  });

  it("opens its page with the request policy, and tells the page whether outside pictures may load", async () => {
    const held = renderer();
    await held.r.shoot(STATE, "home", 1);
    expect(held.seen.options[0]).toMatchObject({ serviceWorkers: "block" });
    expect(held.seen.routes).toHaveLength(1);
    expect(held.seen.jobs.every((j) => j.outside === false)).toBe(true);
    /* what the route does with each request */
    const decide = async (url: string, type = "image") => {
      let got = "";
      await held.seen.routes[0]({ request: () => ({ url: () => url, resourceType: () => type }), continue: async () => void (got = "continue"), abort: async () => void (got = "abort") });
      return got;
    };
    expect(await decide("http://127.0.0.1:4173/assets/index.js", "script")).toBe("continue");
    expect(await decide("http://127.0.0.1:9/secret.png")).toBe("abort");
    expect(await decide("http://169.254.169.254/latest/meta-data")).toBe("abort");
    expect(await decide("https://example.com/tracker.gif")).toBe("abort");
    expect(await decide("https://fonts.googleapis.com/css2?family=Roboto", "stylesheet")).toBe("continue");
    expect(await decide("https://fonts.gstatic.com/s/roboto.woff2", "font")).toBe("continue");
    expect(await decide("https://fonts.gstatic.com/tracker.png", "image")).toBe("abort");

    const allowed = renderer({ outside: ["https://cdn.example.com"] });
    await allowed.r.shoot(STATE, "home", 1);
    expect(allowed.seen.jobs.every((j) => j.outside === true)).toBe(true);
  });

  it("decides what may load by origin", () => {
    const app = "http://127.0.0.1:4173";
    expect(mayLoad("data:image/png;base64,AAAA", "image", app)).toBe(true);
    expect(mayLoad("blob:http://127.0.0.1:4173/x", "image", app)).toBe(true);
    expect(mayLoad("http://127.0.0.1:4173/render", "document", app)).toBe(true);
    expect(mayLoad("http://127.0.0.1:4174/render", "document", app)).toBe(false);
    expect(mayLoad("http://localhost:4173/x.png", "image", app)).toBe(false);
    expect(mayLoad("file:///etc/passwd", "image", app)).toBe(false);
    expect(mayLoad("https://cdn.example.com/a.png", "image", app, ["https://cdn.example.com/"])).toBe(true);
    expect(mayLoad("https://cdn.example.com.evil.test/a.png", "image", app, ["https://cdn.example.com"])).toBe(false);
    expect(mayLoad("https://anything.example/a.png", "image", app, ["*"])).toBe(true);
    expect(mayLoad("ftp://anything.example/a.png", "image", app, ["*"])).toBe(false);
  });
});

/** a GET of a raw path; its status */
const get = (port: number, path: string) =>
  new Promise<number>((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method: "GET" }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end();
  });

describe("the app build served for the render page", () => {
  it("answers a malformed address with 400 and one outside the build with 403, and keeps serving", async () => {
    const dir = join(scratchDir(), "dist");
    mkdirSync(join(dir, "assets"), { recursive: true });
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>render</title>");
    writeFileSync(join(dir, "assets", "a.js"), "export {}");
    const { base, server } = await serveDir(dir);
    closing.push(async () => void server.close());
    const port = Number(new URL(base).port);
    expect(await get(port, "/%E0%A4%A")).toBe(400);
    expect(await get(port, "/%")).toBe(400);
    expect(await get(port, "/a%00b")).toBe(400);
    expect(await get(port, "/..%2f..%2f..%2fetc%2fpasswd")).toBe(403);
    expect(await get(port, "/assets/a.js")).toBe(200);
    expect(await get(port, "/render")).toBe(200);
  });
});
