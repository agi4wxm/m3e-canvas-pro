import { createElement, useContext, useState, type ReactNode } from "react";
import { componentOf } from "./components";
import { isInputNode } from "./inputNode";
import { isNode, isRaw, isWrap, type PNode, type PValue } from "./node";
import { PartHostContext } from "./widgets/host";

/** a prop value with its nodes turned into elements and its raw code dropped */
function value(v: PValue, controls: boolean, key?: string): unknown {
  if (isRaw(v)) return undefined;
  if (isWrap(v)) {
    const wrapper = componentOf(v.$wrap);
    return (element: ReactNode) => createElement(wrapper, { render: element });
  }
  if (isNode(v)) return renderNode(v, key, controls);
  if (Array.isArray(v)) return v.map((x, i) => value(x, controls, String(i)));
  if (typeof v === "object" && v !== null) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x, controls, k)]));
  return v;
}

/** a node's props as its component takes them */
function propsOf(node: PNode, controls: boolean, key?: string | number): Record<string, unknown> {
  const props: Record<string, unknown> = { key };
  for (const [k, v] of Object.entries(node.props ?? {})) {
    const out = value(v, controls, k);
    if (out !== undefined) props[k] = out;
  }
  return props;
}

const childrenOf = (node: PNode, controls: boolean) => (node.children ?? []).map((c, i) => renderNode(c, i, controls));

/** Draw a node with the real component it names (or the HTML tag). Every module the tree names has to be in first
 *  (components.ts `modulesOf`, `loadModules`): PartView sees to it. With `controls` (a part in the preview that holds
 *  an input, `PartDef.input`), the node the tree marks as that input (parts/inputNode.ts) is drawn controlled; everything
 *  else, and every part on the canvas, is drawn as the tree says. */
export function renderNode(node: PNode | string, key?: string | number, controls = false): ReactNode {
  if (typeof node === "string") return node;
  const shape = controls && isInputNode(node) ? SHAPES[node.type] : undefined;
  /* a control the tree already holds to a value (a read-only slider) stays as it is */
  if (shape && !(shape.prop in (node.props ?? {}))) return createElement(Controlled, { key, node, shape });
  return createElement(componentOf(node.type), propsOf(node, controls, key), ...childrenOf(node, controls));
}

/* ---------- inputs, controlled ---------- */

/** a value the visitor gave, as the part holds it: words, yes or no, a number, a choice's place in its list */
type Given = string | boolean | number;

/** How one kind of control is controlled. The tree sets where it starts (`defaultValue`, `defaultChecked`): that is the
 *  value the part is drawn with, in the form the control shows it, and controlled it goes in `prop`. What the visitor
 *  does comes back through `on`, as the control shows it (`shown`) and as the part's value (`given`). */
type Shape = {
  /** the starting prop the tree sets */
  start: string;
  /** the prop that holds the value, controlled */
  prop: string;
  /** what the control shows when the tree sets nothing: nothing typed, off, nothing chosen */
  empty: unknown;
  /** the callback the control calls with what the visitor did */
  on: string;
  /** what the visitor did, as the control shows it, from what the callback is called with */
  shown: (...args: unknown[]) => unknown;
  /** what the visitor did, as the part's value (the one `PartDef.input` declares); undefined when it is none */
  given: (node: PNode, shown: unknown) => Given | undefined;
};

/** the rows a choice offers, by the value each stands for (a select's `items`, a radio group's radios), in order */
function choicesOf(node: PNode): string[] {
  if (node.type === "Select") return Array.isArray(node.props?.items) ? node.props.items.map((row) => String((row as { value?: unknown } | null)?.value)) : [];
  const out: string[] = [];
  const visit = (n: PNode | string) => {
    if (typeof n === "string") return;
    if (n.type === "RadioGroupItem") out.push(String(n.props?.value));
    n.children?.forEach(visit);
  };
  node.children?.forEach(visit);
  return out;
}

const TEXT: Shape = {
  start: "defaultValue",
  prop: "value",
  empty: "",
  on: "onChange",
  shown: (event) => (event as { target?: { value?: unknown } } | undefined)?.target?.value,
  given: (_, shown) => (typeof shown === "string" ? shown : undefined),
};
const CHECKED: Shape = { start: "defaultChecked", prop: "checked", empty: false, on: "onCheckedChange", shown: (on) => !!on, given: (_, on) => !!on };
const CHOICE: Shape = {
  start: "defaultValue",
  prop: "value",
  /* base-ui's own "nothing chosen": undefined would leave the control to itself */
  empty: null,
  on: "onValueChange",
  shown: (v) => v ?? null,
  /* a choice is its row's place in the list (the part's `selected`), -1 for none */
  given: (node, v) => (v === null ? -1 : choicesOf(node).indexOf(String(v))),
};

/** By component: a TextField, an Input and a Textarea hold words; a Switch and a Checkbox yes or no; a Slider its thumbs,
 *  of which the part's value is the first; a RadioGroup and a Select the row chosen, by its words. */
const SHAPES: Record<string, Shape> = {
  TextField: TEXT,
  Input: TEXT,
  Textarea: TEXT,
  Switch: CHECKED,
  Checkbox: CHECKED,
  Slider: {
    start: "defaultValue",
    prop: "value",
    empty: [0],
    on: "onValueChange",
    shown: (v) => v,
    given: (_, v) => {
      const first = Array.isArray(v) ? v[0] : v;
      return typeof first === "number" && Number.isFinite(first) ? first : undefined;
    },
  },
  RadioGroup: CHOICE,
  Select: CHOICE,
};

/** the components an input node can be, to be drawn controlled */
export const CONTROLLABLE: ReadonlySet<string> = new Set(Object.keys(SHAPES));

/** two values a control shows are the same: a slider's thumbs come as a new list each time it is drawn */
const same = (a: unknown, b: unknown) => Object.is(a, b) || (Array.isArray(a) && Array.isArray(b) && JSON.stringify(a) === JSON.stringify(b));

/** An input drawn controlled. It shows the value the part is drawn with, which is what the host's state holds (the
 *  preview's `liveItem`), and hands what the visitor does to the host (`PartHost.input`), which takes it into that
 *  state and draws the part with it. A value that comes from elsewhere (an effect that sets the variable the input is
 *  bound to, a binding, a start over) is just the next value it is drawn with: nothing is drawn afresh.
 *
 *  What the visitor did shows at once, and stays until a value comes from elsewhere: a state that does not take it
 *  (letters in a field bound to a number, a field an expression decides) or takes only part of it (the second thumb of
 *  a range, whose value is the first) leaves the control as the visitor left it, as an uncontrolled one would. */
function Controlled({ node, shape }: { node: PNode; shape: Shape }) {
  const host = useContext(PartHostContext);
  const props = propsOf(node, true);
  const drawnWith = shape.start in props ? props[shape.start] : shape.empty;
  /* What the visitor last did: as the control shows it, as the part's value, and the value the part was drawn with
   * since. It stays while the part is drawn with that value, or with the one the visitor gave (the state took it: the
   * form the visitor left it in shows, the second thumb of a range where they put it); any other value is from
   * elsewhere, and ends it. */
  const [draft, setDraft] = useState<{ shown: unknown; given: Given; over: unknown } | null>(null);
  let held = false;
  if (draft && same(draft.over, drawnWith)) held = true;
  else if (draft && same(shape.given(node, drawnWith), draft.given)) {
    held = true;
    setDraft({ ...draft, over: drawnWith });
  } else if (draft) setDraft(null);
  /* a host that takes no value leaves the control to itself, as the canvas draws it */
  const take = host.input;
  if (take) {
    delete props[shape.start];
    props[shape.prop] = held && draft ? draft.shown : drawnWith;
    props[shape.on] = (...args: unknown[]) => {
      const shown = shape.shown(...args);
      const given = shape.given(node, shown);
      if (given === undefined) return;
      setDraft({ shown, given, over: drawnWith });
      take(given);
    };
  }
  return createElement(componentOf(node.type), props, ...childrenOf(node, true));
}
