/* The tools that build what the catalog has not got, headless: a whole tree of atoms in one step, a custom style
 * written by a scripted model (validated, its faint colors sent back and then put right), the colors of a reference
 * picture and a screen held against it, a picture as a screen's backdrop, and the variable that is the dark mode. */

import { zlibSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { counterIds, DocStore, guessMeasurer, ops, stateOf } from "../core";
import { setGlobalLang } from "../i18n";
import { fakeFetch, scriptedAdapter } from "../llm/testkit";
import type { AiSettings } from "../ai";
import { startState } from "../interact";
import { contrastProblems, contrastRatio, validateCustomStyle } from "../styles";
import { createRegistry, executeTool, type Renderer, type ToolOutcome } from ".";
import { GENERATE_TOOLS } from "./generate";
import { repairContrast, styleSystemPrompt } from "./generateStyle";
import { compareGrid, decodePng, paletteOf, readPixels, regionColor, type Pixels } from "./pixels";

beforeAll(() => setGlobalLang("en"));

const fresh = () => {
  const s = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  s.run(ops.addScreen, { id: "s", name: "Home" }, { origin: "user" });
  return s;
};
const ok = (o: ToolOutcome, what = "") => {
  if (!o.ok) throw new Error(`${what}: ${o.error.code} ${o.error.message}`);
  return o.result as Record<string, unknown>;
};
const items = (s: DocStore) => s.get().doc.groups.flatMap((g) => g.items);
const groupOf = (s: DocStore, id: string) => s.get().doc.groups.find((g) => g.items.some((it) => it.id === id))!;

/* ---------- a PNG made here, for the decoder ---------- */

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (bytes: Uint8Array) => {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type: string, body: Uint8Array) {
  const out = new Uint8Array(12 + body.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, body.length);
  out.set([...type].map((c) => c.charCodeAt(0)), 4);
  out.set(body, 8);
  v.setUint32(8 + body.length, crc(out.subarray(4, 8 + body.length)));
  return out;
}
/** an RGB PNG of w×h whose pixel (x, y) is `at(x, y)`, each row with a different filter */
function png(w: number, h: number, at: (x: number, y: number) => [number, number, number]): string {
  const raw = new Uint8Array(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) raw.set(at(x, y), y * (w * 3 + 1) + 1 + x * 3);
  }
  /* the second row filtered "up", so the decoder's unfiltering is tried too */
  if (h > 1) {
    const r = w * 3 + 1;
    const row = raw.slice(r, 2 * r);
    raw[r] = 2;
    for (let i = 1; i < r; i++) raw[r + i] = (row[i] - raw[i]) & 255;
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlibSync(raw)), chunk("IEND", new Uint8Array())];
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  return `data:image/png;base64,${Buffer.from(all).toString("base64")}`;
}

/** a phone screen 2 px a dp: a dark bar on top, a cream page, an orange button */
const REFERENCE = png(824, 1784, (x, y) => (y < 112 ? [20, 24, 40] : x > 100 && x < 724 && y > 1500 && y < 1612 ? [240, 120, 32] : [250, 244, 230]));

/* ---------- add_tree ---------- */

const PROMPT_BOX = {
  part: "box",
  id: "pb",
  name: "Prompt box",
  props: { surface: "card", padX: 16, padY: 12, gap: 12, width: 380, hugWidth: false, align: "stretch" },
  corners: { tl: 24, tr: 24, bl: 24, br: 24 },
  look: { shadows: [{ x: 0, y: 4, blur: 16, spread: 0, color: "#00000022" }] },
  children: [
    { part: "textarea", id: "ask", props: { variant: "plain", placeholder: "Ask anything", rows: 2 } },
    {
      part: "box",
      id: "row",
      props: { layout: "row", gap: 8, align: "center" },
      children: [
        { part: "icon-button", id: "attach", props: { icon: "add", label: "Attach" } },
        { part: "text", id: "model", props: { text: "Model" }, textColor: "onSurfaceVariant" },
        { part: "box", id: "push", grow: true, props: { layout: "row" } },
        { part: "icon-button", id: "send", props: { icon: "arrow_upward", label: "Send", variant: "filled" }, action: { effects: [{ do: "hide", part: "attach" }] } },
      ],
    },
  ],
};

describe("add_tree", () => {
  it("puts a whole tree of atoms on a screen as one step, laid out, with the ids, fields and taps it was given", async () => {
    const s = fresh();
    const steps = s.history().length;
    const out = ok(await executeTool(s, "add_tree", { tree: PROMPT_BOX, screen: "s", at: { x: 16, y: 600 } }, { origin: "ai" }), "add_tree");
    expect(out).toMatchObject({ itemId: "pb", parts: 7 });
    expect(s.history().length).toBe(steps + 1);
    const root = groupOf(s, "pb");
    expect(root.name).toBe("Prompt box");
    expect(root.items[0].corners).toEqual({ tl: 24, tr: 24, bl: 24, br: 24 });
    expect(root.items[0].look).toBeTruthy();
    /* nested as written, in reading order */
    const row = groupOf(s, "row");
    expect(groupOf(s, "ask").inFlow).toBe(root.id);
    expect(row.inFlow).toBe(root.id);
    expect(s.get().doc.groups.filter((g) => g.inFlow === row.id).map((g) => g.items[0].id)).toEqual(["attach", "model", "push", "send"]);
    expect(groupOf(s, "push").items[0].flowFill).toBe(true);
    expect(groupOf(s, "model").items[0]).toMatchObject({ textColor: "onSurfaceVariant", props: { fit: "auto" } });
    expect(groupOf(s, "send").items[0].action).toMatchObject({ to: "none", effects: [{ do: "hide", part: "attach" }] });
    /* laid out by the guesses: the send button at the right end of the row, the row under the field */
    expect(groupOf(s, "send").x).toBeGreaterThan(groupOf(s, "attach").x + 200);
    expect(row.y).toBeGreaterThan(groupOf(s, "ask").y);
    expect(s.get().session.selection).toEqual(["pb"]);
    s.undo();
    expect(s.get().doc.groups).toEqual([]);
  });

  it("goes into a box's layout at a place in its run, and pins a bar to its edge", async () => {
    const s = fresh();
    ok(await executeTool(s, "add_part", { slug: "box", id: "col", screen: "s", at: { x: 16, y: 120 }, props: { layout: "column" } }, { origin: "ai" }));
    ok(await executeTool(s, "add_part", { slug: "text", id: "first", into: { container: "col" } }, { origin: "ai" }));
    ok(await executeTool(s, "add_tree", { tree: { part: "box", id: "inner", props: { layout: "row" }, children: [{ part: "icon", id: "i1" }] }, into: { container: "col", index: 0 } }, { origin: "ai" }));
    const col = groupOf(s, "col");
    expect(s.get().doc.groups.filter((g) => g.inFlow === col.id).map((g) => g.items[0].id)).toEqual(["inner", "first"]);
    ok(await executeTool(s, "add_tree", { tree: { part: "box", id: "tabs", props: { pin: "bottom", layout: "row", surface: "bar", width: 412, hugWidth: false, justify: "evenly" }, children: [{ part: "icon", props: { name: "home" } }, { part: "icon", props: { name: "person" } }] }, screen: "s" }, { origin: "ai" }));
    const bar = groupOf(s, "tabs");
    expect(bar.y + 40).toBeGreaterThan(800);
  });

  it("says which node is wrong, and changes nothing", async () => {
    const s = fresh();
    const before = s.get().doc;
    const bad = async (tree: unknown) => {
      const out = await executeTool(s, "add_tree", { tree, screen: "s" }, { origin: "ai" });
      expect(out.ok).toBe(false);
      return out.ok ? "" : out.error.message;
    };
    expect(await bad({ part: "box", children: [{ part: "text", props: { colour: "red" } }] })).toMatch(/^tree\.children\[0\]: text has no prop "colour"/);
    expect(await bad({ part: "boxx" })).toMatch(/no part "boxx".*box/);
    expect(await bad({ part: "text", children: [{ part: "icon" }] })).toMatch(/holds no parts/);
    expect(await bad({ part: "box", children: [{ part: "icon", id: "x" }, { part: "icon", id: "x" }] })).toMatch(/used twice/);
    expect(await bad({ part: "box", children: [{ part: "icon", action: { effects: [{ do: "hide", part: "ghost" }] } }] })).toMatch(/children\[0\]\.action/);
    expect(await bad({ part: "box", wobble: true })).toMatch(/not a field of a node/);
    expect(s.get().doc).toBe(before);
  });

  it("is refused corners on a document held to its style, and batches in apply_ops", async () => {
    const s = fresh();
    s.run(ops.applyStyle, { style: "ios" }, { origin: "user" });
    const out = await executeTool(s, "add_tree", { tree: { part: "box", corners: { tl: 8, tr: 8, bl: 8, br: 8 } }, screen: "s" }, { origin: "ai" });
    expect(!out.ok && out.error.message).toMatch(/decided by the style/);
    ok(await executeTool(s, "apply_ops", { ops: [{ op: "add_tree", args: { tree: { part: "box", id: "card", props: { surface: "card" }, children: [{ part: "text", props: { text: "Hi" } }] }, screen: "s" } }, { op: "make_component", args: { ids: ["card"], name: "Card", id: "c1" } }] }, { origin: "ai" }), "batch");
    expect(s.get().doc.components?.map((c) => c.id)).toEqual(["c1"]);
  });
});

/* ---------- styles ---------- */

const SETTINGS: AiSettings = { provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-6.1-sol", key: "k" };
const reg = createRegistry({ extra: GENERATE_TOOLS });

describe("add_custom_style and generate_style", () => {
  it("adds a validated style and wears it, saying what validation changed", async () => {
    const s = fresh();
    const out = ok(await executeTool(s, "add_custom_style", { style: { name: "Paper", extends: "ios", light: { primary: "#zz0000", onPrimary: "#FFFFFF" }, recipes: { tabs: "nope" } }, wear: true }, { origin: "ai" }));
    expect(out.key).toBe("custom:paper");
    expect(out.worn).toBe(true);
    expect((out.problems as string[]).some((p) => p.startsWith("light.primary"))).toBe(true);
    expect((out.problems as string[]).some((p) => p.startsWith("recipes.tabs"))).toBe(true);
    expect(s.get().doc.theme.style).toBe("custom:paper");
    /* the same name again replaces it */
    ok(await executeTool(s, "add_custom_style", { style: { name: "Paper", extends: "notion" } }, { origin: "ai" }));
    expect(s.get().doc.styles?.map((x) => x.key)).toEqual(["custom:paper"]);
    expect(s.get().doc.styles?.[0].extends).toBe("notion");
  });

  it("writes a style with the model, sends faint colors back once, then puts the rest right", async () => {
    const s = fresh();
    const faint = { key: "custom:notebook", name: "Warm paper notebook", extends: "notion", seed: "#2F4A7A", light: { surface: "#FBF6EA", onSurface: "#FAF0E0" }, font: "sourceSerif", recipes: { card: "paper" } };
    const adapter = scriptedAdapter([{ text: JSON.stringify(faint) }, { text: `Here it is: ${JSON.stringify({ ...faint, light: { surface: "#FBF6EA", onSurface: "#F0E8D8" } })}` }]);
    const out = ok(await executeTool(s, "generate_style", { description: "warm paper notebook" }, { origin: "ai", registry: reg, gen: { settings: SETTINGS, adapter } }), "generate_style");
    expect(out).toMatchObject({ key: "custom:notebook", worn: true });
    expect(adapter.requests).toHaveLength(2);
    expect(JSON.stringify(adapter.requests[1].messages.at(-1))).toMatch(/light.onSurface on light.surface reads [\d.]+:1; text needs 4.5:1/);
    expect(adapter.requests[0].system).toBe(styleSystemPrompt());
    expect((out.repaired as string[]).some((r) => r.startsWith("light.onSurface"))).toBe(true);
    const style = s.get().doc.styles![0];
    expect(contrastRatio(style.light.surface, style.light.onSurface)).toBeGreaterThanOrEqual(4.5);
    expect(style.font).toBe("sourceSerif");
    expect(s.get().doc.theme.style).toBe("custom:notebook");
  });

  it("takes a reference picture, and revises a style of the document", async () => {
    const s = fresh();
    const adapter = scriptedAdapter([{ text: JSON.stringify({ name: "Ink", extends: "notion" }) }, { text: JSON.stringify({ name: "Ink", extends: "notion", light: { primary: "#123456" } }) }]);
    const env = { origin: "ai" as const, registry: reg, gen: { settings: SETTINGS, adapter }, attachments: [{ id: "ref1", dataUrl: REFERENCE }] };
    const first = ok(await executeTool(s, "generate_style", { reference: "ref1" }, env));
    const pic = ((adapter.requests[0].messages[0] as { content: { type: string }[] }).content).find((p) => p.type === "image");
    expect(pic).toBeTruthy();
    ok(await executeTool(s, "generate_style", { refine: String(first.key), feedback: "a deeper blue" }, env));
    expect(JSON.stringify(adapter.requests[1].messages[0])).toContain(String(first.key));
    expect(s.get().doc.styles).toHaveLength(1);
    const missing = await executeTool(s, "generate_style", { reference: "ref9" }, env);
    expect(!missing.ok && missing.error.code).toBe("not_found");
    const none = await executeTool(s, "generate_style", { description: "x" }, { origin: "ai", registry: reg });
    expect(!none.ok && none.error.code).toBe("unavailable");
  });

  it("never writes a new style over one the document has: only refine replaces", async () => {
    const s = fresh();
    ok(await executeTool(s, "add_custom_style", { style: { key: "custom:paper", name: "Paper", seed: "#336699" } }, { origin: "ai" }));
    const adapter = scriptedAdapter([{ text: JSON.stringify({ key: "custom:paper", name: "Paper", extends: "notion" }) }]);
    const out = ok(await executeTool(s, "generate_style", { description: "paper" }, { origin: "ai", registry: reg, gen: { settings: SETTINGS, adapter } }));
    expect(out.key).toBe("custom:paper-2");
    expect(s.get().doc.styles?.map((x) => x.key)).toEqual(["custom:paper", "custom:paper-2"]);
    expect(s.get().doc.styles?.[0].seed).toBe("#336699");
  });

  it("writes only as many styles as the turn allows, then says what to do instead", async () => {
    const s = fresh();
    const adapter = scriptedAdapter([{ text: JSON.stringify({ name: "One", extends: "notion" }) }, { text: JSON.stringify({ name: "One", extends: "notion", light: { primary: "#123456" } }) }]);
    const env = { origin: "ai" as const, registry: reg, gen: { settings: SETTINGS, adapter, styles: { left: 2, of: 2 } } };
    const first = ok(await executeTool(s, "generate_style", { description: "one" }, env));
    ok(await executeTool(s, "generate_style", { refine: String(first.key), feedback: "bluer" }, env));
    const third = await executeTool(s, "generate_style", { description: "another" }, env);
    expect(third.ok).toBe(false);
    if (third.ok) return;
    expect(third.error.code).toBe("refused");
    expect(third.error.message).toContain("2 are allowed");
    expect(third.error.hint).toContain("add_custom_style");
    /* refused before any model call */
    expect(adapter.requests).toHaveLength(2);
    /* a bad call is not counted */
    const fresh2 = { ...env, gen: { ...env.gen, styles: { left: 1, of: 1 } } };
    const bad = await executeTool(s, "generate_style", {}, fresh2);
    expect(!bad.ok && bad.error.code).toBe("bad_args");
    expect(fresh2.gen.styles.left).toBe(1);
  });

  it("asks for the material drawn with textures, strokes and shadows, in what a custom style may write", () => {
    const prompt = styleSystemPrompt();
    for (const w of ["paper", "leather", "neon", "pixel", "repeating-linear-gradient", "radial-gradient", "dashed", "text-shadow", "[data-slot=card]"]) expect(prompt).toContain(w);
    /* the example it gives for a screen survives validation as written */
    const screen = /the `screen` field takes gradients too: "([^"]+)"/.exec(prompt)![1];
    const v = validateCustomStyle({ name: "Ruled", seed: "#2B5D8C", screen, rules: [{ selector: "[data-slot=card]", declarations: { border: "1px dashed var(--md-sys-color-outline)", "box-shadow": "2px 2px 0 #0000001F" } }, { selector: "&", declarations: { "background-image": "radial-gradient(#0000000D 1px, #0000 1px)", "background-size": "4px 4px" } }] });
    expect(v.style?.screen).toBe(screen);
    expect(v.style?.rules).toHaveLength(2);
    expect(GENERATE_TOOLS.find((t) => t.name === "generate_style")!.description).toMatch(/material and its details/);
  });

  it("repairs what reads too faintly by rule", () => {
    const made = validateCustomStyle({ name: "Faint", light: { surface: "#FFFFFF", onSurface: "#EEEEEE", outline: "#FAFAFA" } }).style!;
    const { style, changed } = repairContrast(made);
    expect(changed.some((c) => c.startsWith("light.onSurface"))).toBe(true);
    expect(contrastRatio(style.light.surface, style.light.onSurface)).toBeGreaterThanOrEqual(4.5);
    /* a field's border is a mark that tells a control apart: 3:1 */
    expect(contrastRatio(style.light.surface, style.light.outline)).toBeGreaterThanOrEqual(3);
    expect(contrastProblems(style).filter((p) => p.path === "light.onSurface")).toEqual([]);
  });
});

/* ---------- pictures ---------- */

describe("reading a picture", () => {
  it("decodes a PNG, finds its colors, a region's and where two pictures differ", async () => {
    const px = await readPixels(REFERENCE);
    expect([px.w, px.h]).toEqual([824, 1784]);
    const top = paletteOf(px, undefined, 3);
    expect(top[0].hex).toBe("#FAF4E6");
    expect(top.map((c) => c.hex)).toContain("#141828");
    expect(regionColor(px, { x: 300, y: 1520, w: 100, h: 60 }).dominant).toBe("#F07820");
    const same = compareGrid(px, decodePng(Buffer.from(REFERENCE.split(",")[1], "base64")), 4, 8);
    expect(same.similarity).toBe(100);
    const plain: Pixels = { w: 412, h: 892, data: new Uint8ClampedArray(412 * 892 * 4).fill(255) };
    const diff = compareGrid(px, plain, 4, 8);
    expect(diff.similarity).toBeLessThan(100);
    expect(diff.cells[0].y).toBe(0);
  });

  it("sample_colors measures an attached picture; compare_to_reference holds a screen against it", async () => {
    const s = fresh();
    const attachments = [{ id: "ref1", dataUrl: REFERENCE }];
    const sampled = ok(await executeTool(s, "sample_colors", { image: "ref1", regions: [{ x: 0, y: 0, w: 824, h: 100, name: "bar" }], points: [{ x: 400, y: 1550 }] }, { origin: "ai", attachments }));
    expect(sampled.image).toMatchObject({ w: 824, h: 1784, pxPerDp: 2 });
    expect((sampled.regions as { dominant: string }[])[0].dominant).toBe("#141828");
    expect((sampled.points as { hex: string }[])[0].hex).toBe("#F07820");
    const shot = png(412, 892, () => [255, 255, 255]);
    const renderer: Renderer = { screenshot: async () => shot };
    const out = await executeTool(s, "compare_to_reference", { screen: "s", reference: "ref1" }, { origin: "ai", attachments, renderer });
    const r = ok(out);
    expect(out.ok && out.images).toEqual([REFERENCE, shot]);
    expect((r.differ as { y: number; reference: string; screen: string }[])[0]).toMatchObject({ y: 0, reference: "#141828", screen: "#FFFFFF" });
    expect(r.similarity).toBeLessThan(100);
    const missing = await executeTool(s, "compare_to_reference", { screen: "s", reference: "ref2" }, { origin: "ai", attachments, renderer });
    expect(!missing.ok && missing.error.hint).toContain("ref1");
    /* a picture handed over as a data URL (an MCP client's) is read as well */
    ok(await executeTool(s, "sample_colors", { image: REFERENCE }, { origin: "mcp" }));
  });
});

describe("generate_image as a screen's backdrop", () => {
  it("paints the picture behind the whole screen", async () => {
    const s = fresh();
    const picture = () => new Response(JSON.stringify({ data: [{ b64_json: "/9j/AAAA" }] }), { status: 200, headers: { "content-type": "application/json" } });
    const f = fakeFetch(picture(), picture());
    const realFetch = globalThis.fetch;
    globalThis.fetch = f;
    try {
      const out = ok(await executeTool(s, "generate_image", { prompt: "a misty mountain lake at dawn", screen: "s", background: true }, { origin: "ai", registry: reg, gen: { settings: SETTINGS } }));
      expect(out.background).toBe("s");
      const scene = items(s).find((it) => it.id === out.itemId)!;
      expect(scene.component).toBe("scene");
      expect(scene.props?.image).toBe("data:image/jpeg;base64,/9j/AAAA");
      expect(JSON.parse(String(f.calls[0].init.body)).size).toBe("1024x1536");
      /* a second picture goes into the same scene */
      ok(await executeTool(s, "generate_image", { prompt: "the lake at night", screen: "s", background: true }, { origin: "ai", registry: reg, gen: { settings: SETTINGS } }));
      expect(items(s).filter((it) => it.component === "scene")).toHaveLength(1);
    } finally {
      globalThis.fetch = realFetch;
    }
    const bad = await executeTool(s, "generate_image", { prompt: "x", background: true }, { origin: "ai", registry: reg, gen: { settings: SETTINGS } });
    expect(!bad.ok && bad.error.code).toBe("bad_args");
  });
});

describe("the dark mode as a variable", () => {
  it("is one bool variable at most, starts at the mode on show and is told in the outline", async () => {
    const s = fresh();
    ok(await executeTool(s, "apply_ops", { ops: [{ op: "add_var", args: { id: "dark", name: "Dark mode", type: "bool", value: false, drives: "dark" } }, { op: "add_part", args: { slug: "switch", id: "sw", screen: "s" } }, { op: "bind_prop", args: { id: "sw", prop: "checked", var: "dark" } }, { op: "set_action", args: { id: "sw", action: { effects: [{ do: "toggleVar", var: "dark" }] } } }] }, { origin: "ai" }));
    expect(s.get().doc.vars?.[0].drives).toBe("dark");
    ok(await executeTool(s, "add_var", { id: "other", name: "Other", type: "bool", value: true, drives: "dark" }, { origin: "ai" }));
    expect(s.get().doc.vars?.map((v) => v.drives)).toEqual([undefined, "dark"]);
    const wrong = await executeTool(s, "add_var", { name: "Words", type: "text", value: "", drives: "dark" }, { origin: "ai" });
    expect(!wrong.ok && wrong.error.message).toMatch(/Only a bool variable/);
    ok(await executeTool(s, "update_var", { id: "other", drives: null }, { origin: "ai" }));
    expect(s.get().doc.vars?.some((v) => v.drives)).toBe(false);
    ok(await executeTool(s, "update_var", { id: "dark", drives: "dark" }, { origin: "ai" }));
    expect(startState(s.get().doc.vars, undefined, true).vars.dark).toBe(true);
    expect(startState(s.get().doc.vars, undefined, false).vars.dark).toBe(false);
    expect(startState(s.get().doc.vars).vars.other).toBe(true);
    const outline = ok(await executeTool(s, "get_outline", {}, { origin: "ai" })) as unknown as string;
    expect(String(outline)).toContain("(drives the dark mode)");
  });
});
