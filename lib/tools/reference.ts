/* The tools that read a reference picture: the colors of a screenshot the author attached (or of a screen of the
 * canvas), and a screen of the canvas held against the reference it copies, cell by cell, with both pictures handed
 * back side by side. Read-only, deterministic: what a model replicating a screenshot measures instead of guessing. */

import { frameSizeOf } from "../tokens";
import type { Schema } from "../core";
import { compareGrid, paletteOf, readPixels, regionColor, type Pixels, type Rect } from "./pixels";
import { tool, ToolFailure, type Attachment, type Tool, type ToolEnv } from "./types";

const obj = (properties: Record<string, Schema>, required: string[] = []): Schema => ({ type: "object", properties, required, additionalProperties: false });
const RECT: Schema = { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number", minimum: 1 }, h: { type: "number", minimum: 1 }, name: { type: "string" } }, required: ["x", "y", "w", "h"] };
const POINT: Schema = { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, name: { type: "string" } }, required: ["x", "y"] };

const attachmentOf = (env: ToolEnv, id: string): Attachment | undefined => env.attachments?.find((a) => a.id === id);

const listed = (env: ToolEnv) => (env.attachments?.length ? `The attached pictures are ${env.attachments.map((a) => a.id).join(", ")}.` : "The author attached no picture.");

/** a picture by name: an attachment, or a screen or part of the canvas, drawn */
async function pictureOf(env: ToolEnv, id: string): Promise<{ url: string; kind: "attachment" | "screen" | "part"; screenW?: number }> {
  const a = attachmentOf(env, id);
  if (a) return { url: a.dataUrl, kind: "attachment" };
  const s = env.store.get();
  const frame = s.doc.frames.find((f) => f.id === id);
  const part = !frame && s.doc.groups.some((g) => g.items.some((it) => it.id === id));
  if (!frame && !part) throw new ToolFailure("not_found", `There is no picture, screen or part ${JSON.stringify(id)}.`, listed(env));
  if (!env.renderer) throw new ToolFailure("unavailable", "Screens cannot be drawn here (no renderer).", "Sample an attached picture instead.");
  const url = await env.renderer.screenshot(id, { signal: env.signal });
  return { url, kind: frame ? "screen" : "part", ...(frame ? { screenW: frameSizeOf(frame).w } : {}) };
}

async function pixelsOf(env: ToolEnv, url: string): Promise<Pixels> {
  try {
    return await (env.pixels ?? readPixels)(url);
  } catch (e) {
    throw new ToolFailure("unavailable", `The picture could not be read: ${e instanceof Error ? e.message : String(e)}.`, "Judge its colors by eye instead.");
  }
}

const sampleColors = tool<{ image: string; regions?: (Rect & { name?: string })[]; points?: { x: number; y: number; name?: string }[]; colors?: number }>({
  name: "sample_colors",
  group: "read",
  description:
    "Measures the colors of a picture: an attached reference (ref1…) or a screen or part of the canvas. Gives its size in pixels, the colors that cover most of it (with their share), and for each region {x, y, w, h} (in the picture's pixels) its ground color, average and second color, and for each point its color. Use it to take the exact backgrounds, surfaces, accents and text colors of a screenshot you copy.",
  input: obj({ image: { type: "string", description: "ref1… or a screen or part id" }, regions: { type: "array", items: RECT, description: "areas to measure, in the picture's pixels" }, points: { type: "array", items: POINT }, colors: { type: "integer", minimum: 1, maximum: 16, description: "how many main colors (default 8)" } }, ["image"]),
  output: "{image: {w, h}, palette: [{hex, share}], regions: [{name, dominant, average, second}], points: [{name, hex}]}",
  readOnly: true,
  destructive: false,
  async run(a, env) {
    const pic = await pictureOf(env, a.image);
    const px = await pixelsOf(env, pic.url);
    const screens = env.store.get().doc.frames;
    const screenW = pic.screenW ?? (screens[0] ? frameSizeOf(screens[0]).w : undefined);
    return {
      result: {
        image: { id: a.image, kind: pic.kind, w: px.w, h: px.h, ...(pic.kind === "attachment" && screenW ? { pxPerDp: Math.round((px.w / screenW) * 100) / 100, note: `if it shows a whole screen ${screenW} dp wide, divide its pixels by ${Math.round((px.w / screenW) * 100) / 100} for dp` } : {}) },
        palette: paletteOf(px, undefined, a.colors ?? 8),
        ...(a.regions?.length ? { regions: a.regions.slice(0, 40).map((r, i) => ({ name: r.name ?? `r${i + 1}`, ...regionColor(px, r) })) } : {}),
        ...(a.points?.length ? { points: a.points.slice(0, 60).map((p, i) => ({ name: p.name ?? `p${i + 1}`, hex: regionColor(px, { x: p.x - 1, y: p.y - 1, w: 3, h: 3 }).average })) } : {}),
      },
    };
  },
});

const compareToReference = tool<{ screen: string; reference: string; cells?: number }>({
  name: "compare_to_reference",
  group: "read",
  description:
    "Holds a screen of the canvas against the reference picture it copies: draws the screen, hands back both pictures (the reference first), and lays them over each other in a grid, giving the cells whose colors differ most (in dp on the screen, with the reference's color and the screen's) and an overall likeness 0–100. Then compare layout, spacing, sizes, type, corners and shadows by eye, and fix what differs.",
  input: obj({ screen: { type: "string", description: "the screen (or a part) that copies the reference" }, reference: { type: "string", description: "the attached picture: ref1…" }, cells: { type: "integer", minimum: 1, maximum: 20, description: "how many differing cells to list (default 8)" } }, ["screen", "reference"]),
  output: "both pictures, and {similarity, reference: {w, h}, screen: {w, h}, differ: [{x, y, w, h, reference, screen}]}",
  readOnly: true,
  destructive: false,
  async run(a, env) {
    const ref = attachmentOf(env, a.reference);
    if (!ref) throw new ToolFailure("not_found", `There is no attached picture ${JSON.stringify(a.reference)}.`, listed(env));
    const shot = await pictureOf(env, a.screen);
    if (shot.kind === "attachment") throw new ToolFailure("invalid_value", `${a.screen} is an attached picture; name the screen that copies it.`, "list_screens gives the screens' ids.");
    const [rp, sp] = [await pixelsOf(env, ref.dataUrl), await pixelsOf(env, shot.url)];
    const cols = 4;
    const rows = Math.max(4, Math.min(12, Math.round((cols * sp.h) / sp.w)));
    const { similarity, cells } = compareGrid(rp, sp, cols, rows);
    /* a screenshot is one pixel per dp at scale 1 */
    const differ = cells
      .filter((c) => c.distance > 24)
      .slice(0, a.cells ?? 8)
      .map(({ x, y, w, h, reference, replica, distance }) => ({ x, y, w, h, reference, screen: replica, distance }));
    return {
      result: { similarity, reference: { w: rp.w, h: rp.h }, screen: { w: sp.w, h: sp.h }, differ, note: differ.length ? "the first picture is the reference, the second your screen; cells are in dp on your screen" : "the colors agree cell by cell; check layout, sizes and type by eye" },
      images: [ref.dataUrl, shot.url],
    };
  },
});

export const REFERENCE_TOOLS: Tool<never>[] = [sampleColors, compareToReference] as unknown as Tool<never>[];
