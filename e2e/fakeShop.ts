/* A fake back end for the shop of lib/bindings/fixture.ts, put on the page as `window.m3ePreviewTransport` before the
 * editor loads, so the preview's calls are answered without a network or the mock library: pages of products by
 * cursor, one by id, a create that refuses a name with "taken" in it, a sign-in that wants the right password, and,
 * with `requireAuth`, every other call needing its token. Every request is kept in `window.__calls`. The function is
 * sent to the page as source: it reads nothing from outside itself. */

export type FakeShop = { n: number; delay: number; requireAuth?: boolean };

export function installFakeShop(opts: FakeShop) {
  type Req = { operationId?: string; path: string; query?: Record<string, unknown>; headers?: Record<string, string>; body?: unknown };
  const products = Array.from({ length: opts.n }, (_, i) => ({ id: `p${i + 1}`, name: `Product ${i + 1}`, price: 10 + i, description: `The ${i + 1}th product`, createdAt: "2026-11-01T10:00:00Z" }));
  const tokens = new Set<string>();
  const json = (status: number, body?: unknown) => ({ status, headers: {}, body });
  const w = window as unknown as { __calls: unknown[]; m3ePreviewTransport: unknown };
  w.__calls = [];
  w.m3ePreviewTransport = {
    async request(req: Req) {
      w.__calls.push({ op: req.operationId, path: req.path, query: req.query ?? null, auth: req.headers?.Authorization ?? null, body: req.body ?? null });
      await new Promise((r) => setTimeout(r, opts.delay));
      const op = req.operationId;
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (op === "login") {
        if (body.password !== "correct horse") return json(401, { title: "Wrong email or password", status: 401, errors: [{ pointer: "#/password", detail: "That password is not right" }] });
        const t = `t${tokens.size + 1}`;
        tokens.add(t);
        return json(200, { accessToken: t, user: { name: String(body.email ?? "").split("@")[0] } });
      }
      const auth = req.headers?.Authorization;
      if (opts.requireAuth && !(auth && tokens.has(auth.replace("Bearer ", "")))) return json(401, { title: "Sign in first", status: 401 });
      if (op === "listProducts") {
        const size = Number(req.query?.limit ?? 10);
        const from = req.query?.cursor ? Number(req.query.cursor) : 0;
        return json(200, { items: products.slice(from, from + size), nextCursor: from + size < products.length ? String(from + size) : null });
      }
      if (op === "getProduct") {
        const id = decodeURIComponent(req.path.split("/").pop() ?? "");
        const p = products.find((x) => x.id === id);
        return p ? json(200, p) : json(404, { title: "Not found", status: 404 });
      }
      if (op === "createProduct") {
        if (String(body.name).toLowerCase().includes("taken")) return json(422, { title: "Unprocessable", status: 422, errors: [{ pointer: "#/name", detail: "That name is taken" }] });
        const p = { id: `p${products.length + 1}`, name: String(body.name), price: Number(body.price), description: "", createdAt: "2026-11-06T10:00:00Z" };
        products.unshift(p);
        return json(201, p);
      }
      if (op === "logout") return json(204);
      return json(404, { title: "No such route", status: 404 });
    },
  };
}
