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
import { DEFAULT_MOTION, TRANSITION_MOTIONS, motionPoses, screenPoses } from "./screenMotion";
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

  it("plays the motions the older moves were written as, the theme's on springs in the expressive scheme", () => {
    expect(screenPoses({ motion: TRANSITION_MOTIONS.slideUp, backwards: false }).initial).toMatchObject({ y: "100%" });
    expect(screenPoses({ motion: DEFAULT_MOTION, backwards: false, spring: true }).animate.transition).toMatchObject({ type: "spring" });
    expect(screenPoses({ motion: TRANSITION_MOTIONS.fade, backwards: false, spring: true }).animate.transition).toMatchObject({ duration: 0.3 });
    /* an app's own moves still name the older ones */
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
    const { code } = buildCode(doc([button("h", "Hover", { to: "sheet", motion: TRANSITION_MOTIONS.fade, trigger: { on: "hover" } }), button("d", "Later", { to: "back", trigger: { on: "delay", ms: 1500 } })]), {});
    expect(code).toContain(`<Pressable onHover={() => act(homeScreenActions.hover, { part: "hover" })}>`);
    expect(code).toContain(`<Pressable after={1500} onAfter={() => act(homeScreenActions.later, { part: "later" })}>`);
    /* what starts it is the Pressable's: the data says what it does */
    expect(code).toContain(`hover: { to: "sheet", motion: { kind: "dissolve", easing: "emphasized", ms: 300 } },`);
    expect(code).toContain(`later: { to: "back" },`);
    /* neither is a tap */
    expect(code).not.toContain("onClick");
    expect(code).not.toContain("onPress");
  });

  it("lays a screen over the one on show, with its animation", () => {
    const { code } = buildCode(doc([button("o", "Open", { to: "sheet", overlay: true, motion: { kind: "push", dir: "up", easing: "inOut", ms: 300 } })]), {});
    expect(code).toContain(`open: { to: "sheet", motion: { kind: "push", dir: "up", easing: "inOut", ms: 300 }, overlay: true },`);
    expect(code).toContain(`onClick={() => act(homeScreenActions.open, { part: "open" })}`);
  });

  it("goes to a screen with its animation, also on the branch a condition does not take", () => {
    const vars = [{ id: "c", name: "Count", type: "number" as const, value: 0 }];
    const action: Action = { to: "sheet", motion: { kind: "move", dir: "down", ms: 250 }, when: { expr: "vars.Count == 1" }, else: { to: "sheet", overlay: true, motion: { kind: "dissolve" } } };
    const { code } = buildCode(doc([button("g", "Go", action)], { vars }), {});
    expect(code).toContain(`go: { to: "sheet", motion: { kind: "move", dir: "down", ms: 250 }, when: { expr: "vars.Count == 1" }, else: { to: "sheet", motion: { kind: "dissolve" }, overlay: true } },`);
  });

  it("scrolls to a part it marks, before going anywhere", () => {
    const target: Item = { ...makeItem("text"), id: "far", props: { text: "Far below" } };
    const { code } = buildCode(doc([button("s", "Scroll", { to: "sheet", motion: { kind: "instant" }, scrollTo: "far" }), target]), {});
    expect(code).toContain(`scroll: { to: "sheet", scrollTo: "farBelow", motion: { kind: "instant" } },`);
    expect(code).toContain(`data-part="farBelow"`);
    /* a part that is not there is no part to scroll to */
    expect(buildCode(doc([button("s", "Scroll", { to: "none", scrollTo: "gone" })]), {}).code).not.toContain("scrollTo");
  });

  it("prints only what an animation can be, whatever the document holds", () => {
    const hostile = { kind: "push", dir: `left"});alert(1);//`, easing: "in", ms: 1e9, extra: "x" } as never;
    const { code } = buildCode(doc([button("o", "Open", { to: "sheet", motion: hostile })]), {});
    expect(code).toContain(`open: { to: "sheet", motion: { kind: "push", easing: "in", ms: 10000 } },`);
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
    expect(text(files, "src/screens/HomeScreen.tsx")).toMatch(/\{ do: "setVar", var: "accent", value: "#c62828" \}/);
    /* what a tap reads of a variable with modes is what the screen on show shows */
    expect(runtime).toContain("const varsNow = (): Vars => varsOn(live.current, top(), !!live.current.vars.night)");
  });
});

describe("the taps of an exported prototype (lib/actions)", () => {
  it("runs them with the editor's own interpreter, over the state as each step leaves it", async () => {
    const files = await exported(doc([button("b", "Go", { to: "sheet", motion: { kind: "instant" }, effects: [{ do: "addVar", var: "n", by: 1 }, { do: "setVar", var: "m", value: 0, expr: "vars.n * 10" }] })], { vars: [{ id: "n", name: "n", type: "number", value: 1 }, { id: "m", name: "m", type: "number", value: 0 }] }));
    const runtime = text(files, "src/runtime.tsx");
    expect(runtime).toContain('import { run } from "@/lib/actions/run"');
    expect(runtime).toContain("const act = useCallback((action: Action, tap: Tap) => void run(action, host, { ...tap, current: live.current.current }), [host])");
    /* what a step writes the next one reads, before anything is drawn again */
    expect(runtime).toContain("live.current = typeof next === \"function\" ? next(was) : next");
    expect(text(files, "src/lib/actions/run.ts")).toBe(await fromDisk("lib/actions/run.ts"));
    expect(text(files, "src/screens/HomeScreen.tsx")).toContain('go: { to: "sheet", motion: { kind: "instant" }, effects: [{ do: "addVar", var: "n", by: 1 }, { do: "setVar", var: "m", value: 0, expr: "vars.n * 10" }] },');
  });

  it("says what reaches for an API it does not have, and answers the capabilities with the mocks, as the preview does", async () => {
    const files = await exported(doc([button("s", "Save", { to: "none", effects: [{ do: "call", operationId: "save" }, { do: "invoke", capability: "clipboard.write", args: { text: "'x'" } }, { do: "signOut" }] })]));
    expect(text(files, "README.md")).toContain("## Not in this prototype");
    expect(text(files, "README.md")).toContain("- the call of `save`\n- signing out\n");
    const runtime = text(files, "src/runtime.tsx");
    expect(runtime).toContain("unreached(`the call of ${operation}`)");
    expect(runtime).toContain('console.warn(`This prototype has no API: ${what} is not run. Export the product to run it.`)');
    expect(runtime).toContain("const answers = useRef<CapabilityHost>(capabilities ?? createMockCapabilities(MOCK_CAPABILITIES, CAPABILITY_SPEC))");
    expect(text(files, "src/screens/HomeScreen.tsx")).toContain('{ do: "call", operationId: "save" }');
    expect("src/lib/capabilities/mock.ts" in files).toBe(true);
  });
});

describe("a document with one variable", () => {
  it("writes it under a key read as any key, so a value of another type for it still typechecks", async () => {
    const one = text(await exported(doc([button("b", "Go", { to: "none", effects: [{ do: "addVar", var: "w", by: 1 }] })], { vars: [{ id: "w", name: "word", type: "text", value: "1" }] })), "src/runtime.tsx");
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
    /* a document whose taps play only the default slide carries none of the prototype's code */
    const reuse = await exported(reuseDoc().doc, reuseDoc().widths);
    for (const name of ["screenMotion", "ScreenContext", "openOverlay", "FLOWS", "varStyle", "onHover"]) expect(text(reuse, "src/App.tsx") + text(reuse, "src/runtime.tsx"), name).not.toContain(name);
    /* the moves are not played: only the interpreter's model names them (src/lib/actions/model.ts) */
    expect(Object.entries(reuse).filter(([p, t]) => p.startsWith("src/") && typeof t === "string" && !p.startsWith("src/lib/actions/") && t.includes("screenMotion")).map(([p]) => p)).toEqual([]);
    /* one whose taps fade, expand or go at once (the older moves, written as their motions since version 4) plays the
       preview's own poses (src/lib/screenMotion.ts), and nothing else of the prototype */
    const proof = await exported(proofDoc().doc, proofDoc().widths);
    expect(text(proof, "src/App.tsx")).toContain('import { screenPoses } from "@/lib/screenMotion"');
    for (const name of ["openOverlay", "FLOWS", "varStyle", "onHover"]) expect(text(proof, "src/App.tsx") + text(proof, "src/runtime.tsx"), name).not.toContain(name);
    /* Digests of what these documents exported before prototypes, flows and modes reached the app. A change here means
       documents that use none of them now export differently: if that is meant, update the digests (last: version 4 of
       the format, lib/converge.ts: a tap's data says its move by its motion alone, no `transition`, and the older fade,
       expand and at-once moves of proof's menu and sweep's screens are motions, played by the preview's own poses; a
       condition is an expression; before that the taps are
       the data they are, lib/actions' Action, which src/runtime.tsx runs with the interpreter, and the widgets' copy
       goes through the host's capabilities; before that the platform capabilities: the shop flow pays through createOrder and payment.pay and shows the order's status, its checkout's
       body one column with the payment notices among its rows, and the checkout bar, the map and the camera take their
       state as props; before that the field
       states and accessible names, docs/组件规范.md: the button's own loading spinner, a rating's arrow keys and its name
       in the page's language, a picture with no name kept from a screen reader; before them the shop
       template's cart is the atoms the retired cart-list splits into, looking as it did; before it the widgets'
       outlets, report 3.3 and 3.4: the product cards act out their demo, the widgets carry the host's controlled value
       and own controls, and the sweep has more parts with a selectKey; before them proof's rating is an input since
       parts declare theirs, so it reads and writes a variable of its own). */
    expect({ proof: digestOf(proof), reuse: digestOf(await exported(reuseDoc().doc, reuseDoc().widths)), sweep: digestOf(await exported(sweepDoc().doc, sweepDoc().widths)) }).toMatchInlineSnapshot(`
      {
        "proof": "5b61f740b3d06588",
        "reuse": "b39e99536fce9966",
        "sweep": "76b169e2150cd1fa",
      }
    `);
  }, 60_000);
});
