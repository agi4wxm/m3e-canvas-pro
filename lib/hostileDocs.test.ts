import { describe, expect, it } from "vitest";
import { canvasView, expandDoc } from "./expand";
import { expandInstances, MAX_INSTANCE_GROUPS, overridableParts } from "./instances";
import { nodeTree, outline } from "./core/query";
import { layerTree } from "./layerTree";
import { MAX_NESTING, openProject } from "./project";
import type { Doc } from "./tokens";
import { API_LIMITS, apiOutline, apiProblems, schemaToTs, toAsyncApi, toOpenApi } from "./api";

/* Documents made to hurt whoever opens them: a file, a shared link, a model's output or an MCP client's. Each must
 * open and draw in bounded time, whatever it asks for. */

const item = (id: string, component: string, props: Record<string, unknown> = {}) => ({ id, kind: "component", component, label: component, icon: null, variant: "filled", props });

/** Definitions `depth` deep, each holding `fanOut` instances of the next: a few kilobytes asking for fanOut^depth parts */
function instanceBomb(depth: number, fanOut: number): Doc {
  const components = Array.from({ length: depth }, (_, d) => ({
    id: `c${d}`,
    name: `C${d}`,
    w: 40,
    h: 40,
    groups: Array.from({ length: fanOut }, (_, k) =>
      d === depth - 1 ? { id: `g${d}-${k}`, x: k * 10, y: 0, axis: "x", items: [item(`i${d}-${k}`, "text", { text: "x" })] } : { id: `g${d}-${k}`, x: k * 10, y: 0, axis: "x", instanceOf: `c${d + 1}`, items: [item(`i${d}-${k}`, "container")] },
    ),
  }));
  const doc = openProject({ frames: [{ id: "f", name: "F", x: 0, y: 0 }], groups: [{ id: "root", x: 10, y: 10, axis: "x", instanceOf: "c0", items: [item("r", "container")] }], components, paletteKey: "purple", frame: "phone", title: "", brief: "" });
  expect(doc).toBeTruthy();
  return doc!;
}

describe("a document whose components multiply", () => {
  it("draws a bounded number of parts, quickly", () => {
    /* 8^8 = 16 million parts asked for, in about 10 kB */
    const doc = instanceBomb(8, 8);
    expect(JSON.stringify(doc).length).toBeLessThan(20_000);
    const t = performance.now();
    const out = expandInstances(doc, {});
    expect(out.length).toBeLessThanOrEqual(MAX_INSTANCE_GROUPS + 64);
    canvasView(doc, {});
    expandDoc(doc, {});
    expect(performance.now() - t).toBeLessThan(20_000);
  }, 60_000);

  it("lists a bounded number of overridable parts", () => {
    const doc = instanceBomb(8, 8);
    const t = performance.now();
    const parts = overridableParts(doc.components![0], doc.components);
    expect(parts.length).toBeLessThanOrEqual(MAX_INSTANCE_GROUPS);
    expect(performance.now() - t).toBeLessThan(5_000);
  });

  it("still draws a document that only nests a little", () => {
    const doc = instanceBomb(3, 3);
    const texts = expandInstances(doc, {}).filter((g) => g.items[0].component === "text");
    expect(texts).toHaveLength(27);
  });
});

describe("a document nested very deep", () => {
  /** `depth` boxes, each laid out in the one before */
  const nest = (depth: number): Doc => {
    const groups = Array.from({ length: depth }, (_, i) => ({ id: `g${i}`, x: 10, y: 10, axis: "x", ...(i ? { inFlow: `g${i - 1}` } : {}), items: [item(`i${i}`, "container", { layout: "column" })] }));
    const doc = openProject({ frames: [{ id: "f", name: "F", x: 0, y: 0 }], groups, paletteKey: "purple", frame: "phone", title: "", brief: "" });
    expect(doc).toBeTruthy();
    return doc!;
  };

  it("is read as a tree, laid out and outlined in bounded time", () => {
    /* about 400 kB: before, reading it as a tree took minutes (each box looked through everything every box held) */
    const doc = nest(2000);
    /* past the deepest a design goes, a box leaves the layout it was in and stands where it was, holding what it held */
    expect(doc.groups.filter((g) => g.inFlow === undefined)).toHaveLength(2000 - MAX_NESTING);
    expect(doc.groups).toHaveLength(2000);
    const time = (what: string, fn: () => unknown) => {
      const t = performance.now();
      fn();
      const ms = performance.now() - t;
      expect(ms, what).toBeLessThan(8_000);
    };
    time("canvas", () => canvasView(doc, {}));
    time("layers", () => expect(layerTree(doc.groups, doc.frames, {}).nodes.size).toBeGreaterThan(2000));
    time("tree", () => nodeTree(doc, {}));
    time("outline", () => expect(outline(doc, {})).toContain("i1999"));
  }, 60_000);

  it("keeps a nest a design could have as it is", () => {
    const doc = nest(MAX_NESTING + 1);
    expect(doc.groups.filter((g) => g.inFlow === undefined)).toHaveLength(1);
  });
});

describe("a document whose API asks for too much", () => {
  it("opens within the API's bounds, and its specs, types and outline come out in bounded time", () => {
    /* a schema nested thousands deep, models that refer to each other in a ring, a channel address of braces only */
    let deep: Record<string, unknown> = { type: "string" };
    for (let i = 0; i < 3000; i++) deep = { type: "array", items: deep };
    const models = Array.from({ length: 3000 }, (_, i) => ({ name: `M${i}`, schema: { allOf: [{ $ref: `#/components/schemas/M${(i + 1) % 3000}` }], properties: { d: deep } } }));
    const endpoints = Array.from({ length: 10_000 }, (_, i) => ({ operationId: `op${i % 7}`, method: "get", path: `/x/${"{a}".repeat(50)}/${i}`, responses: { "200": { description: "x", content: { "application/json": { schema: deep } } } } }));
    const t = performance.now();
    const doc = openProject({ frames: [], groups: [], paletteKey: "purple", frame: "phone", title: "", brief: "", api: { models, endpoints, channels: [{ id: "c", address: "{".repeat(100_000), messages: [], operations: [] }] } })!;
    expect(doc.api!.models!.length).toBeLessThanOrEqual(API_LIMITS.models);
    expect(doc.api!.endpoints!.length).toBeLessThanOrEqual(API_LIMITS.endpoints);
    apiProblems(doc.api);
    apiOutline(doc.api);
    schemaToTs(doc.api);
    toOpenApi(doc);
    toAsyncApi(doc);
    expect(performance.now() - t).toBeLessThan(20_000);
  }, 60_000);
});
