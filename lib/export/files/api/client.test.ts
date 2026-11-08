import { describe, expect, it } from "vitest";
import { ApiError, createFetchTransport, formDataOf, isMultipart, queryString, segment, send, type Transport, type TransportRequest } from "./index";

/* The client every product's packages/api has before its operations (transport.ts, client.ts, fetch.ts), tested here as
 * the editor's own code; the product tests its printed operations over them (packages/api/src/generated/client.test.ts). */

/** a transport that answers every call with what it is given, and remembers what it was asked */
function answering(status: number, body: unknown) {
  const asked: TransportRequest[] = [];
  const transport: Transport = {
    async request(request) {
      asked.push(request);
      return { status, headers: {}, body };
    },
  };
  return { transport, asked };
}

describe("the product's API client", () => {
  it("writes a query in the order given, lists as repeated keys, nothing for what is not there", () => {
    expect(queryString({ page: 2, tag: ["a", "b"], none: undefined, also: null, q: "a b&c" })).toBe("page=2&tag=a&tag=b&q=a%20b%26c");
    expect(queryString(undefined)).toBe("");
  });

  it("keeps a path parameter one segment of its own path", () => {
    expect(segment("a/b?c#d")).toBe("a%2Fb%3Fc%23d");
    for (const step of [".", ".."]) expect(() => segment(step)).toThrow();
    expect(segment("...")).toBe("...");
  });

  it("gives back what a 2xx answer holds, and throws anything else as an ApiError with its status and body", async () => {
    const ok = answering(200, { ok: true });
    await expect(send(ok.transport, { operationId: "a", method: "GET", path: "/a" }, { headers: { x: "1" } })).resolves.toEqual({ ok: true });
    expect(ok.asked[0].headers).toEqual({ x: "1" });
    const refused = send(answering(422, { title: "No" }).transport, { operationId: "b", method: "POST", path: "/b" });
    await expect(refused).rejects.toBeInstanceOf(ApiError);
    await expect(refused).rejects.toMatchObject({ status: 422, body: { title: "No" }, operationId: "b" });
  });

  it("sends over fetch: JSON as JSON, the query on the address, the answer read by its bytes", async () => {
    const seen: { url: string; init: { method: string; headers: Record<string, string>; body?: unknown } }[] = [];
    const { Response } = globalThis as unknown as { Response: new (body: Uint8Array | string | null, init: { status: number; headers: Record<string, string> }) => never };
    const t = createFetchTransport({
      baseUrl: "https://api.example.com/",
      fetch: async (url, init) => {
        seen.push({ url, init });
        return new Response('{"id":1}', { status: 201, headers: { "content-type": "application/json" } });
      },
    });
    const out = await t.request({ method: "POST", path: "/items", query: { draft: true }, body: { name: "Lamp" } });
    expect(out).toMatchObject({ status: 201, body: { id: 1 } });
    expect(seen[0].url).toBe("https://api.example.com/items?draft=true");
    expect(seen[0].init.headers["content-type"]).toBe("application/json");
    expect(seen[0].init.body).toBe('{"name":"Lamp"}');
  });

  it("tells a multipart request by its content type, and makes its body form data", () => {
    expect(isMultipart({ method: "POST", path: "/u", headers: { "Content-Type": "multipart/form-data" } })).toBe(true);
    expect(isMultipart({ method: "POST", path: "/u" })).toBe(false);
    const form = formDataOf({ name: "a", tags: ["x", "y"], meta: { n: 1 }, file: { name: "a.txt", type: "text/plain", dataUrl: "data:text/plain;base64,aGk=" } }) as FormData;
    expect(form.getAll("tags")).toEqual(["x", "y"]);
    expect(form.get("meta")).toBe('{"n":1}');
    expect((form.get("file") as File).name).toBe("a.txt");
  });
});
