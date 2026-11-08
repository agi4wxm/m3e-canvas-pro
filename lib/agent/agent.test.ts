/* The agent's turn with a scripted model: tools run on the store, the turn is one undo step, stopping it takes
 * everything back, a failure is reported, the model is shown what it changed, and what it is told follows the
 * document's own strictness. */

import { beforeAll, describe, expect, it } from "vitest";
import { counterIds, DocStore, guessMeasurer, ops, savedDoc, stateOf } from "../core";
import { setGlobalLang } from "../i18n";
import { scriptedAdapter } from "../llm/testkit";
import type { LlmEvent, Message } from "../llm";
import { AiHttpError } from "../llm/errors";
import { diffDocs, runTurn, turnContext, type TurnEvent } from ".";

beforeAll(() => setGlobalLang("en"));

const store = () => {
  const s = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  s.run(ops.addScreen, { id: "home", name: "Home" }, { origin: "user" });
  return s;
};

const call = (id: string, name: string, args: unknown) => ({ id, name, argsText: JSON.stringify(args) });
const LOGIN = call("c1", "apply_ops", {
  ops: [
    { op: "add_screen", args: { id: "login", name: "Login" } },
    { op: "add_part", args: { slug: "box", id: "form", screen: "login", at: { x: 16, y: 120 } } },
    { op: "add_part", args: { slug: "text", id: "hi", into: { container: "form" }, props: { text: "Welcome back" } } },
  ],
});

describe("a turn of the agent", () => {
  it("runs the model's tools on the canvas as one undo step, and says what changed", async () => {
    const s = store();
    const steps = s.history().length;
    const adapter = scriptedAdapter([{ text: "I'll add a login screen.", calls: [LOGIN] }, { calls: [call("c2", "set_props", { id: "hi", props: { text: "Sign in" } })] }, { text: "Added a login screen." }]);
    const events: TurnEvent[] = [];
    const r = await runTurn({ store: s, adapter, history: [], request: "make a login screen", lang: "en", onEvent: (e) => events.push(e) });
    expect(r.stop).toBe("end_turn");
    expect(r.text).toBe("Added a login screen.");
    expect(s.get().doc.frames.map((f) => f.id)).toEqual(["home", "login"]);
    expect(s.history().length).toBe(steps + 1);
    expect(r.step).toEqual({ label: "AI: make a login screen", depth: steps + 1 });
    expect(r.changed).toBe(true);
    expect(r.diff.screens.added.map((x) => x.id)).toEqual(["login"]);
    expect(r.diff.nodes.added.map((x) => x.id).sort()).toEqual(["form", "hi"]);
    expect(r.usage.input).toBeGreaterThan(0);
    expect(events.filter((e) => e.type === "tool_end").map((e) => (e as { ok: boolean }).ok)).toEqual([true, true]);
    /* one undo takes the whole turn back */
    s.undo();
    expect(s.get().doc.frames.map((f) => f.id)).toEqual(["home"]);
    expect(s.get().doc.groups).toEqual([]);
    /* the conversation goes on from here: the request with its context, the calls and their results */
    expect(r.messages[0].role).toBe("user");
    expect(String((r.messages[0] as { content: string }).content)).toContain("<context>");
    expect(r.messages.filter((m) => m.role === "tool")).toHaveLength(2);
  });

  it("leaves no step when nothing changed", async () => {
    const s = store();
    const steps = s.history().length;
    const r = await runTurn({ store: s, adapter: scriptedAdapter([{ calls: [call("c1", "get_outline", {})] }, { text: "There is one empty screen." }]), history: [], request: "what is here?", lang: "en" });
    expect(r.changed).toBe(false);
    expect(r.step).toBeUndefined();
    expect(s.history().length).toBe(steps);
  });

  it("hands a failed call back to the model, which can try again", async () => {
    const s = store();
    const adapter = scriptedAdapter([{ calls: [call("c1", "set_props", { id: "ghost", props: {} })] }, { text: "That part does not exist." }]);
    const r = await runTurn({ store: s, adapter, history: [], request: "x", lang: "en" });
    const tool = r.messages.find((m) => m.role === "tool") as Extract<Message, { role: "tool" }>;
    expect(tool.results[0].isError).toBe(true);
    expect(JSON.parse((tool.results[0].content[0] as { text: string }).text)).toMatchObject({ code: "not_found" });
  });

  it("takes back everything when it is stopped mid-turn, and forgets the turn", async () => {
    const s = store();
    const before = savedDoc(s.get());
    const steps = s.history().length;
    const ac = new AbortController();
    /* the second model call never ends on its own: the author presses stop while it streams */
    const hang = (async function* () {
      yield { type: "text", delta: "Now the form…" } as LlmEvent;
      if (!ac.signal.aborted) await new Promise<void>((resolve) => ac.signal.addEventListener("abort", () => resolve(), { once: true }));
      yield { type: "error", error: new DOMException("aborted", "AbortError") } as LlmEvent;
    })();
    const base = scriptedAdapter([{ calls: [LOGIN] }]);
    let n = 0;
    const adapter = { ...base, stream: (req: never, signal?: AbortSignal) => (n++ === 0 ? base.stream(req, signal) : hang) };
    const history: Message[] = [{ role: "user", content: "earlier" }, { role: "assistant", content: [{ type: "text", text: "ok" }] }];
    const running = runTurn({ store: s, adapter, history, request: "make a login screen", lang: "en", signal: ac.signal, onEvent: (e) => e.type === "text" && ac.abort() });
    const r = await running;
    expect(r.stop).toBe("aborted");
    expect(r.rolledBack).toBe(true);
    expect(savedDoc(s.get())).toEqual(before);
    expect(s.history().length).toBe(steps);
    expect(r.messages).toBe(history);
  });

  it("reports a provider's failure and keeps what was done as one step", async () => {
    const s = store();
    const adapter = scriptedAdapter([{ calls: [LOGIN] }, { error: new AiHttpError(429, "429: slow down") }]);
    const r = await runTurn({ store: s, adapter, history: [], request: "make a login screen", lang: "en" });
    expect(r.stop).toBe("error");
    expect(r.error).toBeInstanceOf(AiHttpError);
    expect(r.step).toBeDefined();
    s.undo();
    expect(s.get().doc.frames.map((f) => f.id)).toEqual(["home"]);
  });

  it("shows the model the screens it changed when it did not look, once", async () => {
    const s = store();
    const shots: string[] = [];
    const renderer = { screenshot: async (id: string) => (shots.push(id), `data:image/png;base64,${id}`) };
    const adapter = scriptedAdapter([{ calls: [LOGIN] }, { text: "Done." }, { calls: [call("c3", "set_props", { id: "hi", props: { text: "Hello again" } })] }, { text: "Fixed the title." }]);
    const events: TurnEvent[] = [];
    const r = await runTurn({ store: s, adapter, history: [], request: "make a login screen", lang: "en", renderer, onEvent: (e) => events.push(e) });
    expect(shots).toEqual(["login"]);
    expect(events.some((e) => e.type === "review")).toBe(true);
    const review = adapter.requests[2].messages.at(-1)!;
    expect(review.role).toBe("user");
    expect((review as { content: { type: string }[] }).content.some((p) => p.type === "image")).toBe(true);
    expect(r.text).toBe("Fixed the title.");
    expect(adapter.requests).toHaveLength(4);
  });

  it("does not show again what the model already looked at", async () => {
    const s = store();
    const renderer = { screenshot: async () => "data:image/png;base64,AA" };
    const adapter = scriptedAdapter([{ calls: [LOGIN] }, { calls: [call("c2", "screenshot", { id: "login" })] }, { text: "Looks right." }]);
    const r = await runTurn({ store: s, adapter, history: [], request: "make a login screen", lang: "en", renderer });
    expect(adapter.requests).toHaveLength(3);
    expect(r.text).toBe("Looks right.");
  });

  it("stops at its step cap", async () => {
    const s = store();
    const loop = Array.from({ length: 5 }, (_, i) => ({ calls: [call(`c${i}`, "get_outline", {})] }));
    const r = await runTurn({ store: s, adapter: scriptedAdapter(loop), history: [], request: "x", lang: "en", maxSteps: 3 });
    expect(r.stop).toBe("max_steps");
    expect(r.steps).toBe(3);
  });

  it("writes at most two styles in a turn, and tells the model why the third is refused", async () => {
    const s = store();
    const writer = scriptedAdapter([{ text: JSON.stringify({ key: "custom:paper", name: "Paper", extends: "notion" }) }, { text: JSON.stringify({ key: "custom:paper", name: "Paper", extends: "notion", light: { primary: "#123456" } }) }]);
    const adapter = scriptedAdapter([
      { calls: [call("c1", "generate_style", { description: "paper" })] },
      { calls: [call("c2", "generate_style", { refine: "custom:paper", feedback: "bluer" })] },
      { calls: [call("c3", "generate_style", { description: "ink" })] },
      { text: "Done." },
    ]);
    const ends: Extract<TurnEvent, { type: "tool_end" }>[] = [];
    const r = await runTurn({ store: s, adapter, history: [], request: "generate a warm paper style", lang: "en", gen: { settings: { provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-6.1-sol", key: "k" }, adapter: writer }, onEvent: (e) => e.type === "tool_end" && ends.push(e) });
    expect(r.stop).toBe("end_turn");
    expect(ends.map((e) => e.ok), ends.map((e) => e.summary).join(" / ")).toEqual([true, true, false]);
    expect(ends[2].summary).toContain("No more styles");
    expect(writer.requests).toHaveLength(2);
    expect(adapter.requests[0].system).toContain("generate_style runs at most 2 times in a turn");
    expect(JSON.stringify(adapter.requests[3].messages.at(-1))).toContain("add_custom_style");
  });

  it("takes back a turn the author edited in, both of its changes, and keeps the author's", async () => {
    const s = store();
    const adapter = scriptedAdapter([
      { calls: [call("c1", "add_screen", { id: "a" })] },
      (req) => {
        /* the author changes something while the model thinks */
        s.run(ops.addPart, { slug: "text", id: "mine", screen: "home" }, { origin: "user" });
        void req;
        return { calls: [call("c2", "add_screen", { id: "b" })] };
      },
      { text: "Two screens." },
    ]);
    const r = await runTurn({ store: s, adapter, history: [], request: "two screens", lang: "en" });
    /* one undo step would take back only the second screen: the turn offers none, and a way to take it back whole */
    expect(r.step).toBeUndefined();
    expect(r.takeBack).toBeDefined();
    const back = r.takeBack!.run();
    expect(back).toMatchObject({ outcome: "full", authorEdited: true });
    expect(s.get().doc.frames.map((f) => f.id)).toEqual(["home"]);
    expect(s.get().doc.groups.some((g) => g.items[0].id === "mine")).toBe(true);
    /* nothing of the turn comes back with undo or redo; undo takes back the author's own part */
    expect(s.redo()).toBeNull();
    s.undo();
    expect(s.get().doc.frames.map((f) => f.id)).toEqual(["home"]);
    expect(s.get().doc.groups).toEqual([]);
  });
});

describe("what the agent is told", () => {
  it("tells a document held to its style exactly what survives", () => {
    const s = store();
    s.run(ops.applyStyle, { style: "ios" }, { origin: "user" });
    const text = turnContext({ doc: savedDoc(s.get()), widths: {}, selection: [], frameId: null, lang: "zh" });
    expect(text).toContain("held to its style's rules");
    expect(text).toContain("opacity, rotate, transform, blur, blend, elevation");
    expect(text).toContain("Simplified Chinese");
  });

  it("leaves every look field open on a document not held to its style", () => {
    const s = store();
    s.run(ops.applyStyle, { style: "ios" }, { origin: "user" });
    s.run(ops.setRules, { on: false }, { origin: "user" });
    const text = turnContext({ doc: savedDoc(s.get()), widths: {}, selection: [], frameId: null, lang: "en" });
    expect(text).toContain("not held to its rules");
    expect(text).not.toContain("survive");
  });

  it("names the selection, and shortens a long outline", () => {
    const s = store();
    s.transact("many", "user", (tx) => {
      for (let i = 0; i < 120; i++) tx.run(ops.addPart, { slug: "text", id: `t${i}`, screen: "home", at: { x: 16, y: 40 + i * 6 }, props: { text: `Line number ${i} with some words` } });
    });
    s.select(["t3"]);
    const text = turnContext({ doc: savedDoc(s.get()), widths: guessMeasurer.measure(s.get()), selection: ["t3"], frameId: null, lang: "en" });
    expect(text).toContain("Selected: t3 (text");
    expect(text.length).toBeLessThan(11000);
  });

  it("says what a turn changed, apart from what only moved", () => {
    const s = store();
    s.run(ops.addPart, { slug: "text", id: "a", screen: "home", at: { x: 10, y: 10 } }, { origin: "user" });
    s.run(ops.addPart, { slug: "text", id: "b", screen: "home", at: { x: 10, y: 100 } }, { origin: "user" });
    const before = savedDoc(s.get());
    s.run(ops.setProps, { id: "a", props: { text: "Changed" } }, { origin: "ai" });
    s.run(ops.moveNode, { id: "b", x: 40, y: 200, screen: "home" }, { origin: "ai" });
    s.run(ops.setTitle, { title: "T" }, { origin: "ai" });
    const d = diffDocs(before, savedDoc(s.get()));
    expect(d.nodes.changed.map((n) => n.id)).toEqual(["a"]);
    expect(d.nodes.moved).toBe(1);
    expect(d.doc).toEqual(["title"]);
  });
});
