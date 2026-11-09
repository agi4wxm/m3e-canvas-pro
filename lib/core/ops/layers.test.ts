/* Screens marked as layers (docs/交互规则.md “分层”) through the operations, strict as the AI and MCP call them: what
 * set_screen takes and refuses, a HUD's page removed, a part of a HUD that covers the world, how the outline says it,
 * and the fields through a project file and back, a wrong shape dropped on read. */

import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../../i18n";
import { openProject, projectFile } from "../../project";
import { formatProject } from "../projectFile";
import type { Doc } from "../../tokens";
import { counterIds, DocStore } from "../store";
import type { Op } from "../op";
import { guessMeasurer } from "../op";
import { stateOf } from "../state";
import { outline } from "../query";
import * as ops from ".";

beforeAll(() => setGlobalLang("en"));

function game() {
  const s = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("t"), measurer: guessMeasurer, lang: () => "en" });
  const run = (o: Op<never, unknown> | object, args: Record<string, unknown>) => s.run(o as never, args as never, { origin: "mcp" });
  for (const [id, name] of [["arena", "Arena"], ["hud", "HUD"], ["bag", "Bag"], ["shop", "Shop"]]) run(ops.addScreen, { id, name });
  const frame = (id: string) => s.get().doc.frames.find((f) => f.id === id)!;
  return { s, run, frame, doc: () => s.get().doc };
}

const refused = (fn: () => unknown, words: RegExp) => {
  let err: unknown;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  expect(String((err as Error | undefined)?.message)).toMatch(words);
};

describe("set_screen with a layer", () => {
  it("marks a world, a HUD that stands over it and a dialog that pauses it", () => {
    const { run, frame } = game();
    run(ops.patchScreen, { id: "arena", patch: { layer: "world" } });
    run(ops.patchScreen, { id: "hud", patch: { layer: "hud", over: "arena" } });
    run(ops.patchScreen, { id: "bag", patch: { layer: "dialog", pauses: true } });
    expect([frame("arena").layer, frame("hud").layer, frame("hud").over, frame("bag").layer, frame("bag").pauses]).toEqual(["world", "hud", "arena", "dialog", true]);
    /* a screen made a page again keeps nothing a layer had */
    run(ops.patchScreen, { id: "hud", patch: { layer: null } });
    expect(frame("hud")).not.toHaveProperty("over");
    expect(frame("hud").layer).toBeUndefined();
    run(ops.patchScreen, { id: "bag", patch: { layer: "toast" } });
    expect(frame("bag")).not.toHaveProperty("pauses");
  });

  it("refuses a layer there is none of, a HUD over itself or over no screen, and what only another layer takes", () => {
    const { run } = game();
    refused(() => run(ops.patchScreen, { id: "hud", patch: { layer: "popup" } }), /layer should be one of world, hud, dialog, toast/);
    refused(() => run(ops.patchScreen, { id: "hud", patch: { layer: "hud", over: "hud" } }), /another screen/);
    refused(() => run(ops.patchScreen, { id: "hud", patch: { layer: "hud", over: "nowhere" } }), /another screen/);
    refused(() => run(ops.patchScreen, { id: "bag", patch: { over: "arena" } }), /Only a HUD layer/);
    refused(() => run(ops.patchScreen, { id: "hud", patch: { layer: "hud", pauses: true } }), /Only a dialog layer/);
  });

  it("re-points a HUD whose page goes, and the outline says what each screen is", () => {
    const { run, frame, doc } = game();
    run(ops.patchScreen, { id: "hud", patch: { layer: "hud", over: "arena" } });
    run(ops.patchScreen, { id: "bag", patch: { layer: "dialog", pauses: true } });
    const said = outline(doc(), {});
    expect(said).toContain("layer hud over arena");
    expect(said).toContain("layer dialog, pauses the world");
    run(ops.removeScreen, { id: "arena" });
    expect(frame("hud").layer).toBe("hud");
    expect(frame("hud")).not.toHaveProperty("over");
  });

  it("sets whether a part of a HUD covers the world, and nothing but yes or no", () => {
    const { run, doc } = game();
    run(ops.patchScreen, { id: "hud", patch: { layer: "hud", over: "arena" } });
    run(ops.addPart, { slug: "text", id: "hp", screen: "hud", at: { x: 16, y: 40 }, props: { text: "HP" } });
    run(ops.setItem, { id: "hp", patch: { occlude: true } });
    const hp = () => doc().groups.flatMap((g) => g.items).find((it) => it.id === "hp")!;
    expect(hp().occlude).toBe(true);
    expect(outline(doc(), {})).toContain("occludes the world");
    refused(() => run(ops.setItem, { id: "hp", patch: { occlude: "yes" } }), /occlude should be true/);
    run(ops.setItem, { id: "hp", patch: { occlude: null } });
    expect(hp().occlude).toBeUndefined();
  });
});

describe("layers in a project file", () => {
  it("go through and back as they were; a wrong shape is dropped on read", () => {
    const { run, doc } = game();
    run(ops.patchScreen, { id: "hud", patch: { layer: "hud", over: "arena" } });
    run(ops.patchScreen, { id: "bag", patch: { layer: "dialog", pauses: true } });
    run(ops.addPart, { slug: "button", id: "p", screen: "hud", at: { x: 16, y: 40 }, props: { label: "Fire" } });
    const text = formatProject(projectFile(doc()));
    const back = openProject(JSON.parse(text))!;
    expect(back.frames.map((f) => [f.id, f.layer, f.over, f.pauses])).toEqual(doc().frames.map((f) => [f.id, f.layer, f.over, f.pauses]));
    expect(formatProject(projectFile(back))).toBe(text);
    const hostile = {
      ...doc(),
      frames: doc().frames.map((f) =>
        f.id === "arena" ? { ...f, layer: "popup", pauses: true } : f.id === "shop" ? { ...f, layer: "toast", over: "arena", pauses: true } : f.id === "hud" ? { ...f, over: "hud" } : f,
      ),
      groups: doc().groups.map((g) => ({ ...g, items: g.items.map((it) => (it.id === "p" ? { ...it, occlude: "yes" } : it)) })),
    };
    const read = openProject(JSON.parse(formatProject(projectFile(hostile as unknown as Doc))))!;
    const f = (id: string) => read.frames.find((x) => x.id === id)!;
    expect(f("arena")).not.toHaveProperty("layer");
    expect(f("arena")).not.toHaveProperty("pauses");
    expect([f("shop").layer, f("shop").over, f("shop").pauses]).toEqual(["toast", undefined, undefined]);
    expect(f("hud")).not.toHaveProperty("over");
    expect(read.groups.flatMap((g) => g.items).find((it) => it.id === "p")).not.toHaveProperty("occlude");
  });
});
