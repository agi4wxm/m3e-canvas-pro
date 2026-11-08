/* The prototype, flows and variables in modes in an exported app: the moves between screens the preview and the app
 * share (lib/screenMotion.ts), what the code says the pointer, time, an overlay and a part scrolled to do, where the
 * app starts, the runtime's tables of modes and bound fields, and a document that uses none of it exporting as it
 * always did. scripts/check-export.ts runs the systems document's app in a browser. */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { buildCode } from "./codegen";
import { proofDoc, reuseDoc, sweepDoc, systemsDoc } from "./exportProject.fixture";
import { buildProject, type ProjectFiles } from "./exportProject";
import { setGlobalLang } from "./i18n";
import { motionPoses, screenPoses } from "./screenMotion";
import { makeItem, type Action, type Doc, type Item } from "./tokens";

beforeAll(() => setGlobalLang("en"));

const fromDisk = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });
const exported = async (doc: Doc, widths: Record<string, number> = {}) => (await buildProject(doc, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en" })).files;
const text = (files: ProjectFiles, path: string) => files[path] as string;

describe("the moves between screens", () => {
  it("pushes the screen there out the way the new one comes in, and back undoes it", () => {
    const m = { kind: "push" as const, dir: "left" as const, easing: "linear" as const, ms: 900 };
    const on = motionPoses(m, false);
    expect(on.initial).toMatchObject({ x: "100%", y: 0, zIndex: 2 });
    expect(on.exit).toMatchObject({ x: "-100%", opacity: 1, zIndex: 1 });
    expect(on.animate.transition).toEqual({ duration: 0.9, ease: [0, 0, 1, 1], zIndex: { duration: 0 } });
    const back = motionPoses(m, true);
    expect(back.initial).toMatchObject({ x: "-100%", zIndex: 1 });
    expect(back.exit).toMatchObject({ x: "100%", zIndex: 2 });
  });

  it("moves in over a screen that stays, slides in while it parks, dissolves, or changes at once", () => {
    expect(motionPoses({ kind: "move", dir: "up" }, false).exit).toMatchObject({ x: 0, y: 0, opacity: 1 });
    expect(motionPoses({ kind: "move", dir: "up" }, false).initial).toMatchObject({ x: 0, y: "100%" });
    expect(motionPoses({ kind: "slide", dir: "down" }, false).exit).toMatchObject({ y: "30%", opacity: 0.6 });
    expect(motionPoses({ kind: "dissolve", ms: 200 }, false).initial).toMatchObject({ opacity: 0 });
    expect(motionPoses({ kind: "instant" }, false).animate.transition).toEqual({ duration: 0, zIndex: { duration: 0 } });
    /* a spring has no duration of its own */
    expect(motionPoses({ kind: "push", easing: "spring" }, false).animate.transition).toMatchObject({ type: "spring", stiffness: 360 });
  });

  it("plays an older transition where an action has no animation, on springs in the expressive scheme", () => {
    expect(screenPoses({ transition: "slideUp", backwards: false }).initial).toMatchObject({ y: "100%" });
    expect(screenPoses({ transition: "slide", backwards: false, spring: true }).animate.transition).toMatchObject({ type: "spring" });
    expect(screenPoses({ transition: "fade", backwards: true }).initial).toMatchObject({ opacity: 0 });
    expect(screenPoses({ transition: "expand", backwards: false }).initial).toMatchObject({ scale: 0.92, zIndex: 2 });
    expect(screenPoses({ transition: "none", backwards: false, motion: { kind: "push", dir: "right" } }).initial).toMatchObject({ x: "-100%" });
  });

  it("is the very file the preview plays, with nothing it would have to bring along", async () => {
    const source = await fromDisk("lib/screenMotion.ts");
    expect(source).not.toMatch(/^\s*import\b/m);
    expect(await fromDisk("components/Preview.tsx")).toContain('from "@/lib/screenMotion"');
  });
});

/* ---------- what the code says ---------- */

const doc = (items: Item[], extra: Partial<Doc> = {}): Doc => ({
  groups: items.map((it, i) => ({ id: `g${i}`, x: 16, y: 80 + i * 70, axis: "x", items: [it] })),
  frames: [
    { id: "home", name: "Home", x: 0, y: 0 },
    { id: "sheet", name: "Sheet", x: 600, y: 0, w: 320, h: 240 },
  ],
  paletteKey: "purple",
  frame: "phone",
  title: "T",
  brief: "",
  ...extra,
});
const button = (id: string, label: string, action: Action): Item => ({ ...makeItem("button"), id, props: { label, icon: "" }, action });

describe("the prototype in printed code", () => {
  it("starts an action on the pointer or on time instead of a tap", () => {
    const { code } = buildCode(doc([button("h", "Hover", { to: "sheet", transition: "fade", trigger: { on: "hover" } }), button("d", "Later", { to: "back", transition: "none", trigger: { on: "delay", ms: 1500 } })]), {});
    expect(code).toContain(`<Pressable onHover={() => go("sheet", "fade")}>`);
    expect(code).toContain(`<Pressable after={1500} onAfter={() => back()}>`);
    /* neither is a tap */
    expect(code).not.toContain("onClick");
    expect(code).not.toContain("onPress");
  });

  it("lays a screen over the one on show, with its animation", () => {
    const { code } = buildCode(doc([button("o", "Open", { to: "sheet", transition: "slideUp", overlay: true, motion: { kind: "push", dir: "up", easing: "inOut", ms: 300 } })]), {});
    expect(code).toContain(`onClick={() => openOverlay("sheet", "slideUp", { kind: "push", dir: "up", easing: "inOut", ms: 300 })}`);
    expect(code).toContain("const { openOverlay } = useApp()");
  });

  it("goes to a screen with its animation, also on the branch a condition does not take", () => {
    const vars = [{ id: "c", name: "Count", type: "number" as const, value: 0 }];
    const action: Action = { to: "sheet", transition: "slide", motion: { kind: "move", dir: "down", ms: 250 }, when: { var: "c", op: "eq", value: 1 }, else: { to: "sheet", transition: "fade", overlay: true, motion: { kind: "dissolve" } } };
    const { code } = buildCode(doc([button("g", "Go", action)], { vars }), {});
    expect(code).toContain(`if (vars.count === 1) { go("sheet", "slide", { kind: "move", dir: "down", ms: 250 }) } else { openOverlay("sheet", "fade", { kind: "dissolve" }) }`);
  });

  it("scrolls to a part it marks, before going anywhere", () => {
    const target: Item = { ...makeItem("text"), id: "far", props: { text: "Far below" } };
    const { code } = buildCode(doc([button("s", "Scroll", { to: "sheet", transition: "none", scrollTo: "far" }), target]), {});
    expect(code).toContain(`onClick={() => { scrollTo("farBelow"); go("sheet", "none") }}`);
    expect(code).toContain(`data-part="farBelow"`);
    /* a part that is not there is no part to scroll to */
    expect(buildCode(doc([button("s", "Scroll", { to: "none", transition: "none", scrollTo: "gone" })]), {}).code).not.toContain("scrollTo");
  });

  it("prints only what an animation can be, whatever the document holds", () => {
    const hostile = { kind: "push", dir: `left"});alert(1);//`, easing: "in", ms: 1e9, extra: "x" } as never;
    const { code } = buildCode(doc([button("o", "Open", { to: "sheet", transition: "nope" as never, motion: hostile })]), {});
    expect(code).toContain(`go("sheet", "slide", { kind: "push", easing: "in", ms: 10000 })`);
    expect(code).not.toContain("alert");
  });
});

describe("the exported app's prototype", () => {
  it("starts where the first flow does, and knows the rest", async () => {
    const { doc, widths } = systemsDoc();
    const runtime = text(await exported(doc, widths), "src/runtime.tsx");
    expect(runtime).toContain(`main: { name: "Main", screen: "home" },`);
    expect(runtime).toContain(`reading: { name: "Reading", screen: "long" },`);
    expect(runtime).toContain(`const START_SCREEN: ScreenId = FLOWS[flowAsked() ?? "main"].screen`);
    /* the first screen starts no flow */
    expect(runtime).toContain(`export type ScreenId = "intro" | "home"`);
  });

  it("draws an overlay over the screen on show, plays the shared moves and passes on whether a screen is in use", async () => {
    const { doc, widths } = systemsDoc();
    const files = await exported(doc, widths);
    const app = text(files, "src/App.tsx");
    expect(app).toContain(`import { screenPoses } from "@/lib/screenMotion"`);
    expect(app).toContain("<Page screen={screen} covered={!!overlay} />");
    expect(app).toContain("onClick={closeOverlay}");
    expect(app).toContain("<ScreenContext.Provider value={{ screen, active }}>");
    const runtime = text(files, "src/runtime.tsx");
    expect(runtime).toContain("if (s.overlay) return { ...s, overlay: null }");
    expect(runtime).toContain("const id = window.setTimeout(() => timed.current?.(), after)");
    expect(runtime).toContain("onPointerEnter={onHover}");
    expect(runtime).toContain(`behavior: still ? "auto" : "smooth"`);
    expect(text(files, "README.md")).toContain("- `?flow=reading`: Reading");
  });

  it("keeps a variable a tap wrote on every screen, and reads the rest in each screen's mode", async () => {
    const { doc, widths } = systemsDoc();
    const files = await exported(doc, widths);
    const runtime = text(files, "src/runtime.tsx");
    expect(runtime).toContain("setVar: (name, value) => setState((s) => wrote(s, name, value)),");
    expect(runtime).toContain("if (!at || s.written[name as keyof Vars]) continue");
    expect(runtime).toContain("return page ? { ...app, vars: app.varsOn(page.screen) } : app");
    /* the variable that drives the dark mode is the dark the modes follow */
    expect(runtime).toContain("const darkOn = state.vars.night");
    expect(runtime).toContain("const shownOn = (on: ScreenId) => varsOn(state, on, darkOn)");
    expect(text(files, "src/screens/HomeScreen.tsx")).toContain(`onClick={() => setVar("accent", "#c62828")}`);
  });
});

describe("a document with one variable", () => {
  it("writes it under a key read as any key, so a value of another type for it still typechecks", async () => {
    const one = text(await exported(doc([button("b", "Go", { to: "none", transition: "none", effects: [{ do: "addVar", var: "w", by: 1 }] })], { vars: [{ id: "w", name: "word", type: "text", value: "1" }] })), "src/runtime.tsx");
    expect(one).toContain("toggleVar: (name) => setState((s) => ({ ...s, vars: { ...s.vars, [name as string]: !s.vars[name] } })),");
    expect(one).toContain('return { ...s, vars: { ...s.vars, [name as string]: typeof now === "string" ? String(next) : next } }');
    /* more than one is read as any key already */
    expect(text(await exported(proofDoc().doc, proofDoc().widths), "src/runtime.tsx")).not.toContain("name as string");
  });
});

/* ---------- a document that uses none of it ---------- */

/** one digest of the files an export writes from the document itself, in order of their paths */
function digestOf(files: ProjectFiles): string {
  const own = Object.keys(files)
    .filter((p) => /^src\/(App|runtime|main|theme)\.tsx$|^src\/(index|style)\.css$|^src\/screens\/|^README\.md$|^index\.html$/.test(p))
    .sort();
  const hash = createHash("sha256");
  for (const p of own) hash.update(`${p}\n${files[p] as string}\n`);
  return hash.digest("hex").slice(0, 16);
}

describe("a document with no prototype interactions, flows or variables in modes", () => {
  it("exports as it did before them, byte for byte", async () => {
    const proof = await exported(proofDoc().doc, proofDoc().widths);
    for (const name of ["screenMotion", "ScreenContext", "openOverlay", "FLOWS", "varStyle", "onHover"]) expect(text(proof, "src/App.tsx") + text(proof, "src/runtime.tsx"), name).not.toContain(name);
    expect("src/lib/screenMotion.ts" in proof).toBe(false);
    /* Digests of what these documents exported before prototypes, flows and modes reached the app. A change here means
       documents that use none of them now export differently: if that is meant, update the digests (last: the checkout's body is one column, its
       payment notices among its rows, so hidden ones leave no hole; before that, the shop flow pays through createOrder and payment.pay and shows the order's status, its checkout reading expressions,
       and the checkout bar, the map and the camera take their state as props; before that, proof's rating is an input
       since parts declare theirs, so it reads and writes a variable of its own). */
    expect({ proof: digestOf(proof), reuse: digestOf(await exported(reuseDoc().doc, reuseDoc().widths)), sweep: digestOf(await exported(sweepDoc().doc, sweepDoc().widths)) }).toMatchInlineSnapshot(`
      {
        "proof": "a756a6f3af311b35",
        "reuse": "aeba42efb325c141",
        "sweep": "901a06ae8c4098f2",
      }
    `);
  }, 60_000);
});
