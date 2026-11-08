import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { setGlobalLang } from "../lib/i18n";
import { loadAllModules } from "./components";
import { defaultValues, partBySlug, reader, treeOf } from "./registry";
import { renderNode } from "./render";
import type { PNode } from "./node";

/* The places inside a part a tap can be sent from (report 5.4, 5.7 item 5): the parts with several buttons or links
 * each have one per button or link, and every place a part lists is marked in what it draws, so the preview and the
 * printed code can tell it apart from a tap on the whole part. */

beforeAll(async () => {
  vi.stubGlobal("window", { innerWidth: 1280, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  setGlobalLang("en");
  await loadAllModules();
});

const slotsOf = (slug: string, props: Record<string, unknown> = {}) => {
  const def = partBySlug(slug)!;
  return def.slots?.(reader(def, { ...defaultValues(def), ...props })).map((s) => s.key) ?? [];
};
const draw = (slug: string, props: Record<string, unknown> = {}) => {
  const def = partBySlug(slug)!;
  return renderToStaticMarkup(createElement("div", null, renderNode(treeOf(def, { ...defaultValues(def), ...props }))));
};
/** the places a part's tree marks, an overlay's closed content too (it is drawn only while open) */
const marked = (slug: string, props: Record<string, unknown> = {}): string[] => {
  const def = partBySlug(slug)!;
  const walk = (n: PNode | string | null | undefined | false): string[] => (!n || typeof n === "string" ? [] : [...(typeof n.props?.["data-tap"] === "string" ? [n.props["data-tap"] as string] : []), ...Object.values(n.props ?? {}).flatMap((v) => (v && typeof v === "object" && "type" in (v as object) ? walk(v as PNode) : [])), ...(n.children ?? []).flatMap((c) => walk(c as PNode))]);
  return walk(treeOf(def, { ...defaultValues(def), ...props }));
};

describe("the places of a part", () => {
  it("are one for each button or link it has", () => {
    expect(slotsOf("breadcrumb")).toEqual(["tab:0", "tab:1"]);
    expect(slotsOf("breadcrumb", { items: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }, { label: "E" }], collapse: true })).toEqual(["tab:0", "tab:3"]);
    expect(slotsOf("pagination")).toEqual(["previous", "tab:0", "tab:1", "tab:2", "tab:9", "next"]);
    expect(slotsOf("tree")).toEqual(["tab:0", "tab:1", "tab:2", "tab:3"]);
    expect(slotsOf("cascading-menu")).toEqual(["tab:0", "tab:1", "sub:0", "sub:1"]);
    expect(slotsOf("card", { action: "Open" })).toEqual(["action"]);
    expect(slotsOf("card")).toEqual([]);
    expect(slotsOf("empty")).toEqual(["action"]);
    expect(slotsOf("attachment", { remove: true })).toEqual(["remove"]);
    expect(slotsOf("action-sheet")).toEqual(["tab:0", "tab:1", "cancel"]);
    expect(slotsOf("sheet", { footer: true })).toEqual(["confirm", "dismiss"]);
    expect(slotsOf("drawer")).toEqual(["close"]);
  });

  it("are each marked where the part draws them", () => {
    const cases: [string, Record<string, unknown>][] = [
      ["breadcrumb", {}],
      ["pagination", {}],
      ["tree", {}],
      ["card", { action: "Open" }],
      ["empty", {}],
      ["attachment", { remove: true }],
      ["action-sheet", {}],
      ["sheet", { footer: true }],
      ["side-sheet", {}],
      ["drawer", {}],
    ];
    for (const [slug, props] of cases) {
      const out = marked(slug, props);
      for (const key of slotsOf(slug, props)) expect(out, `${slug} ${key}`).toContain(key);
    }
    /* drawn, a link or a button carries its place */
    expect(draw("breadcrumb")).toContain('data-tap="tab:0"');
  });

  it("take the words the author gives a sheet's buttons", () => {
    const out = JSON.stringify(treeOf(partBySlug("sheet")!, { ...defaultValues(partBySlug("sheet")!), footer: true, confirm: "Apply", dismiss: "Not now" }));
    expect(out).toContain("Apply");
    expect(out).toContain("Not now");
    expect(out).not.toContain('"Save"');
  });
});
