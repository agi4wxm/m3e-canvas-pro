/**
 * listRowsPatch — a row's tap target and the part's chosen entry go with the row.
 *
 * Locks in:
 *  - moving a row moves its `tab:N` action and the selection with it
 *  - removing a row drops its action and renumbers the later ones
 *  - slots that are not rows, and lists that are not the slots, are left alone
 */
import { describe, expect, it } from "vitest";

import { Action, Item, listRowsPatch, makeItem } from "./tokens";

const to = (id: string): Action => ({ to: id });
const rows = (...labels: string[]) => labels.map((label) => ({ label }));
const part = (slug: string, props: Record<string, unknown>, actions?: Item["actions"]): Item => ({ ...makeItem(slug), id: "p", props, actions });
const bar = (selected?: number) =>
  part("navigation-bar", { items: rows("A", "B", "C"), ...(selected === undefined ? {} : { selected }) }, { "tab:0": to("a"), "tab:2": to("c") });

describe("listRowsPatch on reorder", () => {
  it("moves each row's tap target to the row's new place", () => {
    /* C, A, B: the old row 2 is now first and the old row 0 second */
    const patch = listRowsPatch(bar(), "items", rows("C", "A", "B"), [2, 0, 1]);
    expect(patch.props?.items).toEqual(rows("C", "A", "B"));
    expect(patch.actions).toEqual({ "tab:1": to("a"), "tab:0": to("c") });
  });

  it("moves the selection with the chosen row", () => {
    expect(listRowsPatch(bar(2), "items", rows("C", "A", "B"), [2, 0, 1]).props?.selected).toBe(0);
    expect(listRowsPatch(bar(1), "items", rows("C", "A", "B"), [2, 0, 1]).props?.selected).toBe(2);
  });

  it("follows the part's default selection when the author never set one", () => {
    expect(listRowsPatch(bar(), "items", rows("B", "A", "C"), [1, 0, 2]).props?.selected).toBe(1);
  });

  it("does not change the item it was given", () => {
    const item = bar(1);
    const before = JSON.stringify(item);
    listRowsPatch(item, "items", rows("C", "A", "B"), [2, 0, 1]);
    expect(JSON.stringify(item)).toBe(before);
  });
});

describe("listRowsPatch on remove", () => {
  it("drops the removed row's tap target and renumbers the later ones", () => {
    const patch = listRowsPatch(bar(), "items", rows("B", "C"), [1, 2]);
    expect(patch.actions).toEqual({ "tab:1": to("c") });
  });

  it("clears the actions once none is left", () => {
    const item = part("navigation-bar", { items: rows("A", "B", "C") }, { "tab:1": to("b") });
    expect(listRowsPatch(item, "items", rows("A", "C"), [0, 2]).actions).toBeUndefined();
  });

  it("moves the selection up when an earlier row goes, and keeps it on what takes a removed row's place", () => {
    expect(listRowsPatch(bar(2), "items", rows("B", "C"), [1, 2]).props?.selected).toBe(1);
    expect(listRowsPatch(bar(1), "items", rows("A", "C"), [0, 2]).props?.selected).toBe(1);
    expect(listRowsPatch(bar(2), "items", rows("A", "B"), [0, 1]).props?.selected).toBe(1);
  });
});

describe("listRowsPatch on a part with no slots", () => {
  const radio = (selected?: number) => part("radio-group", { items: rows("A", "B", "C"), ...(selected === undefined ? {} : { selected }) });

  it("moves the selection with its row", () => {
    expect(listRowsPatch(radio(2), "items", rows("C", "A", "B"), [2, 0, 1]).props?.selected).toBe(0);
    expect(listRowsPatch(radio(0), "items", rows("B", "A", "C"), [1, 0, 2]).props?.selected).toBe(1);
  });

  it("keeps it on what takes a removed row's place", () => {
    expect(listRowsPatch(radio(1), "items", rows("A", "C"), [0, 2]).props?.selected).toBe(1);
    expect(listRowsPatch(radio(2), "items", rows("A", "B"), [0, 1]).props?.selected).toBe(1);
  });

  it("follows the part's default when the author never set one", () => {
    expect(listRowsPatch(radio(), "items", rows("B", "A", "C"), [1, 0, 2]).props?.selected).toBe(0);
    expect(listRowsPatch(radio(), "items", rows("C", "B", "A"), [2, 1, 0]).props).not.toHaveProperty("selected");
  });

  it("leaves a part that has chosen nothing with nothing chosen", () => {
    const select = part("select", { items: rows("A", "B"), selected: -1 });
    expect(listRowsPatch(select, "items", rows("B", "A"), [1, 0]).props?.selected).toBe(-1);
  });

  it("never touches the actions", () => {
    const item = part("radio-group", { items: rows("A", "B") }, { "tab:0": to("a") });
    expect(listRowsPatch(item, "items", rows("B", "A"), [1, 0])).not.toHaveProperty("actions");
  });
});

describe("listRowsPatch leaves alone", () => {
  it("every target and the selection when a row is only edited or added at the end", () => {
    const edited = listRowsPatch(bar(1), "items", rows("A", "Bee", "C"), [0, 1, 2]);
    expect(edited.actions).toEqual({ "tab:0": to("a"), "tab:2": to("c") });
    expect(edited.props?.selected).toBe(1);
    const added = listRowsPatch(bar(1), "items", rows("A", "B", "C", "D"), [0, 1, 2, -1]);
    expect(added.actions).toEqual({ "tab:0": to("a"), "tab:2": to("c") });
    expect(added.props?.selected).toBe(1);
  });

  it("a selection the author never set, when nothing moved it", () => {
    expect(listRowsPatch(bar(), "items", rows("Ay", "B", "C"), [0, 1, 2]).props).not.toHaveProperty("selected");
  });

  it("slots that are not rows", () => {
    const item = part("search", { kind: "view", results: rows("A", "B") }, { icon: to("x"), "tab:1": to("b") });
    expect(listRowsPatch(item, "results", rows("B", "A"), [1, 0]).actions).toEqual({ icon: to("x"), "tab:0": to("b") });
  });

  it("a slot past the rows, which keeps its distance from their end", () => {
    const item = part("dropdown-menu", { items: rows("A", "B"), destructive: "Delete" }, { "tab:2": to("gone") });
    expect(listRowsPatch(item, "items", rows("B"), [1]).actions).toEqual({ "tab:1": to("gone") });
    expect(listRowsPatch(item, "items", rows("A", "B", "C"), [0, 1, -1]).actions).toEqual({ "tab:3": to("gone") });
  });

  it("the actions and the selection when the list is not the part's slots", () => {
    const item = part("cascading-menu", { subItems: rows("A", "B") }, { "tab:0": to("a") });
    const patch = listRowsPatch(item, "subItems", rows("B", "A"), [1, 0]);
    expect(patch.props?.subItems).toEqual(rows("B", "A"));
    expect(patch).not.toHaveProperty("actions");
  });
});
