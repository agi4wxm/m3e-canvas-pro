import { appearanceOf } from "../parts/appearance";
import { partBySlug, reader, treeOf, withoutPickedImages } from "../parts/registry";
import { flowClasses } from "../parts/flow";
import { describeRepeats } from "./collections";
import { childLayoutOf, flowOf, flowOfItem, sizingOf, type Flow } from "./flow";
import { expandInstances } from "./instances";
import { INPUT_PROP } from "./interact";
import { labelOfPart } from "../parts/resize";
import { nameOf } from "../parts/labels";
import { roleOf } from "../parts/role";
import { inlineNode } from "../parts/print";
import { Lang, SWIPE_TEXT, TRANSITION_TEXT, getLang } from "./i18n";
import { isStrict, styleOf, styleTextOf, uxOf, withDocStyles } from "./styles";
import {
  Place,
  Action,
  ActionBody,
  BACK_TARGET,
  Condition,
  DocVar,
  Effect,
  LINK_TARGET,
  VarType,
  VarValue,
  heldBy,
  linkUrlOf,
  Doc,
  FONTS,
  Frame,
  Group,
  Item,
  Palette,
  Rect,
  SWIPE_DIRS,
  Theme,
  unionRect,
  explodeGroup,
  frameOfPart,
  frameLengthOf,
  framePresetOf,
  frameRect,
  frameSizeOf,
  groupBounds,
  isPhoneFrame,
  ownerIdOf,
  scrollsOf,
  canCollapseFab,
  normalizeTheme,
  paletteOf,
  actionSlotsOf,
} from "./tokens";

const hasText = (s?: string | null) => !!s && s.trim().length > 0;

/** what a part is called in the prompt: the component's own name */
const nounOf = (it: Item, lang: Lang): string => {
  const def = partBySlug(it.component);
  return def ? nameOf(def, lang) : it.component || "component";
};

/** the text a part leads with: the component's first text prop */
const leadTextOf = (it: Item): string => labelOfPart(partBySlug(it.component), it.props);

const qj = (s: string) => `「${s.trim()}」`;
const qe = (s: string) => `"${s.trim()}"`;
const qz = (s: string) => `“${s.trim()}”`;
const quote = (lang: Lang) => (lang === "ja" ? qj : lang === "zh" ? qz : qe);
const trimEnd = (s: string) => s.trim().replace(/[。.\s]+$/, "");

/** the optional scroll transform for an extended FAB, including its trailing-edge anchor */
function fabScrollText(it: Item, lang: Lang): string {
  if (!it.collapseOnScroll || !canCollapseFab(it)) return "";
  if (lang === "ja") return "。本文を下へスクロールするとアイコンのみの標準 FAB に右側へ縮まり（右端は固定）、スクロールを止めても縮んだまま。上へスクロールすると拡張 FAB に戻る";
  if (lang === "zh") return "。正文向下滚动时向右收起为仅显示图标的标准 FAB（右边缘固定），停止滚动后仍保持收起；向上滚动时恢复为扩展 FAB";
  if (lang === "ko") return ". 본문을 아래로 스크롤하면 오른쪽으로 아이콘만 표시하는 표준 FAB까지 접히고(오른쪽 가장자리 고정) 스크롤을 멈춰도 접힌 상태를 유지하며, 위로 스크롤하면 확장 FAB로 돌아온다";
  return "; when the body scrolls down, it collapses toward the right into an icon-only standard FAB (right edge fixed) and stays collapsed after scrolling stops; scrolling up expands it back to the extended FAB";
}

/** Where a box pinned as a bar stands (a kit's top bar, tab bar, buy bar or sheet): the edge it is fixed to. The real
 *  bars say it by what they are; a box only says it by its `pin`. */
const PIN_TEXT: Record<Lang, Record<string, string>> = {
  ja: {
    top: "。画面の上端（ステータスバーの下）に画面幅いっぱいのバーとして固定し、本文をスクロールしても動かない",
    bottom: "。画面の下端（ホームインジケーターの上）に画面幅いっぱいのバーとして固定し、本文をスクロールしても動かない",
    floatingBottom: "。画面の下部に左右中央で浮かせて固定し、本文をスクロールしても動かない",
  },
  zh: {
    top: "。作为与屏幕同宽的栏固定在屏幕顶部（状态栏下方），正文滚动时保持不动",
    bottom: "。作为与屏幕同宽的栏固定在屏幕底部（主屏指示条上方），正文滚动时保持不动",
    floatingBottom: "。水平居中悬浮固定在屏幕底部，正文滚动时保持不动",
  },
  ko: {
    top: ". 화면 위쪽 가장자리(상태 표시줄 아래)에 화면 너비의 바로 고정하며, 본문을 스크롤해도 움직이지 않는다",
    bottom: ". 화면 아래쪽 가장자리(홈 인디케이터 위)에 화면 너비의 바로 고정하며, 본문을 스크롤해도 움직이지 않는다",
    floatingBottom: ". 화면 아래쪽에 가로 가운데로 떠 있게 고정하며, 본문을 스크롤해도 움직이지 않는다",
  },
  en: {
    top: "; a bar fixed to the top edge of the screen (below the status bar), as wide as the screen, staying put while the body scrolls",
    bottom: "; a bar fixed to the bottom edge of the screen (above the home indicator), as wide as the screen, staying put while the body scrolls",
    floatingBottom: "; floating over the bottom of the screen, centered, staying put while the body scrolls",
  },
};
const pinText = (it: Item, lang: Lang): string => (it.component === "box" ? (PIN_TEXT[lang][roleOf(it) ?? ""] ?? "") : "");

/** a part that is a shadcn M3E component is described by the code it stands for */
function componentText(it: Item, lang: Lang, name?: string): string {
  const def = partBySlug(it.component);
  if (!def) return it.label || "component";
  const lead = { ja: `shadcn M3E の ${nameOf(def, lang)}`, en: `the shadcn M3E ${nameOf(def, lang)}`, zh: `shadcn M3E 的 ${nameOf(def, lang)}`, ko: `shadcn M3E의 ${nameOf(def, lang)}` }[lang];
  const called = name?.trim() || labelOfPart(def, it.props);
  /* a picked image's data is the sketch's own: the prompt sees the placeholder the code prints */
  const props = withoutPickedImages(def, it.props ?? {}, "/placeholder.svg");
  const flow = flowOfItem(it);
  /* the classes say how it lays out what is nested in it, in every language */
  const layout = flow ? ` + auto layout \`${flowClasses(flow)}\`` : "";
  return `${lead}${called ? ` ${quote(lang)(called)}` : ""}: \`${inlineNode(treeOf(def, props, appearanceOf(it), it.id))}\`${layout}${fabScrollText(it, lang)}`;
}

/** A collapse-on-scroll FAB only has that behavior on a screen whose body actually scrolls. */
function promptGroupsForScroll(groups: Group[], scrollable: boolean): Group[] {
  if (scrollable) return groups;
  return groups.map((g) => ({
    ...g,
    items: g.items.map((it) => it.collapseOnScroll ? { ...it, collapseOnScroll: undefined } : it),
  }));
}

/* ================= groups of several parts ================= */

/** what is left where an instance was: the parts it comes to are written under it */
const INSTANCE_TEXT: Record<Lang, (name: string) => string> = {
  ja: (n) => `コンポーネント${qj(n)}のインスタンス`,
  en: (n) => `an instance of the component ${qe(n)}`,
  zh: (n) => `组件${qz(n)}的实例`,
  ko: (n) => `컴포넌트 ${qe(n)}의 인스턴스`,
};

function groupText(g: Group, lang: Lang): string {
  if (g.expandedFrom) return INSTANCE_TEXT[lang](g.name?.trim() || g.expandedFrom);
  /* a box a layout places stands where the layout puts it, pinned or not */
  if (g.items.length === 1) return `${componentText(g.items[0], lang, g.name)}${g.inFlow ? "" : pinText(g.items[0], lang)}`;
  /* parts of any kind can run together, so each says what it is */
  const parts = g.items.map((it) => componentText(it, lang)).join(lang === "ja" || lang === "zh" ? "；" : "; ");
  const n = g.items.length;
  const across = g.axis === "x";
  if (lang === "ja") return `${across ? "横一列" : "縦一列"}に並ぶ ${n} 個: ${parts}`;
  if (lang === "zh") return `${across ? "横向排成一行" : "纵向排成一列"}的 ${n} 个组件：${parts}`;
  if (lang === "ko") return `${across ? "가로로" : "세로로"} 나란히 놓인 ${n}개: ${parts}`;
  return `a ${across ? "row" : "stack"} of ${n}: ${parts}`;
}

/** short name for a run when it is referred to again (as a container or a neighbour) */
function groupName(g: Group, lang: Lang): string {
  if (g.expandedFrom) return INSTANCE_TEXT[lang](g.name?.trim() || g.expandedFrom);
  const it = g.items[0];
  const noun = nounOf(it, lang);
  const q = quote(lang);
  if (g.items.length > 1) {
    const across = g.axis === "x";
    const word = { ja: across ? "横の並び" : "縦の並び", en: across ? "row" : "stack", zh: across ? "横排" : "竖排", ko: across ? "가로 줄" : "세로 줄" }[lang];
    /* the part's name only says what the run is when the whole run is that part */
    if (g.items.some((x) => x.component !== it.component)) return lang === "en" ? `the ${word}` : word;
    return lang === "en" ? `the ${noun} ${word}` : lang === "ja" ? `${noun}の${word}` : lang === "ko" ? `${noun} ${word}` : `${noun}${word}`;
  }
  const called = g.name?.trim() || leadTextOf(it);
  if (hasText(called)) return lang === "en" ? `the ${q(called)} ${noun}` : `${q(called)}${lang === "ko" ? " " : ""}${noun}`;
  return lang === "en" ? `the ${noun}` : noun;
}

/* ================= behavior notes ================= */

function actionText(a: Action, frames: Frame[], lang: Lang): string | null {
  const q = quote(lang);
  if (a.to === LINK_TARGET) {
    const href = linkUrlOf(a);
    if (!href) return null;
    if (lang === "ja") return `${href} をブラウザの別タブで開く`;
    if (lang === "zh") return `在浏览器的新标签页中打开 ${href}`;
    if (lang === "ko") return `${href}를 브라우저 새 탭에서 연다`;
    return `opens ${href} in a new browser tab`;
  }
  if (a.to === BACK_TARGET) {
    return lang === "ja" ? "前の画面に戻る（入ったときの遷移を逆再生する）" : lang === "zh" ? "返回上一个屏幕（反向播放进入时的过渡动画）" : lang === "ko" ? "이전 화면으로 돌아간다(진입 전환을 반대로 재생)" : "goes back to the previous screen (playing the entry transition in reverse)";
  }
  const target = frames.find((f) => f.id === a.to);
  if (!target) return null;
  const tr = TRANSITION_TEXT[lang][a.transition];
  const name = q(target.name || (lang === "en" ? "screen" : lang === "zh" ? "屏幕" : lang === "ko" ? "화면" : "画面"));
  if (lang === "ja") return `${name}画面へ${a.transition !== "none" ? `${tr}で` : ""}遷移する`;
  if (lang === "zh") return `${a.transition !== "none" ? `以${tr}的方式` : ""}跳转到${name}屏幕`;
  if (lang === "ko") return `${name} 화면으로${a.transition !== "none" ? ` ${tr} 전환하여` : ""} 이동한다`;
  return `opens the ${name} screen${a.transition !== "none" ? ` with ${tr}` : ""}`;
}

/** slugs whose tab:N slots are menu entries rather than destinations */
const MENU_PARTS = new Set(["context-menu", "dropdown-menu", "menubar", "split-button", "fab-menu"]);

function slotName(it: Item, slot: string, lang: Lang): string {
  const s = actionSlotsOf(it).find((x) => x.key === slot);
  const q = quote(lang);
  /* slots that carry no destination label name their button instead */
  if (slot === "icon" || slot === "icon2" || slot === "menu" || slot === "rail") {
    const named = s?.label && s.label !== "Menu" && s.label !== "More" ? ` ${q(s.label)}` : "";
    if (lang === "ja") return `${slot === "icon2" ? "右" : "左"}の${named ? `${named} ` : ""}アイコンボタン`;
    if (lang === "zh") return `${slot === "icon2" ? "右侧" : "左侧"}的${named ? `${named} ` : ""}图标按钮`;
    if (lang === "ko") return `${slot === "icon2" ? "오른쪽" : "왼쪽"}${named ? ` ${named}` : ""} 아이콘 버튼`;
    return `the${named ? ` ${s?.label}` : ""} icon button on the ${slot === "icon2" ? "right" : "left"}`;
  }
  const label = s?.label ? q(s.label) : slot.startsWith("tab:") ? `#${Number(slot.slice(4)) + 1}` : slot;
  /* the two answers of a dialog are buttons */
  if (slot === "dismiss" || slot === "confirm") return { ja: `${label}ボタン`, en: `the ${label} button`, zh: `${label}按钮`, ko: `${label} 버튼` }[lang];
  /* an entry of a menu is picked from it; a destination on a bar is somewhere to go */
  const menu = MENU_PARTS.has(it.component ?? "");
  if (lang === "ja") return `${label}の${menu ? "メニュー項目" : "項目"}`;
  if (lang === "zh") return `${label}${menu ? "菜单项" : "项"}`;
  if (lang === "ko") return `${label} ${menu ? "메뉴 항목" : "항목"}`;
  return `the ${label} ${menu ? "menu item" : "destination"}`;
}

/* ---- what a tap does beyond where it goes, and what the screen starts without ---- */

type Scope = { frames: Frame[]; groups: Group[]; vars?: DocVar[]; widths: Record<string, number> };

const nameOfItem = (g: Group | undefined, it: Item, lang: Lang) => {
  if (g?.expandedFrom) return INSTANCE_TEXT[lang](g.name?.trim() || g.expandedFrom);
  const noun = nounOf(it, lang);
  const called = (g?.items.length === 1 && g.name?.trim()) || leadTextOf(it);
  if (!hasText(called)) return lang === "en" ? `the ${noun}` : noun;
  return lang === "en" ? `the ${quote(lang)(called)} ${noun}` : `${quote(lang)(called)}${lang === "ko" ? " " : ""}${noun}`;
};

function partRef(id: string, s: Scope, lang: Lang): string | null {
  const g = s.groups.find((x) => x.items.some((it) => it.id === id));
  const it = g?.items.find((x) => x.id === id);
  return it ? nameOfItem(g, it, lang) : null;
}

const varRef = (id: string, s: Scope) => {
  /* the row a repeated part was tapped in, read-only */
  if (id.startsWith("row.")) return id;
  const v = s.vars?.find((x) => x.id === id);
  return v ? v.name || v.id : null;
};

const valueText = (v: VarValue, lang: Lang) => (typeof v === "string" ? quote(lang)(v) : String(v));

function effectText(e: Effect, s: Scope, lang: Lang): string | null {
  const part = "part" in e ? partRef(e.part, s, lang) : null;
  const name = "var" in e ? varRef(e.var, s) : null;
  if ("part" in e ? !part : "var" in e && !name) return null;
  const say: Record<Lang, () => string> = {
    ja: () => {
      switch (e.do) {
        case "show": return `${part}を表示する`;
        case "hide": return `${part}を隠す`;
        case "toggle": return `${part}の表示と非表示を切り替える`;
        case "open": return `${part}を開く`;
        case "close": return `${part}を閉じる`;
        case "setVar": return `変数 ${name} を ${valueText(e.value, lang)} にする`;
        case "toggleVar": return `変数 ${name} を反転する`;
        case "addVar": return `変数 ${name} に ${e.by} を足す`;
        case "setProp": return `${part}の ${e.prop} を ${valueText(e.value, lang)} にする`;
        case "snackbar": return `${qj(e.message)}とスナックバーで知らせる`;
      }
    },
    en: () => {
      switch (e.do) {
        case "show": return `shows ${part}`;
        case "hide": return `hides ${part}`;
        case "toggle": return `shows or hides ${part}`;
        case "open": return `opens ${part}`;
        case "close": return `closes ${part}`;
        case "setVar": return `sets variable ${name} to ${valueText(e.value, lang)}`;
        case "toggleVar": return `flips variable ${name}`;
        case "addVar": return `adds ${e.by} to variable ${name}`;
        case "setProp": return `sets ${e.prop} of ${part} to ${valueText(e.value, lang)}`;
        case "snackbar": return `shows a snackbar saying ${qe(e.message)}`;
      }
    },
    zh: () => {
      switch (e.do) {
        case "show": return `显示${part}`;
        case "hide": return `隐藏${part}`;
        case "toggle": return `切换${part}的显示与隐藏`;
        case "open": return `打开${part}`;
        case "close": return `关闭${part}`;
        case "setVar": return `把变量 ${name} 设为 ${valueText(e.value, lang)}`;
        case "toggleVar": return `翻转变量 ${name}`;
        case "addVar": return `给变量 ${name} 加 ${e.by}`;
        case "setProp": return `把${part}的 ${e.prop} 设为 ${valueText(e.value, lang)}`;
        case "snackbar": return `用 Snackbar 提示${qz(e.message)}`;
      }
    },
    ko: () => {
      switch (e.do) {
        case "show": return `${part} 표시`;
        case "hide": return `${part} 숨기기`;
        case "toggle": return `${part} 표시 전환`;
        case "open": return `${part} 열기`;
        case "close": return `${part} 닫기`;
        case "setVar": return `변수 ${name}을(를) ${valueText(e.value, lang)}(으)로 설정`;
        case "toggleVar": return `변수 ${name} 반전`;
        case "addVar": return `변수 ${name}에 ${e.by} 더하기`;
        case "setProp": return `${part}의 ${e.prop}을(를) ${valueText(e.value, lang)}(으)로 설정`;
        case "snackbar": return `스낵바로 ${qe(e.message)} 표시`;
      }
    },
  };
  return say[lang]();
}

function conditionText(c: Condition, s: Scope, lang: Lang): string | null {
  if ("filled" in c) {
    const part = partRef(c.filled, s, lang);
    if (!part) return null;
    return { ja: `${part}に入力があるとき`, en: `if ${part} is filled in`, zh: `当${part}已填写时`, ko: `${part}에 입력이 있을 때` }[lang];
  }
  const name = varRef(c.var, s);
  if (!name) return null;
  const v = valueText(c.value, lang);
  return c.op === "neq"
    ? { ja: `変数 ${name} が ${v} でないとき`, en: `if variable ${name} is not ${v}`, zh: `当变量 ${name} 不等于 ${v} 时`, ko: `변수 ${name}이(가) ${v}이(가) 아닐 때` }[lang]
    : { ja: `変数 ${name} が ${v} のとき`, en: `if variable ${name} is ${v}`, zh: `当变量 ${name} 等于 ${v} 时`, ko: `변수 ${name}이(가) ${v}일 때` }[lang];
}

const THEN: Record<Lang, string> = { ja: "、続けて", en: ", then ", zh: "，然后", ko: ", 이어서 " };

/** the steps of a tap in the order they run: its effects, then where it goes */
function bodyText(a: ActionBody, s: Scope, lang: Lang): string | null {
  const steps = [...(a.effects ?? []).map((e) => effectText(e, s, lang)), actionText(a, s.frames, lang)].filter((x): x is string => !!x);
  return steps.length ? steps.join(THEN[lang]) : null;
}

/** a whole tap, with the condition it runs on and what runs when that fails; a plain one reads as it always did */
function tapText(a: Action, s: Scope, lang: Lang): string | null {
  const body = bodyText(a, s, lang);
  const when = a.when ? conditionText(a.when, s, lang) : null;
  if (!when) return body;
  const other = a.else ? bodyText(a.else, s, lang) : null;
  const yes = body ?? { ja: "何もしない", en: "does nothing", zh: "不执行任何操作", ko: "아무 동작도 하지 않음" }[lang];
  const no = other ?? { ja: "何もしない", en: "does nothing", zh: "不执行任何操作", ko: "아무 동작도 하지 않음" }[lang];
  return { ja: `${when}は${yes}。そうでないときは${no}`, en: `${when}, ${yes}; otherwise ${no}`, zh: `${when}${yes}，否则${no}`, ko: `${when} ${yes}, 그렇지 않으면 ${no}` }[lang];
}

/** that a part starts hidden, shows on a condition, belongs to a tab or follows a variable */
function stateNotes(g: Group, s: Scope, lang: Lang): string[] {
  const out: string[] = [];
  const first = g.items[0];
  const name = nameOfItem(g, first, lang);
  const cap = lang === "en" ? name[0].toUpperCase() + name.slice(1) : name;
  if (g.hidden) out.push({ ja: `${cap}は最初は表示せず、場所も取らない。`, en: `${cap} starts hidden and takes no room until shown.`, zh: `${cap}初始隐藏，显示前不占位置。`, ko: `${cap}은(는) 처음에는 숨겨져 있고 표시되기 전에는 자리를 차지하지 않는다.` }[lang]);
  const when = g.showWhen ? conditionText(g.showWhen, s, lang) : null;
  if (when) out.push({ ja: `${cap}は${when}だけ表示する。`, en: `${cap} is shown only ${when}.`, zh: `${cap}仅${when}显示。`, ko: `${cap}은(는) ${when}만 표시한다.` }[lang]);
  if (g.pane !== undefined) {
    const dock = s.groups.find((o) => partBySlug(o.items[0].component)?.panes && (g.inFlow === o.id || heldBy(o, s.groups, s.widths).some((x) => x.id === g.id)));
    const def = dock && partBySlug(dock.items[0].component);
    const tab = def?.slots?.(reader(def, dock!.items[0].props))[g.pane]?.label;
    if (dock && tab) {
      const host = nameOfItem(dock, dock.items[0], lang);
      out.push({ ja: `${cap}は${host}の${qj(tab)}タブの中身で、そのタブを選んでいるときだけ表示する。`, en: `${cap} is the content of the ${qe(tab)} tab of ${host}, shown only while that tab is chosen.`, zh: `${cap}是${host}的${qz(tab)}标签页内容，仅在选中该标签页时显示。`, ko: `${cap}은(는) ${host}의 ${qe(tab)} 탭 내용이며 그 탭을 선택했을 때만 표시한다.` }[lang]);
    }
  }
  for (const it of g.items) {
    for (const [prop, id] of Object.entries(it.bind ?? {})) {
      const v = varRef(id, s);
      if (!v) continue;
      const who = nameOfItem(g, it, lang);
      const whoCap = lang === "en" ? who[0].toUpperCase() + who.slice(1) : who;
      /* an input also writes back as the visitor changes it */
      const writes = INPUT_PROP[it.component ?? ""] === prop;
      out.push(
        writes
          ? { ja: `${whoCap}の ${prop} は変数 ${v} と連動し、変更すると変数に書き込む。`, en: `${whoCap}'s ${prop} follows variable ${v} and writes to it as it changes.`, zh: `${whoCap}的 ${prop} 与变量 ${v} 同步，修改时写回变量。`, ko: `${whoCap}의 ${prop}은(는) 변수 ${v}와(과) 연동되며 변경하면 변수에 기록한다.` }[lang]
          : { ja: `${whoCap}の ${prop} は変数 ${v} の値を表示する。`, en: `${whoCap}'s ${prop} shows variable ${v}.`, zh: `${whoCap}的 ${prop} 显示变量 ${v} 的值。`, ko: `${whoCap}의 ${prop}은(는) 변수 ${v}의 값을 표시한다.` }[lang],
      );
    }
  }
  return out;
}

/** the app's state, named once at the head of the behaviour it is used in */
function varsLine(vars: DocVar[] | undefined, lang: Lang): string | null {
  if (!vars?.length) return null;
  const kind: Record<VarType, Record<Lang, string>> = {
    text: { ja: "テキスト", en: "text", zh: "文本", ko: "텍스트" },
    number: { ja: "数値", en: "number", zh: "数字", ko: "숫자" },
    bool: { ja: "真偽値", en: "boolean", zh: "布尔值", ko: "불리언" },
    color: { ja: "色", en: "color", zh: "颜色", ko: "색상" },
  };
  const list = vars.map((v) => {
    const value = valueText(v.value, lang);
    if (v.drives === "dark")
      return { ja: `${v.name || v.id}（真偽値、ダークモードそのもの: true でダーク、起動時の表示モードから始まる）`, en: `${v.name || v.id} (boolean, the app's dark mode itself: true is dark; it starts at the mode on show)`, zh: `${v.name || v.id}（布尔值，就是应用的深色模式：为真时是深色，初始值是启动时显示的模式）`, ko: `${v.name || v.id}(불리언, 앱의 다크 모드 자체: true면 다크, 시작할 때 보이는 모드에서 시작)` }[lang];
    return { ja: `${v.name || v.id}（${kind[v.type].ja}、初期値 ${value}）`, en: `${v.name || v.id} (${kind[v.type].en}, starts at ${value})`, zh: `${v.name || v.id}（${kind[v.type].zh}，初始值 ${value}）`, ko: `${v.name || v.id}(${kind[v.type].ko}, 초기값 ${value})` }[lang];
  });
  const sep = lang === "en" || lang === "ko" ? ", " : "、";
  return { ja: `アプリの状態として次の変数を持つ: ${list.join(sep)}。`, en: `The app keeps this state in variables: ${list.join(sep)}.`, zh: `应用用以下变量保存状态：${list.join(sep)}。`, ko: `앱은 다음 변수로 상태를 보관한다: ${list.join(sep)}.` }[lang];
}

function notes(g: Group, scope: Scope, lang: Lang): string[] {
  const out: string[] = stateNotes(g, scope, lang);
  const q = quote(lang);
  for (const it of g.items) {
    const noun = nounOf(it, lang);
    const called = (g.items.length === 1 && g.name?.trim()) || leadTextOf(it);
    const name = hasText(called) ? (lang === "en" ? `The ${q(called)} ${noun}` : `${q(called)}${lang === "ko" ? " " : ""}${noun}`) : lang === "en" ? `The ${noun}` : noun;
    const parts: string[] = [];
    if (it.action) {
      const a = tapText(it.action, scope, lang);
      if (a) parts.push(lang === "ja" ? `タップすると${a}` : lang === "zh" ? `点击后${a}` : lang === "ko" ? `탭하면 ${a}` : it.action.when ? `when tapped, ${a}` : `${a} when tapped`);
    }
    for (const [slot, action] of Object.entries(it.actions ?? {})) {
      if (!action) continue;
      const a = tapText(action, scope, lang);
      if (!a) continue;
      const s = slotName(it, slot, lang);
      if (lang === "en") out.push(`Tapping ${s} of ${name.replace(/^The /, "the ")} ${a}.`);
      else parts.push(lang === "ja" ? `${s}をタップすると${a}` : lang === "zh" ? `点击${s}后${a}` : `${s}을 탭하면 ${a}`);
    }
    /* a component part toggles through props: toggle + the on* look */
    const def = partBySlug(it.component);
    const rd = def?.props.some((d) => d.key === "toggle") ? reader(def, it.props) : undefined;
    if (rd?.b("toggle")) {
      const icon = rd.s("onIcon");
      const on = rd.s("onLabel");
      const label = on && on !== rd.s("label") ? on : undefined;
      /* only a button has a look of its own for when it is on */
      const look = def?.props.some((d) => d.key === "onLook") && rd.s("onLook") !== "same" ? rd.s("onLook") : undefined;
      const changes: string[] = [];
      if (lang === "ja") {
        if (label) changes.push(`ラベルが${qj(label)}に変わる`);
        if (icon) changes.push(`アイコンが ${icon} に変わる`);
        if (look) changes.push(`スタイルが ${look} に変わる`);
        parts.push(`タップするたびにオン／オフが切り替わるトグルボタンにする${changes.length ? `（オンのときは${changes.join("、")}）` : ""}`);
      } else if (lang === "zh") {
        if (label) changes.push(`文字变为${qz(label)}`);
        if (icon) changes.push(`图标变为 ${icon}`);
        if (look) changes.push(`样式变为 ${look}`);
        parts.push(`做成每次点击都切换开/关状态的切换按钮${changes.length ? `（开启时${changes.join("、")}）` : ""}`);
      } else if (lang === "ko") {
        if (label) changes.push(`변경할 레이블: ${qe(label)}`);
        if (icon) changes.push(`변경할 아이콘: ${icon}`);
        if (look) changes.push(`변경할 스타일: ${look}`);
        parts.push(`탭할 때마다 켜짐/꺼짐이 전환되는 토글 버튼으로 만든다${changes.length ? `(켜졌을 때 ${changes.join(", ")})` : ""}`);
      } else {
        if (label) changes.push(`the label becomes ${qe(label)}`);
        if (icon) changes.push(`the icon becomes ${icon}`);
        if (look) changes.push(`the variant becomes ${look}`);
        parts.push(`is a toggle button that flips on / off with every tap${changes.length ? ` (when on, ${changes.join(" and ")})` : ""}`);
      }
    }
    if (hasText(it.note)) parts.push(trimEnd(it.note!));
    if (!parts.length) continue;
    if (lang === "ja") out.push(`${name}は、${parts.join("。また、")}。`);
    else if (lang === "zh") out.push(`${name}：${parts.join("；")}。`);
    else if (lang === "ko") out.push(`${name}: ${parts.join(". 또한 ")}.`);
    else out.push(`${name} ${parts.join(". It also ")}.`);
  }
  return out;
}

function swipeNotes(f: Frame, frames: Frame[], lang: Lang): string[] {
  const out: string[] = [];
  const q = quote(lang);
  const screen = lang === "en" ? "screen" : lang === "zh" ? "屏幕" : lang === "ko" ? "화면" : "画面";
  for (const d of SWIPE_DIRS) {
    const to = f.swipe?.[d.key];
    if (!to) continue;
    const a = actionText({ to, transition: d.transition }, frames, lang);
    if (!a) continue;
    const sw = SWIPE_TEXT[lang][d.key];
    const name = q(f.name || screen);
    if (lang === "ja") out.push(`${name}画面は、${sw}すると指の動きに追従して${a}。`);
    else if (lang === "zh") out.push(`${name}屏幕：${sw}时跟随手指移动并${a}。`);
    else if (lang === "ko") out.push(`${name} 화면은 ${sw}하면 손가락을 따라 움직이며 ${a}.`);
    else out.push(`The ${name} screen ${a} when ${sw}; the screen follows the finger while dragging.`);
  }
  return out;
}

/* ================= layout: rows and layers ================= */

type LNode = { g: Group; bb: Rect; children: LNode[] };

const area = (r: Rect) => Math.max(0, r.r - r.l) * Math.max(0, r.b - r.t);
const contains = (o: Rect, i: Rect, tol = 2) => i.l >= o.l - tol && i.t >= o.t - tol && i.r <= o.r + tol && i.b <= o.b + tol;
const overlapArea = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));

/** Groups keep their canvas order (later = drawn on top). A run that sits fully inside an
 *  earlier, larger one is nested in it, so a part with parts on it reads as one container. */
function layoutTree(groups: Group[], widths: Record<string, number>): LNode[] {
  const nodes: LNode[] = groups.map((g) => ({ g, bb: groupBounds(g, widths), children: [] }));
  const roots: LNode[] = [];
  nodes.forEach((n, i) => {
    /* what a layout holds is nested in it, overflowing or not */
    const owner = n.g.inFlow ?? ownerIdOf(n.g.id);
    let parent: LNode | null = owner ? (nodes.find((c) => c.g.id === owner) ?? null) : null;
    let best: LNode | null = null;
    for (let j = 0; j < i && !parent; j++) {
      const c = nodes[j];
      /* the screen's own bars are never containers: what sits on them is on top of them */
      if (c.g.items[0].component === "app-bar" || c.g.items[0].component === "navigation-bar") continue;
      if (contains(c.bb, n.bb) && area(c.bb) > area(n.bb) && (!best || area(c.bb) < area(best.bb))) best = c;
    }
    parent ??= best;
    (parent ? parent.children : roots).push(n);
  });
  return roots;
}

/** Siblings whose vertical extents overlap and that sit side by side form one row. */
function rowsOf(nodes: LNode[]): LNode[][] {
  const sorted = [...nodes].sort((a, b) => a.bb.t - b.bb.t || a.bb.l - b.bb.l);
  const out: LNode[][] = [];
  for (const n of sorted) {
    const row = out[out.length - 1];
    if (row) {
      const rt = Math.min(...row.map((r) => r.bb.t));
      const rb = Math.max(...row.map((r) => r.bb.b));
      const cy = (n.bb.t + n.bb.b) / 2;
      const rcy = (rt + rb) / 2;
      const beside = row.every((r) => r.bb.r <= n.bb.l + 2 || r.bb.l >= n.bb.r - 2);
      if (beside && ((cy >= rt && cy <= rb) || (rcy >= n.bb.t && rcy <= n.bb.b))) {
        row.push(n);
        continue;
      }
    }
    out.push([n]);
  }
  for (const r of out) r.sort((a, b) => a.bb.l - b.bb.l);
  return out;
}

/** where a rect sits inside a container, in words */
function zone(bb: Rect, within: Rect, lang: Lang, phone: boolean): string {
  const w = within.r - within.l;
  const h = within.b - within.t;
  const cy = (bb.t + bb.b) / 2 - within.t;
  const cx = (bb.l + bb.r) / 2 - within.l;
  const bw = bb.r - bb.l;
  const vert = cy < h * (phone ? 0.22 : 0.3) ? 0 : cy > h * (phone ? 0.8 : 0.7) ? 2 : 1;
  const horiz = bw >= w * 0.85 ? -1 : cx < w * 0.36 ? 0 : cx > w * 0.64 ? 2 : 1;
  if (lang === "ja") {
    const v = ["上部", "中央付近", "下部"][vert];
    if (horiz === 1) return `${v}の中央に`;
    const hh = horiz < 0 ? "" : ["左寄せで", "", "右寄せで"][horiz];
    return `${v}に${hh}`;
  }
  if (lang === "zh") {
    const v = ["上部", "中部", "下部"][vert];
    if (horiz === 1) return `${v}居中`;
    const hh = horiz < 0 ? "" : ["靠左", "", "靠右"][horiz];
    return `${v}${hh}`;
  }
  if (lang === "ko") {
    const v = ["위쪽", "가운데", "아래쪽"][vert];
    if (horiz === 1) return `${v} 중앙에`;
    const hh = horiz < 0 ? "" : [" 왼쪽 정렬로", "", " 오른쪽 정렬로"][horiz];
    return `${v}${hh}`;
  }
  const v = ["Near the top", "In the middle", "Near the bottom"][vert];
  const hh = horiz < 0 ? "" : [", aligned left", ", centered", ", aligned right"][horiz];
  return `${v}${hh}`;
}

/** the row phrase: a single part, or several parts side by side that must stay on one line */
function rowText(row: LNode[], where: string, lang: Lang, within: Rect): string {
  if (row.length === 1) {
    const d = groupText(row[0].g, lang);
    return lang === "ja" ? `${where}${d}を置きます。` : lang === "zh" ? `${where}放置${d}。` : lang === "ko" ? `${where} 다음 항목을 배치합니다: ${d}.` : `${where}: ${d}.`;
  }
  const last = row[row.length - 1];
  const fillsRight = last.bb.r >= within.r - 24;
  const descs = row.map((n) => groupText(n.g, lang));
  if (lang === "ja") {
    const stretch = fillsRight ? `。最後の${groupName(last.g, "ja")}は右端まで残りの幅いっぱいに伸ばします` : "";
    return `${where}、左から ${descs.join("、")} を横一列に並べます（同じ行に収めて縦方向は中央揃え。縦に積んだり折り返したりしません${stretch}）。`;
  }
  if (lang === "zh") {
    const stretch = fillsRight ? `，最后的${groupName(last.g, "zh")}向右拉伸占满剩余宽度` : "";
    return `${where}，从左到右横向排成一行：${descs.join("、")}（放在同一行并垂直居中，不要竖着堆叠或换行${stretch}）。`;
  }
  if (lang === "ko") {
    const stretch = fillsRight ? `, 마지막 항목(${groupName(last.g, "ko")})은 오른쪽 끝까지 남은 너비를 채웁니다` : "";
    return `${where}, 왼쪽부터 한 행에 다음 항목을 배치합니다: ${descs.join(", ")}(같은 줄에 세로 중앙 정렬하고 쌓거나 줄 바꿈하지 않음${stretch}).`;
  }
  const stretch = fillsRight ? `; ${groupName(last.g, "en")} stretches to fill the remaining width to the right edge` : "";
  return `${where}, in one row from left to right: ${descs.join(", ")} (keep them on the same line, vertically centered; never stack or wrap them${stretch}).`;
}

/** parts whose side-by-side rows can read as one grid */
const GRID_PARTS = new Set(["card"]);
/** the farthest two column edges or cell widths may be apart and still count as one grid */
const GRID_SNAP = 6;

type Grid = { rows: LNode[][]; cols: number; colGap: number; rowGap: number };

/** Rows starting at `from` that line up as a grid: single cards of one kind,
 *  at least two rows of at least two cells, every row with the same column count
 *  except a shorter last one, columns sharing their left edges and all cells one width.
 *  Anything with parts on top of it is left to the row-by-row description. */
function gridAt(rows: LNode[][], from: number): Grid | null {
  const first = rows[from];
  if (first.length < 2) return null;
  const slug = first[0].g.items[0].component;
  if (!slug || !GRID_PARTS.has(slug)) return null;
  const cell = (n: LNode) => n.g.items.length === 1 && n.g.items[0].component === slug && !n.children.length;
  const width = first[0].bb.r - first[0].bb.l;
  const fits = (row: LNode[]) =>
    row.length <= first.length &&
    row.every((n, j) => cell(n) && Math.abs(n.bb.l - first[j].bb.l) <= GRID_SNAP && Math.abs(n.bb.r - n.bb.l - width) <= GRID_SNAP);
  if (!fits(first)) return null;
  const out = [first];
  for (let i = from + 1; i < rows.length; i++) {
    if (!fits(rows[i])) break;
    out.push(rows[i]);
    if (rows[i].length < first.length) break; // a short row closes the grid
  }
  if (out.length < 2) return null;
  const bottom = (row: LNode[]) => Math.max(...row.map((n) => n.bb.b));
  const top = (row: LNode[]) => Math.min(...row.map((n) => n.bb.t));
  return {
    rows: out,
    cols: first.length,
    colGap: Math.max(0, Math.round(first[1].bb.l - first[0].bb.r)),
    rowGap: Math.max(0, Math.round(top(out[1]) - bottom(out[0]))),
  };
}

/** the grid phrase: how many columns, the gaps, then every cell in reading order */
function gridText(grid: Grid, where: string, lang: Lang): string {
  const cells = grid.rows.flat();
  const noun = nounOf(cells[0].g.items[0], lang);
  const n = cells.length;
  const c = grid.cols;
  const list = cells.map((x, i) => `(${i + 1}) ${groupText(x.g, lang)}`).join(lang === "en" || lang === "ko" ? "; " : "；");
  if (lang === "ja")
    return `${where}、${noun}${n}個を${c}列のグリッドに並べます（列の間隔 ${grid.colGap}dp、行の間隔 ${grid.rowGap}dp。セルはすべて同じ幅で、左から右へ、上の行から順に埋める。1行に並べたり縦1列に積んだりせず${c}列を保つ）: ${list}。`;
  if (lang === "zh")
    return `${where}，将 ${n} 个${noun}排成 ${c} 列网格（列间距 ${grid.colGap}dp，行间距 ${grid.rowGap}dp；所有单元格等宽，从左到右、从上一行开始依次填充；保持 ${c} 列，不要排成一行或竖着堆叠）：${list}。`;
  if (lang === "ko")
    return `${where}, ${noun} ${n}개를 ${c}열 그리드로 배치합니다(열 간격 ${grid.colGap}dp, 행 간격 ${grid.rowGap}dp. 모든 칸은 같은 너비이며 왼쪽에서 오른쪽으로, 위 행부터 채운다. 한 줄로 늘어놓거나 세로로 쌓지 않고 ${c}열을 유지): ${list}.`;
  return `${where}, a grid of ${n} ${noun}s in ${c} columns (${grid.colGap}dp between columns, ${grid.rowGap}dp between rows; every cell the same width, filled left to right, row by row; keep ${c} columns rather than one long row or a single stack): ${list}.`;
}

function describeNodes(lines: string[], nodes: LNode[], within: Rect | null, widths: Record<string, number>, lang: Lang, depth: number, phone: boolean) {
  const rows = rowsOf(nodes);
  const pad = "  ".repeat(depth);
  const box: Rect = within ?? unionRect(nodes.map((n) => n.bb));
  for (let i = 0; i < rows.length; i++) {
    /* rows that line up as a grid are written once, as the grid, in place of each row */
    const grid = gridAt(rows, i);
    const row = grid ? grid.rows.flat() : rows[i];
    const first = row[0];
    const rowRect = unionRect(row.map((n) => n.bb));
    let where: string;
    if (within) where = zone(rowRect, box, lang, phone);
    else where = lang === "ja" ? (i === 0 ? "まず" : "その下に") : lang === "zh" ? (i === 0 ? "首先" : "其下方") : lang === "ko" ? (i === 0 ? "먼저" : "그 아래에") : i === 0 ? "First" : "Below that";
    if (grid) {
      lines.push(`${pad}- ${gridText(grid, where, lang)}`);
      i += grid.rows.length - 1;
      continue;
    }
    /* a part that partly covers an earlier sibling is drawn on top of it */
    const overlaps: string[] = [];
    if (row.length === 1) {
      for (const other of nodes) {
        if (other === first || nodes.indexOf(other) > nodes.indexOf(first)) continue;
        const ov = overlapArea(other.bb, first.bb);
        if (ov > 0 && ov >= area(first.bb) * 0.25 && !contains(other.bb, first.bb)) overlaps.push(groupName(other.g, lang));
      }
    }
    let line = rowText(row, where, lang, box);
    if (overlaps.length) {
      const o = overlaps.join(lang === "en" ? " and " : lang === "ko" ? ", " : "、");
      line = lang === "ja" ? `${line.replace(/。$/, "")}（${o}の上に一部重ねて前面に描画）。` : lang === "zh" ? `${line.replace(/。$/, "")}（部分覆盖在${o}之上，绘制在前面）。` : lang === "ko" ? `${line.replace(/\.$/, "")}(${o} 위에 일부 겹쳐 앞쪽에 그림).` : `${line.replace(/\.$/, "")} (partly overlapping ${o}, drawn on top).`;
    }
    lines.push(`${pad}- ${line}`);
    for (const n of row) describeHeld(lines, n, widths, lang, depth);
  }
}

type Rows = NonNullable<Group["rowsOf"]>;
const ROWS_TEXT: Record<Lang, (r: Rows) => string> = {
  ja: (r) => `${qj(r.name)}の 1 件につき 1 行、${r.rows} 行（項目: ${r.fields.join("、")}）。テンプレート: `,
  en: (r) => `one row per item of ${qe(r.name)}, ${r.rows} rows (fields: ${r.fields.join(", ")}), template: `,
  zh: (r) => `${qz(r.name)}的每一项一行，共 ${r.rows} 行（字段：${r.fields.join("、")}），模板：`,
  ko: (r) => `${qe(r.name)}의 항목마다 한 행, ${r.rows}행(필드: ${r.fields.join(", ")}), 템플릿: `,
};

/** what the tokens in a template and in another screen read, said once under the behaviour */
const ROW_NOTE: Record<Lang, string> = {
  ja: "テンプレート内の {{項目名}} はその行の値を表示する。行をタップすると、その行が現在の行になり、別の画面の {{current.項目名}} はその行の値を表示する。条件の row.項目名 はタップされた行の値で、読み取り専用。",
  en: "{{field}} in a template shows that row's value. Tapping a row makes it the current row: {{current.field}} on another screen shows its value, and row.field in a condition reads it, read-only.",
  zh: "模板中的 {{字段名}} 显示该行的值。点击某行后它成为当前行：其他屏幕上的 {{current.字段名}} 显示它的值，条件中的 row.字段名 读取它，只读。",
  ko: "템플릿의 {{필드}}는 그 행의 값을 표시한다. 행을 탭하면 현재 행이 되어 다른 화면의 {{current.필드}}가 그 값을 표시하고, 조건의 row.필드는 그 값을 읽는다(읽기 전용).",
};

/** a screen that is another size of one written before it */
const VARIANT_TEXT: Record<Lang, (name: string) => string> = {
  ja: (n) => `この画面は${n}画面と同じ画面の別サイズです。`,
  en: (n) => `This is the same screen as ${n} at another size.`,
  zh: (n) => `这是与${n}屏幕相同的屏幕，只是尺寸不同。`,
  ko: (n) => `이 화면은 ${n} 화면과 같은 화면의 다른 크기입니다.`,
};

type Axis = "w" | "h";
type AskWords = {
  run: (axis: Axis) => string;
  across: (axis: Axis) => string;
  own: (axis: Axis) => string;
  cell: (axis: Axis) => string;
  hug: (axis: Axis) => string;
  self: (where: string, dir: string) => string;
  min: (v: number, axis: Axis) => string;
  max: (v: number, axis: Axis) => string;
  span: (n: number) => string;
  where: Record<string, string>;
  dir: Record<string, string>;
  join: string;
};
/** the words for what a part in a layout asks of it, beyond what the container's own classes say */
const ASKS: Record<Lang, AskWords> = {
  en: {
    run: (a) => `takes the remaining ${a === "w" ? "width" : "height"}`,
    across: (a) => `stretches to the full ${a === "w" ? "width" : "height"}`,
    own: (a) => `keeps its own ${a === "w" ? "width" : "height"} rather than stretching`,
    cell: (a) => `fills its cell's ${a === "w" ? "width" : "height"}`,
    hug: (a) => `its ${a === "w" ? "width" : "height"} hugs its contents`,
    self: (where, dir) => `aligned to the ${where} across the ${dir}`,
    min: (v, a) => `at least ${v}dp ${a === "w" ? "wide" : "tall"}`,
    max: (v, a) => `at most ${v}dp ${a === "w" ? "wide" : "tall"}`,
    span: (n) => `spans ${n} columns`,
    where: { start: "start", center: "center", end: "end", baseline: "text baseline" },
    dir: { row: "row", column: "column", grid: "cell" },
    join: "; ",
  },
  zh: {
    run: (a) => `占满剩余${a === "w" ? "宽度" : "高度"}`,
    across: (a) => `拉伸到整个${a === "w" ? "宽度" : "高度"}`,
    own: (a) => `保持自身${a === "w" ? "宽度" : "高度"}，不拉伸`,
    cell: (a) => `占满单元格的${a === "w" ? "宽度" : "高度"}`,
    hug: (a) => `${a === "w" ? "宽度" : "高度"}随内容`,
    self: (where, dir) => `在${dir}的横穿方向${where}`,
    min: (v, a) => `${a === "w" ? "宽" : "高"}至少 ${v}dp`,
    max: (v, a) => `${a === "w" ? "宽" : "高"}最多 ${v}dp`,
    span: (n) => `跨 ${n} 列`,
    where: { start: "靠起点", center: "居中", end: "靠终点", baseline: "按文字基线对齐" },
    dir: { row: "横排", column: "竖排", grid: "单元格" },
    join: "；",
  },
  ja: {
    run: (a) => `残りの${a === "w" ? "幅" : "高さ"}いっぱいに広げる`,
    across: (a) => `${a === "w" ? "幅" : "高さ"}いっぱいに伸ばす`,
    own: (a) => `自分の${a === "w" ? "幅" : "高さ"}のまま伸ばさない`,
    cell: (a) => `セルの${a === "w" ? "幅" : "高さ"}いっぱいに広げる`,
    hug: (a) => `${a === "w" ? "幅" : "高さ"}は内容に合わせる`,
    self: (where, dir) => `${dir}の交差方向に${where}`,
    min: (v, a) => `${a === "w" ? "幅" : "高さ"}は ${v}dp 以上`,
    max: (v, a) => `${a === "w" ? "幅" : "高さ"}は ${v}dp 以下`,
    span: (n) => `${n} 列にまたがる`,
    where: { start: "先頭揃え", center: "中央揃え", end: "末尾揃え", baseline: "ベースライン揃え" },
    dir: { row: "横並び", column: "縦並び", grid: "セル" },
    join: "、",
  },
  ko: {
    run: (a) => `남은 ${a === "w" ? "너비" : "높이"}를 채움`,
    across: (a) => `${a === "w" ? "너비" : "높이"} 전체로 늘림`,
    own: (a) => `늘이지 않고 자기 ${a === "w" ? "너비" : "높이"} 유지`,
    cell: (a) => `칸의 ${a === "w" ? "너비" : "높이"}를 채움`,
    hug: (a) => `${a === "w" ? "너비" : "높이"}는 내용에 맞춤`,
    self: (where, dir) => `${dir}의 교차 방향으로 ${where}`,
    min: (v, a) => `${a === "w" ? "너비" : "높이"} 최소 ${v}dp`,
    max: (v, a) => `${a === "w" ? "너비" : "높이"} 최대 ${v}dp`,
    span: (n) => `${n}열에 걸침`,
    where: { start: "시작 정렬", center: "가운데 정렬", end: "끝 정렬", baseline: "기준선 정렬" },
    dir: { row: "가로 줄", column: "세로 줄", grid: "칸" },
    join: ", ",
  },
};

/** What a part in an auto layout asks of it that the container's classes do not say: taking the room left, standing
 *  elsewhere across the run, its least and most measure, the columns of a grid it takes. Each comes with the classes
 *  the printed code puts on the box around it. Empty when it goes by the container. */
export function childAsks(g: Group, parent: Flow, lang: Lang): string {
  const it = g.items.length === 1 ? g.items[0] : undefined;
  if (!it) return "";
  const c = childLayoutOf(it);
  const t = ASKS[lang];
  const out: string[] = [];
  const say = (words: string, classes: string) => out.push(`${words} (\`${classes}\`)`);
  const w = sizingOf(it, parent, "w");
  const h = sizingOf(it, parent, "h");
  const selfAlign = c.self && c.self !== "stretch" ? c.self : undefined;
  if (parent.dir === "grid") {
    const span = Math.min(c.span, parent.columns);
    if (span > 1) say(t.span(span), `col-span-${span}`);
    if (w === "fill" && parent.align !== "stretch") say(t.cell("w"), "justify-self-stretch");
    if (h === "fill") say(t.cell("h"), "self-stretch");
    if (selfAlign) say(t.self(t.where[selfAlign], t.dir.grid), selfAlign === "baseline" ? "self-baseline" : `self-${selfAlign} justify-self-${selfAlign}`);
  } else {
    const mainAxis: Axis = parent.dir === "row" ? "w" : "h";
    const crossAxis: Axis = mainAxis === "w" ? "h" : "w";
    const main = mainAxis === "w" ? w : h;
    const cross = crossAxis === "w" ? w : h;
    const across = c.self ?? parent.align;
    if (main === "fill") say(t.run(mainAxis), parent.dir === "column" ? "min-h-0 flex-1" : "min-w-0 flex-1");
    else if (c.size[mainAxis] === "hug") out.push(t.hug(mainAxis));
    if (cross === "fill" && across !== "stretch") say(t.across(crossAxis), "self-stretch");
    else if (cross !== "fill" && across === "stretch") say(t.own(crossAxis), "self-start");
    else if (selfAlign) say(t.self(t.where[selfAlign], t.dir[parent.dir]), `self-${selfAlign}`);
    if (cross !== "fill" && c.size[crossAxis] === "hug") out.push(t.hug(crossAxis));
  }
  for (const axis of ["w", "h"] as const) {
    const lo = c.min[axis];
    const hi = c.max[axis];
    if (lo !== undefined) say(t.min(Math.round(lo), axis), `min-${axis}-[${Math.round(lo)}px]`);
    if (hi !== undefined) say(t.max(Math.round(hi), axis), `max-${axis}-[${Math.round(hi)}px]`);
  }
  return out.join(t.join);
}

/** where a part standing loose in a layout is put: from the container's top left, as the printed code places it */
const LOOSE_TEXT: Record<Lang, { head: (name: string) => string; at: (x: number, y: number) => string }> = {
  en: {
    head: (n) => `Layered on top of ${n}, out of its auto layout (they take no place in the run; the container is \`relative\` and each is \`absolute\` at its offset from the container's top left):`,
    at: (x, y) => `at left ${x}px, top ${y}px (\`absolute left-[${x}px] top-[${y}px]\`)`,
  },
  zh: {
    head: (n) => `${n}之上叠放、不参与其自动布局（不占排布位置；容器为 \`relative\`，各自以 \`absolute\` 定位在相对容器左上角的位置）：`,
    at: (x, y) => `位于左 ${x}px、上 ${y}px（\`absolute left-[${x}px] top-[${y}px]\`）`,
  },
  ja: {
    head: (n) => `${n}の上に重ね、自動レイアウトから外して配置します（並びの場所を取らない。コンテナは \`relative\`、各要素はコンテナ左上からの位置に \`absolute\` で置く）:`,
    at: (x, y) => `左 ${x}px・上 ${y}px の位置（\`absolute left-[${x}px] top-[${y}px]\`）`,
  },
  ko: {
    head: (n) => `${n} 위에 겹쳐 자동 레이아웃에서 제외하고 배치합니다(배치 순서에 자리를 차지하지 않음. 컨테이너는 \`relative\`, 각 항목은 컨테이너 왼쪽 위 기준 위치에 \`absolute\`):`,
    at: (x, y) => `왼쪽 ${x}px, 위 ${y}px 위치(\`absolute left-[${x}px] top-[${y}px]\`)`,
  },
};

/** What a part holds, under its line. What its auto layout places is nested in order, since the
 *  classes on the container say where it goes, each with what it asks of the layout; what stands loose
 *  in the layout is placed from the container's corner; what merely lies on it is placed by position. */
function describeHeld(lines: string[], n: LNode, widths: Record<string, number>, lang: Lang, depth: number) {
  const pad = "  ".repeat(depth);
  const name = groupName(n.g, lang);
  const mine = (c: LNode) => c.g.inFlow === n.g.id;
  const loose = (c: LNode) => c.g.items.length === 1 && childLayoutOf(c.g.items[0]).absolute;
  const flowed = n.children.filter((c) => mine(c) && !loose(c));
  const absolute = n.children.filter((c) => mine(c) && loose(c));
  const placed = n.children.filter((c) => !mine(c));
  const flow = flowOf(n.g);
  const end = lang === "ja" || lang === "zh" ? "。" : ".";
  if (flowed.length) {
    lines.push(`${pad}  - ${lang === "ja" ? `${name}の自動レイアウトの中に、次の順で入れ子にします:` : lang === "zh" ? `${name}的自动布局内依次嵌套：` : lang === "ko" ? `${name}의 자동 레이아웃 안에 다음 순서로 중첩합니다:` : `Nested in the auto layout of ${name}, in this order:`}`);
    flowed.forEach((c, i) => {
      /* the rows are not written out: the first child stands for all of them */
      const rows = i === 0 ? n.g.rowsOf : undefined;
      const asks = flow ? childAsks(c.g, flow, lang) : "";
      const more = asks ? (lang === "ja" || lang === "zh" ? `（${asks}）` : ` (${asks})`) : "";
      lines.push(`${pad}    - ${rows ? ROWS_TEXT[lang](rows) : ""}${groupText(c.g, lang)}${more}${end}`);
      describeHeld(lines, c, widths, lang, depth + 2);
    });
  }
  if (absolute.length) {
    lines.push(`${pad}  - ${LOOSE_TEXT[lang].head(name)}`);
    for (const c of absolute) {
      const at = LOOSE_TEXT[lang].at(Math.round(c.g.x - n.g.x), Math.round(c.g.y - n.g.y));
      lines.push(`${pad}    - ${groupText(c.g, lang)}${lang === "ja" || lang === "zh" ? "，" : ", "}${at}${end}`);
      describeHeld(lines, c, widths, lang, depth + 2);
    }
  }
  if (placed.length) {
    lines.push(`${pad}  - ${lang === "ja" ? `${name}の中には次を重ねて配置します（ボックス側を背景にし、以下はその前面に載せる。位置はボックス内での相対位置）:` : lang === "zh" ? `${name}内部叠放以下内容（以容器为背景，下列组件绘制在其前面，位置为容器内的相对位置）：` : lang === "ko" ? `${name} 안에 다음 항목을 겹쳐 배치합니다(컨테이너를 배경으로 하고 다음 부품은 그 앞에 배치하며, 위치는 컨테이너 내부 기준):` : `Inside ${name}, layered on top of it (the container is the background; positions are relative to it):`}`);
    describeNodes(lines, placed, n.bb, widths, lang, depth + 2, false);
  }
}

const RAIL_LEAD: Record<Lang, string> = { ja: "左端に", en: "Along the left edge: ", zh: "左缘：", ko: "왼쪽 가장자리에 " };

function describeScreen(lines: string[], groups: Group[], frameRect: Rect | null, widths: Record<string, number>, lang: Lang) {
  if (!groups.length) return;
  /* a navigation rail runs the full height, so it is written first, on its own; the
   * rest of the screen is then read beside it in rows as usual */
  const rails = groups.filter((g) => g.items.length === 1 && roleOf(g.items[0]) === "rail");
  for (const g of rails) lines.push(`- ${RAIL_LEAD[lang]}${componentText(g.items[0], lang, g.name)}${lang === "ja" || lang === "zh" ? "。" : "."}`);
  const rest = rails.length ? groups.filter((g) => !rails.includes(g)) : groups;
  if (!rest.length) return;
  const roots = layoutTree(rest, widths);
  describeNodes(lines, roots, frameRect, widths, lang, 0, true);
}

/* ---------- color palette ---------- */

function paletteLines(p: Palette): string[] {
  const row = (pairs: [string, string][]) => `- ${pairs.map(([k, v]) => `${k} ${v}`).join(" / ")}`;
  return [
    row([
      ["primary", p.primary],
      ["onPrimary", p.onPrimary],
      ["primaryContainer", p.primaryContainer],
      ["onPrimaryContainer", p.onPrimaryContainer],
    ]),
    row([
      ["secondary", p.secondary],
      ["secondaryContainer", p.secondaryContainer],
      ["onSecondaryContainer", p.onSecondaryContainer],
      ["tertiaryContainer", p.tertiaryContainer],
      ["onTertiaryContainer", p.onTertiaryContainer],
    ]),
    row([
      ["surface", p.surface],
      ["surfaceContainerLow", p.surfaceContainerLow],
      ["surfaceContainer", p.surfaceContainer],
      ["surfaceContainerHigh", p.surfaceContainerHigh],
      ["surfaceContainerHighest", p.surfaceContainerHighest],
    ]),
    row([
      ["onSurface", p.onSurface],
      ["onSurfaceVariant", p.onSurfaceVariant],
      ["outline", p.outline],
      ["outlineVariant", p.outlineVariant],
    ]),
    row([
      ["inverseSurface", p.inverseSurface],
      ["inverseOnSurface", p.inverseOnSurface],
      ["inversePrimary", p.inversePrimary],
    ]),
    row([
      ["error", p.error],
      ["onError", p.onError],
      ["errorContainer", p.errorContainer],
      ["onErrorContainer", p.onErrorContainer],
    ]),
  ];
}

/* ---------- theme: shape, type, motion ---------- */

const FONT_NOTE: Record<Lang, (name: string) => string> = {
  ja: (n) => `書体は ${n} を使う。`,
  en: (n) => `Use ${n} as the typeface.`,
  zh: (n) => `字体使用 ${n}。`,
  ko: (n) => `사용할 글꼴: ${n}.`,
};

/** what a coding agent is told when the document is held to its style */
const RULES_NOTE: Record<Lang, (margin: number, gap: number, tight: number) => string> = {
  ja: (m, g, t) => `このスタイルの規則を厳守する。独自の色、角丸、影、書体を足さず、色はテーマの役割だけを使う。左右の余白 ${m}px、区画の間隔 ${g}px、同じ種類の間隔 ${t}px。`,
  en: (m, g, t) => `Hold strictly to this style's rules. Add no colors, corners, shadows or typefaces of your own, and use only the theme's color roles. Side margins ${m}px, ${g}px between sections, ${t}px between rows of a kind.`,
  zh: (m, g, t) => `严格遵守这个风格的规范。不要自行添加颜色、圆角、阴影或字体，只使用主题的颜色角色。页边距 ${m}px，区块间距 ${g}px，同类间距 ${t}px。`,
  ko: (m, g, t) => `이 스타일의 규칙을 엄격히 따른다. 임의의 색, 모서리, 그림자, 글꼴을 추가하지 말고 테마의 색 역할만 쓴다. 좌우 여백 ${m}px, 구역 간격 ${g}px, 같은 종류 간격 ${t}px.`,
};

/** what a coding agent is told when parts carry effects of their own (lib/look.ts): they are drawn as inline styles */
const LOOK_NOTE: Record<Lang, string> = {
  ja: "部品のインラインスタイル（塗りの重ね、グラデーション、線、影、ぼかし、フィルター、変形、文字の効果、テクスチャ）はその部品の見た目なので、そのまま再現する。`var(--look-elev-N, …)` はスタイル自身の高さ N の影で、カンマの後ろはスタイルが何も言わないときの値。",
  en: "A part's inline style (paint layers, gradients, strokes, shadows, blur, filters, transforms, text effects, textures) is its look: reproduce it exactly. `var(--look-elev-N, …)` is the style's own elevation level N; what follows the comma is the value when the style says nothing.",
  zh: "组件的内联样式（填充叠层、渐变、描边、阴影、模糊、滤镜、变换、文字效果、纹理）就是它的外观，要原样还原。`var(--look-elev-N, …)` 是风格自己的第 N 级高度阴影，逗号后面是风格没有规定时使用的值。",
  ko: "부품의 인라인 스타일(채우기 겹침, 그라데이션, 선, 그림자, 흐림, 필터, 변형, 글자 효과, 질감)은 그 부품의 모습이므로 그대로 재현한다. `var(--look-elev-N, …)`은 스타일 고유의 높이 N 그림자이고, 쉼표 뒤는 스타일이 정하지 않을 때의 값이다.",
};

const STYLE_NOTE: Record<Lang, (name: string, hint: string) => string> = {
  ja: (n, h) => `全体のスタイルは「${n}」（${h}）。M3 の既定の見た目のままにせず、コントロールの形までこのスタイルに合わせる。`,
  en: (n, h) => `The whole design wears the ${n} style (${h}). Do not leave the Material defaults: build the controls themselves to match it.`,
  zh: (n, h) => `整体风格是“${n}”（${h}）。不要停留在 Material 的默认外观，控件的造型也要符合这个风格。`,
  ko: (n, h) => `전체 스타일은 ${n}이다(${h}). Material 기본 모습에 머물지 말고 컨트롤의 형태까지 이 스타일에 맞춘다.`,
};

const THEME_NOTES: Record<Lang, { shape: Record<Theme["shape"], string>; emphasized: string; plainType: string; motion: Record<Theme["motion"], string> }> = {
  ja: {
    shape: {
      none: "角丸は使わない: M3 の shape スケールを 0 にし、ボタン・カード・入力欄・アバターまですべて直角にする。",
      soft: "角丸は小さめにする: M3 の shape スケールを半分にする（ボタンと入力欄は約 6dp、カードは約 8dp）。",
      square: "角丸は控えめにする: M3 の shape スケールを全体に小さく取り（ボタン・チップは 8〜12dp、カードや画像は 8dp、ダイアログは 12dp 程度）、ピル型は使わない。",
      rounded: "角丸は M3 Expressive の標準値のまま（ボタンはピル型、カードは 20dp、ダイアログは 28dp）。",
      full: "角丸は最大限に取る: ボタン・チップ・入力欄はピル型、カードや画像は 32dp、ダイアログやシートは 40dp 程度にする。",
    },
    emphasized: "見出し・ボタンラベル・タブは M3 Expressive の emphasized タイポグラフィ（headlineMediumEmphasized などの太めのウェイト）を使う。",
    plainType: "タイポグラフィは M3 の標準ウェイト。",
    motion: {
      standard: "モーションは M3ThemeProvider の defaultTheme で motion: \"standard\" にする。画面遷移や状態変化は弾まない滑らかな動きにする。",
      expressive: "モーションは M3ThemeProvider の defaultTheme で motion: \"expressive\" にする。画面遷移や状態変化には軽く弾むスプリングを使う。",
    },
  },
  en: {
    shape: {
      none: "No rounded corners at all: set the M3 shape scale to 0, so buttons, cards, fields and even avatars are square.",
      soft: "Small corners: halve the M3 shape scale (about 6dp on buttons and fields, about 8dp on cards).",
      square: "Keep corners modest: shrink the M3 shape scale throughout (buttons and chips 8–12dp, cards and images 8dp, dialogs about 12dp) and avoid pill shapes.",
      rounded: "Corners follow the M3 Expressive defaults (pill buttons, 20dp cards, 28dp dialogs).",
      full: "Push corners to the maximum: pill-shaped buttons, chips and text fields, 32dp cards and images, about 40dp dialogs and sheets.",
    },
    emphasized: "Headlines, button labels and tabs use the M3 Expressive emphasized typography (the heavier headlineMediumEmphasized and similar styles).",
    plainType: "Typography uses the standard M3 weights.",
    motion: {
      standard: "Set motion: \"standard\" in the defaultTheme of M3ThemeProvider: smooth transitions and state changes with no bounce.",
      expressive: "Set motion: \"expressive\" in the defaultTheme of M3ThemeProvider: a light spring bounce on transitions and state changes.",
    },
  },
  zh: {
    shape: {
      none: "完全不用圆角：把 M3 的形状比例设为 0，按钮、卡片、输入框乃至头像都是直角。",
      soft: "小圆角：把 M3 的形状比例减半（按钮和输入框约 6dp，卡片约 8dp）。",
      square: "圆角保持克制：整体缩小 M3 的形状比例（按钮和标签片 8〜12dp，卡片和图片 8dp，对话框约 12dp），不使用胶囊形。",
      rounded: "圆角沿用 M3 Expressive 的默认值（按钮为胶囊形，卡片 20dp，对话框 28dp）。",
      full: "圆角尽量放大：按钮、标签片和输入框为胶囊形，卡片和图片 32dp，对话框和面板约 40dp。",
    },
    emphasized: "标题、按钮文字和标签页使用 M3 Expressive 的 emphasized 字体样式（headlineMediumEmphasized 等更粗的字重）。",
    plainType: "排版使用 M3 的标准字重。",
    motion: {
      standard: "在 M3ThemeProvider 的 defaultTheme 中设置 motion: \"standard\"：屏幕过渡和状态变化平滑、不回弹。",
      expressive: "在 M3ThemeProvider 的 defaultTheme 中设置 motion: \"expressive\"：屏幕过渡和状态变化带轻微回弹的弹簧效果。",
    },
  },
  ko: {
    shape: {
      none: "둥근 모서리를 쓰지 않는다. M3 모양 배율을 0으로 두어 버튼, 카드, 입력란, 아바타까지 모두 직각으로 한다.",
      soft: "작은 모서리를 쓴다. M3 모양 배율을 절반으로 한다(버튼과 입력란 약 6dp, 카드 약 8dp).",
      square: "모서리는 절제한다. 전체 M3 모양 배율을 줄이고(버튼과 칩 8~12dp, 카드와 이미지 8dp, 대화상자 약 12dp) 알약 모양은 사용하지 않는다.",
      rounded: "M3 Expressive 기본 모서리를 사용한다(버튼은 알약 모양, 카드 20dp, 대화상자 28dp).",
      full: "모서리를 최대한 둥글게 한다. 버튼, 칩, 입력란은 알약 모양, 카드와 이미지 32dp, 대화상자와 시트는 약 40dp로 한다.",
    },
    emphasized: "제목, 버튼 레이블, 탭은 더 굵은 headlineMediumEmphasized 등 M3 Expressive 강조 글꼴 스타일을 사용한다.",
    plainType: "M3 표준 글자 굵기를 사용한다.",
    motion: {
      standard: "M3ThemeProvider의 defaultTheme에 motion: \"standard\"를 설정한다. 화면 전환과 상태 변화는 튀지 않고 부드럽게 처리한다.",
      expressive: "M3ThemeProvider의 defaultTheme에 motion: \"expressive\"를 설정한다. 화면 전환과 상태 변화에 가볍게 튀는 스프링 효과를 적용한다.",
    },
  },
};

function themeLines(th: Theme, lang: Lang): string[] {
  const n = THEME_NOTES[lang];
  const font = FONTS.find((f) => f.key === th.font);
  const fontName = font?.key === "system" ? (lang === "ja" ? "端末のシステムフォント" : lang === "zh" ? "设备的系统字体" : lang === "ko" ? "기기의 시스템 글꼴" : "the device's system font") : (font?.label ?? "Roboto");
  const sp = lang === "en" || lang === "ko" ? " " : "";
  const pack = styleOf(th.style);
  return [
    ...(pack ? [`- ${STYLE_NOTE[lang](styleTextOf(pack.name, lang), styleTextOf(pack.hint, lang))}`, `- ${styleTextOf(pack.layout, lang)}`] : []),
    ...(isStrict(th) ? [`- ${RULES_NOTE[lang](uxOf(th).margin, uxOf(th).gap, uxOf(th).tight)}`] : []),
    `- ${n.shape[th.shape]}`,
    `- ${FONT_NOTE[lang](fontName)}${sp}${th.emphasized ? n.emphasized : n.plainType}`,
    `- ${n.motion[th.motion]}`,
  ];
}

/** the closing guidance */
const GENERAL: Record<Lang, string[]> = {
  ja: [
    "まず画面の目的から「これは何のアプリか」を判断し、そのカテゴリのアプリとして一般に期待される機能（作成・一覧・詳細・編集・削除・検索・設定など、該当するもの）を、スケッチに描かれていなくても一通り実装する。",
    `データは本物として扱う。ユーザーが作成したデータはブラウザに（IndexedDB など）永続化し、再読み込み後も残す。ダミーやサンプルのデータは入れず、何もない状態には空の案内を表示する。入力は検証し、失敗や削除は適切に確認・通知する。`,
    "スケッチに書かれていない振る舞いは、画面の目的と部品のラベルから補う。動作の指定がないボタンや項目は、そのラベルにふさわしい処理（保存、送信、詳細画面を開く、など）を実装し、何も起きないままにしない。",
    "配置は意図（順序・まとまり・上下左右の位置関係）を守れば十分で、寸法や余白は内容に合わせて調整してよい。実機で崩れるなら、スケッチより動くことを優先する。",
    "コンポーネントは導入済みの shadcn M3E（@m3e レジストリ。`@/components/m3e/*` から import）を使い、ライブラリにある部品を独自に作り直さない。",
    "色は必ず上のカラースキームのロール名（primary、surfaceContainer など）で参照し、ハードコードした色を使わない。",
    "余白は画面端 16dp、部品同士は 8〜16dp を基本にし、タイポグラフィは M3 の型（titleLarge、bodyMedium など）を使う。",
    "「横一列に並べる」と書いた部品は必ず 1 つの flex コンテナ（flex-row）に入れて同じ行に置き、縦に積んだり次の行に折り返したりしない。行の高さは一番高い部品に合わせ、他は縦中央に揃える。",
    "「〜の中に重ねて配置」と書いた部品は、その容器（ボックスやカード）を position: relative にして、その上に絶対配置で重ねて描く。重なりは意図したものなので、レイアウトの都合で分離したり順序を変えたりしない。前後関係は記述の順（後に書いたものが前面）に従う。",
    "「自動レイアウトの中に入れ子」と書いた部品は、その容器の flex または grid の子要素として書かれた順に並べ、絶対配置にしない。",
    "タップできる部品にはリップルと軽い縮小のフィードバックを付ける。「戻る」は入ったときの遷移を逆再生し、システムの戻る操作（戻るジェスチャー・戻るボタン）でも同じ動きにする。",
    "アイコンは Material Symbols Rounded を使う。",
  ],
  en: [
    "Work out what kind of app this is from the purpose of the screens, and implement the features such an app is normally expected to have (create, list, detail, edit, delete, search, settings, whichever apply) even where the sketch does not show them.",
    `Treat the data as real. Persist what the user creates in the browser (IndexedDB or similar) so it survives reloads. Do not ship dummy or sample data; show an empty state when there is nothing yet. Validate input, and confirm or report failures and deletions appropriately.`,
    "Fill in behavior the sketch leaves out from the purpose of the screen and the labels of the parts. A button or item with no behavior specified should do what its label implies (save, send, open a detail screen, and so on), never nothing.",
    "The layout only needs to keep the intent (order, grouping, relative placement); sizes and spacing may be adjusted to fit the content. If something would break on a device, prefer working over matching the sketch.",
    "Use the already-installed shadcn M3E components (the @m3e registry, imported from `@/components/m3e/*`); do not recreate parts the library provides.",
    "Always reference colors through the scheme roles above (primary, surfaceContainer, …) instead of hard-coded values.",
    "Keep 16dp screen margins and 8–16dp between parts, and use the M3 type styles (titleLarge, bodyMedium, …).",
    "Parts described as \"in one row\" must share a single flex container (flex-row) on the same line; never stack them vertically or wrap them. The row is as tall as its tallest part and the others are vertically centered in it.",
    "Parts described as \"layered\" on a container are drawn on top of that container (position: relative on it, absolute positioning inside it). The overlap is intentional: do not separate or reorder them for layout reasons. Later items in the description are drawn in front of earlier ones.",
    "Parts described as \"nested in the auto layout\" of a container are its flex or grid children, in the order written; do not position them absolutely.",
    "Give every tappable part ripple plus a slight press-scale. \"Back\" plays the entry transition in reverse, and the system back gesture / button must do the same.",
    "Use Material Symbols Rounded for icons.",
  ],
  zh: [
    "先根据屏幕目的判断这是什么类型的应用，并实现该类应用通常应有的功能（新建、列表、详情、编辑、删除、搜索、设置等，视情况而定），即使草图中没有画出。",
    `把数据当作真实数据处理：用户创建的数据要持久化到浏览器（IndexedDB 等），重新加载后仍保留。不要放入虚拟或示例数据，没有数据时显示空状态提示。校验输入，删除和失败要有适当的确认或提示。`,
    "草图没有写明的行为，根据屏幕目的和组件标签补全。未指定行为的按钮或项目要实现与其标签相符的操作（保存、发送、打开详情页等），不要什么都不做。",
    "布局只需保持意图（顺序、分组、相对位置），尺寸和间距可根据内容调整。若在真机上会出问题，宁可能用也不要死守草图。",
    "组件使用已安装的 shadcn M3E（@m3e 注册表，从 `@/components/m3e/*` 导入），库里已有的组件不要自行重做。",
    "颜色必须通过上面配色方案的角色名（primary、surfaceContainer 等）引用，不要写死颜色值。",
    "屏幕边缘留 16dp，组件之间 8〜16dp，排版使用 M3 的字体样式（titleLarge、bodyMedium 等）。",
    "写明“横向排成一行”的组件必须放进同一个 flex 容器（flex-row）并在同一行显示，不要竖着堆叠或换行。行高以最高的组件为准，其余组件垂直居中。",
    "写明“内部叠放”的组件要绘制在该容器（容器框或卡片）之上（容器设 position: relative，组件在其内部绝对定位）。这种叠放是有意为之，不要因布局原因拆开或调整顺序。前后关系按描述顺序，后写的在前面。",
    "写明“自动布局内依次嵌套”的组件是该容器的 flex 或 grid 子元素，按书写顺序排列，不要绝对定位。",
    "可点击的组件加涟漪和轻微缩放反馈。“返回”反向播放进入时的过渡动画，系统返回手势／返回键也要做同样的效果。",
    "图标使用 Material Symbols Rounded。",
  ],
  ko: [
    "화면의 목적에서 앱의 종류를 판단하고, 스케치에 없더라도 그 종류의 앱에 일반적으로 필요한 기능(만들기, 목록, 상세, 편집, 삭제, 검색, 설정 등)을 구현한다.",
    `데이터를 실제 데이터로 취급한다. 사용자가 만든 데이터는 브라우저(IndexedDB 등)에 저장해 새로고침 후에도 유지한다. 더미나 샘플 데이터는 넣지 않고 데이터가 없으면 빈 상태를 표시한다. 입력을 검증하고 실패와 삭제는 적절히 확인하거나 알린다.`,
    "스케치에 없는 동작은 화면 목적과 부품 레이블을 바탕으로 보완한다. 동작이 지정되지 않은 버튼이나 항목도 레이블에 맞는 동작(저장, 보내기, 상세 화면 열기 등)을 수행해야 한다.",
    "레이아웃은 의도한 순서, 그룹, 상대 위치를 유지하되 크기와 간격은 내용에 맞게 조정할 수 있다. 실제 기기에서 깨진다면 스케치 일치보다 정상 동작을 우선한다.",
    "이미 설치된 shadcn M3E(@m3e 레지스트리, `@/components/m3e/*`에서 import)의 컴포넌트를 사용하고 라이브러리에 있는 부품을 다시 만들지 않는다.",
    "색상은 하드코딩하지 말고 위 색상 구성의 역할 이름(primary, surfaceContainer 등)으로 참조한다.",
    "화면 가장자리는 16dp, 부품 사이는 8~16dp를 기본으로 하고 M3 글꼴 스타일(titleLarge, bodyMedium 등)을 사용한다.",
    "'한 행에 배치'한 부품은 하나의 flex 컨테이너(flex-row)에서 같은 줄에 두고 세로로 쌓거나 줄 바꿈하지 않는다. 행 높이는 가장 높은 부품에 맞추고 나머지는 세로 중앙 정렬한다.",
    "'내부에 겹쳐 배치'한 부품은 해당 컨테이너(상자 또는 카드)를 position: relative로 하고 그 안에 절대 위치로 겹쳐 그린다. 이 겹침은 의도된 것이므로 분리하거나 순서를 바꾸지 않으며 나중에 설명된 항목을 앞에 그린다.",
    "'자동 레이아웃 안에 중첩'한 부품은 해당 컨테이너의 flex 또는 grid 자식으로 쓰인 순서대로 놓고 절대 위치로 배치하지 않는다.",
    "탭 가능한 부품에는 리플과 약한 축소 피드백을 준다. '뒤로'는 진입 전환을 반대로 재생하고 시스템 뒤로 제스처나 버튼도 같은 동작을 수행한다.",
    "아이콘은 Material Symbols Rounded를 사용한다.",
  ],
};

/** what a box is, for a sketch that is composed of them */
const BOX_NOTE: Record<Lang, string> = {
  ja: "Box（`data-slot=\"box\"`）は見た目のない入れ子の枠で、Figma のオートレイアウトのフレームにあたる。中身は書かれた順の flex の子要素として組み、`data-surface` の役割（card、field、bar、chip など）はそのスタイルでその面がどう見えるかを表す。ライブラリに同じ部品があっても、Box で組まれた形をそのまま再現する。",
  en: "A Box (`data-slot=\"box\"`) is a nested frame with no look of its own, like an auto-layout frame in Figma. Build it as a div whose contents are its flex children in the order written; its `data-surface` role (card, field, bar, chip…) says which surface of the style it wears. Reproduce a composition made of boxes as composed, even where the library has a part of the same kind.",
  zh: "Box（`data-slot=\"box\"`）是没有自身外观的嵌套框，相当于 Figma 的自动布局框架。把它写成 div，里面的内容按书写顺序作为它的 flex 子元素；`data-surface` 的角色（card、field、bar、chip 等）表示它在当前风格下是哪种表面。用 Box 组合出来的结构要照原样实现，即使组件库里有同类组件也一样。",
  ko: "Box(`data-slot=\"box\"`)는 자체 모양이 없는 중첩 프레임으로 Figma의 자동 레이아웃 프레임에 해당한다. div로 만들고 내용은 쓰인 순서대로 flex 자식으로 둔다. `data-surface` 역할(card, field, bar, chip 등)은 해당 스타일에서 어떤 표면인지를 나타낸다. Box로 구성된 구조는 라이브러리에 같은 종류의 부품이 있어도 구성된 그대로 재현한다.",
};

/* ---------- fixed phrases ---------- */

/** what the screens are drawn for: phones only, desktops only, both, or no screens at all */
type Viewport = "phone" | "desktop" | "mixed" | "free";
const viewportOf = (frames: Frame[], phone: boolean): Viewport => {
  if (!phone || frames.length === 0) return "free";
  const phones = frames.filter(isPhoneFrame).length;
  return phones === frames.length ? "phone" : phones === 0 ? "desktop" : "mixed";
};
/** a screen's size, written only when the document mixes sizes */
const sizeLabel = (f: Frame, vp: Viewport, lang: Lang): string | undefined => {
  if (vp !== "mixed") return undefined;
  const { w, h } = frameSizeOf(f);
  const kind = isPhoneFrame(f) ? { ja: "スマホ", en: "phone", zh: "手机", ko: "휴대전화" } : framePresetOf(f) === "tablet" ? { ja: "タブレット", en: "tablet", zh: "平板", ko: "태블릿" } : { ja: "デスクトップ", en: "desktop", zh: "桌面", ko: "데스크톱" };
  return `${kind[lang]} ${w}×${h}`;
};

const PH = {
  ja: {
    screen: "画面",
    intro: (title: string, brief: string) => `${title}を Material 3 Expressive のデザインで実装してください。${brief ? trimEnd(brief) + "。" : ""}`,
    titleOnly: (name: string) => `${name}画面`,
    titleAll: (n: number) => (n > 1 ? "このアプリ" : "この画面"),
    target: (vp: Viewport, dark: boolean, both: boolean) =>
      `${
        vp === "phone"
          ? "想定はスマホの縦画面（412×892dp）で、"
          : vp === "desktop"
            ? "想定はデスクトップのブラウザ画面（基準 1280×800）で、"
            : vp === "mixed"
              ? `スマホの縦画面（412×892）とデスクトップのブラウザ画面（1280×800）の両方を想定し、同じ名前の画面は 1 つの画面の 2 つの幅として、レスポンシブに実装します。`
              : "レイアウトは自由配置で、"
      }${both ? "ライトモードとダークモードの両方に対応し、端末のシステム設定に従って切り替えます。" : dark ? "ダークモード固定です。" : "ライトモード固定です。"}`,
    platform: "実装先は Web（ブラウザで動くアプリ）です。UI は shadcn M3E（@m3e レジストリの shadcn コンポーネント）で作ります。導入済みなので、これらのコンポーネントを import して使い、独自に作り直さないでください。",
    schemeHead: (dark: boolean) => (dark ? "ダークスキーム:" : "ライトスキーム:"),
    sketch:
      "下の画面構成は、意図を伝えるためのラフスケッチです。完成図の仕様ではないので、静止画のように再現するのではなく、この種のアプリとして普通に期待される機能を一通り備えた、実際に使える完成品として仕上げてください。",
    hColor: "## カラー",
    dynamic: "ダイナミックカラーを使います。ブラウザや OS がユーザーのアクセントカラーを公開している場合はそれを種にして Material 3 のスキームを生成し（M3ThemeProvider の source.primary に渡す）、取得できない環境では下の色をフォールバックにしてください。",
    colorIntro: (label: string, fallback: boolean, th: Theme) => {
      const scheme = `Material 3 の${th.bothModes ? "ライトとダークの" : th.dark ? "ダーク" : "ライト"}カラースキーム${th.contrast === "high" ? "（高コントラスト）" : th.contrast === "medium" ? "（中コントラスト）" : ""}`;
      return `${fallback ? "フォールバック用のテーマ" : "テーマ"}は ${label} 系です。${scheme}に次の色を設定し、UI の色はすべてこのロール経由で参照してください。`;
    },
    hTheme: "## 形・文字・動き",
    hLayout: "## 画面構成",
    empty: "画面にはまだ部品が置かれていません。",
    screens: (names: string[]) => `画面は ${names.length} つあり、${names.join("、")}です。`,
    placement: (place: Place) => (place === "center" ? "本文の部品は画面の縦中央にまとめて配置します。" : place === "bottom" ? "本文の部品は画面の下側（ナビゲーションバーの上）に寄せて配置します。" : "本文の部品は画面の高さいっぱいに均等な間隔で配置します（1 行だけなら縦中央）。"),
    scrolls: (length: number, view: number) => `画面の長さは ${length}dp で、端末に映る ${view}dp より長いため、本文は縦にスクロールします。バーと、コンテンツの上に浮かぶ部品（FAB、スナックバーなど）はスクロールしても固定のままです。`,
    screenHead: (name: string, bg: string | undefined, has: boolean, size?: string) => `${name}画面${size || bg ? `（${[size, bg ? `背景は ${bg}` : ""].filter(Boolean).join("、")}）` : ""}${has ? "は上から順に次の通りです。重なっている部品はその旨を書いています。" : "はまだ空です。"}`,
    loose: "画面の外に置かれている部品（共通パーツや参考）:",
    freeform: "画面を上から順に説明します。",
    hBehavior: "## 振る舞いと画面遷移",
    hGeneral: "## 全体の指針",
  },
  en: {
    screen: "screen",
    intro: (title: string, brief: string) => `Please implement ${title} in the Material 3 Expressive design language.${brief ? ` ${trimEnd(brief)}.` : ""}`,
    titleOnly: (name: string) => `the ${name} screen`,
    titleAll: (n: number) => (n > 1 ? "this app" : "this screen"),
    target: (vp: Viewport, dark: boolean, both: boolean) =>
      `${
        vp === "phone"
          ? "Target a portrait phone screen (412×892dp)"
          : vp === "desktop"
            ? "Target a desktop browser viewport (1280×800 reference)"
            : vp === "mixed"
              ? `Target both a portrait phone (412×892) and a desktop browser viewport (1280×800); screens that share a name are one screen at two widths, so build them responsively`
              : "The layout is free-form"
      }, ${both ? "supporting both light and dark mode and following the device's system setting" : `${dark ? "dark" : "light"} mode only`}.`,
    platform: "Build it for the web, as an app that runs in the browser. Build the UI with shadcn M3E (the shadcn components of the @m3e registry). It is already installed: import and use those components instead of recreating them.",
    schemeHead: (dark: boolean) => (dark ? "Dark scheme:" : "Light scheme:"),
    sketch:
      "The layout below is a rough sketch that conveys intent, not a finished spec. Do not reproduce it as a static picture; build the complete, usable app that this kind of product is normally expected to be.",
    hColor: "## Colors",
    dynamic: "Use dynamic color: where the browser or OS exposes the user's accent color, use it as the seed of the Material 3 scheme (pass it as source.primary of M3ThemeProvider), and fall back to the colors below where it is unavailable.",
    colorIntro: (label: string, fallback: boolean, th: Theme) => {
      const scheme = `Material 3 ${th.bothModes ? "light and dark color schemes" : `${th.dark ? "dark" : "light"} color scheme`}${th.contrast === "high" ? " (high contrast)" : th.contrast === "medium" ? " (medium contrast)" : ""}`;
      return `The ${fallback ? "fallback theme" : "theme"} is ${label}. Set these on the ${scheme} and reference every UI color through its role.`;
    },
    hTheme: "## Shape, type and motion",
    hLayout: "## Layout",
    empty: "Nothing has been placed on the screen yet.",
    screens: (names: string[]) => `There are ${names.length} screens: ${names.join(", ")}.`,
    placement: (place: Place) => (place === "center" ? "The body parts sit together in the vertical center of the screen." : place === "bottom" ? "The body parts sit toward the bottom of the screen, above the navigation bar." : "The body parts are spread over the screen height with equal gaps (a single row sits in the vertical center)."),
    scrolls: (length: number, view: number) => `The screen runs ${length}dp, longer than the ${view}dp the device shows, so its body scrolls vertically; the bars and anything floating over the content (a FAB, a snackbar) stay fixed while it scrolls.`,
    screenHead: (name: string, bg: string | undefined, has: boolean, size?: string) => `The ${name} screen${size || bg ? ` (${[size, bg ? `background ${bg}` : ""].filter(Boolean).join(", ")})` : ""}${has ? ", from top to bottom (overlapping parts are called out as such):" : " is still empty."}`,
    loose: "Parts placed outside the screens (shared parts or references):",
    freeform: "The screen, from top to bottom:",
    hBehavior: "## Behavior and navigation",
    hGeneral: "## General guidance",
  },
  zh: {
    screen: "屏幕",
    intro: (title: string, brief: string) => `请用 Material 3 Expressive 的设计实现${title}。${brief ? trimEnd(brief) + "。" : ""}`,
    titleOnly: (name: string) => `${name}屏幕`,
    titleAll: (n: number) => (n > 1 ? "这个应用" : "这个屏幕"),
    target: (vp: Viewport, dark: boolean, both: boolean) =>
      `${
        vp === "phone"
          ? "目标为竖屏手机（412×892dp）"
          : vp === "desktop"
            ? "目标为桌面浏览器视口（以 1280×800 为基准）"
            : vp === "mixed"
              ? `同时面向竖屏手机（412×892）和桌面浏览器视口（1280×800）；同名的屏幕是同一个屏幕的两种宽度，请做成响应式`
              : "布局为自由排布"
      }，${both ? "同时支持浅色和深色模式，并跟随设备的系统设置切换" : `只做${dark ? "深色" : "浅色"}模式`}。`,
    platform: "实现目标是 Web（在浏览器中运行的应用）。UI 使用 shadcn M3E（@m3e 注册表中的 shadcn 组件）构建。它已经安装好了：直接导入使用这些组件，不要自行重做。",
    schemeHead: (dark: boolean) => (dark ? "深色配色：" : "浅色配色："),
    sketch:
      "下面的屏幕结构是传达意图的草图，不是最终规格。不要把它当静态图片照搬，而要做成这类应用通常应具备的功能齐全、真正可用的成品。",
    hColor: "## 配色",
    dynamic: "使用动态配色：浏览器或系统提供用户强调色时，以它为种子生成 Material 3 配色方案（传给 M3ThemeProvider 的 source.primary）；无法获取时使用下面的颜色作为备用。",
    colorIntro: (label: string, fallback: boolean, th: Theme) => {
      const scheme = `Material 3 的${th.bothModes ? "浅色和深色" : th.dark ? "深色" : "浅色"}配色方案${th.contrast === "high" ? "（高对比度）" : th.contrast === "medium" ? "（中对比度）" : ""}`;
      return `${fallback ? "备用主题" : "主题"}为 ${label} 系。请在${scheme}中设置以下颜色，UI 的所有颜色都通过这些角色引用。`;
    },
    hTheme: "## 形状、字体与动效",
    hLayout: "## 屏幕结构",
    empty: "屏幕上还没有放置任何组件。",
    screens: (names: string[]) => `共有 ${names.length} 个屏幕：${names.join("、")}。`,
    placement: (place: Place) => (place === "center" ? "内容作为整体，在屏幕内容区域内纵向居中排列。" : place === "bottom" ? "内容区域中的组件靠屏幕底部（导航栏上方）放置。" : "各行内容在屏幕内容区域内纵向均匀分布（只有一行时纵向居中）。"),
    scrolls: (length: number, view: number) => `屏幕总长 ${length}dp，超过设备可显示的 ${view}dp，因此内容区域可纵向滚动；栏以及浮在内容之上的组件（FAB、Snackbar 等）在滚动时保持固定。`,
    screenHead: (name: string, bg: string | undefined, has: boolean, size?: string) => `${name}屏幕${size || bg ? `（${[size, bg ? `背景为 ${bg}` : ""].filter(Boolean).join("，")}）` : ""}${has ? "从上到下依次如下（重叠的组件会特别说明）：" : "目前为空。"}`,
    loose: "放在屏幕之外的组件（公共部件或参考）：",
    freeform: "从上到下说明屏幕内容：",
    hBehavior: "## 行为与屏幕跳转",
    hGeneral: "## 整体原则",
  },
  ko: {
    screen: "화면",
    intro: (title: string, brief: string) => `Material 3 Expressive 디자인으로 구현해 주세요: ${title}.${brief ? ` ${trimEnd(brief)}.` : ""}`,
    titleOnly: (name: string) => `${name} 화면`,
    titleAll: (n: number) => (n > 1 ? "이 앱" : "이 화면"),
    target: (vp: Viewport, dark: boolean, both: boolean) => `${vp === "phone" ? "세로형 휴대전화 화면(412×892dp)을 대상으로 하며" : vp === "desktop" ? `데스크톱 브라우저 화면(1280×800 기준)을 대상으로 하며` : vp === "mixed" ? `세로형 휴대전화(412×892)와 데스크톱 브라우저(1280×800)을 모두 지원하며, 이름이 같은 화면은 서로 다른 너비의 동일한 화면이므로 반응형으로 구현하고` : "레이아웃은 자유 배치이며"}, ${both ? "라이트 모드와 다크 모드를 모두 지원하고 기기의 시스템 설정을 따른다" : `${dark ? "다크" : "라이트"} 모드만 지원한다`}.`,
    platform: "브라우저에서 실행되는 웹 앱으로 구현한다. UI는 shadcn M3E(@m3e 레지스트리의 shadcn 컴포넌트)로 만든다. 이미 설치되어 있으므로 이 컴포넌트를 import해서 사용하고 다시 만들지 않는다.",
    schemeHead: (dark: boolean) => (dark ? "다크 색상 구성:" : "라이트 색상 구성:"),
    sketch: "아래 화면 구성은 의도를 전달하는 대략적인 스케치이며 완성 사양이 아니다. 정적인 그림처럼 복제하지 말고 이 종류의 제품에 일반적으로 필요한 기능을 갖춘 실제 사용 가능한 앱으로 완성한다.",
    hColor: "## 색상",
    dynamic: "동적 색상을 사용한다. 브라우저나 운영체제에서 사용자의 강조 색상을 제공하면 이를 기준으로 Material 3 색상 구성을 생성하고(M3ThemeProvider의 source.primary로 전달), 사용할 수 없으면 아래 색상으로 대체한다.",
    colorIntro: (label: string, fallback: boolean, th: Theme) => {
      const scheme = `Material 3 ${th.bothModes ? "라이트 및 다크" : th.dark ? "다크" : "라이트"} 색상 구성${th.contrast === "high" ? "(고대비)" : th.contrast === "medium" ? "(중간 대비)" : ""}`;
      return `${fallback ? "대체 테마" : "테마"}는 ${label} 계열이다. ${scheme}에 다음 색상을 설정하고 모든 UI 색상을 해당 역할로 참조한다.`;
    },
    hTheme: "## 모양, 글꼴 및 모션",
    hLayout: "## 화면 구성",
    empty: "화면에 아직 부품이 없습니다.",
    screens: (names: string[]) => `화면은 ${names.length}개이며 ${names.join(", ")}입니다.`,
    placement: (place: Place) => (place === "center" ? "본문 부품은 화면 세로 가운데에 모아 배치한다." : place === "bottom" ? "본문 부품은 화면 아래쪽(내비게이션 바 위)에 붙여 배치한다." : "본문 부품은 화면 높이에 걸쳐 같은 간격으로 배치한다(한 줄뿐이면 세로 가운데)."),
    scrolls: (length: number, view: number) => `화면 길이는 ${length}dp로 기기에 보이는 ${view}dp보다 길어서 본문이 세로로 스크롤된다. 바와 콘텐츠 위에 떠 있는 부품(FAB, 스낵바 등)은 스크롤해도 고정된다.`,
    screenHead: (name: string, bg: string | undefined, has: boolean, size?: string) => `${name} 화면${size || bg ? `(${[size, bg ? `배경 ${bg}` : ""].filter(Boolean).join(", ")})` : ""}. ${has ? "위에서부터 다음과 같습니다. 겹친 부품은 별도로 표시합니다." : "아직 비어 있습니다."}`,
    loose: "화면 밖에 놓인 부품(공통 부품 또는 참고):",
    freeform: "화면을 위에서부터 설명합니다.",
    hBehavior: "## 동작 및 화면 전환",
    hGeneral: "## 전체 지침",
  },
};

/** The lines an author may add to the general guidance with one tap: each is a short choice in
 *  the panel and one sentence in the prompt. The deliverable is on unless it is turned off. */
type PromptOption = "deliverable" | "tests" | "darkMode" | "languages" | "offline";
const PROMPT_OPTIONS: PromptOption[] = ["deliverable", "tests", "darkMode", "languages", "offline"];
export const DEFAULT_PROMPT_OPTIONS: PromptOption[] = ["deliverable"];
export const isPromptOption = (v: unknown): v is PromptOption => PROMPT_OPTIONS.includes(v as PromptOption);
export const promptOptionsOf = (doc: Pick<Doc, "promptOptions">): PromptOption[] => (doc.promptOptions ? doc.promptOptions.filter(isPromptOption) : DEFAULT_PROMPT_OPTIONS);
const PROMPT_OPTION_TEXT: Record<Lang, Record<PromptOption, { label: string; icon: string; line: string }>> = {
  ja: {
    deliverable: { label: "検証不要・成果物のみ", icon: "package_2", line: "ブラウザでの動作検証は不要。実装が終わったら production build を実行し、その出力を成果物として提供する。" },
    tests: { label: "テストを書く", icon: "science", line: "主要なロジックにユニットテストを書き、すべて通る状態で提出する。" },
    darkMode: { label: "ダークモード対応", icon: "dark_mode", line: "ライトとダークの両方のカラースキームに対応し、システム設定に追従する。" },
    languages: { label: "日本語と英語", icon: "translate", line: "UI の文言は日本語と英語の両方を用意し、端末の言語設定に追従する。" },
    offline: { label: "オフライン対応", icon: "cloud_off", line: "ネットワークがなくても主要な機能が使えるようにし、必要なら再接続時に同期する。" },
  },
  en: {
    deliverable: { label: "No verification, deliverable only", icon: "package_2", line: "Do not verify in a browser. When the implementation is done, run the production build and provide its output as the deliverable." },
    tests: { label: "Write tests", icon: "science", line: "Write unit tests for the main logic and hand it over with all of them passing." },
    darkMode: { label: "Dark mode", icon: "dark_mode", line: "Support both the light and the dark color scheme, following the system setting." },
    languages: { label: "Japanese and English", icon: "translate", line: "Provide the UI text in both Japanese and English, following the device language." },
    offline: { label: "Works offline", icon: "cloud_off", line: "Keep the main features usable without a network, syncing when it returns if needed." },
  },
  zh: {
    deliverable: { label: "无需验证，仅交付成果", icon: "package_2", line: "不需要在浏览器上验证。实现完成后运行 production build 并提供其输出作为交付物。" },
    tests: { label: "编写测试", icon: "science", line: "为主要逻辑编写单元测试，并在全部通过的状态下交付。" },
    darkMode: { label: "支持深色模式", icon: "dark_mode", line: "同时支持浅色与深色配色方案，并跟随系统设置。" },
    languages: { label: "日语和英语", icon: "translate", line: "UI 文案同时提供日语和英语，并跟随设备语言设置。" },
    offline: { label: "支持离线", icon: "cloud_off", line: "在没有网络时也能使用主要功能，必要时在重新连接后同步。" },
  },
  ko: {
    deliverable: { label: "검증 없이 결과물만", icon: "package_2", line: "브라우저 동작 검증은 필요 없다. 구현 후 production build를 실행하고 그 출력을 결과물로 제공한다." },
    tests: { label: "테스트 작성", icon: "science", line: "주요 로직에 단위 테스트를 작성하고 모두 통과하는 상태로 제출한다." },
    darkMode: { label: "다크 모드 지원", icon: "dark_mode", line: "라이트와 다크 색상 스킴을 모두 지원하고 시스템 설정을 따른다." },
    languages: { label: "일본어와 영어", icon: "translate", line: "UI 문구를 일본어와 영어로 모두 준비하고 기기 언어 설정을 따른다." },
    offline: { label: "오프라인 지원", icon: "cloud_off", line: "네트워크가 없어도 주요 기능을 쓸 수 있게 하고, 필요하면 재연결 시 동기화한다." },
  },
};

/** A place in the prompt the outline can point at: a section heading, or the line a screen
 *  begins on. Read off the text itself, so an edited prompt keeps its marks while its headings
 *  and screen names still stand. */
export type PromptMark = { kind: "section" | "screen"; label: string; line: number; frameId?: string };
export function promptMarks(text: string, frames: Frame[], lang: Lang = getLang()): PromptMark[] {
  const ph = PH[lang];
  const q = quote(lang);
  const out: PromptMark[] = [];
  /* the screens are written in document order, so the next screen line is the next unmatched
   * frame: two screens with one name, or two unnamed ones, each get their own mark */
  const left = [...frames];
  const word = lang === "ja" ? "画面" : lang === "zh" ? "屏幕" : lang === "ko" ? " 화면" : null;
  text.split("\n").forEach((l, i) => {
    if (l.startsWith("## ")) {
      out.push({ kind: "section", label: l.slice(3).trim(), line: i });
      return;
    }
    const at = left.findIndex((f) => {
      const name = q(f.name || ph.screen);
      return word ? l.startsWith(name + word) : l.startsWith(`The ${name} screen`);
    });
    if (at < 0) return;
    const f = left.splice(at, 1)[0];
    out.push({ kind: "screen", label: f.name || ph.screen, line: i, frameId: f.id });
  });
  return out;
}

/** what a coding agent is told to build, read in the document's own styles (a custom style is resolved from `doc.styles`) */
export function buildPrompt(source: Doc, widths: Record<string, number>, onlyFrameId?: string, lang: Lang = getLang()): string {
  return withDocStyles(source.styles, () => promptOf(source, widths, onlyFrameId, lang));
}

function promptOf(source: Doc, widths: Record<string, number>, onlyFrameId: string | undefined, lang: Lang): string {
  /* instances are written out, each saying what it is an instance of; repeats are not drawn out, the first child stands for its rows */
  const doc: Doc = { ...source, groups: describeRepeats(expandInstances(source, widths, { rows: false }), source.collections) };
  const th = normalizeTheme(doc.theme);
  const pal = paletteOf(doc.paletteKey, doc.customPalette, th);
  const phone = doc.frame === "phone";
  const allFrames = phone ? doc.frames : [];
  const only = onlyFrameId ? allFrames.find((f) => f.id === onlyFrameId) : undefined;
  const frames = only ? [only] : allFrames;
  const viewport = viewportOf(frames, phone);
  /* canvas order is the layer order; rows are worked out per screen. A hand-made
   * group is written part by part, since it exists only to move things together. */
  const groups = doc.groups
    .filter((g) => !only || frameOfPart(g, doc.groups, allFrames, widths)?.id === only.id)
    .flatMap((g) => explodeGroup(g, widths));
  const lines: string[] = [];
  const q = quote(lang);
  const ph = PH[lang];

  const byFrame = new Map<string, Group[]>();
  const loose: Group[] = [];
  for (const g of groups) {
    const f = frameOfPart(g, doc.groups, allFrames, widths);
    if (f && frames.some((x) => x.id === f.id)) byFrame.set(f.id, [...(byFrame.get(f.id) ?? []), g]);
    else if (!f) loose.push(g);
  }

  const title = only ? ph.titleOnly(q(only.name || ph.screen)) : doc.title.trim() || ph.titleAll(frames.length);
  lines.push(ph.intro(title, doc.brief.trim()));
  lines.push(ph.target(viewport, th.dark, th.bothModes));
  lines.push(ph.platform);
  lines.push(ph.sketch);

  lines.push("");
  lines.push(ph.hColor);
  if (doc.dynamicColor) lines.push(ph.dynamic);
  lines.push(ph.colorIntro(pal.label, !!doc.dynamicColor, th));
  if (th.bothModes) {
    const light = paletteOf(doc.paletteKey, doc.customPalette, { ...th, dark: false });
    const dark = paletteOf(doc.paletteKey, doc.customPalette, { ...th, dark: true });
    lines.push(ph.schemeHead(false));
    lines.push(...paletteLines(light));
    lines.push(ph.schemeHead(true));
    lines.push(...paletteLines(dark));
  } else {
    lines.push(...paletteLines(pal));
  }

  lines.push("");
  lines.push(ph.hTheme);
  lines.push(...themeLines(th, lang));
  if (groups.some((g) => g.items.some((it) => it.look))) lines.push(LOOK_NOTE[lang]);

  lines.push("");
  lines.push(ph.hLayout);
  if (groups.length === 0) {
    lines.push(ph.empty);
  } else if (frames.length > 0) {
    if (frames.length > 1) lines.push(ph.screens(frames.map((f) => q(f.name || ph.screen))));
    frames.forEach((f, i) => {
      const gs = byFrame.get(f.id) ?? [];
      if (i > 0 || frames.length > 1) lines.push("");
      if (hasText(f.note)) lines.push(lang === "ja" || lang === "zh" ? `${trimEnd(f.note!)}。` : `${trimEnd(f.note!)}.`);
      lines.push(ph.screenHead(q(f.name || ph.screen), f.bg && f.bg !== "surface" ? f.bg : undefined, gs.length > 0, sizeLabel(f, viewport, lang)));
      const sizeOfScreen = f.variantOf ? allFrames.find((x) => x.id === f.variantOf) : undefined;
      if (sizeOfScreen) lines.push(VARIANT_TEXT[lang](q(sizeOfScreen.name || ph.screen)));
      if (gs.length > 0 && f.place && f.place !== "top") lines.push(ph.placement(f.place));
      if (gs.length > 0 && scrollsOf(f)) lines.push(ph.scrolls(frameLengthOf(f), frameSizeOf(f).h));
      describeScreen(lines, promptGroupsForScroll(gs, scrollsOf(f)), frameRect(f), widths, lang);
    });
    if (loose.length && !only) {
      lines.push("");
      lines.push(ph.loose);
      describeScreen(lines, promptGroupsForScroll(loose, false), null, widths, lang);
    }
  } else {
    lines.push(ph.freeform);
    describeScreen(lines, promptGroupsForScroll(groups, false), null, widths, lang);
  }

  const scope: Scope = { frames: allFrames, groups: doc.groups, vars: doc.vars, widths };
  const state = varsLine(doc.vars, lang);
  const behavior = [...(state ? [state] : []), ...(doc.groups.some((g) => g.rowsOf) ? [ROW_NOTE[lang]] : []), ...groups.flatMap((g) => notes(g, scope, lang)), ...frames.flatMap((f) => swipeNotes(f, allFrames, lang))];
  if (behavior.length) {
    lines.push("");
    lines.push(ph.hBehavior);
    for (const n of behavior) lines.push(`- ${n}`);
  }

  lines.push("");
  lines.push(ph.hGeneral);
  for (const s of GENERAL[lang]) lines.push(`- ${s}`);
  /* a sketch composed of boxes says how the boxes are meant, once */
  if (doc.groups.some((g) => g.items.some((it) => it.component === "box"))) lines.push(`- ${BOX_NOTE[lang]}`);
  /* the author's own choices come last, in the order they are offered */
  const chosen = promptOptionsOf(doc);
  for (const key of PROMPT_OPTIONS) {
    if (!chosen.includes(key)) continue;
    const line = PROMPT_OPTION_TEXT[lang][key].line;
    lines.push(`- ${line}`);
  }
  return lines.join("\n");
}

/** the prompt to hand out: the author's edited text when there is one, otherwise the generated one */
export const effectivePrompt = (doc: Doc, widths: Record<string, number>, lang: Lang = getLang()): string => (doc.promptEdit !== undefined ? doc.promptEdit : buildPrompt(doc, widths, undefined, lang));
