import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { setGlobalLang } from "../lib/i18n";
import { PARTS, treeOf, viewOf } from "./registry";
import { componentOf, loadModules, modulesOf } from "./components";
import { isInputNode } from "./inputNode";
import { isNode, mapNodes, type PNode } from "./node";
import { inlineNode } from "./print";
import { CONTROLLABLE, renderNode } from "./render";
import { WIDGET_SOURCES } from "./widgets/sources";

/* A part's tree marks the control that holds its input, so the preview can draw that one controlled (parts/render.tsx).
 * The canvas and the printed code do not see the mark. */

setGlobalLang("en");

/** every node of a tree, the nodes its props hold among them */
function nodesOf(node: PNode, out: PNode[] = []): PNode[] {
  out.push(node);
  const visit = (v: unknown): void => {
    if (isNode(v)) nodesOf(v, out);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") Object.values(v).forEach(visit);
  };
  Object.values(node.props ?? {}).forEach(visit);
  for (const c of node.children ?? []) if (typeof c !== "string") nodesOf(c, out);
  return out;
}

/** the parts whose input a base-ui control of the tree holds: the rest are widgets, which hand theirs out through the
 *  part host, or draw it from the prop alone (a subscription's plans, chosen by a tap) */
const BUILT_IN = PARTS.filter((d) => d.input && nodesOf(treeOf(d)).some((n) => CONTROLLABLE.has(n.type)) && !nodesOf(treeOf(d)).some((n) => n.type in WIDGET_SOURCES));

/** every element of what renderNode draws, as React keeps it */
function elementsOf(node: ReactNode, out: ReactElement<Record<string, unknown>>[] = []): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) node.forEach((n) => elementsOf(n as ReactNode, out));
  else if (isValidElement<Record<string, unknown>>(node)) {
    out.push(node);
    for (const v of Object.values(node.props)) if (isValidElement(v) || Array.isArray(v)) elementsOf(v as ReactNode, out);
  }
  return out;
}

describe("the control that holds a part's input", () => {
  it("is marked in the tree the preview draws, for every part whose input a built-in control holds", () => {
    expect(BUILT_IN.map((d) => d.slug).sort()).toEqual(["checkbox", "input", "radio-group", "select", "slider", "switch", "text-field", "textarea"]);
    for (const def of BUILT_IN) {
      const marked = nodesOf(viewOf(def, undefined, undefined, undefined, true)).filter(isInputNode);
      expect(marked.length, def.slug).toBeGreaterThan(0);
      for (const n of marked) expect(CONTROLLABLE.has(n.type), `${def.slug}: ${n.type}`).toBe(true);
    }
  });

  it("is drawn controlled only in the preview: on the canvas it starts where the tree says, as before", async () => {
    for (const def of BUILT_IN) {
      const tree = viewOf(def, undefined, undefined, undefined, false);
      await loadModules(modulesOf(tree));
      const marked = nodesOf(tree).filter(isInputNode);
      const canvas = elementsOf(renderNode(tree));
      for (const n of marked) {
        const drawn = canvas.filter((e) => e.type === componentOf(n.type));
        expect(drawn.length, def.slug).toBeGreaterThan(0);
        for (const e of drawn) expect(e.props, def.slug).not.toHaveProperty(n.type === "Switch" || n.type === "Checkbox" ? "checked" : "value");
      }
      /* in the preview the marked node is drawn by the controlled wrapper, not as the bare component */
      const live = elementsOf(renderNode(tree, undefined, true));
      expect(live.some((e) => typeof e.type === "function" && e.type.name === "Controlled"), def.slug).toBe(true);
    }
  });

  it("is not printed: the code of every part is what it was without the mark", () => {
    for (const def of BUILT_IN) {
      const tree = treeOf(def);
      const bare = mapNodes(tree, (n) => {
        const { input: _input, ...rest } = n as PNode & { input?: true };
        return rest;
      });
      expect(nodesOf(tree).some(isInputNode), def.slug).toBe(true);
      expect(inlineNode(tree), def.slug).toBe(inlineNode(bare));
      expect(inlineNode(tree), def.slug).not.toMatch(/\binput=/);
    }
  });
});
