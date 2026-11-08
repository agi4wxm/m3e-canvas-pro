import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { setGlobalLang } from "../lib/i18n";
import { loadAllModules } from "./components";
import { ARIA_LABEL } from "./a11y";
import { PARTS, defaultValues, partBySlug, treeOf } from "./registry";
import { renderNode } from "./render";
import type { PartDef } from "./types";
import { moveTo } from "./widgets/roving";

/* The accessibility contract every part keeps (docs/组件规范.md "无障碍"), checked on the markup each part draws: every
 * control can be named and is named once it is, no control is called by an icon's Material Symbols name, a group that
 * declares a role is one stop in the Tab order, and an input offers a way to be named. A part that breaks it fails here
 * the moment it is in PARTS. */

beforeAll(async () => {
  vi.stubGlobal("window", { innerWidth: 1280, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  setGlobalLang("en");
  await loadAllModules();
});

/* ---------- a small reader of the markup a part draws ----------
 * React writes well-formed markup, so a tag reader is enough: attributes always quoted, no scripts. */

type El = { tag: string; attrs: Record<string, string>; kids: (El | string)[]; parent?: El };

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'", nbsp: " " };
const unescape = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => ENTITIES[e.toLowerCase()] ?? (e.startsWith("#x") ? String.fromCodePoint(parseInt(e.slice(2), 16)) : e.startsWith("#") ? String.fromCodePoint(Number(e.slice(1))) : m));

/** the markup as a tree under a root of its own */
function parseMarkup(html: string): El {
  const root: El = { tag: "#root", attrs: {}, kids: [] };
  let at = root;
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
  for (const m of html.matchAll(re)) {
    if (m[0].startsWith("<!--")) continue;
    if (m[1]) {
      /* a closing tag closes the nearest open element of its name; one with none open is left alone */
      let open: El | undefined = at;
      while (open && open !== root && open.tag !== m[1].toLowerCase()) open = open.parent;
      if (open && open !== root) at = open.parent!;
    } else if (m[2]) {
      const attrs: Record<string, string> = {};
      for (const a of (m[3] ?? "").matchAll(/([^\s=>/]+)(?:="([^"]*)")?/g)) attrs[a[1].toLowerCase()] = unescape(a[2] ?? "");
      const el: El = { tag: m[2].toLowerCase(), attrs, kids: [], parent: at };
      at.kids.push(el);
      if (!VOID.has(el.tag) && !m[4]) at = el;
    } else if (m[5]) at.kids.push(unescape(m[5]));
  }
  return root;
}

const all = (el: El): El[] => el.kids.flatMap((k) => (typeof k === "string" ? [] : [k, ...all(k)]));

/** whether an element is kept from a screen reader: it or one around it is aria-hidden, or hidden */
const hidden = (el: El | undefined): boolean => {
  for (let at = el; at; at = at.parent) if (at.attrs["aria-hidden"] === "true" || "hidden" in at.attrs || /display:\s*none/.test(at.attrs.style ?? "")) return true;
  return false;
};

/** the words inside an element a screen reader reads (what is hidden from it left out) */
function textOf(el: El): string {
  if (el.attrs["aria-hidden"] === "true") return "";
  if (el.attrs["aria-label"]) return el.attrs["aria-label"];
  return el.kids.map((k) => (typeof k === "string" ? k : textOf(k))).join("").replace(/\s+/g, " ").trim();
}

const ROLE_OF: Record<string, string> = { button: "button", select: "combobox", textarea: "textbox", a: "link" };

/** the role an element plays, its own or its tag's */
function roleOf(el: El): string | undefined {
  if (el.attrs.role) return el.attrs.role;
  if (el.tag === "input") {
    const t = el.attrs.type ?? "text";
    return t === "hidden" ? undefined : t === "checkbox" ? "checkbox" : t === "radio" ? "radio" : t === "range" ? "slider" : t === "button" || t === "submit" ? "button" : "textbox";
  }
  return el.tag === "a" && !("href" in el.attrs) ? undefined : ROLE_OF[el.tag];
}

/** the roles a person operates, each of which must have a name */
const CONTROL_ROLES = new Set(["button", "checkbox", "switch", "radio", "slider", "tab", "option", "menuitem", "menuitemcheckbox", "menuitemradio", "combobox", "textbox", "searchbox", "spinbutton", "link"]);

/** the roles that take their name from their words */
const NAMED_BY_WORDS = new Set(["button", "checkbox", "switch", "radio", "tab", "option", "menuitem", "menuitemcheckbox", "menuitemradio", "link"]);

/** What a screen reader calls a control, as the markup says: its aria-label, the words of what it is labelled by, the
 *  label that names it or holds it, its own words where its role reads them, its title, an input's placeholder. */
function nameOf(el: El, root: El): string {
  if (el.attrs["aria-label"]?.trim()) return el.attrs["aria-label"].trim();
  const by = el.attrs["aria-labelledby"];
  if (by) {
    const ids = new Map(all(root).map((e) => [e.attrs.id, e]));
    const words = by.split(/\s+/).map((id) => (ids.get(id) ? textOf(ids.get(id)!) : "")).join(" ").trim();
    if (words) return words;
  }
  const id = el.attrs.id;
  if (id) {
    const label = all(root).find((e) => e.tag === "label" && e.attrs.for === id);
    if (label && textOf(label)) return textOf(label);
  }
  for (let at = el.parent; at; at = at.parent) if (at.tag === "label" && textOf(at)) return textOf(at);
  const role = roleOf(el);
  if (role && NAMED_BY_WORDS.has(role) && textOf({ ...el, attrs: { ...el.attrs, "aria-label": "" } })) return textOf({ ...el, attrs: { ...el.attrs, "aria-label": "" } });
  return el.attrs.title?.trim() || el.attrs.placeholder?.trim() || "";
}

/** whether an element is a stop in the Tab order */
function tabStop(el: El): boolean {
  const t = el.attrs.tabindex;
  if (t !== undefined) return Number(t) >= 0;
  if ("disabled" in el.attrs) return false;
  return el.tag === "button" || el.tag === "select" || el.tag === "textarea" || (el.tag === "input" && el.attrs.type !== "hidden") || (el.tag === "a" && "href" in el.attrs);
}

/* ---------- the contract ---------- */

const markup = (d: PartDef, props: Record<string, unknown> = {}) => parseMarkup(renderToStaticMarkup(createElement("div", null, renderNode(treeOf(d, { ...defaultValues(d), ...props })))));

/** the groups a role declares and the roles of the items the arrows move through */
const GROUPS: Record<string, string[]> = { radiogroup: ["radio"], tablist: ["tab"], listbox: ["option"], menu: ["menuitem", "menuitemcheckbox", "menuitemradio"], menubar: ["menuitem"], tree: ["treeitem"], grid: ["gridcell"] };

/** a Material Symbols name: words in snake_case, as no person would be called */
const ICON_NAME = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;

/** the controls a screen reader can reach in a drawing, each with its role and its name */
function controlsIn(root: El): { el: El; role: string; name: string }[] {
  return all(root)
    .filter((el) => !hidden(el))
    .flatMap((el) => {
      const role = roleOf(el);
      return role && CONTROL_ROLES.has(role) ? [{ el, role, name: nameOf(el, root) }] : [];
    });
}

/** the props an icon-only drawing of a part takes, for the parts that can be one */
const ICON_ONLY: Record<string, Record<string, unknown>> = {
  button: { label: "", icon: "arrow_back" },
  fab: { label: "", icon: "share" },
  toggle: { label: "", icon: "format_bold" },
  "icon-button": { label: "", icon: "more_vert" },
  "toggle-group": { items: [{ label: "", icon: "format_align_left" }, { label: "", icon: "format_align_center" }] },
  "button-group": { items: [{ label: "", icon: "skip_previous" }, { label: "", icon: "play_arrow" }] },
  "app-bar": { leading: "arrow_back", trailing: "search", trailing2: "more_vert" },
  item: { trailing: "icon", trailingIcon: "chevron_right" },
};

describe("every part", () => {
  it("names each control it draws once it is given its name", () => {
    const unnamed: string[] = [];
    for (const d of PARTS) {
      const named = d.props.some((p) => p.key === ARIA_LABEL) ? { [ARIA_LABEL]: "Named" } : {};
      for (const c of controlsIn(markup(d, named))) if (!c.name) unnamed.push(`${d.slug}: a ${c.role} <${c.el.tag} data-slot="${c.el.attrs["data-slot"] ?? ""}">`);
    }
    expect(unnamed).toEqual([]);
  });

  it("calls no control by an icon's name", () => {
    const byIcon: string[] = [];
    for (const d of PARTS)
      for (const props of [{}, ICON_ONLY[d.slug] ?? {}]) for (const c of controlsIn(markup(d, props))) if (ICON_NAME.test(c.name)) byIcon.push(`${d.slug}: a ${c.role} called "${c.name}"`);
    expect(byIcon).toEqual([]);
  });

  it("is one stop in the Tab order wherever it declares a group's role, and a slider can be reached", () => {
    const wrong: string[] = [];
    for (const d of PARTS) {
      const root = markup(d);
      for (const el of all(root)) {
        if (hidden(el)) continue;
        const role = roleOf(el);
        if (role === "slider" && el.tag !== "input" && !tabStop(el)) wrong.push(`${d.slug}: a slider no key can reach`);
        if (!role || !GROUPS[role]) continue;
        /* each item in the Tab order means no arrows move through them; none means a script picks one as it mounts */
        const stops = all(el).filter((x) => !hidden(x) && GROUPS[role].includes(roleOf(x) ?? "") && tabStop(x)).length;
        if (stops > 1) wrong.push(`${d.slug}: a ${role} with ${stops} stops in the Tab order`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("that takes input offers a way to be named: a label it shows, or its accessible name", () => {
    const VISIBLE = ["label", "title", "text"];
    for (const d of PARTS.filter((x) => x.input || x.field?.required))
      expect(d.props.some((p) => p.key === ARIA_LABEL || VISIBLE.includes(p.key)), `${d.slug} has no way to be named`).toBe(true);
  });
});

describe("a control that shows only an icon", () => {
  const nameOfButton = (props: Record<string, unknown>) => {
    const root = markup(partBySlug("button")!, props);
    return controlsIn(root)[0]?.name;
  };

  it("is called by what its icon means, in the language the part speaks", () => {
    expect(nameOfButton({ label: "", icon: "arrow_back" })).toBe("Back");
    expect(nameOfButton({ label: "", icon: "view_list" })).toBe("View list");
    setGlobalLang("zh");
    try {
      expect(nameOfButton({ label: "", icon: "arrow_back" })).toBe("返回");
    } finally {
      setGlobalLang("en");
    }
  });

  it("takes the name its author gives it", () => {
    expect(nameOfButton({ label: "", icon: "arrow_back", ariaLabel: "Back to the list" })).toBe("Back to the list");
  });

  it("names a bar's icons each by what it means", () => {
    const names = controlsIn(markup(partBySlug("app-bar")!, ICON_ONLY["app-bar"])).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["Back", "Search", "More"]));
  });
});

describe("the arrows of a group", () => {
  it("move to the next and the one before, round the ends, Home and End to the ends", () => {
    expect(moveTo("ArrowRight", 0, 3)).toBe(1);
    expect(moveTo("ArrowDown", 2, 3)).toBe(0);
    expect(moveTo("ArrowLeft", 0, 3)).toBe(2);
    expect(moveTo("Home", 2, 3)).toBe(0);
    expect(moveTo("End", 0, 3)).toBe(2);
    expect(moveTo("Enter", 0, 3)).toBeNull();
    /* a row's arrows are only left and right, a column's up and down */
    expect(moveTo("ArrowDown", 0, 3, "horizontal")).toBeNull();
    expect(moveTo("ArrowRight", 0, 3, "vertical")).toBeNull();
  });

  it("leave one item in the Tab order: the chosen, else the first", () => {
    const root = markup(partBySlug("rating")!, { value: 3 });
    const stars = all(root).filter((e) => e.attrs.role === "radio");
    expect(stars.map((s) => s.attrs.tabindex)).toEqual(["-1", "-1", "0", "-1", "-1"]);
    const tabs = all(markup(partBySlug("side-tabs")!, {})).filter((e) => e.attrs.role === "tab");
    expect(tabs.filter((t) => t.attrs.tabindex === "0")).toHaveLength(1);
  });
});
