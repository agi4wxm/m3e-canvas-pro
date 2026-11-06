/* The pictures an agent or a client may put on the canvas: drawn into the document or the project's own, never an
 * outside address; an SVG data URL cleaned by the vector atom's sanitizer. The editor's own panels are not held to it.
 * A screenshot with a picture that will not draw says so instead of failing. */

import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../i18n";
import { executeTool, type Renderer } from "../tools";
import { cleanSvgUrl, pictureError, picturesCleaned } from "./images";
import { guessMeasurer, OpError } from "./op";
import { counterIds, DocStore } from "./store";
import { stateOf } from "./state";
import * as ops from "./ops";

beforeAll(() => setGlobalLang("en"));

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const svgUrl = (markup: string) => `data:image/svg+xml;utf8,${encodeURIComponent(markup)}`;
const fresh = () => new DocStore(stateOf({ groups: [], frames: [{ id: "F1", name: "Home", x: 0, y: 0 }] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
const item = (s: DocStore, id: string) => s.get().doc.groups.flatMap((g) => g.items).find((it) => it.id === id);

describe("picture addresses", () => {
  it("take pictures drawn into the document and the project's own, and refuse outside ones with what to do instead", () => {
    expect(pictureError("")).toBeNull();
    expect(pictureError(PNG)).toBeNull();
    expect(pictureError("m3e-asset:abc123")).toBeNull();
    expect(pictureError(svgUrl('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>'))).toBeNull();
    expect(pictureError("https://upload.wikimedia.org/x.jpg")).toMatch(/outside address.*generate_image/);
    expect(pictureError("data:image/png;base64,***")).toMatch(/cannot be read/);
    expect(pictureError(svgUrl("<svg><script>alert(1)</script></svg>"))).toMatch(/nothing left that draws/);
  });

  it("run an SVG data URL through the sanitizer wherever it is in the arguments", () => {
    const dirty = svgUrl('<svg viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><rect width="10" height="10" fill="#f00"/></svg>');
    const clean = cleanSvgUrl(dirty)!;
    expect(decodeURIComponent(clean)).not.toMatch(/script|onload/);
    expect(decodeURIComponent(clean)).toMatch(/<rect/);
    const base64 = `data:image/svg+xml;base64,${btoa('<svg viewBox="0 0 4 4"><path d="M0 0h4v4z" onclick="x()"/></svg>')}`;
    expect(decodeURIComponent(cleanSvgUrl(base64)!)).not.toMatch(/onclick/);
    const args = { tree: { part: "box", children: [{ part: "image", props: { src: dirty } }] }, keep: PNG };
    const out = picturesCleaned(args) as typeof args;
    expect(out.tree.children[0].props.src).toBe(clean);
    expect(out.keep).toBe(PNG);
    expect(picturesCleaned({ a: 1, b: "text" })).toEqual({ a: 1, b: "text" });
  });
});

describe("pictures through the operations and the tools", () => {
  it("refuse an outside picture from an agent, in a prop, a list row and a screen's backdrop; the editor may", () => {
    const s = fresh();
    const refused = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        expect((e as OpError).code).toBe("invalid_value");
        expect((e as OpError).message).toMatch(/outside address/);
        return;
      }
      throw new Error("did not throw");
    };
    refused(() => s.run(ops.addPart, { slug: "image", screen: "F1", props: { src: "https://example.com/a.jpg" } }, { origin: "ai" }));
    refused(() => s.run(ops.patchScreen, { id: "F1", patch: { backgroundImage: "http://example.com/b.png" } }, { origin: "mcp" }));
    refused(() => s.run(ops.addPart, { slug: "carousel", screen: "F1", props: { slides: [{ label: "A", image: "https://example.com/c.png" }, { label: "B" }] } }, { origin: "ai" }));
    s.run(ops.addPart, { slug: "image", id: "ok", screen: "F1", props: { src: PNG } }, { origin: "ai" });
    s.run(ops.addPart, { slug: "image", id: "mine", screen: "F1", props: { src: "https://example.com/a.jpg" } }, { origin: "user" });
    expect(item(s, "mine")!.props?.src).toBe("https://example.com/a.jpg");
  });

  it("keep an agent's SVG picture only as the sanitizer leaves it", async () => {
    const s = fresh();
    const dirty = svgUrl('<svg viewBox="0 0 10 10"><script>alert(1)</script><circle cx="5" cy="5" r="5"/></svg>');
    const out = await executeTool(s, "apply_ops", { ops: [{ op: "add_part", args: { slug: "image", id: "pic", screen: "F1", props: { src: dirty } } }] }, { origin: "ai" });
    expect(out.ok).toBe(true);
    const src = String(item(s, "pic")!.props?.src);
    expect(src.startsWith("data:image/svg+xml")).toBe(true);
    expect(decodeURIComponent(src)).not.toMatch(/script/);
  });

  it("say in a screenshot's result which pictures would not load, instead of failing", async () => {
    const s = fresh();
    s.run(ops.addPart, { slug: "text", screen: "F1", props: { text: "Hi" } }, { origin: "ai" });
    const renderer: Renderer = {
      async screenshot(_id, o) {
        o?.onSkipped?.(["https://upload.wikimedia.org/x.jpg"]);
        return PNG;
      },
    };
    const out = await executeTool(s, "screenshot", { id: "F1" }, { origin: "ai", renderer });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result).toMatchObject({ id: "F1", skipped: ["https://upload.wikimedia.org/x.jpg"] });
    expect((out.result as { note: string }).note).toMatch(/would not load.*generate_image/);
    expect(out.images).toEqual([PNG]);
  });
});
