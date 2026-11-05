import { beforeAll, describe, expect, it, vi } from "vitest";
import { KITS, MATERIAL_LOOK, kitBySlug, type KitLook } from "../parts/kits";
import { defaultMeasures } from "../parts/templates/kit";
import { PARTS, partBySlug, reader } from "../parts/registry";
import { withoutSampleWords } from "./ai";
import { arrangeFlows } from "./flow";
import { setGlobalLang } from "./i18n";
import { isProject } from "./project";
import { kitGroups, kitLookOf, landTree, roomOn, splitIntoAtoms, treeSize } from "./kits";
import { DEFAULT_THEME, frameRect, makeItem, type Action, type Frame, type Group, type Item } from "./tokens";

/* A kit added to a document, and a composite split into atoms: groups that name their box, stand
 * inside it, land on the screen they are let go on, and keep what the part they replace had. */

beforeAll(() => {
  vi.stubGlobal("window", { innerWidth: 1280, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  setGlobalLang("en");
});

const look = kitLookOf(DEFAULT_THEME);
const phone: Frame = { id: "f", name: "Home", x: 1000, y: 200 };
const small: Frame = { id: "s", name: "Small", x: 2000, y: 200, w: 360, h: 780 };

const inside = (g: Group, host: Group, m: Record<string, number>) => {
  const it = g.items[0];
  const hi = host.items[0];
  return g.x >= host.x - 1 && g.y >= host.y - 1 && g.x + m[it.id] <= host.x + m[hi.id] + 1 && g.y + m[`${it.id}:h`] <= host.y + m[`${hi.id}:h`] + 1;
};

describe("a kit added", () => {
  it("is its outermost box first, and every other group names the box it stands in, before it", () => {
    for (const kit of KITS)
      for (const v of kit.variants) {
        const groups = kitGroups(kit, look, "en", { variant: v.key });
        expect(groups[0].inFlow, `${kit.slug}/${v.key}`).toBeUndefined();
        expect(groups[0].items[0].component).toBe("box");
        const ids = new Set(groups.map((g) => g.id));
        expect(ids.size).toBe(groups.length);
        groups.slice(1).forEach((g, i) => {
          expect(g.inFlow && ids.has(g.inFlow), `${kit.slug}/${v.key}: ${g.items[0].component}`).toBe(true);
          const host = groups.findIndex((x) => x.id === g.inFlow);
          expect(host, `${kit.slug}/${v.key}: a box comes before what it holds`).toBeLessThan(i + 1);
          expect(partBySlug(groups[host].items[0].component)?.flow).toBeTruthy();
        });
      }
  });

  it("is laid out already, everything inside its box, and stays put when laid out again", () => {
    for (const kit of KITS)
      for (const v of kit.variants) {
        const groups = kitGroups(kit, look, "en", { variant: v.key, at: { x: 40, y: 60 } });
        const m = defaultMeasures(groups);
        expect(groups[0].x).toBe(40);
        expect(groups[0].y).toBe(60);
        for (const g of groups.slice(1)) expect(inside(g, groups.find((x) => x.id === g.inFlow)!, m), `${kit.slug}/${v.key}: ${g.items[0].component} at ${g.x},${g.y}`).toBe(true);
        expect(arrangeFlows(groups, m), `${kit.slug}/${v.key}`).toBe(groups);
      }
  });

  it("speaks the language it is added in", () => {
    const zh = kitGroups(kitBySlug("claude-prompt")!, look, "zh");
    const area = zh.find((g) => g.items[0].component === "textarea")!;
    expect(area.items[0].props?.placeholder).toBe("今天有什么可以帮你？");
    expect(zh[0].name).toBe("输入框");
  });

  it("is brought down to the width of a smaller phone, and what it holds follows", () => {
    const groups = kitGroups(kitBySlug("claude-prompt")!, look, "en", { screen: small });
    expect(treeSize(groups).w).toBe(328);
    const m = defaultMeasures(groups);
    for (const g of groups.slice(1)) expect(g.x + m[g.items[0].id]).toBeLessThanOrEqual(groups[0].x + 328 + 1);
    expect(roomOn({ id: "d", name: "D", x: 0, y: 0, w: 1280, h: 800 })).toBeUndefined();
    /* a bar spans the screen it is for, edge to edge */
    const bar = kitGroups(kitBySlug("top-app-bar")!, look, "en", { screen: small });
    expect(treeSize(bar).w).toBe(360);
    expect(landTree(bar, small.x + 30, small.y + 100, [small], true).groups[0].x).toBe(small.x);
  });

  it("lands inside the screen it is let go on, on its grid, and off any screen where it is let go", () => {
    const groups = kitGroups(kitBySlug("claude-prompt")!, look, "en");
    const { w, h } = treeSize(groups);
    /* let go hanging off the right and the foot of the screen */
    const landed = landTree(groups, phone.x + 100, phone.y + 800, [phone, small]);
    expect(landed.frame?.id).toBe("f");
    const r = frameRect(phone);
    expect(landed.groups[0].x).toBeGreaterThanOrEqual(r.l + 16);
    expect(landed.groups[0].x + w).toBeLessThanOrEqual(r.r - 16);
    expect(landed.groups[0].y + h).toBeLessThanOrEqual(r.b - 16);
    expect((landed.groups[0].x - r.l) % 4).toBe(0);
    expect((landed.groups[0].y - r.t) % 4).toBe(0);
    /* everything moved with its box */
    expect(landed.groups[1].x - landed.groups[0].x).toBe(groups[1].x - groups[0].x);
    const loose = landTree(groups, -500, -500, [phone]);
    expect(loose.frame).toBeUndefined();
    expect(loose.groups[0].x).toBe(-500);
  });

  it("takes the variant the style calls for", () => {
    const desk = kitLookOf({ ...DEFAULT_THEME, style: "vscode" });
    expect(desk.group).toBe("desktop");
    const groups = kitGroups(kitBySlug("search-bar")!, desk, "en");
    expect(groups.some((g) => g.items[0].component === "kbd")).toBe(true);
    expect(kitLookOf({ ...DEFAULT_THEME, dark: true }).dark).toBe(true);
    /* how a style composes, read from its recipes and its face */
    expect(kitLookOf({ ...DEFAULT_THEME, style: "ios" })).toMatchObject({ dialog: "alert", list: "inset", nav: "plain", caption: "lights" });
    expect(kitLookOf({ ...DEFAULT_THEME, style: "wechat" })).toMatchObject({ dialog: "weui", avatar: "square", caption: "lights" });
    expect(kitLookOf({ ...DEFAULT_THEME, style: "fluent" }).caption).toBe("buttons");
    expect(kitLookOf({ ...DEFAULT_THEME, style: "notion" }).caption).toBe("buttons");
    expect(kitLookOf(DEFAULT_THEME)).toMatchObject({ dialog: "m3", nav: "m3", caption: "buttons" });
    /* and the room there is: the one-row box is for a wide screen, whatever the style */
    const desktop: Frame = { id: "d", name: "D", x: 0, y: 0, w: 1280, h: 800 };
    expect(treeSize(kitGroups(kitBySlug("codex-prompt")!, desk, "en", { screen: phone })).w).toBe(380);
    expect(treeSize(kitGroups(kitBySlug("codex-prompt")!, look, "en", { screen: desktop })).w).toBe(640);
  });
});

describe("a document of atoms", () => {
  it("is an ordinary document: it saves, opens, and comes through a model's cleaning", () => {
    const groups = [...kitGroups(kitBySlug("codex-prompt")!, look, "en", { screen: phone }), { id: "v", x: 0, y: 0, axis: "x" as const, items: [{ ...makeItem("svg"), props: { mode: "markup", markup: '<svg viewBox="0 0 4 4"><path d="M0 0h4v4z" onclick="x()"/></svg>' } }] }];
    const doc = JSON.parse(JSON.stringify({ groups, frames: [phone], paletteKey: "purple", frame: "phone", title: "", brief: "" }));
    expect(isProject(doc)).toBe(true);
    const clean = withoutSampleWords(doc);
    expect(clean.groups.map((g: Group) => g.items[0].component)).toEqual(groups.map((g) => g.items[0].component));
    expect(clean.groups.find((g: Group) => g.id === "v")?.items[0].props?.markup).toContain("<path");
  });
});

describe("a composite split into atoms", () => {
  const card = (): Group[] => {
    const host: Group = { id: "host", x: 0, y: 0, axis: "x", items: [{ ...makeItem("container"), id: "hi", props: { layout: "column", width: 412, height: 600 } }] };
    const before: Group = { id: "b", x: 16, y: 16, axis: "x", inFlow: "host", items: [{ ...makeItem("text"), id: "bt" }] };
    const it = { ...makeItem("card"), id: "card-item", props: { title: "Soup", description: "Hot", action: "Order" }, action: { to: "detail", transition: "slide" as const }, fill: "primaryContainer" as const };
    const target: Group = { id: "c", x: 16, y: 64, axis: "x", inFlow: "host", name: "Dinner", items: [it] };
    const after: Group = { id: "a", x: 16, y: 300, axis: "x", inFlow: "host", items: [{ ...makeItem("button"), id: "at" }] };
    return [host, before, target, after];
  };

  it("stands where the part stood, in its place among the others, with its ids, name, tap and paint", () => {
    const groups = card();
    const out = splitIntoAtoms(groups, "card-item", "en", { "card-item": 300 })!;
    expect(out.rootItemId).toBe("card-item");
    const at = out.groups.findIndex((g) => g.id === "c");
    expect(at).toBe(2);
    const root = out.groups[at];
    expect(root.x).toBe(16);
    expect(root.y).toBe(64);
    expect(root.inFlow).toBe("host");
    expect(root.name).toBe("Dinner");
    expect(splitIntoAtoms(groups.map((g) => (g.id === "c" ? { ...g, name: undefined } : g)), "card-item", "en")!.groups[2].name).toBe("Card");
    expect(root.items[0]).toMatchObject({ id: "card-item", component: "box", action: { to: "detail" }, fill: "primaryContainer" });
    expect(root.items[0].props?.width).toBe(300);
    /* what was before and after it still is */
    expect(out.groups[1].id).toBe("b");
    expect(out.groups[out.groups.length - 1].id).toBe("a");
    /* its words are now atoms in its box */
    const words = out.groups.filter((g) => g.items[0].component === "text").map((g) => g.items[0].props?.text);
    expect(words).toEqual(expect.arrayContaining(["Soup", "Hot"]));
    const kids = out.groups.slice(at + 1, -1);
    expect(kids.length).toBeGreaterThan(2);
    for (const k of kids) expect(out.groups.some((g) => g.id === k.inFlow)).toBe(true);
  });

  it("leaves a part that cannot be split, and one that is not there, alone", () => {
    const groups = card();
    expect(splitIntoAtoms(groups, "bt", "en")).toBeNull();
    expect(splitIntoAtoms(groups, "nope", "en")).toBeNull();
  });
});

describe("what a split keeps of the part", () => {
  const part = (slug: string, id: string, props: Record<string, unknown> = {}, more: Partial<Item> = {}): Item => ({ ...makeItem(slug), id, props, ...more });
  const go = (to: string): Action => ({ to, transition: "slide" });
  /** the groups a split comes to, standing in `around` (a layout first) when it is given */
  const split = (slug: string, props: Record<string, unknown>, more: Partial<Item> = {}, around: Group[] = []) => {
    const g: Group = { id: "g", x: 0, y: 0, axis: "x", items: [part(slug, "i", props, more)], ...(around.length ? { inFlow: around[0].id } : {}) };
    return splitIntoAtoms([...around, g], "i", "en", { i: 360 })!.groups;
  };
  /** what a group and everything inside it says */
  const says = (groups: Group[], g: Group) => {
    const under = new Set([g.id]);
    for (const x of groups) if (x.inFlow && under.has(x.inFlow)) under.add(x.id);
    return groups.filter((x) => under.has(x.id)).flatMap((x) => Object.values(x.items[0].props ?? {}).filter((v): v is string => typeof v === "string"));
  };
  const tapped = (groups: Group[], to: string) => groups.filter((x) => x.items[0].action?.to === to);

  it("keeps what the part asks of the layout it stands in", () => {
    const row: Group = { id: "row", x: 0, y: 0, axis: "x", items: [part("box", "i-row", { layout: "row", width: 400, height: 80, hugWidth: false, hugHeight: false })] };
    const asks = { flowFill: true, flowSize: { w: "fill" as const, h: "hug" as const }, alignSelf: "center" as const, flowMin: { w: 120 }, flowMax: { w: 300, h: 80 }, flowSpan: 2, flowAbsolute: true };
    const out = split("search", { kind: "bar" }, asks, [row]);
    const root = out.find((g) => g.id === "g")!;
    expect(root.inFlow).toBe("row");
    expect(root.items[0]).toMatchObject(asks);
  });

  it("puts the variable an entry follows on the entry inside", () => {
    const out = split("search", { kind: "bar", placeholder: "Find" }, { bind: { value: "q", placeholder: "hint" } });
    const entry = out.find((g) => g.items[0].component === "input")!;
    expect(entry.items[0].bind).toEqual({ value: "q", placeholder: "hint" });
    expect(out.find((g) => g.id === "g")!.items[0].bind).toBeUndefined();
  });

  it("puts a bound prop on the one atom showing its words, and drops one nothing shows", () => {
    const out = split("stat-card", { title: "Revenue", value: "$12", trend: "" }, { bind: { value: "money", trend: "nowhere" } });
    const shown = out.filter((g) => g.items[0].bind);
    expect(shown).toHaveLength(1);
    expect(shown[0].items[0]).toMatchObject({ component: "text", props: { text: "$12" }, bind: { text: "money" } });
  });

  it("puts each slot's tap on the atom that takes it: a search's trailing icon, its suggestions", () => {
    const out = split("search", { kind: "view", trailing: "mic", results: [{ label: "One" }, { label: "Two" }] }, { actions: { icon: go("voice"), "tab:1": go("two") } });
    expect(tapped(out, "voice").map((g) => g.items[0].props?.icon)).toEqual(["mic"]);
    const [row] = tapped(out, "two");
    expect(says(out, row)).toContain("Two");
    expect(says(out, row)).not.toContain("One");
  });

  it("puts an app bar's icon slots on its icon buttons, in order", () => {
    const out = split("app-bar", { leading: "menu", trailing: "search", trailing2: "more_vert" }, { actions: { icon: go("drawer"), icon2: go("find"), icon3: go("more") } });
    expect(tapped(out, "drawer")[0].items[0].props?.icon).toBe("menu");
    expect(tapped(out, "find")[0].items[0].props?.icon).toBe("search");
    expect(tapped(out, "more")[0].items[0].props?.icon).toBe("more_vert");
  });

  it("puts a list's or a bar's row taps on its rows, and a dialog's on its buttons", () => {
    const tabs = split("tabs", { items: [{ label: "A" }, { label: "B" }, { label: "C" }] }, { actions: { "tab:2": go("c") } });
    expect(says(tabs, tapped(tabs, "c")[0])).toContain("C");
    const nav = split("navigation-bar", {}, { actions: { "tab:1": go("search") } });
    expect(says(nav, tapped(nav, "search")[0])).toContain("Search");
    const rows = split("item", { items: [{ label: "Wi-Fi" }, { label: "Bluetooth" }] }, { actions: { "tab:1": go("bt") } });
    expect(says(rows, tapped(rows, "bt")[0])).toContain("Bluetooth");
    const dialog = split("dialog", { dismiss: "Later", confirm: "OK" }, { actions: { confirm: go("ok") } });
    expect(tapped(dialog, "ok")[0].items[0]).toMatchObject({ component: "button", props: { label: "OK" } });
  });

  it("finds an atom for every slot of every part that splits, but what the split does not show", () => {
    const lost: string[] = [];
    for (const def of PARTS.filter((d) => d.atoms)) {
      const variants: Record<string, unknown>[] = [{}];
      for (const d of def.props) {
        if (d.kind === "enum") for (const o of d.options) variants.push({ [d.key]: typeof o === "string" ? o : o.value });
        if (d.kind === "bool") variants.push({ [d.key]: true }, { [d.key]: false });
      }
      for (const props of variants) {
        const slots = def.slots?.(reader(def, props)) ?? [];
        const out = split(def.slug, props, { actions: Object.fromEntries(slots.map((s) => [s.key, go(`to-${s.key}`)])) });
        for (const s of slots) if (!tapped(out, `to-${s.key}`).length) lost.push(`${def.slug} ${s.key}`);
      }
    }
    /* a notice bar's split shows its first notice, and a dialogue box's choices only show at its last line */
    expect([...new Set(lost)].sort()).toEqual(["dialogue-box tab:0", "dialogue-box tab:1", "notice-bar tab:1", "notice-bar tab:2"]);
  });
});

describe("a split that looks like the part", () => {
  /** the split of a part, with where each atom stands from the box's corner and how big its guesses make it */
  const laid = (slug: string, props: Record<string, unknown>) => {
    const g: Group = { id: "g", x: 0, y: 0, axis: "x", items: [{ ...makeItem(slug), id: "i", props }] };
    const groups = splitIntoAtoms([g], "i", "en")!.groups;
    const m = defaultMeasures(groups);
    const at = (kind: string, n = 0) => {
      const x = groups.filter((k) => k.items[0].component === kind)[n];
      return { x: x.x, y: x.y, w: m[x.items[0].id], h: m[`${x.items[0].id}:h`] };
    };
    return { size: treeSize(groups), root: groups[0].items[0], at };
  };

  it("keeps an app bar on the screen's own surface, 64 tall, its title where the part has it", () => {
    const bar = laid("app-bar", { title: "Inbox", leading: "menu", trailing: "more_vert", trailing2: "" });
    expect(bar.size).toEqual({ w: 412, h: 64 });
    expect(bar.root.props?.surface).toBe("none");
    /* 4 in, a 40 button, 4 between, and the heading's own 12 */
    expect(bar.at("text").x).toBe(60);
    expect(bar.at("icon-button", 1).x + 40).toBe(412 - 4);
    expect(laid("app-bar", { title: "Inbox", leading: "" }).at("text").x).toBe(4 + 16);
    const scrolled = laid("app-bar", { title: "Inbox", scrolled: true });
    expect(scrolled.root.props?.surface).toBe("bar");
    expect(scrolled.root.look?.elevation).toBe(2);
    expect(laid("app-bar", { size: "medium" }).size.h).toBe(112);
    expect(laid("app-bar", { size: "large", subtitle: "All mail" }).size.h).toBe(152);
  });

  it("runs a card's media to its edges", () => {
    const card = laid("card", { width: 280, imageSize: 96 });
    const media = card.at("box", 1);
    expect([media.x, media.y, media.w, media.h]).toEqual([0, 0, 280, 96]);
    /* the words start the card's spacing below it and in from its side */
    expect(card.at("text").x).toBe(16);
    expect(card.at("text").y).toBe(96 + 16);
    expect(card.root.fill).toBe("surfaceContainerHighest");
    const foot = laid("card", { width: 280, imageSize: 96, imagePos: "bottom" });
    expect(foot.at("box", 2).y + 96).toBe(foot.size.h);
  });

  it("keeps a search view's rows 56 tall under a 56 bar, raised as the part is", () => {
    const view = laid("search", { kind: "view", width: 360, results: [{ label: "A" }, { label: "B" }, { label: "C" }] });
    expect(view.size.h).toBe(56 + 1 + 3 * 56);
    expect(view.root.look?.elevation).toBe(3);
    expect(view.at("icon").x).toBe(16);
    expect(view.at("input").x).toBe(56);
    expect(laid("search", { kind: "bar", width: 360 }).size).toEqual({ w: 360, h: 56 });
    expect(laid("search", { kind: "bar", style: "outlined" }).root.look).toBeUndefined();
  });
});

describe("a split composed the way the style composes the part", () => {
  /* looks written as fields, the way a kit reads them: no style is named */
  const IPHONE: KitLook = { ...MATERIAL_LOOK, bar: "center", appbar: "ios", list: "inset", row: "chevron", dialog: "alert", sheet: "grabber" };
  const MESSENGER: KitLook = { ...MATERIAL_LOOK, bar: "center", appbar: "center", list: "flush", row: "arrow", dialog: "weui", sheet: "weui" };
  const go = (to: string): Action => ({ to, transition: "slide" });
  const split = (slug: string, props: Record<string, unknown>, look?: KitLook, more: Partial<Item> = {}) => {
    const g: Group = { id: "g", x: 0, y: 0, axis: "x", items: [{ ...makeItem(slug), id: "i", props, ...more }] };
    const groups = splitIntoAtoms([g], "i", "en", {}, look)!.groups;
    const m = defaultMeasures(groups);
    const box = (x: Group) => ({ x: x.x, y: x.y, w: m[x.items[0].id], h: m[`${x.items[0].id}:h`] });
    return { groups, size: treeSize(groups), box, find: (pick: (x: Group) => boolean) => groups.filter(pick) };
  };

  it("reads its traits off the theme, as a kit does", () => {
    expect(kitLookOf({ ...DEFAULT_THEME, style: "ios" })).toMatchObject({ appbar: "ios", list: "inset", row: "chevron", dialog: "alert" });
    expect(kitLookOf({ ...DEFAULT_THEME, style: "wechat" })).toMatchObject({ bar: "center", list: "flush", row: "arrow", dialog: "weui" });
  });

  it("is Material's without a look, the same as with Material's", () => {
    for (const [slug, props] of [["app-bar", { title: "Inbox" }], ["item", { items: [{ label: "A", icon: "home" }, { label: "B" }] }], ["dialog", {}], ["alert-dialog", {}]] as const) {
      const plain = split(slug, props).groups.map((g) => g.items[0].component);
      expect(split(slug, props, MATERIAL_LOOK).groups.map((g) => g.items[0].component), slug).toEqual(plain);
    }
  });

  it("centers an app bar's title where the style does, and an iPhone's says where its arrow leads, 44 tall", () => {
    const props = { title: "Inbox", leading: "arrow_back", trailing: "more_vert", trailing2: "" };
    const ios = split("app-bar", props, IPHONE, { actions: { icon: go("home"), icon2: go("menu") } });
    expect(ios.size).toEqual({ w: 412, h: 44 });
    const title = ios.find((g) => g.items[0].props?.text === "Inbox")[0];
    const t = ios.box(title);
    expect(Math.abs(t.x + t.w / 2 - 206)).toBeLessThanOrEqual(2);
    const back = ios.find((g) => g.items[0].component === "button")[0];
    expect(back.items[0]).toMatchObject({ props: { label: "Back", icon: "arrow_back" }, action: { to: "home" } });
    expect(ios.find((g) => g.items[0].action?.to === "menu")[0].items[0].props?.icon).toBe("more_vert");
    const weui = split("app-bar", props, MESSENGER);
    expect(weui.size).toEqual({ w: 412, h: 64 });
    const w = weui.box(weui.find((g) => g.items[0].props?.text === "Inbox")[0]);
    expect(Math.abs(w.x + w.w / 2 - 206)).toBeLessThanOrEqual(2);
    /* only an iPhone names the way back */
    expect(weui.find((g) => g.items[0].component === "button")).toHaveLength(0);
  });

  it("closes list rows up on a rounded card under an iPhone's look, edge to edge under WeChat's, with their chevrons and their taps", () => {
    const props = { items: [{ label: "Wi-Fi", icon: "wifi" }, { label: "Bluetooth", icon: "bluetooth" }, { label: "Cellular", icon: "cell_tower" }], description: "" };
    const ios = split("item", props, IPHONE, { actions: { "tab:1": go("bt") } });
    const root = ios.groups[0].items[0];
    expect(root).toMatchObject({ fill: "surfaceContainerLow", corners: { tl: 12, tr: 12, br: 12, bl: 12 } });
    const rules = ios.find((g) => g.name === "Divider");
    expect(rules).toHaveLength(2);
    /* the lines start where the words do */
    const gap = ios.find((g) => g.inFlow === rules[0].id)[0];
    expect(ios.box(gap).w).toBe(52);
    expect(ios.find((g) => g.items[0].props?.name === "chevron_right")).toHaveLength(3);
    const [row] = ios.find((g) => g.items[0].action?.to === "bt");
    expect(ios.groups.some((g) => g.items[0].props?.text === "Bluetooth" && ios.groups.find((x) => x.id === g.inFlow)?.inFlow === row.id)).toBe(true);
    const weui = split("item", props, MESSENGER);
    expect(weui.groups[0].items[0].fill).toBe("surfaceContainerLow");
    expect(weui.groups[0].items[0].corners).toBeUndefined();
    expect(weui.box(weui.find((g) => g.inFlow === weui.find((x) => x.name === "Divider")[0].id)[0]).w).toBe(16);
    /* a cell is 56 tall */
    expect(weui.box(weui.groups[1]).h).toBeGreaterThanOrEqual(56);
    /* Material's rows stay bare, with no chevron */
    const plain = split("item", props);
    expect(plain.groups[0].items[0].fill).toBeUndefined();
    expect(plain.find((g) => g.items[0].props?.name === "chevron_right")).toHaveLength(0);
  });

  it("draws a dialog as an iPhone's alert or a WeChat dialog: narrow, centered, its buttons halves of the foot", () => {
    const ios = split("dialog", { title: "Delete?", description: "It cannot be undone.", dismiss: "Cancel", confirm: "Delete" }, IPHONE, { actions: { confirm: go("gone") } });
    expect(ios.size.w).toBe(280);
    expect(ios.find((g) => g.items[0].props?.text === "Delete?")[0].items[0].props?.align).toBe("center");
    const buttons = ios.find((g) => g.items[0].component === "button");
    expect(buttons.map((b) => b.items[0].props?.label)).toEqual(["Cancel", "Delete"]);
    expect(buttons.every((b) => b.items[0].flowFill)).toBe(true);
    expect(ios.find((g) => g.items[0].action?.to === "gone")[0].items[0].props?.label).toBe("Delete");
    expect(split("alert-dialog", {}, MESSENGER).size.w).toBe(320);
  });
});
