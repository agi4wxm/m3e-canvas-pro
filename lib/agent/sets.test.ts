/* The agent's handling of a long conversation with a scripted model: the tool sets a request is given and loads
 * (never fewer within a conversation, the system prompt the same throughout), older pictures let go a few at a time
 * without touching what the model wrote, pictures the author attaches reaching the model and the tools, a stopped
 * turn that cannot be redone, every tool with a name for the step list, and an MCP client leaving the selection be. */

import { beforeAll, describe, expect, it } from "vitest";
import { counterIds, DocStore, guessMeasurer, ops, stateOf } from "../core";
import { setGlobalLang } from "../i18n";
import { LABELED_TOOLS, toolLabel } from "../i18n/agentTools";
import { scriptedAdapter } from "../llm/testkit";
import type { LlmEvent, Message } from "../llm";
import { agentSetup, runTurn } from "./turn";
import { prunePictures, picturesIn } from "./pictures";
import { setOf, setsFor, TOOL_SETS } from "./toolsets";

beforeAll(() => setGlobalLang("en"));

const store = () => {
  const s = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  s.run(ops.addScreen, { id: "home", name: "Home" }, { origin: "user" });
  return s;
};
const call = (id: string, name: string, args: unknown) => ({ id, name, argsText: JSON.stringify(args) });
const names = (req: { tools?: { name: string }[] }) => (req.tools ?? []).map((t) => t.name);
const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("tool sets", () => {
  it("starts a plain request with the build set, and a dark-mode request with style and data", async () => {
    const a = scriptedAdapter([{ text: "ok" }]);
    await runTurn({ store: store(), adapter: a, history: [], request: "make a login screen", lang: "en" });
    const first = names(a.requests[0]);
    expect(first).toContain("add_tree");
    expect(first).toContain("load_tools");
    expect(first).not.toContain("set_theme");
    expect(first).not.toContain("align");
    const b = scriptedAdapter([{ text: "ok" }]);
    const r = await runTurn({ store: store(), adapter: b, history: [], request: "add a dark mode toggle", lang: "en" });
    expect(names(b.requests[0])).toEqual(expect.arrayContaining(["set_theme", "add_var", "set_action"]));
    expect(r.sets).toEqual(["build", "style", "data"]);
    expect(setsFor("做一个深色模式开关")).toEqual(expect.arrayContaining(["style", "data"]));
    expect(setsFor("replicate this", { attachments: 1 })).toEqual(expect.arrayContaining(["reference", "style", "generate"]));
  });

  it("loads a set mid-turn, keeps it for the next turn, and never changes the system prompt", async () => {
    const s = store();
    const a = scriptedAdapter([{ calls: [call("c1", "load_tools", { sets: ["layout"] })] }, { calls: [call("c2", "tidy_screen", { screen: "home" })] }, { text: "Tidied." }, { text: "Hello." }]);
    const r = await runTurn({ store: s, adapter: a, history: [], request: "make a login screen", lang: "en" });
    expect(names(a.requests[0])).not.toContain("tidy_screen");
    expect(names(a.requests[1])).toContain("tidy_screen");
    expect(r.sets).toEqual(["build", "layout"]);
    const next = await runTurn({ store: s, adapter: a, history: r.messages, request: "say hello", lang: "en", sets: r.sets });
    expect(next.stop).toBe("end_turn");
    /* the next turn sends exactly the tools the last request of the turn before sent */
    expect(names(a.requests[3])).toEqual(names(a.requests[2]));
    expect(new Set(a.requests.map((q) => q.system)).size).toBe(1);
    expect(a.requests[0].system).toContain("- layout:");
    expect(a.requests[0].system).toContain("tidy_screen");
  });

  it("puts every tool in a set, and names every one for the step list", () => {
    const { registry } = agentSetup({ canSee: true, canDraw: true, drawings: 2 });
    for (const t of registry.tools) {
      expect(TOOL_SETS).toContain(setOf(t));
      expect(LABELED_TOOLS, t.name).toContain(t.name);
    }
    expect(toolLabel("add_tree", "zh")).toBe("组合原子");
    expect(toolLabel("made_up_tool", "en")).toBe("Made up tool");
  });
});

describe("pictures in a long conversation", () => {
  const shot = (n: number): Message => ({ role: "tool", results: [{ callId: `c${n}`, name: "screenshot", content: [{ type: "text", text: `{"id":"s${n}"}` }, { type: "image", dataUrl: `${PNG}#${n}` }] }] });
  const thinking: Message = { role: "assistant", content: [{ type: "reasoning", text: "…", native: { type: "reasoning", encrypted_content: "opaque" } }, { type: "tool_call", id: "c", name: "screenshot", args: {}, argsText: "{}" }] };

  it("keeps all of up to six, then the last three, and leaves what the model wrote as it was", () => {
    const six = [thinking, ...Array.from({ length: 6 }, (_, i) => shot(i))];
    expect(prunePictures(six)).toBe(six);
    const seven = [...six, shot(6)];
    const pruned = prunePictures(seven);
    expect(picturesIn(pruned)).toBe(3);
    expect(pruned[0]).toBe(thinking);
    expect(JSON.stringify(pruned[1])).toContain("left out to save room");
    expect(pruned.at(-1)).toBe(seven.at(-1));
    /* once let go, the same conversation with one picture more is cut no further */
    const eight = [...pruned, shot(7)];
    expect(prunePictures(eight)).toBe(eight);
  });

  it("lets go of older screenshots within a turn, so each request starts as the one before it", async () => {
    const s = store();
    const renderer = { screenshot: async (id: string) => `${PNG}#${id}` };
    const turns = [...Array.from({ length: 9 }, (_, i) => ({ calls: [call(`c${i}`, "screenshot", { id: "home" })] })), { text: "Seen." }];
    const a = scriptedAdapter(turns);
    const r = await runTurn({ store: s, adapter: a, history: [], request: "look", lang: "en", renderer });
    expect(r.stop).toBe("end_turn");
    for (const q of a.requests) expect(picturesIn(q.messages)).toBeLessThanOrEqual(6);
    /* from one request to the next, the conversation sent changes only where pictures were let go, a few at a time */
    let breaks = 0;
    for (let i = 1; i < a.requests.length; i++) {
      const prev = JSON.stringify(a.requests[i - 1].messages);
      const now = JSON.stringify(a.requests[i].messages.slice(0, a.requests[i - 1].messages.length));
      if (prev !== now) breaks++;
    }
    expect(breaks).toBeLessThanOrEqual(2);
    expect(picturesIn(r.messages)).toBeLessThanOrEqual(6);
  });
});

describe("pictures the author attaches", () => {
  it("go to the model with the request, named, and the tools read them by id", async () => {
    const s = store();
    const attached = { id: "ref1", dataUrl: PNG, w: 1, h: 1, name: "chat.png" };
    const a = scriptedAdapter([{ calls: [call("c1", "describe_node", { id: "home" })] }, { text: "Built it." }]);
    const r = await runTurn({ store: s, adapter: a, history: [], request: "copy this", images: [attached], lang: "en", renderer: { screenshot: async () => PNG } });
    const first = a.requests[0].messages[0] as Extract<Message, { role: "user" }>;
    const parts = first.content as { type: string; text?: string; name?: string }[];
    expect(parts[0].text).toContain("ref1 (1×1 px)");
    expect(parts.find((p) => p.type === "image")?.name).toBe("the attached picture ref1");
    expect(names(a.requests[0])).toEqual(expect.arrayContaining(["sample_colors", "compare_to_reference"]));
    expect(r.sets).toContain("reference");
  });
});

describe("a stopped turn", () => {
  it("is discarded: redo has nothing to bring back", async () => {
    const s = store();
    const ac = new AbortController();
    const hang = (async function* () {
      yield { type: "text", delta: "Next…" } as LlmEvent;
      if (!ac.signal.aborted) await new Promise<void>((resolve) => ac.signal.addEventListener("abort", () => resolve(), { once: true }));
      yield { type: "error", error: new DOMException("aborted", "AbortError") } as LlmEvent;
    })();
    const base = scriptedAdapter([{ calls: [call("c1", "add_screen", { id: "login" })] }]);
    let n = 0;
    const adapter = { ...base, stream: (req: never, signal?: AbortSignal) => (n++ === 0 ? base.stream(req, signal) : hang) };
    const r = await runTurn({ store: s, adapter, history: [], request: "make a login screen", lang: "en", signal: ac.signal, onEvent: (e) => e.type === "text" && ac.abort() });
    expect(r.rolledBack).toBe(true);
    expect(s.canRedo()).toBe(false);
    expect(s.redo()).toBeNull();
    expect(s.get().doc.frames.map((f) => f.id)).toEqual(["home"]);
  });
});

describe("an MCP client", () => {
  it("changes the document without changing the person's selection", () => {
    const s = store();
    s.run(ops.addPart, { slug: "text", id: "mine", screen: "home" }, { origin: "user" });
    s.select(["mine"]);
    s.run(ops.addPart, { slug: "button", id: "theirs", screen: "home" }, { origin: "mcp" });
    expect(s.get().session.selection).toEqual(["mine"]);
    s.run(ops.removeNodes, { ids: ["mine"] }, { origin: "mcp" });
    expect(s.get().session.selection).toEqual([]);
    s.run(ops.addPart, { slug: "button", id: "ours", screen: "home" }, { origin: "ai" });
    expect(s.get().session.selection).toEqual(["ours"]);
  });
});
