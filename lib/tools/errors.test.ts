/* Cheaper argument errors: the names a model reaches for first read as meant (an app bar's `leading` tap is its `icon`
 * place, a button's `text` is its label), a failed batch says which operations failed and that the rest were fine,
 * and an error names what a prop takes once, not twice. */

import { beforeAll, describe, expect, it } from "vitest";
import { counterIds, DocStore, guessMeasurer, schemaError, stateOf } from "../core";
import { setGlobalLang } from "../i18n";
import { executeTool, type ToolOutcome } from ".";
import { propsAliased, slotAlias } from "./aliases";

beforeAll(() => setGlobalLang("en"));

const fresh = () => new DocStore(stateOf({ groups: [], frames: [{ id: "F1", name: "Home", x: 0, y: 0 }, { id: "F2", name: "Cart", x: 500, y: 0 }] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
const run = (s: DocStore, name: string, args: unknown) => executeTool(s, name, args, { origin: "ai" });
const ok = (o: ToolOutcome) => {
  if (!o.ok) throw new Error(`${o.error.code} ${o.error.message}`);
  return o.result as Record<string, unknown>;
};
const item = (s: DocStore, id: string) => s.get().doc.groups.flatMap((g) => g.items).find((it) => it.id === id);

describe("aliases", () => {
  it("read an app bar's leading and trailing taps as its icon places", async () => {
    const s = fresh();
    ok(await run(s, "add_part", { slug: "app-bar", id: "bar", screen: "F2", props: { title: "Cart", leading: "arrow_back", trailing: "more_vert" } }));
    ok(await run(s, "set_item", { id: "bar", patch: { actions: { leading: { to: "F1" } } } }));
    expect(Object.keys(item(s, "bar")!.actions ?? {})).toEqual(["icon"]);
    ok(await run(s, "set_action", { id: "bar", slot: "trailing", action: { to: "back" } }));
    expect(Object.keys(item(s, "bar")!.actions ?? {}).sort()).toEqual(["icon", "icon2"]);
  });

  it("read a row by its number or its words, inside a batch too", async () => {
    const s = fresh();
    const out = await run(s, "apply_ops", {
      ops: [
        { op: "add_part", args: { slug: "navigation-bar", id: "nav", screen: "F1", props: { items: [{ label: "Home", icon: "home" }, { label: "Cart", icon: "shopping_cart" }, { label: "Me", icon: "person" }] } } },
        { op: "set_item", args: { id: "nav", patch: { actions: { Home: { to: "F1" } } } } },
        { op: "set_action", args: { id: "nav", slot: "1", action: { to: "F2" } } },
      ],
    });
    ok(out);
    expect(Object.keys(item(s, "nav")!.actions ?? {}).sort()).toEqual(["tab:0", "tab:1"]);
  });

  it("read the one part an operation is about however it is given: a list of one, another name, the selection", async () => {
    const s = fresh();
    ok(await run(s, "add_part", { slug: "transaction-list", id: "group", screen: "F1" }));
    /* the batch dark-mode-switch sent in the evaluation: split_into_atoms with ids */
    const split = ok(await run(s, "apply_ops", { ops: [{ op: "split_into_atoms", args: { ids: ["group"] } }] }));
    expect(split.ran).toBe(1);
    expect(item(s, "group")?.component).not.toBe("transaction-list");
    ok(await run(s, "add_part", { slug: "button", id: "b1", screen: "F1" }));
    ok(await run(s, "set_props", { itemId: "b1", props: { label: "Go" } }));
    expect(item(s, "b1")!.props?.label).toBe("Go");
    ok(await run(s, "remove_nodes", { id: "b1" }));
    expect(item(s, "b1")).toBeUndefined();
    /* "split this": the one part selected */
    ok(await run(s, "add_part", { slug: "transaction-list", id: "g2", screen: "F1" }));
    s.select(["g2"]);
    ok(await run(s, "split_into_atoms", {}));
    expect(item(s, "g2")?.component).not.toBe("transaction-list");
    /* nothing selected and nothing given is refused with what to give */
    s.select([]);
    const none = await run(s, "split_into_atoms", {});
    expect(!none.ok && none.error.message).toMatch(/id is required/);
    /* a name for a new part is not a part to find */
    const named = await run(s, "add_part", { slug: "button", part: "x", screen: "F1" });
    expect(!named.ok && named.error.message).toMatch(/args\.part is not an argument/);
  });

  it("leave a place that is not near anything for the operation to refuse", async () => {
    const s = fresh();
    ok(await run(s, "add_part", { slug: "app-bar", id: "bar", screen: "F1" }));
    const out = await run(s, "set_item", { id: "bar", patch: { actions: { banana: { to: "F2" } } } });
    expect(out.ok).toBe(false);
    expect(slotAlias({ component: "app-bar", props: {} }, "icon")).toBeUndefined();
  });

  it("read the prop names models guess as the part's own", async () => {
    expect(propsAliased("button", { text: "Pay" })).toEqual({ label: "Pay" });
    expect(propsAliased("image", { url: "data:image/png;base64,AA==" })).toEqual({ src: "data:image/png;base64,AA==" });
    /* the real name wins when both are given, and a name the part has stays */
    expect(propsAliased("button", { text: "A", label: "B" })).toEqual({ text: "A", label: "B" });
    expect(propsAliased("text", { text: "Hi" })).toEqual({ text: "Hi" });
    const s = fresh();
    ok(await run(s, "add_tree", { screen: "F1", tree: { part: "box", props: { layout: "column" }, children: [{ part: "button", id: "pay", props: { text: "Pay" } }, { part: "icon", id: "ic", props: { icon: "home" } }] } }));
    expect(item(s, "pay")!.props?.label).toBe("Pay");
    expect(item(s, "ic")!.props?.name).toBe("home");
  });
});

describe("a failed batch", () => {
  it("lists every operation that failed, says the rest were fine, and changes nothing", async () => {
    const s = fresh();
    const before = s.get().doc;
    const out = await run(s, "apply_ops", {
      ops: [
        { op: "add_part", args: { slug: "box", id: "col", screen: "F1", props: { layout: "column" } } },
        { op: "add_part", args: { slug: "box", into: { container: "col" }, props: { surface: "tonal" } } },
        { op: "add_part", args: { slug: "text", into: { container: "col" }, props: { text: "Hi" } } },
        { op: "add_part", args: { slug: "avatar", into: { container: "col" }, props: { size: 32 } } },
      ],
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.message).toMatch(/2 of the 4 operations failed/);
    expect(out.error.message).toMatch(/ops\[1\] \(add_part\): box\.surface should be one of/);
    expect(out.error.message).toMatch(/ops\[3\] \(add_part\): avatar\.size should be one of "sm", "default", "lg", not a number/);
    expect(out.error.hint).toMatch(/other 2 operations are fine: change only those/);
    expect(s.get().doc).toBe(before);
  });

  it("names the one that failed alone the way it always has", async () => {
    const s = fresh();
    const out = await run(s, "apply_ops", { ops: [{ op: "add_part", args: { slug: "text", screen: "F1" } }, { op: "set_props", args: { id: "nope", props: {} } }] });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe("not_found");
    expect(out.error.message).toMatch(/^ops\[1\] \(set_props\) failed, so none of the 2 operations ran/);
    expect(out.error.hint).toMatch(/other 1 operation is fine: change only ops\[1\]/);
  });
});

describe("error words", () => {
  it("name an enum's choices once, with the nearest", async () => {
    const s = fresh();
    const out = await run(s, "add_part", { slug: "avatar", screen: "F1", props: { size: "large" } });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.message).toBe('avatar.size should be one of "sm", "default", "lg" ("lg" is the nearest).');
    expect(out.error.message.match(/"sm"/g)).toHaveLength(1);
  });

  it("do not spell out a long list the schema already has", () => {
    const e = schemaError({ type: "string", enum: Array.from({ length: 40 }, (_, i) => `op_${i}`).concat("add_part") }, "addPart", "args.ops[0].op");
    expect(e).toBe('args.ops[0].op "addPart" is not one of the 41 values the schema lists; the nearest is "add_part"');
    expect(schemaError({ type: "string", enum: ["a", "b"] }, "c", "x")).toBe('x should be one of "a", "b"');
  });
});
