import { afterEach, describe, expect, it } from "vitest";

import { Lang, setGlobalLang } from "./i18n";
import { buildPrompt } from "./prompt";
import { BACK_TARGET, DEFAULT_THEME, Doc, Item, defaultTabs, makeItem, paletteOf } from "./tokens";

const LANGS: Lang[] = ["ja", "en", "zh", "ko"];

/* Section headings in the order buildPrompt must emit them. */
const SECTIONS: Record<Lang, string[]> = {
  ja: ["## カラー", "## 形・文字・動き", "## 画面構成", "## 振る舞いと画面遷移", "## 全体の指針"],
  en: ["## Colors", "## Shape, type and motion", "## Layout", "## Behavior and navigation", "## General guidance"],
  zh: ["## 配色", "## 形状、字体与动效", "## 屏幕结构", "## 行为与屏幕跳转", "## 整体原则"],
  ko: ["## 색상", "## 모양, 글꼴 및 모션", "## 화면 구성", "## 동작 및 화면 전환", "## 전체 지침"],
};

/* The prompt always targets the web, with shadcn M3E already installed. */
const PLATFORM_LINE: Record<Lang, string> = {
  ja: "実装先は Web（ブラウザで動くアプリ）です。UI は shadcn M3E（@m3e レジストリの shadcn コンポーネント）で作ります。導入済みなので、これらのコンポーネントを import して使い、独自に作り直さないでください。",
  en: "Build it for the web, as an app that runs in the browser. Build the UI with shadcn M3E (the shadcn components of the @m3e registry). It is already installed: import and use those components instead of recreating them.",
  zh: "实现目标是 Web（在浏览器中运行的应用）。UI 使用 shadcn M3E（@m3e 注册表中的 shadcn 组件）构建。它已经安装好了：直接导入使用这些组件，不要自行重做。",
  ko: "브라우저에서 실행되는 웹 앱으로 구현한다. UI는 shadcn M3E(@m3e 레지스트리의 shadcn 컴포넌트)로 만든다. 이미 설치되어 있으므로 이 컴포넌트를 import해서 사용하고 다시 만들지 않는다.",
};

const part = (slug: string, id: string, props: Record<string, unknown> = {}, extra: Partial<Item> = {}): Item => ({ ...makeItem(slug), id, props, ...extra });

/* One phone screen with an app bar, a run of two buttons (one with a tap action) and a
 * navigation bar. The module-level language is set first so the default destinations follow
 * the test. */
function fixture(): Doc {
  const bar = part("app-bar", "bar", { title: "Home" });
  const save = part("button", "save", { label: "Save" }, { action: { to: BACK_TARGET, transition: "fade" } });
  const cancel = part("button", "cancel", { label: "Cancel", variant: "text" });
  const nav = part("navigation-bar", "nav", { items: defaultTabs() });
  return {
    groups: [
      { id: "g-bar", x: 0, y: 24, axis: "x", items: [bar] },
      { id: "g-row", x: 16, y: 400, axis: "x", items: [save, cancel] },
      { id: "g-nav", x: 0, y: 812, axis: "x", items: [nav] },
    ],
    frames: [{ id: "f-home", name: "Home", x: 0, y: 0 }],
    paletteKey: "purple",
    frame: "phone",
    title: "Notes",
    brief: "",
  };
}

/* Set the module-level language for the fixture helpers, then build explicitly
 * in that language — nothing is left to ambient state. */
function build(lang: Lang) {
  setGlobalLang(lang);
  return buildPrompt(fixture(), {}, undefined, lang);
}

const lines = (prompt: string) => prompt.split("\n");
const headings = (prompt: string) => lines(prompt).filter((l) => l.startsWith("## "));
/* the layout and behavior sections: everything between the layout heading and the closing guidance */
const layoutOf = (prompt: string, lang: Lang) => prompt.slice(prompt.indexOf(SECTIONS[lang][2]), prompt.indexOf(SECTIONS[lang][4]));

const QUOTED: Record<Lang, { label: string; others: string[] }> = {
  ja: { label: "「Save」", others: ['"Save"', "“Save”"] },
  en: { label: '"Save"', others: ["「Save」", "“Save”"] },
  zh: { label: "“Save”", others: ["「Save」", '"Save"'] },
  ko: { label: '"Save"', others: ["「Save」", "“Save”"] },
};

describe("progress track thickness", () => {
  afterEach(() => setGlobalLang("ja"));

  it.each(LANGS)("describes the selected thickness, including the default, in %s", (lang) => {
    for (const slug of ["progress", "circular-progress"]) {
      for (const thickness of [undefined, 4, 6, 8]) {
        const doc = fixture();
        doc.groups = [{ id: "progress", x: 16, y: 100, axis: "x", items: [part(slug, "p", { variant: "wavy", thickness })] }];
        const layout = layoutOf(buildPrompt(doc, {}, undefined, lang), lang);
        /* only a non-default thickness is spelled out */
        if (thickness && thickness !== 4) expect(layout).toContain(`thickness={${thickness}}`);
        else expect(layout).not.toContain("thickness");
      }
    }
  });
});

describe("card image placement", () => {
  afterEach(() => setGlobalLang("ja"));

  /* the code the layout section must carry for each placement */
  const PLACEMENT: Record<string, string> = {
    top: "paddingTop: 0",
    bottom: "paddingBottom: 0",
    leading: "flex-row",
    trailing: "flex-row",
    background: 'className="absolute inset-0"',
  };
  /* a card standing in its own group, so its whole code is written out */
  function cardLayout(lang: Lang, props: Record<string, unknown>, extra: Partial<Item> = {}) {
    setGlobalLang(lang);
    const doc = fixture();
    doc.groups = [{ id: "g-card", x: 16, y: 100, axis: "x", items: [part("card", "card", props, extra)] }];
    return layoutOf(buildPrompt(doc, {}, undefined, lang), lang);
  }

  it.each(LANGS)("says where the image area sits, treating no placement as the top, in %s", (lang) => {
    for (const pos of [undefined, "top", "bottom", "leading", "trailing", "background"]) {
      expect(cardLayout(lang, { imagePos: pos }), `${lang} ${pos}`).toContain(PLACEMENT[pos ?? "top"]);
    }
    /* a side column is told apart by which side of the words it is written on */
    const media = "-my-(--card-spacing)";
    const leading = cardLayout(lang, { imagePos: "leading" });
    expect(leading.indexOf(media)).toBeLessThan(leading.indexOf("<CardHeader"));
    const trailing = cardLayout(lang, { imagePos: "trailing" });
    expect(trailing.indexOf(media)).toBeGreaterThan(trailing.indexOf("<CardHeader"));
  });

  it.each(LANGS)("spells out a sized image area but keeps a background image unsized in %s", (lang) => {
    expect(cardLayout(lang, { imageSize: 120 })).toContain("height: 120");
    expect(cardLayout(lang, { imagePos: "leading", imageSize: 120 })).toContain("width: 120");
    const background = cardLayout(lang, { imagePos: "background", imageSize: 120 });
    expect(background).not.toContain("height: 120");
    expect(background).not.toContain("width: 120");
  });

  it.each(LANGS)("mentions a text position or color only when it differs from the automatic one in %s", (lang) => {
    expect(cardLayout(lang, {})).not.toContain("text-primary");
    expect(cardLayout(lang, {}, { textColor: "primary" })).toContain("text-primary");
    expect(cardLayout(lang, {})).not.toContain("justify-end");
    expect(cardLayout(lang, { contentAlign: "end" })).toContain("justify-end");
    expect(cardLayout(lang, { textAlign: "start" })).not.toContain("text-center");
    expect(cardLayout(lang, { textAlign: "center" })).toContain("text-center");
  });

  it.each(LANGS)("states a card's corners once they are changed in %s", (lang) => {
    expect(cardLayout(lang, {}, { corners: { tl: 0, tr: 20, bl: 20, br: 0 } })).toMatch(/20px/);
    // the reported image size is the drawn one, clamped to the part, not the stored number
    expect(cardLayout(lang, { imageSize: 999 })).not.toContain("999");
  });

  it.each(LANGS)("stays silent about the image area when it is turned off in %s", (lang) => {
    const off = cardLayout(lang, { imagePos: "none" });
    for (const code of [...Object.values(PLACEMENT), '<Icon name="image"']) expect(off).not.toContain(code);
  });
});

describe("buildPrompt color output", () => {
  afterEach(() => setGlobalLang("ja")); // restore the module default

  it.each(LANGS)("emits the actual secondary color in both modes and every contrast level in %s", (lang) => {
    for (const contrast of ["standard", "medium", "high"] as const) {
      const doc = { ...fixture(), theme: { ...DEFAULT_THEME, bothModes: true, contrast } };
      const prompt = buildPrompt(doc, {}, undefined, lang);
      for (const dark of [false, true]) {
        const p = paletteOf(doc.paletteKey, undefined, { ...doc.theme, dark });
        expect(prompt).toContain(`secondary ${p.secondary} / secondaryContainer`);
      }
    }
  });
});

describe("navigation rail expansion", () => {
  afterEach(() => setGlobalLang("ja"));

  const LEAD: Record<Lang, string> = { ja: "- 左端に", en: "- Along the left edge: ", zh: "- 左缘：", ko: "- 왼쪽 가장자리에 " };
  /* the rail's own tag: what it says about itself, apart from the rows and buttons inside */
  const railTag = (layout: string) => layout.match(/<NavigationRail [^>]*>/)![0];
  const railLayout = (lang: Lang, props: Record<string, unknown>) => {
    const doc = fixture();
    doc.groups = [{ id: "rail", x: 0, y: 0, axis: "x", items: [part("navigation-rail", "rail", props)] }];
    return layoutOf(buildPrompt(doc, {}, undefined, lang), lang);
  };

  it.each(LANGS)("exports only the selected rail state and presentation in %s", (lang) => {
    for (const expanded of [false, true]) {
      for (const modal of [false, true]) {
        const layout = railLayout(lang, { expanded, modal: expanded && modal, selected: 1, items: [{ icon: "home", label: "Home" }, { icon: "star", label: "Saved" }] });
        expect(layout).toContain(LEAD[lang]);
        const tag = railTag(layout);
        expect(tag.includes(" expanded")).toBe(expanded);
        expect(tag.includes(" modal")).toBe(expanded && modal);
        expect(layout).toContain('label="Saved" active');
        expect(layout).not.toContain('label="Home" active');
      }
    }
  });

  it.each(LANGS)("keeps a collapsed modal rail modal, for when it opens, in %s", (lang) => {
    const tag = railTag(railLayout(lang, { modal: true }));
    expect(tag).not.toContain(" expanded");
    expect(tag).toContain(" modal");
  });
});

describe("buildPrompt structure", () => {
  afterEach(() => setGlobalLang("ja")); // restore the module default

  it.each(LANGS)("orders its sections the same way in %s", (lang) => {
    expect(headings(build(lang))).toEqual(SECTIONS[lang]);
  });

  it.each(LANGS)("targets the web with shadcn M3E on the intro lines in %s", (lang) => {
    expect(lines(build(lang))[2]).toBe(PLATFORM_LINE[lang]);
  });

  it.each(LANGS)("never mentions Android or Compose in %s", (lang) => {
    /* `fab: false`: the rail's own button is labeled "Compose", the verb rather than the toolkit */
    const rail = part("navigation-rail", "rail", { expanded: true, modal: true, fab: false });
    const sheet = part("sheet", "sheet");
    const carousel = part("carousel", "carousel");
    const doc = { ...fixture(), dynamicColor: true };
    doc.groups = [...doc.groups, ...[rail, sheet, carousel].map((it, i) => ({ id: `g${i}`, x: 0, y: i * 100, axis: "x" as const, items: [it] }))];
    const prompt = buildPrompt(doc, {}, undefined, lang);
    expect(prompt).not.toMatch(/Android|Compose|Jetpack|APK|Room|DataStore|Material Web/);
  });

  it.each(LANGS)("quotes labels with %s punctuation", (lang) => {
    const prompt = build(lang);
    expect(prompt).toContain(QUOTED[lang].label);
    for (const other of QUOTED[lang].others) expect(prompt).not.toContain(other);
  });

  it("follows its lang argument regardless of ambient module state", () => {
    setGlobalLang("en");
    const doc = fixture();
    setGlobalLang("zh");
    const prompt = buildPrompt(doc, {}, undefined, "ja");
    expect(headings(prompt)).toEqual(SECTIONS.ja);
    expect(prompt).toContain("「Save」");
  });
});

describe("buildPrompt wording", () => {
  afterEach(() => setGlobalLang("ja"));
  const onScreen = (groups: Doc["groups"]): Doc => ({ ...fixture(), groups });

  it("writes a run of parts as a row or a stack, each part as itself", () => {
    const run = [part("chip", "c", { items: [{ label: "Tag" }] }), part("button", "b", { label: "Go", variant: "tonal" })];
    const across = buildPrompt(onScreen([{ id: "g", x: 16, y: 100, axis: "x", items: run }]), {}, undefined, "en");
    expect(across).toContain("a row of 2:");
    expect(across).toContain(`variant="tonal"`);
    expect(across).toContain("Chip");
    expect(across).not.toContain("button group");
    expect(buildPrompt(onScreen([{ id: "g", x: 16, y: 100, axis: "y", items: run }]), {}, undefined, "en")).toContain("a stack of 2:");
  });

  it("says what a toggle button changes to when on", () => {
    const toggle = (props: Record<string, unknown>) => buildPrompt(onScreen([{ id: "g", x: 16, y: 100, axis: "x", items: [part("button", "b", { label: "Follow", toggle: true, ...props })] }]), {}, undefined, "en");
    expect(toggle({ onLook: "tonal" })).toContain("the variant becomes tonal");
    expect(toggle({})).not.toContain("the variant becomes");
  });

  it.each(LANGS)("speaks of the web, not of Compose, in %s", (lang) => {
    for (const motion of ["standard", "expressive"] as const) {
      const prompt = buildPrompt({ ...fixture(), theme: { ...DEFAULT_THEME, motion } }, {}, undefined, lang);
      expect(prompt).toContain(`motion: "${motion}"`);
      expect(prompt).toContain("M3ThemeProvider");
      expect(prompt).not.toMatch(/MotionScheme|\bRow\b|\bBox\b/);
    }
  });
});

/* The placeholder parts state their box, and a dropdown names its options and initial value.
 * Each sits in its own group, so its whole code is written out. */
describe("buildPrompt for the camera, map and dropdown parts", () => {
  afterEach(() => setGlobalLang("ja"));

  const NOUN: Record<Lang, [camera: string, map: string]> = {
    ja: ["カメラプレースホルダー", "地図プレースホルダー"],
    en: ["Camera placeholder", "Map placeholder"],
    zh: ["相机占位", "地图占位"],
    ko: ["카메라 자리표시자", "지도 자리표시자"],
  };

  function screen(lang: Lang, items: Item[]) {
    setGlobalLang(lang);
    const doc: Doc = {
      groups: items.map((it, i) => ({ id: `g${i}`, x: 16, y: 100 + i * 300, axis: "x", items: [it] })),
      frames: [{ id: "f", name: "Home", x: 0, y: 0 }],
      paletteKey: "purple",
      frame: "phone",
      title: "Notes",
      brief: "",
    };
    return buildPrompt(doc, {}, undefined, lang);
  }

  it.each(LANGS)("writes the camera and map boxes as width and height in %s", (lang) => {
    const prompt = screen(lang, [part("camera", "cam"), part("map", "map", { width: 200, height: 120 })]);
    /* capability views: drawn at their size, and said to be the product's slot to draw for real */
    expect(prompt).toContain("width={360} height={480}");
    expect(prompt).toContain(NOUN[lang][0]);
    expect(prompt).toContain("width={200} height={120}");
    expect(prompt).toContain(NOUN[lang][1]);
    expect(prompt).toContain("src/custom/slots");
  });

  it.each(LANGS)("lists a dropdown's options and names the initial value in %s", (lang) => {
    const props = { label: "Size", items: [{ label: "Espresso" }, { label: "Latte" }] };
    const withValue = screen(lang, [part("select", "sel", { ...props, selected: 1 })]);
    for (const word of ["Size", "Espresso", "Latte"]) expect(withValue).toContain(word);
    expect(withValue).toContain('defaultValue="Latte"');
    const noValue = screen(lang, [part("select", "sel", { ...props, selected: -1 })]);
    expect(noValue).toContain("Latte");
    expect(noValue).not.toContain("defaultValue");
  });
});

describe("scrollable tab rows in the prompt", () => {
  const withTabs = (n: number) => part("tabs", "tabs", { items: Array.from({ length: n }, (_, i) => ({ label: `Tab ${i + 1}`, icon: "" })) });
  const doc = (n: number): Doc => ({
    title: "T", brief: "", paletteKey: "purple", frame: "phone",
    frames: [{ id: "f", name: "Home", x: 0, y: 0 }],
    groups: [{ id: "g", x: 0, y: 100, axis: "x", items: [withTabs(n)] }],
  });
  const marker = "overflow-x-auto";

  it.each(LANGS)("says a row of seven tabs scrolls in %s, and a row of five does not", (lang) => {
    expect(buildPrompt(doc(7), {}, undefined, lang)).toContain(marker);
    expect(buildPrompt(doc(5), {}, undefined, lang)).not.toContain(marker);
  });
});

describe("cards laid out as a grid", () => {
  afterEach(() => setGlobalLang("ja"));

  const GRID: Record<Lang, (cols: number) => string> = {
    ja: (c) => `${c}列のグリッド`,
    en: (c) => `in ${c} columns`,
    zh: (c) => `${c} 列网格`,
    ko: (c) => `${c}열 그리드`,
  };
  const ONE_ROW: Record<Lang, string> = { ja: "横一列に並べます", en: "in one row from left to right", zh: "横向排成一行", ko: "한 행에 다음 항목을 배치합니다" };

  /* cells of `w` wide cards (or another part) at the given column and row offsets inside a phone screen */
  function layout(lang: Lang, cells: { x: number; y: number; slug?: string; w?: number }[]) {
    setGlobalLang(lang);
    const doc = fixture();
    doc.groups = cells.map((c, i) => ({
      id: `g${i}`,
      x: c.x,
      y: c.y,
      axis: "x" as const,
      items: [part(c.slug ?? "card", `c${i}`, { title: `Cell ${i + 1}` })],
    }));
    const widths = Object.fromEntries(cells.flatMap((c, i) => [[`c${i}`, c.w ?? 182], [`c${i}:h`, 200]]));
    return layoutOf(buildPrompt(doc, widths, undefined, lang), lang);
  }
  const square = (cols: number, count: number) =>
    Array.from({ length: count }, (_, i) => ({ x: 16 + (i % cols) * 198, y: 100 + Math.floor(i / cols) * 216 }));

  it.each(LANGS)("writes aligned rows of cards as one grid with its gaps, every cell in reading order, in %s", (lang) => {
    const text = layout(lang, square(2, 4));
    expect(text).toContain(GRID[lang](2));
    expect(text).toContain("16dp");
    expect(text).not.toContain(ONE_ROW[lang]);
    const at = [1, 2, 3, 4].map((n) => text.indexOf(`Cell ${n}`));
    expect(at.every((p) => p >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it.each(LANGS)("keeps a shorter last row inside the grid in %s", (lang) => {
    const text = layout(lang, square(2, 3));
    expect(text).toContain(GRID[lang](2));
    expect(text).toContain("Cell 3");
    expect(text).not.toContain(ONE_ROW[lang]);
  });

  it.each(LANGS)("leaves a single row, mixed parts and cells off the columns as rows in %s", (lang) => {
    expect(layout(lang, square(2, 2))).not.toContain(GRID[lang](2));
    const mixed = square(2, 4).map((c, i) => (i === 3 ? { ...c, slug: "image" } : c));
    expect(layout(lang, mixed)).toContain(ONE_ROW[lang]);
    const shifted = square(2, 4).map((c, i) => (i === 2 ? { ...c, x: c.x + 40 } : c));
    expect(layout(lang, shifted)).not.toContain(GRID[lang](2));
    const narrow = square(2, 4).map((c, i) => (i === 3 ? { ...c, w: 160 } : c));
    expect(layout(lang, narrow)).not.toContain(GRID[lang](2));
  });
});

describe("a screen whose body scrolls", () => {
  const SCROLLS: Record<Lang, string> = {
    ja: "画面の長さは 1784dp で、端末に映る 892dp より長いため、本文は縦にスクロールします。",
    en: "The screen runs 1784dp, longer than the 892dp the device shows, so its body scrolls vertically;",
    zh: "屏幕总长 1784dp，超过设备可显示的 892dp，因此内容区域可纵向滚动；",
    ko: "화면 길이는 1784dp로 기기에 보이는 892dp보다 길어서 본문이 세로로 스크롤된다.",
  };
  const prompt = (lang: Lang, length?: number) => {
    setGlobalLang(lang);
    const doc = fixture();
    return buildPrompt({ ...doc, frames: [{ ...doc.frames[0], length }] }, {}, undefined, lang);
  };

  it.each(LANGS)("says so under the screen's heading (%s)", (lang) => {
    const ls = lines(prompt(lang, 1784));
    const at = ls.findIndex((l) => l.includes(SCROLLS[lang]));
    expect(at).toBeGreaterThan(ls.indexOf(SECTIONS[lang][2]));
    expect(at).toBeLessThan(ls.indexOf(SECTIONS[lang][3]));
  });

  it.each(LANGS)("says nothing of scrolling for a screen the device holds (%s)", (lang) => {
    expect(prompt(lang)).not.toContain(SCROLLS[lang]);
    expect(prompt(lang, 892)).not.toContain(SCROLLS[lang]);
  });
});

describe("what each part asks of the auto layout it is in", () => {
  const doc = (groups: Doc["groups"]): Doc => ({ groups, frames: [{ id: "f", name: "Home", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "T", brief: "" });
  const row = (): Doc["groups"] => [
    { id: "row", x: 16, y: 80, axis: "x", items: [part("box", "i-row", { layout: "row", gap: 8, width: 360, height: 100, hugWidth: false, surface: "card" })] },
    { id: "a", x: 16, y: 92, axis: "x", inFlow: "row", items: [part("button", "i-a", { label: "Fills" }, { flowSize: { w: "fill" }, alignSelf: "end", flowMin: { w: 120 } })] },
    { id: "b", x: 330, y: 70, axis: "x", inFlow: "row", items: [part("badge", "i-b", { label: "3" }, { flowAbsolute: true })] },
    { id: "c", x: 200, y: 92, axis: "x", inFlow: "row", items: [part("button", "i-c", { label: "Fixed" })] },
  ];
  const widths = { "i-row": 360, "i-row:h": 100, "i-a": 100, "i-a:h": 40, "i-b": 20, "i-b:h": 20, "i-c": 100, "i-c:h": 40, "i-g": 360, "i-g:h": 200, "i-w": 100, "i-w:h": 40, "i-s": 360, "i-s:h": 80, "i-k": 100, "i-k:h": 40 };
  const said = (lang: Lang, groups = row()) => {
    setGlobalLang(lang);
    return lines(buildPrompt(doc(groups), widths, undefined, lang));
  };

  it("says how a flowed part is sized, aligned and limited, with the classes that do it", () => {
    const ls = said("en");
    const fills = ls.find((l) => l.includes('"Fills"'))!;
    expect(fills).toContain("takes the remaining width (`min-w-0 flex-1`)");
    expect(fills).toContain("aligned to the end across the row (`self-end`)");
    expect(fills).toContain("at least 120dp wide (`min-w-[120px]`)");
    /* a part that goes by the container says nothing more */
    expect(ls.find((l) => l.includes('"Fixed"'))).toMatch(/<\/Button>`\.$/);
  });

  it("lists a part standing loose in the layout on top of it, where it stands, not in the run", () => {
    const ls = said("en");
    const run = ls.findIndex((l) => l.includes("Nested in the auto layout of"));
    const loose = ls.findIndex((l) => l.includes("Layered on top of") && l.includes("out of its auto layout"));
    const badge = ls.findIndex((l) => l.includes("Badge"));
    expect(loose).toBeGreaterThan(run);
    expect(badge).toBeGreaterThan(loose);
    expect(ls[badge]).toContain("at left 314px, top -10px (`absolute left-[314px] top-[-10px]`)");
    /* the run lists only what takes its turn in it */
    expect(ls.slice(run, loose).some((l) => l.includes("Badge"))).toBe(false);
  });

  it.each(LANGS)("says it in every language (%s)", (lang) => {
    const text = said(lang).join("\n");
    expect(text).toContain("`min-w-0 flex-1`");
    expect(text).toContain("`self-end`");
    expect(text).toContain("`min-w-[120px]`");
    expect(text).toContain("`absolute left-[314px] top-[-10px]`");
  });

  it("says a grid part's span and a part that keeps its own height in a stretching row", () => {
    const groups: Doc["groups"] = [
      { id: "g", x: 16, y: 80, axis: "x", items: [part("box", "i-g", { layout: "grid", columns: 3, gap: 8, width: 360, height: 200, hugWidth: false, surface: "card" })] },
      { id: "w", x: 16, y: 92, axis: "x", inFlow: "g", items: [part("button", "i-w", { label: "Wide" }, { flowSpan: 2 })] },
      { id: "s", x: 16, y: 300, axis: "x", items: [part("box", "i-s", { layout: "row", align: "stretch", gap: 8, width: 360, height: 80, hugWidth: false, surface: "card" })] },
      { id: "k", x: 16, y: 310, axis: "x", inFlow: "s", items: [part("button", "i-k", { label: "Keep" }, { flowSize: { h: "fixed" } })] },
    ];
    const text = said("en", groups).join("\n");
    expect(text).toContain("spans 2 columns (`col-span-2`)");
    expect(text).toContain("keeps its own height rather than stretching (`self-start`)");
  });
});
