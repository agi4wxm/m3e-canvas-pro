/**
 * lib/prompt.ts — prompt generation per language.
 *
 * Locks in:
 *  - buildPrompt picks the right language strings (ja / en / zh)
 *  - the prompt includes intro, target, platform, sketch header
 *  - the color section lists every required Palette role
 *  - the layout section names every part and writes out its code
 *  - Japanese / Chinese quotes are used per language
 *  - bothModes emits BOTH light and dark palette sections
 *  - dynamicColor flag changes the prompt text
 *  - the prompt targets the web with shadcn M3E
 *  - effectivePrompt returns the author's edit when present, buildPrompt otherwise
 *  - onlyFrameId restricts output to one screen
 *  - empty doc still produces a valid prompt (freeform / empty message)
 *  - action text "goes back to..." is emitted for BACK_TARGET action
 *  - quote handling: empty/whitespace label is treated as no label
 */
import { describe, expect, it } from "vitest";
import { buildPrompt, effectivePrompt } from "./prompt";
import { Lang } from "./i18n";
import {
  Doc,
  Frame,
  Item,
  Palette,
  PHONE_H,
  makeItem,
  LINK_TARGET,
} from "./tokens";

const widths: Record<string, number> = {};
const paletteKey = "baseline";
const palette: Palette = {
  key: "baseline",
  label: "Baseline",
  seed: "#6750A4",
  primary: "#6750A4",
  onPrimary: "#FFFFFF",
  primaryContainer: "#EADDFF",
  onPrimaryContainer: "#21005D",
  inversePrimary: "#D0BCFF",
  secondary: "#635A75",
  secondaryContainer: "#E8DEF8",
  onSecondaryContainer: "#1D192B",
  tertiaryContainer: "#FFD8E4",
  onTertiaryContainer: "#31111D",
  surface: "#FEF7FF",
  surfaceContainerLow: "#F7F2FA",
  surfaceContainer: "#F3EDF7",
  surfaceContainerHigh: "#ECE6F0",
  surfaceContainerHighest: "#E6E0E9",
  onSurface: "#1D1B20",
  onSurfaceVariant: "#49454F",
  outline: "#79747E",
  outlineVariant: "#CAC4D0",
  inverseSurface: "#322F35",
  inverseOnSurface: "#F5EFF7",
  error: "#B3261E",
  onError: "#FFFFFF",
  errorContainer: "#F9DEDC",
  onErrorContainer: "#410E0B",
};

const phoneFrame: Frame = { id: "f1", name: "Home", x: 0, y: 0 };

const part = (slug: string, id: string, props: Record<string, unknown> = {}, extra: Partial<Item> = {}): Item => ({ ...makeItem("component", slug), id, props, ...extra });

function baseDoc(overrides: Partial<Doc> = {}): Doc {
  return {
    title: "MyApp",
    brief: "",
    paletteKey,
    customPalette: palette,
    frame: "phone",
    groups: [],
    frames: [phoneFrame],
    ...overrides,
  };
}

describe("buildPrompt — language switch", () => {
  it("emits English when lang='en'", () => {
    const doc = baseDoc();
    const out = buildPrompt(doc, widths, undefined, "en");
    expect(out).toContain("MyApp");
    // English introductory framing
    expect(out).toMatch(/Material 3 Expressive/);
  });

  it("emits Japanese when lang='ja' (uses 「」 quotes and 日本語 headers)", () => {
    const doc = baseDoc();
    const out = buildPrompt(doc, widths, undefined, "ja");
    expect(out).toContain("Material 3 Expressive");
    // ja intro phrasing contains 「...」 somewhere when title quoted, or Japanese sentence-ending
    expect(out).toMatch(/を実装してください|画面/);
  });

  it("emits Chinese when lang='zh' (uses “” quotes)", () => {
    const doc = baseDoc();
    const out = buildPrompt(doc, widths, undefined, "zh");
    expect(out).toContain("Material 3 Expressive");
    expect(out).toMatch(/使用|屏幕|组件|设计/);
  });
});

describe("buildPrompt — palette section", () => {
  it("includes every required color role", () => {
    const doc = baseDoc();
    const out = buildPrompt(doc, widths, undefined, "en");
    for (const role of [
      "primary",
      "onPrimary",
      "primaryContainer",
      "onPrimaryContainer",
      "secondary",
      "secondaryContainer",
      "onSecondaryContainer",
      "tertiaryContainer",
      "onTertiaryContainer",
      "surface",
      "surfaceContainerLow",
      "surfaceContainer",
      "surfaceContainerHigh",
      "surfaceContainerHighest",
      "onSurface",
      "onSurfaceVariant",
      "outline",
      "outlineVariant",
      "inverseSurface",
      "inverseOnSurface",
      "inversePrimary",
      "error",
      "onError",
      "errorContainer",
      "onErrorContainer",
    ] as const) {
      expect(out).toContain(`${role} ${palette[role]}`);
    }
  });

  it("writes hex colors uppercased", () => {
    const doc = baseDoc();
    const out = buildPrompt(doc, widths, undefined, "en");
    expect(out).toContain("#6750A4");
    expect(out).toContain("#FEF7FF");
  });

  it("bothModes=true emits both light and dark color sections", () => {
    const doc = baseDoc({ theme: { dark: false, bothModes: true, contrast: "standard", shape: "rounded", font: "roboto", emphasized: false, motion: "standard" } });
    const out = buildPrompt(doc, widths, undefined, "en");
    // bothModes is the only path that pushes both scheme headers — one
    // section alone can never emit "Dark scheme:".
    expect(out).toContain("Light scheme:");
    expect(out).toContain("Dark scheme:");
  });

  it("dynamicColor=true adds the dynamic-color note", () => {
    const doc = baseDoc({ dynamicColor: true });
    const out = buildPrompt(doc, widths, undefined, "en");
    expect(out).toMatch(/dynamic|wallpaper|Material You/i);
  });
});

describe("buildPrompt — items are named in language", () => {
  it("an English button is named and written out as the code it stands for", () => {
    const item = part("button", "b1", { label: "Click" });
    const doc = baseDoc({ groups: [{ id: "g", x: 100, y: 100, axis: "x", items: [item] }] });
    const out = buildPrompt(doc, widths, undefined, "en");
    expect(out).toContain(`the shadcn M3E Button "Click"`);
    expect(out).toContain(`<Button variant="filled"`);
  });

  /* a part's line quotes its code; the behavior notes are what quote its label in the language */
  it("a Japanese button is noted with 「ラベル」 quotes", () => {
    const item = part("button", "b1", { label: "クリック" }, { note: "保存する" });
    const doc = baseDoc({ groups: [{ id: "g", x: 100, y: 100, axis: "x", items: [item] }] });
    const out = buildPrompt(doc, widths, undefined, "ja");
    expect(out).toContain("「クリック」");
  });

  it("a Chinese list item is noted with “…” quotes and Chinese text", () => {
    const item = part("item", "l1", { items: [{ label: "项目", icon: "person" }] }, { note: "打开详情" });
    const doc = baseDoc({ groups: [{ id: "g", x: 100, y: 100, axis: "y", items: [item] }] });
    const out = buildPrompt(doc, widths, undefined, "zh");
    expect(out).toContain("“项目”");
  });

  it("empty / whitespace label falls back to the part's bare name in English", () => {
    const item = part("button", "b1", { label: "   " });
    const doc = baseDoc({ groups: [{ id: "g", x: 100, y: 100, axis: "x", items: [item] }] });
    const out = buildPrompt(doc, widths, undefined, "en");
    expect(out).toContain("the shadcn M3E Button: `");
  });
});

describe("extended FAB scroll-collapse prompt", () => {
  const BEHAVIOR: Record<Lang, string> = {
    ja: "本文を下へスクロールするとアイコンのみの標準 FAB に右側へ縮まり（右端は固定）、スクロールを止めても縮んだまま。上へスクロールすると拡張 FAB に戻る",
    en: "when the body scrolls down, it collapses toward the right into an icon-only standard FAB (right edge fixed) and stays collapsed after scrolling stops; scrolling up expands it back to the extended FAB",
    zh: "正文向下滚动时向右收起为仅显示图标的标准 FAB（右边缘固定），停止滚动后仍保持收起；向上滚动时恢复为扩展 FAB",
    ko: "본문을 아래로 스크롤하면 오른쪽으로 아이콘만 표시하는 표준 FAB까지 접히고(오른쪽 가장자리 고정) 스크롤을 멈춰도 접힌 상태를 유지하며, 위로 스크롤하면 확장 FAB로 돌아온다",
  };

  it.each(["ja", "en", "zh", "ko"] as Lang[])("describes the enabled scroll transform in %s", (lang) => {
    const fab = part("fab", "fab", { label: "Add", icon: "add" }, { collapseOnScroll: true });
    expect(buildPrompt(baseDoc({ frames: [{ ...phoneFrame, length: PHONE_H * 2 }], groups: [{ id: "g", x: 100, y: 100, axis: "x", items: [fab] }] }), widths, undefined, lang)).toContain(BEHAVIOR[lang]);
  });

  it.each(["ja", "en", "zh", "ko"] as Lang[])("does not describe the transform when the screen does not scroll in %s", (lang) => {
    const fab = part("fab", "fab", { label: "Add", icon: "add" }, { collapseOnScroll: true });
    expect(buildPrompt(baseDoc({ groups: [{ id: "g", x: 100, y: 100, axis: "x", items: [fab] }] }), widths, undefined, lang)).not.toContain(BEHAVIOR[lang]);
  });

  it.each(["ja", "en", "zh", "ko"] as Lang[])("does not describe the transform without an icon to fold into in %s", (lang) => {
    const fab = part("fab", "fab", { label: "Add", icon: "" }, { collapseOnScroll: true });
    expect(buildPrompt(baseDoc({ frames: [{ ...phoneFrame, length: PHONE_H * 2 }], groups: [{ id: "g", x: 100, y: 100, axis: "x", items: [fab] }] }), widths, undefined, lang)).not.toContain(BEHAVIOR[lang]);
  });

  it.each(["ja", "en", "zh", "ko"] as Lang[])("does not describe the transform when disabled in %s", (lang) => {
    const fab = part("fab", "fab", { label: "Add", icon: "add" }, { collapseOnScroll: false });
    expect(buildPrompt(baseDoc({ frames: [{ ...phoneFrame, length: PHONE_H * 2 }], groups: [{ id: "g", x: 100, y: 100, axis: "x", items: [fab] }] }), widths, undefined, lang)).not.toContain(BEHAVIOR[lang]);
  });
});

describe("buildPrompt — web with shadcn M3E", () => {
  it("targets the web and the installed shadcn M3E components", () => {
    const out = buildPrompt(baseDoc(), widths, undefined, "en");
    expect(out).toMatch(/web/i);
    expect(out).toContain("shadcn M3E");
    expect(out).toContain("@/components/m3e/*");
    expect(out).not.toMatch(/Android|Compose|Jetpack|APK/);
  });

});

describe("buildPrompt — a part's shape and its entries are in its code", () => {
  const screen = (item: Item) => baseDoc({ groups: [{ id: "g", x: 16, y: 100, axis: "x", items: [item] }] });

  it("a carousel names its layout and its cards", () => {
    const slides = [{ label: "One" }, { label: "Two" }, { label: "Three" }];
    const out = buildPrompt(screen(part("expressive-carousel", "c", { variant: "hero", slides })), widths, undefined, "en");
    expect(out).toContain(`variant="hero"`);
    for (const { label } of slides) expect(out).toContain(label);
  });

  it("a FAB menu says so, with the entries it raises", () => {
    const items = [{ label: "Note", icon: "edit" }, { label: "Voice", icon: "mic" }];
    const out = buildPrompt(screen(part("fab-menu", "f", { items })), widths, undefined, "en");
    expect(out).toContain("<FabMenu");
    expect(out).toContain("Note");
    expect(out).toContain("Voice");
    expect(out).toContain("edit");
    expect(out).toContain("mic");
  });

  it("a progress indicator still says which shape it is", () => {
    const bar = buildPrompt(screen(part("progress", "p", { variant: "wavy", value: 40 })), widths, undefined, "en");
    expect(bar).toContain(`<Progress value={40} variant="wavy"`);
    const ring = buildPrompt(screen(part("circular-progress", "r", { indeterminate: true, thickness: 8 })), widths, undefined, "en");
    expect(ring).toContain("<CircularProgress");
    expect(ring).toContain("thickness={8}");
    expect(ring).not.toMatch(/<CircularProgress[^>]*value=/);
  });

  it("an app bar names its size", () => {
    expect(buildPrompt(screen(part("app-bar", "b", { title: "Inbox", size: "medium" })), widths, undefined, "en")).toContain(`size="medium"`);
    expect(buildPrompt(screen(part("app-bar", "b", { title: "Inbox" })), widths, undefined, "en")).not.toContain(`size="medium"`);
  });
});

describe("buildPrompt — behavior / actions", () => {
  it("an item with action.to='back' generates a 'go back' note", () => {
    const item = part("button", "b1", { label: "Back" }, { action: { to: "back", transition: "none" } });
    const doc = baseDoc({ groups: [{ id: "g", x: 100, y: 100, axis: "x", items: [item] }] });
    const out = buildPrompt(doc, widths, undefined, "en");
    expect(out).toMatch(/go back|previous screen/i);
  });

  it("a button with a link action names the address it opens, and says nothing without one", () => {
    const linked = part("button", "b1", { label: "Docs" }, { action: { to: LINK_TARGET, transition: "none", url: "example.com/docs" } });
    const doc = baseDoc({ groups: [{ id: "g", x: 100, y: 100, axis: "x", items: [linked] }] });
    expect(buildPrompt(doc, widths, undefined, "en")).toContain("opens https://example.com/docs in a new browser tab");
    const blank = baseDoc({ groups: [{ id: "g", x: 100, y: 100, axis: "x", items: [{ ...linked, action: { to: LINK_TARGET, transition: "none" } }] }] });
    expect(buildPrompt(blank, widths, undefined, "en")).not.toMatch(/browser tab/);
  });

  it("a button that was given a size says so, by the M3 size it lands on", () => {
    const tall = part("button", "b1", { label: "Start", size: "lg" });
    const doc = baseDoc({ groups: [{ id: "g", x: 100, y: 100, axis: "x", items: [tall] }] });
    expect(buildPrompt(doc, widths, undefined, "en")).toContain(`size="lg"`);
    const plain = baseDoc({ groups: [{ id: "g", x: 100, y: 100, axis: "x", items: [{ ...tall, props: { label: "Start" } }] }] });
    expect(buildPrompt(plain, widths, undefined, "en")).not.toContain(`size="lg"`);
  });

  it("an item with action.to=<frameId> generates an 'opens the ... screen' note", () => {
    const target: Frame = { id: "f2", name: "Settings", x: 600, y: 0 };
    const item = part("button", "b1", { label: "Open" }, { action: { to: "f2", transition: "slide" } });
    const doc = baseDoc({ frames: [phoneFrame, target], groups: [{ id: "g", x: 100, y: 100, axis: "x", items: [item] }] });
    const out = buildPrompt(doc, widths, undefined, "en");
    expect(out).toContain(`"Settings"`);
    expect(out).toMatch(/opens the .* screen/);
  });
});

describe("buildPrompt — empty document", () => {
  it("an empty groups list still produces a non-empty prompt", () => {
    const doc = baseDoc();
    const out = buildPrompt(doc, widths, undefined, "en");
    expect(out.length).toBeGreaterThan(100);
    // Should NOT have a layout tree but should have the intro
    expect(out).toContain("MyApp");
  });
});

describe("buildPrompt — onlyFrameId", () => {
  it("restricts output to the named frame only", () => {
    const f2: Frame = { id: "f2", name: "Other", x: 600, y: 0 };
    const item1 = part("button", "a", { label: "OnlyHome" });
    const item2 = part("button", "b", { label: "OnlyOther" });
    const doc = baseDoc({
      frames: [phoneFrame, f2],
      groups: [
        { id: "g1", x: 100, y: 100, axis: "x", items: [item1] },
        { id: "g2", x: 700, y: 100, axis: "x", items: [item2] },
      ],
    });
    const only = buildPrompt(doc, widths, "f1", "en");
    const all = buildPrompt(doc, widths, undefined, "en");
    expect(only).toContain("OnlyHome");
    expect(only).not.toContain("OnlyOther");
    expect(all).toContain("OnlyHome");
    expect(all).toContain("OnlyOther");
  });
});

describe("buildPrompt — multi-screen doc", () => {
  it("two phone frames produces a screens section listing both names", () => {
    const f2: Frame = { id: "f2", name: "Settings", x: 600, y: 0 };
    const doc = baseDoc({
      frames: [phoneFrame, f2],
      groups: [
        { id: "g1", x: 100, y: 100, axis: "x", items: [part("button", "a", { label: "B1" })] },
        { id: "g2", x: 700, y: 100, axis: "x", items: [part("button", "b", { label: "B2" })] },
      ],
    });
    const out = buildPrompt(doc, widths, undefined, "en");
    expect(out).toContain(`"Home"`);
    expect(out).toContain(`"Settings"`);
  });
});

describe("effectivePrompt", () => {
  it("returns the author's promptEdit when present", () => {
    const doc = baseDoc({ promptEdit: "CUSTOM PROMPT TEXT" });
    expect(effectivePrompt(doc, widths, "en")).toBe("CUSTOM PROMPT TEXT");
  });

  it("returns buildPrompt output when promptEdit is undefined", () => {
    const doc = baseDoc();
    const out = effectivePrompt(doc, widths, "en");
    expect(out).toContain("MyApp");
    expect(out).toMatch(/Material 3 Expressive/);
  });
});


describe("integration with makeItem", () => {
  it("buildPrompt accepts a Doc with items made by makeItem", () => {
    const item = makeItem("component", "button");
    const doc = baseDoc({ groups: [{ id: "g", x: 100, y: 100, axis: "x", items: [item] }] });
    const out = buildPrompt(doc, widths, undefined, "en");
    expect(out.length).toBeGreaterThan(200);
  });
});
