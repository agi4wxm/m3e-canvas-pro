
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion, useSpring } from "motion/react";
import { toPng } from "html-to-image";
import { buildPrompt, effectivePrompt } from "@/lib/prompt";
import {
  actionsOf,
  ComponentDef,
  Axis,
  BACK_TARGET,
  draftGradient,
  BEZEL,
  clamp,
  Doc,
  Frame,
  Place,
  FramePreset,
  FRAME_LABEL_H,
  FrameMode,
  frameOfGroup,
  frameOfPart,
  frameRadius,
  frameRect,
  frameSizeOf,
  frameLengthOf,
  GAP,
  Group,
  groupBounds,
  Item,
  heldBy,
  layoutOf,
  makeItem,
  Theme,
  fontFamilyOf,
  uiFontFamily,
  normalizeTheme,
  Palette,
  paletteOf,
  seedOf,
  shapeScaleOf,
  PHONE_H,
  PHONE_MARGIN,
  PHONE_W,
  SETTLE_CSS_VARS,
  SETTLE_MS,
  sizeOf,
  Transition,
  TRANSITIONS,
  uid,
  unionRect,
  takesDeviceBars,
  TRACE_OPACITY,
} from "@/lib/tokens";
import { DeviceBars } from "@/components/DeviceBars";
import { Icon } from "@/components/Icon";
import { ComponentNode, StaticPart } from "@/components/ComponentNode";
import { PartView } from "@/components/PartView";
import { CORNER_GAIN, CORNERS, HandleSide, SizeHandles } from "@/components/SizeHandles";
import { LayersPanel } from "@/components/Layers";
import { FrameSizePicker, Inspector } from "@/components/Inspector";
import { FrameInspector } from "@/components/FramePanel";
import { Preview } from "@/components/Preview";
import { Logo } from "@/components/Logo";
import { PartsPalette } from "@/components/PartsPalette";
import { TemplatesPanel } from "@/components/TemplatesPanel";
import { PromptPanel } from "@/components/PromptPanel";
import { GitHubLink, Mode, Toolbar, type Note, type NoteAction } from "@/components/Toolbar";
import { LangMenu } from "@/components/Menus";
import { AiActionKey, AiPanel, aiErrorText } from "@/components/AiPanel";
import { TidyState, PANEL_FADE_H } from "@/components/ui";
import { AiSettings, DEFAULT_AI, generateImage, hasImageKey, hasKey, imageSpec, isSecureUrl, loadAiSettings, proposeBehavior, proposeDescription, pushHistory, saveAiSettings, scenePrompt, scenesToPaint } from "@/lib/ai";
import { holdsEdgeBar, maxFrameLength, minFrameLength, tidyFrame } from "@/lib/tidy";
import { combineButtons, joinTargetOf } from "@/lib/combine";
import { type AlignHow } from "@/lib/align";
import { childLayoutOf, flowHostAt, flowOf, outOfPane, showingGroups } from "@/lib/flow";
import { guideTargets, insertionMark, measureBetween, snapRect, targetRects, type GuideGap, type GuideLine, type GuideTargets, type Rect as GuideRect } from "@/lib/guides";
import { InsertionMark, SmartGuides } from "@/components/SmartGuides";
import { canNest, expandInstances, standIn } from "@/lib/instances";
import { canvasView, expandDoc, type CanvasView, type DrawnPart } from "@/lib/expand";
import { repeatAround } from "@/lib/collections";
import { familyOf, missingSizes } from "@/lib/variants";
import { ComponentsPanel, DataPanel, InstanceInspector, sizeWord } from "@/components/ReusePanels";
import { Behavior, BehaviorContext, StyleRulesContext } from "@/components/EffectsPanel";
import { readProject, saveProject } from "@/lib/project";
import { hasShareHash, readShareHash } from "@/lib/share";
import { LoadingIndicator } from "@/components/Loading";
import { draftDesign } from "@/lib/ai";
import { pushApart } from "@/lib/settle";
import { isNavPart, mergeLinks, routeLink, shownLinks, type LinkLine, type Route } from "@/lib/links";
import { ShareDialog } from "@/components/ShareMenu";
import { ColorPanel } from "@/components/ColorPanel";
import { MotionPanel, ShapePanel, TypePanel } from "@/components/ThemePanel";
import { ensureFontLoaded, ensureLangFontLoaded } from "@/lib/theme";
import { PartStyleSheet, PartThemeContext, PartThemeStyle, type PartTheme } from "@/parts/theme";
import { artOf, isStrict, screenBackground, styleOf, styleTextOf, type StyleUX } from "@/lib/styles";
import { conformDoc, conformGroups, rulesForModel } from "@/lib/styleRules";
import { afterPass, relayoutDue, startRelayout, type Relayout } from "@/lib/relayoutClock";
import { tidyLook } from "@/lib/look";
import { layoutForStyle, metricsOf } from "@/lib/styleLayout";
import { fillRest, fitLength, standingTogether } from "@/lib/tidy";
import { useIconFamily } from "@/parts/icons";
import { StyleGate, StylePanel } from "@/components/StylePanel";
import { partBySlug, reader } from "@/parts/registry";
import { templateBySlug } from "@/parts/templates";
import { kitOfKey } from "@/parts/kits";
import { defaultMeasures } from "@/parts/templates/kit";
import { kitLookOf, moveTo, treeSize } from "@/lib/kits";
import { COMMON_TEXT } from "@/parts/labels";
import { FIT_OVERLAY, REMEASURE } from "@/parts/contained";
import { axisStep, axisValue, axisWrite, resizeOf, type PartAxis } from "@/parts/resize";
import { roleOf } from "@/parts/role";
import { BottomSheet, MobileActionBar, MobileInspector, MobileLang, MobileSettings } from "@/components/Mobile";
import { ConfirmDialog, IconBtn, Segmented } from "@/components/ui";
import { Lang, LangContext, SEED_TEXT, getLang, setGlobalLang, t } from "@/lib/i18n";
import { OpError, ops, savedDoc, translateSnapshot, withDoc, withFrames, withGroups, type Op, type TxOptions } from "@/lib/core";
import { useStore } from "@/lib/core/react";
import { localPersist, PersistFullError, withAssets, type PersistAdapter, type Stored } from "@/lib/core/persist";
import { freshPart, freshSize, onGrid } from "@/lib/core/ops/common";
import { buildKit as buildKitGroups, clipOf, movedGroups, type Clip, type GroupPatch } from "@/lib/core/ops/nodes";
import { ensureScreen } from "@/lib/core/ops/screens";
import { editorStore } from "./editor/store";

/** the screens while a model drafts: primary, tertiary and primary container, drifting */
const BASE_PATH = import.meta.env.VITE_BASE_PATH ?? "";

/** the dragged part's own travel: a little lag reads as weight */
const CARRY = {
  type: "spring" as const,
  stiffness: 620,
  damping: 38,
  mass: 0.7,
};
/** the gap opening and the run's counter-shift; identical configs so they cancel */
const OPEN = {
  type: "spring" as const,
  stiffness: 700,
  damping: 42,
  mass: 0.55,
};
const INSTANT = { duration: 0 };
/** a cancelled part shrinking away: long enough to be seen, short enough not to be waited for */
const VANISH_MS = 180;
const VANISH = { duration: VANISH_MS / 1000, ease: [0.3, 0, 0.8, 0.15] as const };
/** a hole opening or closing: the run's offset travels on the same curve the hole's own width does */
const GAP_TWEEN = { duration: SETTLE_MS / 1000, ease: [0.2, 0, 0, 1] as const };

/** the icon rail on the left edge of the parts / layers panel */
const RAIL_W = 52;
const MIN_Z = 0.25;
const MAX_Z = 3;
/** the room a screen keeps from the canvas edges when the camera glides to it: the floating
 *  toolbar's row at the top, a margin elsewhere */
const GLIDE_TOP = 84;
const GLIDE_PAD = 40;
const UI_KEY = "m3e:ui";

type View = { x: number; y: number; z: number };

/** Smart guides for what is being carried: where it snaps on each axis (left out where it does not), and what to draw:
 *  the lines it lines up with, the even gaps it keeps, the distances to its neighbours (lib/guides.ts). */
type Guide = { x?: number; y?: number; lines: GuideLine[]; gaps: GuideGap[] };
const GUIDE_PX = 7;

/** How far below the top of a drawn part its first line of text sits. The browser gives the box of that line's glyphs;
 *  the baseline is taken at four fifths of it, where it falls for the Latin and CJK faces a style uses. Undefined for a
 *  part with no words. */
function firstBaseline(el: HTMLElement, top: number): number | undefined {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getClientRects()[0];
    if (r && r.height > 0) return Math.max(1, Math.round(r.top + r.height * 0.8 - top));
  }
  return undefined;
}

const FRAME_MARGIN = PHONE_MARGIN;

type DragState = {
  item: Item;
  guide: Guide | null;
  offX: number;
  offY: number;
  startX: number;
  startY: number;
  px: number;
  py: number;
  active: boolean;
  fromPalette: boolean;
  overBin: boolean;
  /** let go where it cannot land: the ghost shrinks away before the state is cleared */
  vanishing: boolean;
  /** what is carried from the Components tab: it lands as an instance of this definition */
  instance?: string;
  /** A kit carried from the palette: `item` is its outermost box, and these are all its groups with
   *  that box's top left at 0,0, and the sizes they were laid out by. It lands as all of them. */
  kit?: { slug: string; variant?: string; groups: Group[]; measures: Record<string, number> };
};

type Gesture =
  | { kind: "pan"; sx: number; sy: number; vx: number; vy: number }
  | {
      kind: "marquee";
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      moved: boolean;
    }
  | {
      kind: "frame";
      id: string;
      sx: number;
      sy: number;
      fx: number;
      fy: number;
      groups: { id: string; x: number; y: number }[];
      moved: boolean;
    }
  | { kind: "group"; id: string; sx: number; sy: number; gx: number; gy: number; moved: boolean; overBin: boolean; guide?: Guide | null; carry?: { id: string; x: number; y: number }[] };

/** a repeated row other than the template, on the canvas */
const ROW_DIM = 0.5;

/** a part drawn open (a dialog, a menu) floats over the parts around it, whichever was added later */
const drawnOpen = (g: Group) => g.items.some((it) => !!partBySlug(it.component)?.open);
/** the handles of a part: pulled by whichever measures its props have */
const componentAxes = (it: Item) => resizeOf(partBySlug(it.component), it.props);
const BAR_SIDES = ["left", "right"] as const;
const TALL_SIDES = ["top", "bottom"] as const;

/** a screen changing size eases the way a settling part does */
const SIZE_TRANSITION = `width ${SETTLE_MS}ms cubic-bezier(0.2, 0, 0, 1), height ${SETTLE_MS}ms cubic-bezier(0.2, 0, 0, 1), border-radius ${SETTLE_MS}ms cubic-bezier(0.2, 0, 0, 1)`;

const SEED_FRAMES: Frame[] = [{ id: "seedF1", name: "Home", x: 0, y: 0 }];

/** how a part hidden at the start of the preview is drawn on the canvas */
const HIDDEN_DIM = 0.4;

/** Seed ids are deterministic so server and client render the same markup. */
/* shown when an edit is refused because the group is locked */
const lockedGroupMsg = () => t("lockedGroup", getLang());
const groupRefusedMsg = () => t("groupInstanceRefused", getLang());

/** a part that is a shadcn M3E component, with the values the author would have set */
const partOf = (slug: string, props: Record<string, unknown>, id: string): Item => ({ ...makeItem(slug), id, props });

/** the id a part carried from the palette goes by while it is carried */
const CARRIED = "carried";

/** the document with a part being carried standing where it is now, in place of where it was */
const carriedDrag = (groups: Group[], item: Item, x: number, y: number): Group[] => [...groups.filter((g) => !g.items.some((it) => it.id === item.id)), { id: CARRIED, x, y, axis: "x", items: [item] }];

/** The slot a carried group would take in the auto layout under it, by the order the layout reads its parts, and the line
 *  that marks it there. What stands loose in the layout, or on a tab not showing, has no place in the run. */
function slotIn(host: Group, groups: Group[], id: string, widths: Record<string, number>) {
  const f = flowOf(host);
  const carried = groups.find((g) => g.id === id);
  if (!f || !carried) return null;
  const off = outOfPane(groups, widths);
  const kids = groups.filter((g) => g.inFlow === host.id && g.id !== id && !off.has(g.id) && !(g.items.length === 1 && childLayoutOf(g.items[0]).absolute)).map((g) => groupBounds(g, widths));
  const b = groupBounds(host, widths);
  const room = { l: b.l + f.inset.l + f.pad.l, t: b.t + f.inset.t + f.pad.t, r: b.r - f.inset.r - f.pad.r, b: b.b - f.inset.b - f.pad.b };
  return insertionMark(kids, { x: carried.x, y: carried.y }, { dir: f.dir, wrap: f.wrap, gap: f.gap }, room);
}

/* The starter sketch: an app bar, a pair of buttons, three list items, a FAB and a navigation bar, all
 * of them the real components. Parts are as tall as they measure, so the rows sit apart on their own. */
const seed = (lang: Lang = getLang()): Group[] => {
  /* the parts' own seed words, so a change of language reseeds them the way it does a part added later */
  const word = (en: string) => (lang === "en" ? en : (COMMON_TEXT[en]?.[lang] ?? en));
  const text = { favorite: word("Favorite"), share: word("Share"), inbox: word("Inbox"), starred: word("Starred"), archive: word("Archive"), supporting: word("Supporting text") };
  let n = 0;
  const sid = () => `seed${++n}`;
  const content = PHONE_W - PHONE_MARGIN * 2;
  const bar = partOf("app-bar", { title: text.inbox, width: PHONE_W }, sid());
  /* the two buttons are one connected pair, the way the first canvas drew them */
  const pair = partOf(
    "button-group",
    { items: [{ label: text.favorite, icon: "star", variant: "filled" }, { label: text.share, icon: "share" }], buttonVariant: "tonal", size: "md" },
    sid(),
  );
  const rows = [text.inbox, text.starred, text.archive].map((label, i) =>
    partOf("item", { items: [{ label, icon: ["inbox", "star", "archive"][i] }], description: text.supporting, trailing: "icon", width: content }, sid()),
  );
  const fab = partOf("fab", { icon: "edit" }, sid());
  const nav = partOf("navigation-bar", { width: PHONE_W }, sid());
  const navH = partBySlug("navigation-bar")?.h ?? 64;
  return [
    { id: sid(), x: 0, y: 0, axis: "x", items: [bar] },
    { id: sid(), x: PHONE_MARGIN, y: 88, axis: "x", items: [pair] },
    ...rows.map((row, i) => ({ id: sid(), x: PHONE_MARGIN, y: 168 + i * 76, axis: "y" as const, items: [row] })),
    { id: sid(), x: PHONE_W - 56 - PHONE_MARGIN, y: PHONE_H - navH - 56 - PHONE_MARGIN, axis: "x", items: [fab] },
    { id: sid(), x: 0, y: PHONE_H - navH, axis: "x", items: [nav] },
  ];
};

/** The phone version starts with buttons only: that is all it edits. */
const mobileSeed = (lang: Lang = getLang()): Group[] => {
  const text = SEED_TEXT[lang];
  const a = partOf("button", { label: text.favorite, icon: "star", size: "md" }, uid());
  const b = partOf("button", { label: text.share, icon: "share", variant: "tonal", size: "md" }, uid());
  const c = partOf("button", { label: text.start, icon: "arrow_forward", size: "md" }, uid());
  return [
    { id: uid(), x: PHONE_MARGIN, y: 120, axis: "x", items: [a] },
    { id: uid(), x: PHONE_MARGIN + 160, y: 120, axis: "x", items: [b] },
    { id: uid(), x: PHONE_MARGIN, y: 200, axis: "x", items: [c] },
  ];
};

/** While the model works on a screen, the scheme's colors drift through its bezel. */
function ThinkingRing({ p, frame }: { p: Palette; frame: Frame }) {
  const still = useReducedMotion();
  const w = frameSizeOf(frame).w + BEZEL * 2;
  const h = frameLengthOf(frame) + BEZEL * 2;
  const d = Math.ceil(Math.hypot(w, h)) + 80;
  const stops = [p.primary, p.tertiaryContainer, p.inversePrimary, p.secondaryContainer, p.primaryContainer, p.primary];
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: [0.2, 0, 0, 1] }}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <motion.div
        animate={still ? undefined : { rotate: 360 }}
        transition={{ repeat: Infinity, duration: 3.2, ease: "linear" }}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: d,
          height: d,
          marginLeft: -d / 2,
          marginTop: -d / 2,
          background: `conic-gradient(from 0deg, ${stops.join(", ")})`,
          filter: "blur(22px)",
        }}
      />
    </motion.div>
  );
}

type LeftTab = "parts" | "templates" | "components" | "data" | "layers" | "style" | "color" | "shape" | "type" | "motion" | "ai";
/** the left rail: parts, templates, what the design reuses and layers, then the look of the whole design: its style, and the four axes under it */
const LEFT_TABS: { key: LeftTab; icon: string; title: "parts" | "screenTemplates" | "components" | "data" | "layers" | "styleTab" | "colors" | "shape" | "typography" | "motion" | "ai" }[] = [
  { key: "parts", icon: "add_box", title: "parts" },
  { key: "templates", icon: "dashboard_customize", title: "screenTemplates" },
  { key: "components", icon: "widgets", title: "components" },
  { key: "data", icon: "table_chart", title: "data" },
  { key: "layers", icon: "layers", title: "layers" },
  { key: "style", icon: "style", title: "styleTab" },
  { key: "color", icon: "palette", title: "colors" },
  { key: "shape", icon: "rounded_corner", title: "shape" },
  { key: "type", icon: "text_fields", title: "typography" },
  { key: "motion", icon: "animation", title: "motion" },
  { key: "ai", icon: "auto_awesome", title: "ai" },
];

export default function Editor({ initialLang, onReady, persist = localPersist }: { initialLang: Lang; onReady?: () => void; /** where the document is kept between visits (lib/core/persist.ts) */ persist?: PersistAdapter }) {
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  /* ---------- document ---------- */
  const [lang, setLang] = useState<Lang>(initialLang);
  const [editAccess, setEditAccess] = useState<"checking" | "editable" | "readonly">("checking");
  /* The document lives in the document core's store (lib/core): the canvas's screens and parts, the theme, the data,
   * the selection and the measures, and the history. Everything here reads it and changes it through it. */
  const [store] = useState(() => editorStore(seed(initialLang), [{ ...SEED_FRAMES[0], name: t("home", initialLang) }]));
  const { state: core, history } = useStore(store);
  const { groups, frames, paletteKey, theme, vars, components, collections, frame } = core.doc;
  const customPalette = core.doc.customPalette ?? null;
  const dynamicColor = !!core.doc.dynamicColor;
  const widths = core.session.widths;
  const selectedIds = core.session.selection;
  const selectedFrameId = core.session.frameId;
  const defEdit = core.editing;
  const themeRef = useRef(theme);
  themeRef.current = theme;
  /** An operation run as one change, a step of the history as it says. What it cannot do is said the way the editor
   *  has always said it: a locked part on a toast, anything else as `refused` asks, or not at all. */
  const runOp = <A, R>(o: Op<A, R>, args: A, opts: TxOptions & { label?: string; refused?: (e: OpError) => void } = {}): R | undefined => {
    try {
      return store.run(o, args, opts);
    } catch (e) {
      if (!(e instanceof OpError)) throw e;
      if (opts.refused) opts.refused(e);
      else if (e.code === "locked") showToast(lockedGroupMsg());
      return undefined;
    }
  };
  /** the same, for an operation that reports nothing: whether it did what it was asked */
  const didOp = <A,>(o: Op<A, unknown>, args: A, opts: TxOptions & { label?: string; refused?: (e: OpError) => void } = {}): boolean => {
    try {
      store.run(o, args, opts);
      return true;
    } catch (e) {
      if (!(e instanceof OpError)) throw e;
      if (opts.refused) opts.refused(e);
      else if (e.code === "locked") showToast(lockedGroupMsg());
      return false;
    }
  };
  /* the canvas's parts and screens changed as part of the step before (a gesture in progress, a layout pass) */
  const setGroups = (next: Group[] | ((g: Group[]) => Group[]), label = "Canvas") => store.update(label, "user", (s) => withGroups(s, typeof next === "function" ? next(s.doc.groups) : next));
  const setFrames = (next: Frame[] | ((f: Frame[]) => Frame[]), label = "Canvas") => store.update(label, "user", (s) => withFrames(s, typeof next === "function" ? next(s.doc.frames) : next));
  const setWidths = store.setWidths;
  const setSelectedIds = store.select;
  const setSelectedFrameId = store.selectFrame;
  const setFrame = (mode: FrameMode) => store.update("Canvas mode", "user", (s) => withDoc(s, { frame: mode }));
  /* Whatever asks, a theme held to its style stays what the style says. A change that composes kits another way (light
   * and dark, the recipes, the face) composes the kits nobody has changed again, as one undo step with it. */
  const patchTheme = (patch: Partial<Theme>) => runOp(ops.patchTheme, { patch });
  /* colors picked after a style are the author's: the style keeps everything else */
  const pickPalette = (key: string) => runOp(ops.setPalette, { key });
  const pickCustomPalette = (custom: Palette | null) => runOp(ops.setCustomPalette, { palette: custom });
  const setDynamicColor = (on: boolean) => runOp(ops.setDynamicColor, { on });
  const changeLanguage = (next: Lang) => {
    setGlobalLang(next);
    initialLangRef.current = next;
    setLang(next);
    const tidy = tidyRef.current;
    const was = store.get().doc;
    store.translate(next);
    if (tidy) {
      tidyRef.current = tidy.after === was.groups ? {
        ...tidy,
        before: translateSnapshot({ groups: tidy.before, frames: was.frames }, next, was.theme).groups,
        after: store.get().doc.groups,
      } : null;
    }
  };
  const [isMobile, setIsMobile] = useState(false);
  const [sheet, setSheet] = useState<"edit" | "settings" | "lang" | "add" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  /** frame being rendered offscreen for the PNG export */
  const [exportFrame, setExportFrame] = useState<Frame | null>(null);
  const [toast, setToast] = useState<Note | null>(null);
  /** the definition open for editing, if one is: then `groups` and `frames` are its screen, not the document's.
   *  Read live from the store; the view the canvas had before it opened waits here. */
  const defEditRef = { get current() { return store.get().editing; } };
  const defViewRef = useRef<View | null>(null);
  /** the prompt's full-screen cover is up: the panel's own band steps aside while it is */
  const [promptCoverUp, setPromptCoverUp] = useState(false);
  /** the author's explicit target; null follows the screens (web once a desktop screen exists) */
  /** a project file waiting for the author to confirm replacing the canvas */
  const [pendingImport, setPendingImport] = useState<Doc | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  /** the idea typed into the "ask an AI" dialog; kept here so a failed draft does not lose it */
  const [ideaText, setIdeaText] = useState("");
  /** a model is drafting a design right now */
  const [draftBusy, setDraftBusy] = useState(false);
  /** the design a draft replaced, kept until the author keeps or undoes the draft */
  const [draftBefore, setDraftBefore] = useState<Doc | null>(null);
  const draftBeforeRef = useRef<Doc | null>(null);
  draftBeforeRef.current = draftBefore;
  /** true for the moment after a design arrives, so its colours ease over */
  const [revealing, setRevealing] = useState(false);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
  }, []);
  const guideRef = useRef<string | null>(null);

  /* ---------- editor ui ---------- */
  const [view, setView] = useState<View>({ x: 0, y: 0, z: 1 });
  /** Keep the server-rendered world hidden until its first fit has completed. */
  const [viewReady, setViewReady] = useState(false);
  /** screens ease to their new place and size for a moment after one changes size */
  const [easing, setEasing] = useState(false);
  /** the canvas transform eases while the camera glides to or from a screen */
  const [cameraEasing, setCameraEasing] = useState(false);
  const [mode, setMode] = useState<Mode>("select");
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftW, setLeftW] = useState(RAIL_W + 268);
  const [leftTab, setLeftTab] = useState<LeftTab>("parts");
  /** pointer over the collapsed rail: the logo becomes the open button */
  const [railHover, setRailHover] = useState(false);
  /** the screen whose layers are listed when nothing on a screen is selected */
  const [layersFrameId, setLayersFrameId] = useState<string | null>(null);
  const [rightW, setRightW] = useState(320);
  const [rightTab, setRightTab] = useState<"edit" | "prompt">("edit");
  const [favorites, setFavorites] = useState<string[]>([]);
  const selectedFrameIdRef = useRef(selectedFrameId);
  selectedFrameIdRef.current = selectedFrameId;
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [showAllLinks, setShowAllLinks] = useState(false);
  /* picking a style lays the screens out its way too, unless the author asked to keep their own */
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [pressedId, setPressedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [resizing, setResizing] = useState<"left" | "right" | null>(null);
  /* ---------- tidy and ai ---------- */
  /** the groups before and after the last tidy; "undo" is offered only while the after-state is still current */
  const tidyRef = useRef<{ frameId: string; before: Group[]; after: Group[] } | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings>(DEFAULT_AI);
  const [aiBusy, setAiBusy] = useState(false);
  /** the screen the model is working on, which wears the animated ring meanwhile */
  const [aiFrameId, setAiFrameId] = useState<string | null>(null);
  /** the "applied" confirmation beside the tidy button */
  const [aiNote, setAiNote] = useState<Note | null>(null);
  const projectFileRef = useRef<HTMLInputElement>(null);
  const aiNoteTimer = useRef<number | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);

  const p = useMemo(() => paletteOf(paletteKey, customPalette, theme), [paletteKey, customPalette, theme]);
  /* corner helpers read the shape scale outside React; keep it current before anything renders */
  /* the shadcn M3E components are drawn in the same scheme the code asks for: the sketch's seed color */
  const partTheme = useMemo<PartTheme>(
    () => ({ seed: seedOf(paletteKey, customPalette, theme), dark: theme.dark, contrast: theme.contrast, shape: shapeScaleOf(theme.shape) }),
    [paletteKey, customPalette, theme],
  );

  const canvasRef = useRef<HTMLDivElement>(null);
  const measureEls = useRef<Map<string, HTMLElement>>(new Map());
  const dragRef = useRef<DragState | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const framesRef = useRef(frames);
  framesRef.current = frames;
  const componentsRef = useRef(components);
  componentsRef.current = components;
  const collectionsRef = useRef(collections);
  collectionsRef.current = collections;
  const widthsRef = useRef(widths);
  widthsRef.current = widths;
  const viewRef = useRef(view);
  viewRef.current = view;
  const previewIdRef = useRef(previewId);
  previewIdRef.current = previewId;
  const leftOpenRef = useRef(leftOpen);
  leftOpenRef.current = leftOpen;
  const leftWRef = useRef(leftW);
  leftWRef.current = leftW;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const spaceRef = useRef(spaceHeld);
  spaceRef.current = spaceHeld;
  /** focus last moved with Tab, not with a pointer */
  const tabbedRef = useRef(false);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const mobileRef = useRef(isMobile);
  mobileRef.current = isMobile;
  /** active touch points, for pinch zoom */
  const touchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{
    d0: number;
    z0: number;
    mx: number;
    my: number;
    vx: number;
    vy: number;
  } | null>(null);
  /** groups that must reposition without animating on the next render */
  const instantRef = useRef<Set<string>>(new Set());
  const loadedRef = useRef(false);
  const initialLangRef = useRef<Lang>(initialLang);
  /** A saved document or the first viewport initialization prevents later reseeding. */
  const hadDocRef = useRef(false);

  /* ---------- history ---------- */
  /** Takes an undo step now, before a change made in pieces (a gesture, a panel's edit); `withMeta` when the change
   *  crosses the whole document. The history itself is the store's. */
  const snapshot = useCallback((withMeta = false, label = "Edit") => {
    store.checkpoint(label, { whole: withMeta });
  }, [store]);
  /** consecutive edits of the same field collapse into one undo step */
  const snapshotFor = useCallback((key: string, label = "Edit") => {
    store.checkpoint(label, { coalesce: key });
  }, [store]);
  const undo = useCallback(() => {
    setQuickUndo(false);
    store.undo();
  }, [store]);
  const redo = useCallback(() => {
    store.redo();
  }, [store]);
  /* a step taken or taken back ends the moment a kept draft's undo sits by the opener; a step brought back puts its
   * parts where they were at once, and one that crossed the whole document closes what was open over the old one */
  useEffect(
    () =>
      store.subscribe((e) => {
        if (e.step) setQuickUndo(false);
        if (e.kind !== "undo" && e.kind !== "redo") return;
        /* a style's layout still to come would land on what has just been brought back */
        relayoutRef.current = null;
        for (const g of e.state.doc.groups) instantRef.current.add(g.id);
        if (e.whole) leaveForNewDoc();
      }),
    [store],
  );

  useEffect(() => {
    instantRef.current.clear();
  });

  /* ---------- persistence ---------- */
  /* where the document is kept between visits (lib/core/persist.ts): one tab edits, the others wait read-only */
  useEffect(() => persist.lock(setEditAccess), [persist]);

  /** What a whole document arriving does to what was open over the one it replaces. A document can arrive during
   *  the opening glide, before previewId is set: the screen the glide was heading for belongs to the replaced
   *  document, so the pending opening is dropped and the camera returns; an open preview simply closes. */
  const leaveForNewDoc = () => {
    if (previewTimer.current !== null) abandonPreview();
    else {
      /* a return still on its way would drag the camera off the new document's fit */
      cancelReturn();
      if (previewIdRef.current !== null) {
        setPreviewId(null);
        viewBeforePreview.current = null;
      }
    }
    relayoutRef.current = null;
  };

  useEffect(() => {
    // React's development double-run would otherwise read back its own first save
    if (loadedRef.current) return;
    try {
      const stored = persist.read() as Stored;
      const d = stored.doc;
      if (d) {
        hadDocRef.current = true;
        leaveForNewDoc();
        store.load(d, false);
        // frame mode is decided by the device (media-query effect), not restored
      }
      if (stored.before) setDraftBefore(stored.before);
      /* the large pictures wait in the browser's asset store: the document comes back whole a moment later */
      void persist
        .assets(stored)
        .then((found) => {
          if (!found) return;
          store.update("Pictures", "system", (s) => ({ ...s, doc: { ...s.doc, groups: withAssets(s.doc.groups, found), frames: withAssets(s.doc.frames, found), ...(s.doc.components ? { components: withAssets(s.doc.components, found) } : {}) } }));
          setDraftBefore((b) => (b ? withAssets(b, found) : b));
        })
        .catch(() => {});
      const u = localStorage.getItem(UI_KEY);
      if (u) {
        const ui = JSON.parse(u);
        if (ui.view) setView(ui.view);
        if (typeof ui.leftOpen === "boolean") setLeftOpen(ui.leftOpen);
        if (typeof ui.rightOpen === "boolean") setRightOpen(ui.rightOpen);
        if (ui.leftW) setLeftW(Math.max(RAIL_W + 244, ui.leftW));
        if (ui.rightW) setRightW(ui.rightW);
        if (Array.isArray(ui.favorites)) setFavorites(ui.favorites.filter((f: unknown): f is string => typeof f === "string" && (!!partBySlug(f) || !!kitOfKey(f))));
        if (ui.mode) setMode(ui.mode);
        if (ui.showAllLinks === true) setShowAllLinks(true);
      } else {
        queueMicrotask(() => fitRef.current());
      }
      setGlobalLang(initialLang);
      initialLangRef.current = initialLang;
      if (!d) {
        setGroups(seed(initialLang));
        setFrames([{ ...SEED_FRAMES[0], name: t("home", initialLang) }]);
      }
    } catch {}
    setAiSettings(loadAiSettings());
    loadedRef.current = true;
    /* the document is in state; one frame later it is on screen and the boot overlay may go.
       Not cancelled on cleanup: the development double-run skips this effect the second time. */
    requestAnimationFrame(() => onReadyRef.current?.());
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    /* the editor's own text and the parts both pick up the language's Noto face */
    document.body.style.fontFamily = uiFontFamily(lang);
    ensureLangFontLoaded(lang, () => setWidths({}));
  }, [lang]);

  useEffect(() => {
    /* an empty width map makes every measured part read its width again in the new face */
    ensureFontLoaded(theme.font, () => setWidths({}), lang);
    if (theme.displayFont) ensureFontLoaded(theme.displayFont, () => setWidths({}), lang);
    /* a style builds its controls to other sizes too */
    setWidths({});
  }, [theme.font, theme.displayFont, theme.style, theme.recipes, lang]);

  useIconFamily(theme.icons ?? "rounded");

  /* the page background outside the app root follows the scheme, so dark mode has no white edges */
  useEffect(() => {
    document.body.style.background = p.surface;
    document.body.style.color = p.onSurface;
  }, [p.surface, p.onSurface]);

  /* in-app browsers size the page behind their own toolbars and may ignore dvh,
     so the measured inner height wins over the CSS height (innerHeight, not the
     visual viewport, so pinch-zoom and the keyboard leave the layout alone) */
  useEffect(() => {
    const apply = () => {
      const h = Math.round(window.innerHeight);
      if (h > 0) document.documentElement.style.setProperty("--app-h", `${h}px`);
    };
    /* in-app browsers (X, Instagram, LINE...) keep their own action bar over the
       page bottom, so the controls sit one button higher there. App names in the
       user agent are unreliable; the embedded web view itself is not: iOS web
       views omit the Safari token and Android ones carry "wv" */
    const ua = navigator.userAgent;
    const iosWebView = /iPhone|iPad|iPod/.test(ua) && !/Safari\//.test(ua);
    const androidWebView = /Android/.test(ua) && /(?:^|\W)wv(?:\W|$)/.test(ua);
    if (iosWebView || androidWebView || /Twitter|Instagram|FBAN|FBAV|Line\//i.test(ua)) {
      document.documentElement.style.setProperty("--bottom-ui", "64px");
    }
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);

  /* everyone works on phone screens; a phone gets one fixed screen and the select tool only */
  useEffect(() => {
    const mq = window.matchMedia(
      "(max-width: 840px), (pointer: coarse) and (max-width: 1024px)",
    );
    const apply = () => {
      const m = mq.matches;
      setIsMobile(m);
      mobileRef.current = m;
      /* a phone edits screens only: a document arriving or a step brought back keeps it on them */
      store.pinFrameMode(m ? "phone" : null);
      if (m) {
        setMode("select");
        setSheet(null);
        if (!hadDocRef.current) {
          hadDocRef.current = true;
          setGroups(mobileSeed(initialLangRef.current));
          setFrames([{ id: uid(), name: t("home", initialLangRef.current), x: 0, y: 0 }]);
        }
      }
      hadDocRef.current = true;
      if (frameRef.current !== "phone") {
        setFrame("phone");
        frameRef.current = "phone";
      }
      ensureFrameRef.current();
      queueMicrotask(() => {
        fitRef.current();
        setViewReady(true);
      });
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const saveFullToldRef = useRef(false);
  useEffect(() => {
    if (!loadedRef.current || editAccess !== "editable") return;
    /* the author keeps working; said once, since every later change would fail the same way */
    const full = (err: unknown) => {
      if (err instanceof PersistFullError && !saveFullToldRef.current) {
        saveFullToldRef.current = true;
        showToast(t("saveFull", getLang()), 9000, "warning");
      }
    };
    try {
      /* the document, even while a definition is open: a reload then finds its screens, and the definition as far as it got */
      const done = persist.write(docRef.current);
      if (done) done.then(() => (saveFullToldRef.current = false), full);
      else saveFullToldRef.current = false;
    } catch (err) {
      full(err);
    }
    /* whatever in the document changed, or the definition opened or closed; not the selection or the measures */
  }, [editAccess, core.doc, core.editing, persist]);

  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      localStorage.setItem(
        UI_KEY,
        JSON.stringify({
          view,
          leftOpen,
          rightOpen,
          leftW,
          rightW,
          favorites,
          mode,
          pickedLang: lang,
          showAllLinks,
          /* the theme's surfaces, so the shell drawn before the editor loads is already this colour */
          boot: { surface: p.surface, container: p.surfaceContainer, low: p.surfaceContainerLow, high: p.surfaceContainerHigh, primary: p.primary, canvas: frame === "phone" ? p.surfaceContainerLow : "#ffffff" },
        }),
      );
    } catch {}
  }, [
    view,
    leftOpen,
    rightOpen,
    leftW,
    rightW,
    p,
    frame,
    favorites,
    mode,
    lang,
    showAllLinks,
  ]);

  /* ---------- measurement ---------- */
  /* an overlay mounts after the render that made its box; it says so, and this render measures it */
  const [, setRemeasure] = useState(0);
  useEffect(() => {
    const again = () => setRemeasure((n) => n + 1);
    window.addEventListener(REMEASURE, again);
    return () => window.removeEventListener(REMEASURE, again);
  }, []);
  /** a screen that changed size and is waiting for its parts' new measures before it is
   *  laid out again — an overlay's size only settles once it has been drawn in its new box */
  const retidyRef = useRef<string[] | null>(null);
  /** screens just added from a template: what touches on them does so because of a guess at its size, not by design */
  const freshFramesRef = useRef<{ ids: string[]; until: number } | null>(null);
  /** screens just put on another phone: what they hold wraps anew, and is only known once it has been drawn at that width */
  const newPhoneRef = useRef<{ ids: string[]; until: number } | null>(null);
  /** each part's text baseline, with the size it was read at */
  const baseCache = useRef(new Map<string, { w: number; h: number; base: number | undefined }>());
  useLayoutEffect(() => {
    const next: Record<string, number> = {};
    measureEls.current.forEach((el, id) => {
      /* a part that fits its overlay is the overlay's size, not the box it floats in */
      const ov = el.querySelector<HTMLElement>(FIT_OVERLAY);
      /* the overlay mounts through a portal a beat after the box does: until it is there,
       * the box's own size would be mistaken for the part's, so keep the last known size */
      if (!ov && el.querySelector("[data-fit]") && widthsRef.current[id] !== undefined) {
        next[id] = widthsRef.current[id];
        next[`${id}:h`] = widthsRef.current[`${id}:h`] ?? next[`${id}:h`];
        if (widthsRef.current[`${id}:base`] !== undefined) next[`${id}:base`] = widthsRef.current[`${id}:base`];
        return;
      }
      const box = (ov ?? el).getBoundingClientRect();
      next[id] = Math.ceil(box.width);
      next[`${id}:h`] = Math.ceil(box.height);
      /* where its first line of text sits, for lining parts up on their baselines: read again only when its size moved */
      const known = baseCache.current.get(id);
      const base = known && known.w === next[id] && known.h === next[`${id}:h`] ? known.base : firstBaseline(ov ?? el, box.top);
      baseCache.current.set(id, { w: next[id], h: next[`${id}:h`], base });
      if (base !== undefined) next[`${id}:base`] = base;
    });
    const keys = Object.keys(next);
    const changed =
      keys.length !== Object.keys(widthsRef.current).length ||
      keys.some((k) => widthsRef.current[k] !== next[k]);
    if (changed) setWidths(next);
    /* the screens to lay out again: one whose preset just changed (`retidyRef`), and any
     * screen holding an overlay whose measured size moved under it — an overlay centers
     * itself, so a size that changed since the last tidy leaves it off center */
    const retidy = new Set<string>();
    if (retidyRef.current) for (const id of retidyRef.current) retidy.add(id);
    retidyRef.current = null;
    const fresh = freshFramesRef.current && Date.now() < freshFramesRef.current.until ? freshFramesRef.current.ids : [];
    const newPhone = newPhoneRef.current && Date.now() < newPhoneRef.current.until ? newPhoneRef.current.ids : [];
    if (changed) for (const id of [...fresh, ...newPhone]) retidy.add(id);
    if (changed)
      for (const g of groupsRef.current) {
        if (!g.items.some((it) => roleOf(it) === "overlay" && (next[it.id] !== widthsRef.current[it.id] || next[`${it.id}:h`] !== widthsRef.current[`${it.id}:h`]))) continue;
        const fid = frameOfGroup(g, framesRef.current, next)?.id;
        if (fid) retidy.add(fid);
      }
    /* `next` holds the sizes the parts just came out at; the change is instant — after a preset
     * change the screen is still easing to its new size, so the correction is part of the move */
    let laid = groupsRef.current;
    let laidFrames = framesRef.current;
    let moved = false;
    /* what a part is about to be given goes beside what the parts came out at, not over it: while a part has not
     * taken its new size the two differ, and a measure that kept reading as changed would run this again without end */
    const sizes = { ...next };
    for (const fid of retidy) {
      const fr = laidFrames.find((f) => f.id === fid);
      if (!fr) continue;
      const m = { ...metricsOf(themeRef.current), ...(fresh.includes(fid) ? { together: [] } : {}) };
      const filled = fillRest(laid, fr, laidFrames, sizes, m);
      /* how long such a screen has to be was reckoned from a guess, or from sizes on the other phone: now it is known */
      const fit = fresh.includes(fid) || newPhone.includes(fid) ? fitLength(filled, fr, laidFrames, sizes, m) : { groups: filled, frames: laidFrames, frame: fr };
      const tidied = tidyFrame(fit.groups, fit.frame, fit.frames, sizes, m);
      if (tidied || fit.groups !== laid || fit.frames !== laidFrames) {
        laid = tidied ?? fit.groups;
        laidFrames = fit.frames;
        moved = true;
      }
    }
    if (moved) {
      setGroups(laid);
      if (laidFrames !== framesRef.current) setFrames(laidFrames);
    }
  });

  useEffect(() => {
    const refreshWidths = () => setWidths({});
    document.fonts?.ready.then(refreshWidths);
    document.fonts?.addEventListener("loadingdone", refreshWidths);
    return () => document.fonts?.removeEventListener("loadingdone", refreshWidths);
  }, []);

  const sizeRef = useCallback((it: Item) => sizeOf(it, widthsRef.current), []);
  const alongRef = useCallback(
    (it: Item, axis: Axis) => (axis === "x" ? sizeRef(it).w : sizeRef(it).h),
    [sizeRef],
  );
  const prefixOf = useCallback(
    (g: Group, k: number) =>
      g.items.slice(0, k).reduce((s, it) => s + alongRef(it, g.axis) + GAP, 0),
    [alongRef],
  );

  /* ---------- coordinates ---------- */
  const canvasRect = () => canvasRef.current?.getBoundingClientRect();
  const inCanvas = (clientX: number, clientY: number) => {
    const r = canvasRect();
    return !!r && clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  };
  const toWorld = (clientX: number, clientY: number) => {
    const r = canvasRect();
    const v = viewRef.current;
    return {
      x: (clientX - (r?.left ?? 0) - v.x) / v.z,
      y: (clientY - (r?.top ?? 0) - v.y) / v.z,
    };
  };
  /* only the open left panel accepts a drop for deletion; the narrow rail never does */
  const inBin = (clientX: number) =>
    !mobileRef.current && leftOpenRef.current && clientX >= 0 && clientX <= leftWRef.current;

  const setZoomAt = useCallback((nz: number, cx?: number, cy?: number) => {
    const r = canvasRect();
    const v = viewRef.current;
    const z = clamp(nz, MIN_Z, MAX_Z);
    const px = cx === undefined ? (r?.width ?? 0) / 2 : cx - (r?.left ?? 0);
    const py = cy === undefined ? (r?.height ?? 0) / 2 : cy - (r?.top ?? 0);
    setView({
      x: px - ((px - v.x) * z) / v.z,
      y: py - ((py - v.y) * z) / v.z,
      z,
    });
  }, []);

  const fit = useCallback(() => {
    const r = canvasRect();
    if (!r) return;
    const gs = groupsRef.current;
    let x0 = -BEZEL;
    let y0 = -BEZEL - FRAME_LABEL_H;
    let x1 = PHONE_W + BEZEL;
    let y1 = PHONE_H + BEZEL;
    const fs = framesRef.current;
    if (frameRef.current === "phone" && fs.length > 0) {
      x0 = Math.min(...fs.map((f) => f.x)) - BEZEL;
      y0 = Math.min(...fs.map((f) => f.y)) - BEZEL - FRAME_LABEL_H;
      x1 = Math.max(...fs.map((f) => frameRect(f).r)) + BEZEL;
      y1 = Math.max(...fs.map((f) => frameRect(f).b)) + BEZEL;
    }
    if (frameRef.current === "blank") {
      if (gs.length === 0) {
        setView({ x: 48, y: 48, z: 1 });
        return;
      }
      x0 = Infinity;
      y0 = Infinity;
      x1 = -Infinity;
      y1 = -Infinity;
      for (const g of gs) {
        for (const pl of layoutOf(g, widthsRef.current)) {
          x0 = Math.min(x0, pl.x);
          y0 = Math.min(y0, pl.y);
          x1 = Math.max(x1, pl.x + pl.w);
          y1 = Math.max(y1, pl.y + pl.h);
        }
      }
    }
    const mobile = mobileRef.current;
    const pad = mobile ? 14 : 40;
    const top = mobile ? 96 : 84; // keep the floating toolbar clear of the frame
    const bottom = mobile ? 96 : pad;
    if (mobile) {
      // a phone zooms to the width of the first screen and starts at its top; the rest are a pan away.
      // Fitting them all would leave each a stamp, with the first cut off at the edge
      const first = frameRef.current === "phone" ? fs[0] : undefined;
      if (first) {
        x0 = first.x - BEZEL;
        x1 = frameRect(first).r + BEZEL;
      }
      const z = clamp((r.width - pad * 2) / (x1 - x0), MIN_Z, MAX_Z);
      setView({ x: (r.width - (x1 - x0) * z) / 2 - x0 * z, y: top - y0 * z, z });
      return;
    }
    const z = clamp(
      Math.min(
        (r.width - pad * 2) / (x1 - x0),
        (r.height - top - bottom) / (y1 - y0),
        1,
      ),
      MIN_Z,
      MAX_Z,
    );
    setView({
      x: (r.width - (x1 - x0) * z) / 2 - x0 * z,
      y: top + (r.height - top - bottom - (y1 - y0) * z) / 2 - y0 * z,
      z,
    });
  }, []);
  const fitRef = useRef(fit);
  fitRef.current = fit;

  /* touch: two fingers pinch-zoom and pan, cancelling whatever one finger started */
  const onTouchCapture = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touchesRef.current.size === 2) {
      const [a, b] = [...touchesRef.current.values()];
      const v = viewRef.current;
      pinchRef.current = {
        d0: Math.hypot(a.x - b.x, a.y - b.y),
        z0: v.z,
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
        vx: v.x,
        vy: v.y,
      };
      dragRef.current = null;
      setDrag(null);
      setPressedId(null);
      gestureRef.current = null;
      setGesture(null);
    }
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !touchesRef.current.has(e.pointerId))
        return;
      touchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pinch = pinchRef.current;
      if (!pinch || touchesRef.current.size < 2) return;
      const [a, b] = [...touchesRef.current.values()];
      const r = canvasRef.current?.getBoundingClientRect();
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const z = clamp((pinch.z0 * d) / Math.max(1, pinch.d0), MIN_Z, MAX_Z);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const px = pinch.mx - (r?.left ?? 0);
      const py = pinch.my - (r?.top ?? 0);
      setView({
        x: px - ((px - pinch.vx) * z) / pinch.z0 + (mx - pinch.mx),
        y: py - ((py - pinch.vy) * z) / pinch.z0 + (my - pinch.my),
        z,
      });
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      touchesRef.current.delete(e.pointerId);
      if (touchesRef.current.size < 2) pinchRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  /* wheel: pan, or zoom with ctrl / pinch */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        setZoomAt(
          viewRef.current.z * Math.exp(-e.deltaY * 0.0022),
          e.clientX,
          e.clientY,
        );
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setZoomAt]);

  const sx = useSpring(0, CARRY);
  const sy = useSpring(0, CARRY);

  /** What a drag can line up with, worked out once when it starts and kept until it ends: every part on the canvas but
   *  what is carried, and the screens with their margins and middles. A move of the pointer only reads it. */
  const guideCache = useRef<{ key: string; targets: GuideTargets } | null>(null);
  const targetsFor = useCallback((skip: Set<string>): GuideTargets => {
    const key = [...skip].sort().join(" ");
    if (guideCache.current?.key === key) return guideCache.current.targets;
    const rects: { l: number; t: number; r: number; b: number }[] = [];
    /* a part on a dock's other tab is not on the canvas to line up with */
    const off = outOfPane(groupsRef.current, widthsRef.current);
    for (const g of groupsRef.current) {
      if (off.has(g.id)) continue;
      for (const pl of layoutOf(g, widthsRef.current)) if (!skip.has(pl.item.id)) rects.push({ l: pl.x, t: pl.y, r: pl.x + pl.w, b: pl.y + pl.h });
    }
    const margin = metricsOf(themeRef.current).margin ?? FRAME_MARGIN;
    const screens = frameRef.current === "phone" ? framesRef.current.map((f) => ({ rect: frameRect(f), margin })) : [];
    const targets = guideTargets(rects, screens);
    guideCache.current = { key, targets };
    return targets;
  }, []);
  /** a drag is over: what it could line up with is worked out afresh for the next */
  const endGuides = () => {
    guideCache.current = null;
  };
  /** whether a group let go where it stands in these groups would go into an auto layout, which then places it */
  const overFlow = (gs: Group[], id: string) => !!flowHostAt(gs, id, widthsRef.current);

  /** Figma-style smart guides: the edges and centres of the parts on the same screen and of the screen itself, the gaps
   *  its neighbours keep, pull the part gently into line, and the guides say what it lines up with and how far it is. */
  const guideFor = useCallback(
    (left: number, top: number, sz: { w: number; h: number }, skip: Set<string>): Guide | null => {
      const tol = GUIDE_PX / viewRef.current.z;
      const s = snapRect({ l: left, t: top, r: left + sz.w, b: top + sz.h }, targetsFor(skip), tol);
      if (!s.snapX && !s.snapY && !s.gaps.length) return null;
      return { x: s.snapX ? left + s.dx : undefined, y: s.snapY ? top + s.dy : undefined, lines: s.lines, gaps: s.gaps };
    },
    [targetsFor],
  );
  const findGuide = useCallback(
    (item: Item, left: number, top: number): Guide | null => guideFor(left, top, sizeRef(item), new Set([item.id])),
    [guideFor, sizeRef],
  );

  /* ---------- pointer: parts ---------- */
  const startPan = (clientX: number, clientY: number) => {
    const g: Gesture = {
      kind: "pan",
      sx: clientX,
      sy: clientY,
      vx: viewRef.current.x,
      vy: viewRef.current.y,
    };
    gestureRef.current = g;
    setGesture(g);
  };

  /* a drop that adds or deletes nothing: the ghost fades and shrinks where it was let go, so the
   * cancel is seen rather than the part simply blinking out */
  const vanishDrag = (d: DragState) => {
    setDrag({ ...d, vanishing: true, overBin: false, guide: null });
    window.setTimeout(() => setDrag((cur) => (cur?.vanishing ? null : cur)), VANISH_MS);
  };
  const onItemPointerDown = (
    e: React.PointerEvent,
    g: Group,
    index: number,
    item: Item,
  ) => {
    if (e.button === 1 || modeRef.current === "hand" || spaceRef.current) {
      e.preventDefault();
      e.stopPropagation();
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    /* an instance moves in place, as one unit, like a hand-made group: the copy that follows a
       pointer is for parts that are nothing but their item */
    if (g.free || g.instanceOf) {
      setSelectedIds((cur) => (e.shiftKey ? [...cur.filter((x) => !g.items.some((it) => it.id === x)), ...g.items.map((it) => it.id)] : g.items.map((it) => it.id)));
      setSelectedFrameId(null);
      setSelectedLinkId(null);
      setRightTab("edit");
      /* a locked group stays selectable, but dragging it does nothing */
      if (g.locked) return;
      const gg: Gesture = { kind: "group", id: g.id, sx: e.clientX, sy: e.clientY, gx: g.x, gy: g.y, moved: false, overBin: false };
      gestureRef.current = gg;
      setGesture(gg);
      return;
    }
    /* a container with something on it moves with what it holds, all in place, not as a copy
       following the pointer; an empty one is a part like any other */
    const held = g.locked ? [] : heldBy(g, groupsRef.current, widthsRef.current);
    if (held.length) {
      setSelectedIds((cur) => (e.shiftKey ? [...cur.filter((x) => x !== item.id), item.id] : [item.id]));
      setSelectedFrameId(null);
      setSelectedLinkId(null);
      setRightTab("edit");
      const gg: Gesture = { kind: "group", id: g.id, sx: e.clientX, sy: e.clientY, gx: g.x, gy: g.y, moved: false, overBin: false, carry: held.map((x) => ({ id: x.id, x: x.x, y: x.y })) };
      gestureRef.current = gg;
      setGesture(gg);
      return;
    }
    const pt = toWorld(e.clientX, e.clientY);
    const off = prefixOf(g, index);
    const left = g.axis === "x" ? g.x + off : g.x;
    const top = g.axis === "x" ? g.y : g.y + off;
    sx.jump(left);
    sy.jump(top);
    setSelectedIds((cur) =>
      e.shiftKey ? [...cur.filter((x) => x !== item.id), item.id] : [item.id],
    );
    setSelectedFrameId(null);
    setSelectedLinkId(null);
    setRightTab("edit");
    /* a locked group's part stays selectable, but dragging it does nothing */
    if (g.locked) return;
    setPressedId(item.id);
    const d: DragState = {
      item,
      offX: pt.x - left,
      offY: pt.y - top,
      startX: pt.x,
      startY: pt.y,
      px: pt.x,
      py: pt.y,
      active: false,
      fromPalette: false,
      overBin: false,
      vanishing: false,
      guide: null,
    };
    dragRef.current = d;
    setDrag({ ...d });
  };

  const onPartPointerDown = (e: React.PointerEvent, slug: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const item = freshPart(slug);
    const pt = toWorld(e.clientX, e.clientY);
    /* held by its middle, at the size it will come out: a line of words that hugs them is far narrower than its part's default */
    const sz = freshSize(item);
    const offX = Math.min(sz.w / 2, 90);
    const offY = Math.min(sz.h / 2, 40);
    sx.jump(pt.x - offX);
    sy.jump(pt.y - offY);
    setSelectedIds([item.id]);
    setRightTab("edit");
    const d: DragState = {
      item,
      offX,
      offY,
      startX: pt.x,
      startY: pt.y,
      px: pt.x,
      py: pt.y,
      active: true,
      fromPalette: true,
      overBin: false,
      vanishing: false,
      guide: null,
    };
    dragRef.current = d;
    setDrag({ ...d });
  };

  /** A definition picked up from the Components tab: it is carried like a part from the palette, and lands as an instance. */
  const onComponentPointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    const def = componentsRef.current?.find((c) => c.id === id);
    if (!def) return;
    e.preventDefault();
    e.stopPropagation();
    const item = standIn(def, 0, 0).items[0];
    const pt = toWorld(e.clientX, e.clientY);
    const offX = Math.min(def.w / 2, 90);
    const offY = Math.min(def.h / 2, 40);
    sx.jump(pt.x - offX);
    sy.jump(pt.y - offY);
    const d: DragState = { item, offX, offY, startX: pt.x, startY: pt.y, px: pt.x, py: pt.y, active: true, fromPalette: true, overBin: false, vanishing: false, guide: null, instance: id };
    dragRef.current = d;
    setDrag({ ...d });
  };

  /** A kit's groups for the document as it is: in the variant asked for or the one its style calls for,
   *  in the editor's language, no wider than a phone's content. */
  const buildKit = (slug: string, variant: string | undefined, screen: Frame | undefined) => buildKitGroups(store.get(), slug, variant, screen, getLang());

  /** A kit picked up from the palette: carried like a part, drawn whole, and let go as its atoms. */
  const onKitPointerDown = (e: React.PointerEvent, slug: string, variant?: string) => {
    if (e.button !== 0 || defEditRef.current) return;
    const groups = buildKit(slug, variant, framesRef.current[0]);
    if (!groups?.length) return;
    e.preventDefault();
    e.stopPropagation();
    const item = groups[0].items[0];
    const size = treeSize(groups);
    const pt = toWorld(e.clientX, e.clientY);
    const offX = Math.min(size.w / 2, 90);
    const offY = Math.min(size.h / 2, 40);
    sx.jump(pt.x - offX);
    sy.jump(pt.y - offY);
    const d: DragState = { item, offX, offY, startX: pt.x, startY: pt.y, px: pt.x, py: pt.y, active: true, fromPalette: true, overBin: false, vanishing: false, guide: null, kit: { slug, variant, groups, measures: defaultMeasures(groups) } };
    dragRef.current = d;
    setDrag({ ...d });
  };

  /** A kit's groups put down with their top left near (x, y): inside the screen under them, brought to
   *  its width, taken into the layout they were let go in (lib/core `add_kit`). Selected as one: the outermost box.
   *  One undo step. */
  const landKit = (kit: NonNullable<DragState["kit"]>, x: number, y: number) => {
    if (!runOp(ops.addKit, { slug: kit.slug, variant: kit.variant, at: { x, y }, built: kit.groups }, { history: "step" })) return;
    setRightTab("edit");
    setSheet(null);
  };

  /** Where a part or a kit chosen without a drag lands: on the selected screen (or the one the selection is on) while it is
   *  in view, else on the screen under the middle of the view, else on the nearest screen in view; on a phone, the screen
   *  shown. The spot is the middle of the view brought onto that screen, so nothing lands in the gap between two. */
  const landingSpot = (): { f: Frame | undefined; cx: number; cy: number } => {
    const r = canvasRect();
    const v = viewRef.current;
    const w = r?.width ?? 0;
    const h = r?.height ?? 0;
    let cx = (w / 2 - v.x) / v.z;
    let cy = (h / 2 - v.y) / v.z;
    /* screens are hidden on a blank canvas */
    if (frameRef.current !== "phone") return { f: undefined, cx, cy };
    const frames = framesRef.current;
    const holds = (fr: Frame) => {
      const b = frameRect(fr);
      return cx >= b.l && cx <= b.r && cy >= b.t && cy <= b.b;
    };
    const view = { l: -v.x / v.z, t: -v.y / v.z, r: (w - v.x) / v.z, b: (h - v.y) / v.z };
    const seen = frames.filter((fr) => {
      const b = frameRect(fr);
      return b.l < view.r && b.r > view.l && b.t < view.b && b.b > view.t;
    });
    const held = groupsRef.current.find((g) => g.items.some((it) => it.id === selectedIds[0]));
    const chosen = frames.find((fr) => fr.id === selectedFrameIdRef.current) ?? (held ? frameOfGroup(held, frames, widthsRef.current) : undefined);
    const away = (fr: Frame) => {
      const b = frameRect(fr);
      return Math.hypot(Math.max(b.l - cx, 0, cx - b.r), Math.max(b.t - cy, 0, cy - b.b));
    };
    const f = (chosen && seen.includes(chosen) ? chosen : undefined) ?? frames.find(holds) ?? [...seen].sort((a, b) => away(a) - away(b))[0] ?? (mobileRef.current ? frames[0] : undefined);
    if (f && !holds(f)) {
      const b = frameRect(f);
      cx = (b.l + b.r) / 2;
      cy = Math.min(Math.max(cy, b.t), b.b);
    }
    return { f, cx, cy };
  };

  /** A kit chosen without a drag: it lands where the view is looking, as a part does, on the screen in view and below what
   *  already stands at that spot. */
  const addKit = (slug: string, variant?: string) => {
    if (defEditRef.current) return;
    const { f, cx, cy } = landingSpot();
    const groups = buildKit(slug, variant, f ?? framesRef.current[0]);
    if (!groups?.length) return;
    const sz = treeSize(groups);
    let x = cx - sz.w / 2;
    let y = cy - sz.h / 2;
    if (f) {
      const h = frameLengthOf(f);
      const taken = (yy: number) => itemRects().some((o) => o.l < x + sz.w && o.r > x && o.t < yy + sz.h && o.b > yy);
      x = clamp(x, f.x + FRAME_MARGIN, Math.max(f.x + FRAME_MARGIN, f.x + frameSizeOf(f).w - FRAME_MARGIN - sz.w));
      y = clamp(y, f.y + FRAME_MARGIN, Math.max(f.y + FRAME_MARGIN, f.y + h - FRAME_MARGIN - sz.h));
      let tries = 0;
      while (taken(y) && y + sz.h * 2 < f.y + h && tries++ < 12) y += Math.min(sz.h, 120) + 12;
    }
    landKit({ slug, variant, groups: moveTo(groups, { x: 0, y: 0 }), measures: defaultMeasures(groups) }, x, y);
  };
  const addKitRef = useRef(addKit);
  addKitRef.current = addKit;

  /** the selected composite, replaced where it stands by the atoms it is made of. One undo step. */
  const splitSelected = () => {
    const id = selectedIds[0];
    if (!id) return;
    if (!runOp(ops.split, { id }, { history: "step", refused: () => {} })) return;
    showToast(t("splitDone", getLang()));
  };

  /** the in-flight size drag on a lone button's edge handle */
  const [widthDragId, setWidthDragId] = useState<string | null>(null);
  /** how far the group under a left- or top-edge drag is drawn from where it sits, so the opposite
   *  edge stays put. It rides on the same commit as the new size, which keeps the two in step; the
   *  group's own position only moves once the drag ends. */
  const [widthShift, setWidthShift] = useState<{ gid: string; dx: number; dy: number } | null>(null);
  /** the lines an edge being pulled lines up with */
  const [resizeGuide, setResizeGuide] = useState<{ lines: GuideLine[]; gaps: GuideGap[] } | null>(null);
  const widthDragRef = useRef<{
    id: string;
    gid: string;
    side: HandleSide;
    vertical: boolean;
    round: boolean;
    /** the measure this handle pulls */
    axis?: PartAxis;
    startX: number;
    startY: number;
    start0: number;
    startV: number;
    v: number;
    min: number;
    max: number;
    /** where the part stood when the handle was taken, for the edge it pulls to line up with its neighbours */
    box0: { l: number; t: number; r: number; b: number };
    /** the undo step for this drag has been taken: it is taken at the first change */
    taken: boolean;
  } | null>(null);
  /** What a handle on this side of the part changes, and how far it may be pulled: the prop it
   *  holds, and the bounds of that prop. A drag and a key press read the same answer. */
  const sizeDragSpec = (item: Item, side: HandleSide) => {
    const vertical = side === "top" || side === "bottom";
    /* a circle is pulled by a point on it: the drag reads along the diagonal and the one
     * measure it has -- its diameter -- follows, so it stays round the whole way */
    const round = CORNERS.includes(side);
    const ax = componentAxes(item);
    const axis = ax ? (round ? ax.size : vertical ? ax.height : ax.width) : undefined;
    const startV = axis ? axisValue(axis, item.props) : 0;
    return { vertical, round, startV, min: axis?.min ?? startV, max: axis?.max ?? startV, axis };
  };
  /** the patch a new measure is */
  const sizePatch = (item: Item, d: { axis?: PartAxis }, v: number): Partial<Item> => (d.axis ? { props: { ...item.props, [d.axis.key]: axisWrite(d.axis, v) } } : {});
  /** a handle pulled by the keyboard: one step out or in, kept the way a panel change is */
  const nudgeSize = (item: Item, side: HandleSide, dir: 1 | -1) => {
    const d = sizeDragSpec(item, side);
    if (!d.axis) return;
    const next = axisStep(d.axis, item.props, dir);
    if (next !== undefined) patchSelected({ props: { ...item.props, [d.axis.key]: next } });
  };
  /* a drag that outlives the editor leaves nothing listening behind it */
  const widthDragEnd = useRef<(() => void) | null>(null);
  useEffect(() => () => widthDragEnd.current?.(), []);
  const onWidthHandleDown = (e: React.PointerEvent, g: Group, item: Item, side: HandleSide) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const spec = sizeDragSpec(item, side);
    const at = layoutOf(g, widthsRef.current).find((pl) => pl.item.id === item.id);
    endGuides();
    widthDragRef.current = {
      id: item.id,
      gid: g.id,
      side,
      ...spec,
      startX: e.clientX,
      startY: e.clientY,
      start0: spec.vertical ? e.clientY : e.clientX,
      v: spec.startV,
      box0: at ? { l: at.x, t: at.y, r: at.x + at.w, b: at.y + at.h } : { l: g.x, t: g.y, r: g.x, b: g.y },
      taken: false,
    };
    setWidthDragId(item.id);
    const move = (ev: PointerEvent) => {
      const d = widthDragRef.current;
      if (!d) return;
      const z = viewRef.current.z;
      let raw: number;
      if (d.round) {
        /* how far the point travelled along its own diagonal, the two axes counting equally, read
           back as size through the gain the point itself is drawn with: it stays under the pointer */
        const dx = ((ev.clientX - d.startX) / z) * (d.side === "tl" || d.side === "bl" ? -1 : 1);
        const dy = ((ev.clientY - d.startY) / z) * (d.side === "tl" || d.side === "tr" ? -1 : 1);
        raw = d.startV + (dx + dy) / CORNER_GAIN;
      } else {
        const delta = ((d.vertical ? ev.clientY : ev.clientX) - d.start0) / z;
        raw = d.startV + (d.side === "right" || d.side === "bottom" ? delta : -delta);
      }
      /* the edge being pulled lines up with the edges and centres around it, as a moved part does; Ctrl skips it */
      let snapped = false;
      if (!d.round && !(ev.ctrlKey || ev.metaKey)) {
        const grow = raw - d.startV;
        const b0 = d.box0;
        const far = d.side === "right" || d.side === "bottom";
        const rect = d.side === "right" ? { ...b0, r: b0.r + grow } : d.side === "left" ? { ...b0, l: b0.l - grow } : d.side === "bottom" ? { ...b0, b: b0.b + grow } : { ...b0, t: b0.t - grow };
        const edge: ("lo" | "hi")[] = [far ? "hi" : "lo"];
        const s = snapRect(rect, targetsFor(new Set([d.id])), GUIDE_PX / z, d.vertical ? { x: [], y: edge } : { x: edge, y: [] });
        const by = d.vertical ? s.dy : s.dx;
        if (d.vertical ? s.snapY : s.snapX) {
          raw += far ? by : -by;
          snapped = true;
          setResizeGuide({ lines: s.lines, gaps: [] });
        } else setResizeGuide(null);
      }
      /* on a guide the edge keeps its whole pixel; off one it settles on the 4dp grid */
      const v = clamp(snapped ? Math.round(raw) : Math.round(raw / 4) * 4, d.min, d.max);
      if (v === d.v) return;
      /* the undo step is taken at the first change, so a handle merely pressed leaves none */
      if (!d.taken) {
        snapshot();
        d.taken = true;
      }
      d.v = v;
      /* a FAB hangs off its own corner, so its run is drawn at an offset that changes with the
         size: it has to land with the pointer rather than ease after it */
      instantRef.current.add(d.gid);
      /* whichever point is held, the one across from it stays where it is */
      const back = d.startV - v;
      if (d.side === "left") setWidthShift({ gid: d.gid, dx: back, dy: 0 });
      if (d.side === "top") setWidthShift({ gid: d.gid, dx: 0, dy: back });
      if (d.round && d.side !== "br") {
        setWidthShift({ gid: d.gid, dx: d.side === "tl" || d.side === "bl" ? back : 0, dy: d.side === "tl" || d.side === "tr" ? back : 0 });
      }
      setGroups((prev) =>
        prev.map((gr) =>
          gr.id !== d.gid
            ? gr
            : {
                ...gr,
                items: gr.items.map((it) => (it.id !== d.id ? it : { ...it, ...sizePatch(it, d, v) })),
              },
        ),
      );

    };
    const up = () => {
      const d = widthDragRef.current;
      /* the drawn offset becomes the group's real position, in one step and with no easing */
      if (d && d.v !== d.startV && d.side !== "right" && d.side !== "bottom" && d.side !== "br") {
        const shift = d.startV - d.v;
        const movesX = d.side === "left" || d.side === "tl" || d.side === "bl";
        const movesY = d.side === "top" || d.side === "tl" || d.side === "tr";
        instantRef.current.add(d.gid);
        setGroups((prev) =>
          prev.map((gr) => (gr.id !== d.gid ? gr : { ...gr, x: gr.x + (movesX ? shift : 0), y: gr.y + (movesY ? shift : 0) })),
        );
      }
      setWidthShift(null);
      setResizeGuide(null);
      endGuides();
      widthDragRef.current = null;
      setWidthDragId(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      widthDragEnd.current = null;
    };
    widthDragEnd.current = up;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const isDragging = drag !== null;

  useEffect(() => {
    if (!isDragging) return;
    /* Ctrl overrides auto-snap for as long as it is held: no magnet slot, no
       alignment guide, no 4dp grid. A pointer move carries its own ctrlKey, and
       key events cover the moments in between when the pointer is still. */
    let ctrlHeld = false;

    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const pt = toWorld(e.clientX, e.clientY);
      d.px = pt.x;
      d.py = pt.y;
      ctrlHeld = e.ctrlKey || e.metaKey;

      if (!d.active) {
        if (
          Math.hypot(pt.x - d.startX, pt.y - d.startY) * viewRef.current.z <
          5
        ) {
          setDrag({ ...d });
          return;
        }
        d.active = true;
        endGuides();
        const id = d.item.id;
        /* the group keeps the hole the part came out of until the part has moved on, rather than
         * snapping shut the moment the drag begins */
        const from = groupsRef.current.find((x) => !x.free && x.items.length > 1 && x.items.some((it) => it.id === id));
        if (from) {
          const index = from.items.findIndex((it) => it.id === id);
          const sz = sizeRef(d.item);
          holdGap(from.id, index, sz.w, sz.h, true);
        }
        snapshot();
        setGroups((prev) => {
          const out: Group[] = [];
          for (const g of prev) {
            const idx = g.items.findIndex((it) => it.id === id);
            if (idx < 0) {
              out.push(g);
              continue;
            }
            const rest = g.items.filter((it) => it.id !== id);
            if (rest.length === 0) continue;
            const sz = sizeOf(g.items[idx], widthsRef.current);
            const back = idx === 0;
            // The anchor moves to the new first item; that jump must not animate,
            // otherwise the remaining run springs sideways for a frame.
            if (back) instantRef.current.add(g.id);
            out.push({
              ...g,
              x: back && g.axis === "x" ? g.x + sz.w + GAP : g.x,
              y: back && g.axis === "y" ? g.y + sz.h + GAP : g.y,
              items: rest,
            });
          }
          return out;
        });
        setPressedId(null);
        setDrag({ ...d });
        return;
      }

      /* a part being added from the palette has nothing to delete yet; dropping it back there just cancels */
      d.overBin = !d.fromPalette && inBin(e.clientX);
      closeGap();
      /* over an auto layout the layout places it: nothing to line up with, only its slot to show */
      d.guide =
        d.overBin || ctrlHeld || d.kit || overFlow(carriedDrag(groupsRef.current, d.item, pt.x - d.offX, pt.y - d.offY), CARRIED)
          ? null
          : findGuide(d.item, pt.x - d.offX, pt.y - d.offY);
      setDrag({ ...d });
    };

    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      setPressedId(null);
      endGuides();
      if (!d) return;
      if (!d.active) {
        setDrag(null);
        return;
      }

      closeGap();
      const loose = ctrlHeld || e.ctrlKey || e.metaKey;

      const item = d.item;

      if (d.overBin) {
        setSelectedIds((cur) => cur.filter((x) => x !== item.id));
        vanishDrag(d);
        return;
      }

      /* A palette part is accepted by the canvas only when the pointer is released over it.
       * Testing the part's bounds here made a click in the palette add any wide part whose
       * preview happened to overlap the canvas. */
      if (d.fromPalette && !inCanvas(e.clientX, e.clientY)) {
        setSelectedIds((cur) => cur.filter((x) => x !== item.id));
        /* a component's tile pressed and let go without moving is a click: it adds one where the view is looking */
        if (d.instance && Math.hypot(d.px - d.startX, d.py - d.startY) * viewRef.current.z < 5) {
          setDrag(null);
          addInstanceRef.current(d.instance);
          return;
        }
        /* so is a kit's */
        if (d.kit && Math.hypot(d.px - d.startX, d.py - d.startY) * viewRef.current.z < 5) {
          setDrag(null);
          addKitRef.current(d.kit.slug, d.kit.variant);
          return;
        }
        /* and a part's, as Enter on its tile does */
        if (!d.kit && !d.instance && item.component && Math.hypot(d.px - d.startX, d.py - d.startY) * viewRef.current.z < 5) {
          setDrag(null);
          addPartRef.current(item.component);
          return;
        }
        vanishDrag(d);
        return;
      }
      /* a definition does not go inside itself: refused here, before anything is added */
      if (d.instance && !canNest(componentsRef.current, defEditRef.current?.id ?? null, d.instance)) {
        showToast(t("nestRefused", getLang()));
        vanishDrag(d);
        return;
      }
      /* a kit lands as the tree of atoms it is, on the screen under it */
      if (d.kit) {
        landKit(d.kit, d.px - d.offX, d.py - d.offY);
        setDrag(null);
        return;
      }
      /* a Ctrl drop lands where the cursor is, untouched by any guide hold */
      const rawX = loose ? d.px - d.offX : d.guide?.x ?? d.px - d.offX;
      const rawY = loose ? d.py - d.offY : d.guide?.y ?? d.py - d.offY;
      if (d.fromPalette) snapshot(false, "Add");
      /* Ctrl keeps the pixel the cursor chose and a guide holds its whole-pixel position; the step was taken when the
       * part was picked up, or just now for one from the palette */
      const dropped = runOp(ops.dropPart, { item, x: rawX, y: rawY, heldX: d.guide?.x !== undefined, heldY: d.guide?.y !== undefined, loose, instanceOf: d.instance, pointer: { x: d.px, y: d.py } }, { history: "none" });
      if (d.instance) setSelectedIds([item.id]);
      if (dropped?.joined) {
        setSelectedIds([dropped.itemId]);
        showToast(t("buttonsJoined", getLang()));
      }
      setDrag(null);
    };

    /* Ctrl (or Cmd on a Mac) pressed or released while the pointer is still: the drawn
       magnet and guide must leave (or be free to return) right away, not on the next move */
    const onCtrl = (e: KeyboardEvent, held: boolean) => {
      if ((e.key !== "Control" && e.key !== "Meta") || e.repeat) return;
      const d = dragRef.current;
      if (!d) return;
      ctrlHeld = held;
      if (held) d.guide = null;
      setDrag({ ...d });
    };
    const onCtrlDown = (e: KeyboardEvent) => onCtrl(e, true);
    const onCtrlUp = (e: KeyboardEvent) => onCtrl(e, false);
    window.addEventListener("keydown", onCtrlDown);
    window.addEventListener("keyup", onCtrlUp);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", onCtrlDown);
      window.removeEventListener("keyup", onCtrlUp);
    };
    // handlers read live state through refs, so this binds once per drag
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  /* the overlay sits between the cursor and the slot, weighted by attraction */
  useEffect(() => {
    if (!drag?.active) return;
    const cursorL = drag.px - drag.offX;
    const cursorT = drag.py - drag.offY;
    sx.set(drag.guide?.x ?? cursorL);
    sy.set(drag.guide?.y ?? cursorT);
  }, [drag, sx, sy]);

  /* ---------- pointer: canvas (pan / marquee) ---------- */
  const itemRects = useCallback(() => {
    const out: { id: string; l: number; t: number; r: number; b: number }[] =
      [];
    /* a part on a dock's other tab is not on the canvas to be swept up or pointed at */
    const off = outOfPane(groupsRef.current, widthsRef.current);
    for (const g of groupsRef.current) {
      if (off.has(g.id)) continue;
      for (const pl of layoutOf(g, widthsRef.current)) {
        out.push({ id: pl.item.id, l: pl.x, t: pl.y, r: pl.x + pl.w, b: pl.y + pl.h });
      }
    }
    return out;
  }, []);

  /** Alt held with something selected, as in Figma: the distances from it to the part under the pointer, or to the
   *  edges of the screen when the pointer is on nothing else */
  const [measure, setMeasure] = useState<{ gaps: GuideGap[]; avoid: GuideRect[] } | null>(null);
  useEffect(() => {
    if (!selectedIds.length || isMobile) return;
    let alt = false;
    let last: { x: number; y: number } | null = null;
    const update = () => {
      if (!alt || !last || dragRef.current || gestureRef.current) return setMeasure(null);
      const pt = toWorld(last.x, last.y);
      const ids = new Set(selectedIds);
      const rects = itemRects();
      const mine = rects.filter((r) => ids.has(r.id));
      if (!mine.length) return setMeasure(null);
      const a = unionRect(mine);
      const area = (r: { l: number; t: number; r: number; b: number }) => (r.r - r.l) * (r.b - r.t);
      const over = rects.filter((r) => !ids.has(r.id) && pt.x >= r.l && pt.x <= r.r && pt.y >= r.t && pt.y <= r.b).sort((x, y) => area(x) - area(y))[0];
      const screen = framesRef.current.map(frameRect).find((r) => pt.x >= r.l && pt.x <= r.r && pt.y >= r.t && pt.y <= r.b);
      const b = over ?? screen;
      /* the numbers keep clear of every other part's words: the two measured are where the lines end */
      setMeasure(b ? { gaps: measureBetween(a, b), avoid: rects.filter((r) => !ids.has(r.id) && r !== over) } : null);
    };
    const onMove = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY };
      alt = e.altKey;
      update();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Alt") return;
      alt = e.type === "keydown";
      /* the browser's own use of Alt (its menu bar) would take the focus away from the canvas */
      if (alt) e.preventDefault();
      update();
    };
    const off = () => {
      alt = false;
      setMeasure(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", off);
      setMeasure(null);
    };
    // the handlers read live state through refs; a new selection measures from it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, isMobile]);

  const clearSelection = () => {
    setSelectedIds([]);
    setSelectedFrameId(null);
    setSelectedLinkId(null);
  };

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (mobileRef.current && e.pointerType === "touch") {
      e.preventDefault();
      clearSelection();
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.button === 1 || modeRef.current === "hand" || spaceRef.current) {
      e.preventDefault();
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0) return;
    const pt = toWorld(e.clientX, e.clientY);
    const g: Gesture = {
      kind: "marquee",
      x0: pt.x,
      y0: pt.y,
      x1: pt.x,
      y1: pt.y,
      moved: false,
    };
    gestureRef.current = g;
    setGesture(g);
    if (!e.shiftKey) setSelectedIds([]);
    setSelectedFrameId(null);
    setSelectedLinkId(null);
  };

  /** grab a phone frame by its bezel or label: it carries everything on it;
   *  on a phone the screen stays put and a tap on it just clears the selection */
  const onFramePointerDown = (e: React.PointerEvent, f: Frame) => {
    /* the screen a definition is edited on is only the ground it stands on: it is not moved or chosen */
    if (mobileRef.current || defEditRef.current) {
      e.preventDefault();
      e.stopPropagation();
      clearSelection();
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.button === 1 || modeRef.current === "hand" || spaceRef.current) {
      e.preventDefault();
      e.stopPropagation();
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedFrameId(f.id);
    setSelectedIds([]);
    setSelectedLinkId(null);
    setRightTab("edit");
    const carried = groupsRef.current
      .filter(
        (g) =>
          frameOfGroup(g, framesRef.current, widthsRef.current)?.id === f.id,
      )
      .map((g) => ({ id: g.id, x: g.x, y: g.y }));
    const g: Gesture = {
      kind: "frame",
      id: f.id,
      sx: e.clientX,
      sy: e.clientY,
      fx: f.x,
      fy: f.y,
      groups: carried,
      moved: false,
    };
    gestureRef.current = g;
    setGesture(g);
  };

  const isGesturing = gesture !== null;

  /* Containers with a layout put what they hold in its place after every change. It waits while
   * something is being carried, which is what lets a part be dragged out of its row or across it,
   * and it is part of whatever change caused it, so it never makes an undo step of its own. */
  const carrying = isGesturing || !!drag;
  /* What instances and repeats come to, and the layout of the document with them in it. It is worked
   * out while nothing is being carried; what it draws is relative to the group it stands on, so a
   * carried group takes its share along with no need to work anything out meanwhile. */
  const lastView = useRef<CanvasView>({ groups, drawn: new Map(), shown: new Map(), extra: [] });
  const canvas = useMemo(() => (carrying ? lastView.current : canvasView({ groups, components, collections }, widths)), [carrying, groups, components, collections, widths]);
  lastView.current = canvas;
  /* the part being carried, not where it is: the drag changes with every move of the pointer */
  const dragItem = drag?.item;
  const allItems = useMemo(() => {
    const map = new Map<string, Item>();
    for (const g of groups) for (const it of g.items) map.set(it.id, canvas.shown.get(it.id) ?? it);
    for (const { item } of canvas.extra) map.set(item.id, item);
    if (dragItem) map.set(dragItem.id, dragItem);
    return [...map.values()];
  }, [groups, dragItem, canvas]);
  useEffect(() => {
    if (carrying) return;
    const next = canvas.groups;
    if (next === groups) return;
    next.forEach((g, i) => {
      if (g !== groups[i]) instantRef.current.add(g.id);
    });
    /* what remembers this very state (Tidy's way back, a length being dragged) is told of the new one */
    if (tidyRef.current?.after === groups) tidyRef.current = { ...tidyRef.current, after: next };
    if (lengthRun.current?.to.groups === groups) lengthRun.current = { ...lengthRun.current, to: { ...lengthRun.current.to, groups: next } };
    /* only over the state it was worked out from: a layout just asked for must not be written over by this older one, and it comes back here anyway */
    setGroups((current) => (current === groups ? next : current));
  }, [groups, canvas, carrying]);
  useEffect(() => {
    if (!isGesturing) return;
    const move = (e: PointerEvent) => {
      const g = gestureRef.current;
      if (!g) return;
      if (g.kind === "pan") {
        setView((v) => ({
          ...v,
          x: g.vx + (e.clientX - g.sx),
          y: g.vy + (e.clientY - g.sy),
        }));
        return;
      }
      if (g.kind === "group") {
        const z = viewRef.current.z;
        const dx = (e.clientX - g.sx) / z;
        const dy = (e.clientY - g.sy) / z;
        if (!g.moved) {
          if (Math.hypot(dx, dy) * z < 4) return;
          g.moved = true;
          endGuides();
          snapshot();
        }
        instantRef.current.add(g.id);
        g.overBin = inBin(e.clientX);
        const gr = groupsRef.current.find((x) => x.id === g.id);
        if (!gr) return;
        /* a moved group lines up with its neighbours like a single part does, and off
           any guide settles on the 4dp grid of the screen it is over; Ctrl (or Cmd)
           skips both */
        const moved = { ...gr, x: g.gx + dx, y: g.gy + dy };
        const loose = e.ctrlKey || e.metaKey;
        const b = groupBounds(moved, widthsRef.current);
        const carried = new Map((g.carry ?? []).map((o) => [o.id, o]));
        /* what travels with it is no neighbour to line up with */
        const own = [gr, ...groupsRef.current.filter((x) => carried.has(x.id))].flatMap((x) => x.items.map((it) => it.id));
        /* over an auto layout the layout places it: nothing to line up with, only its slot to show */
        const intoFlow = overFlow(groupsRef.current.map((x) => (x.id === g.id ? moved : x)), g.id);
        const guide = loose || g.overBin || intoFlow ? null : guideFor(b.l, b.t, { w: b.r - b.l, h: b.b - b.t }, new Set(own));
        g.guide = guide;
        setGesture({ ...g });
        const f = frameOfGroup(moved, framesRef.current, widthsRef.current);
        const placed = loose
          ? moved
          : {
              ...moved,
              x: guide?.x !== undefined ? Math.round(moved.x + guide.x - b.l) : onGrid(moved.x, f?.x ?? 0),
              y: guide?.y !== undefined ? Math.round(moved.y + guide.y - b.t) : onGrid(moved.y, f?.y ?? 0),
            };
        for (const id of carried.keys()) instantRef.current.add(id);
        setGroups((gs) =>
          gs.map((x) => {
            if (x.id === g.id) return placed;
            const o = carried.get(x.id);
            return o ? { ...x, x: o.x + placed.x - g.gx, y: o.y + placed.y - g.gy } : x;
          }),
        );
        return;
      }
      if (g.kind === "frame") {
        const z = viewRef.current.z;
        const dx = (e.clientX - g.sx) / z;
        const dy = (e.clientY - g.sy) / z;
        if (!g.moved) {
          if (Math.hypot(dx, dy) * z < 4) return;
          g.moved = true;
          snapshot();
        }
        const ids = new Map(g.groups.map((o) => [o.id, o]));
        for (const o of g.groups) instantRef.current.add(o.id);
        setFrames((fs) =>
          fs.map((f) =>
            f.id === g.id
              ? { ...f, x: Math.round(g.fx + dx), y: Math.round(g.fy + dy) }
              : f,
          ),
        );
        setGroups((gs) =>
          gs.map((gr) => {
            const o = ids.get(gr.id);
            return o
              ? { ...gr, x: Math.round(o.x + dx), y: Math.round(o.y + dy) }
              : gr;
          }),
        );
        return;
      }
      const pt = toWorld(e.clientX, e.clientY);
      g.x1 = pt.x;
      g.y1 = pt.y;
      if (
        !g.moved &&
        Math.hypot(pt.x - g.x0, pt.y - g.y0) * viewRef.current.z > 4
      )
        g.moved = true;
      if (g.moved) {
        const l = Math.min(g.x0, g.x1);
        const r = Math.max(g.x0, g.x1);
        const t = Math.min(g.y0, g.y1);
        const b = Math.max(g.y0, g.y1);
        const hit = itemRects()
          .filter((it) => it.l < r && it.r > l && it.t < b && it.b > t)
          .map((it) => it.id);
        setSelectedIds(hit);
      }
      setGesture({ ...g });
    };
    const up = (e: PointerEvent) => {
      const g = gestureRef.current;
      gestureRef.current = null;
      setGesture(null);
      endGuides();
      // a group dragged onto the parts panel is deleted, like a single part
      /* the step was taken when the drag began */
      if (g?.kind === "group" && g.moved && inBin(e.clientX)) {
        runOp(ops.removeGroups, { ids: [g.id, ...(g.carry ?? []).map((o) => o.id)] }, { history: "none" });
      } else if (g?.kind === "group" && g.moved) {
        /* Ctrl (or Cmd) keeps it where it is, the way it skips the guides */
        const settled = runOp(ops.settleGroup, { id: g.id, loose: e.ctrlKey || e.metaKey }, { history: "none" });
        if (settled?.joined && settled.itemId) {
          setSelectedIds([settled.itemId]);
          showToast(t("buttonsJoined", getLang()));
        }
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGesturing]);

  /* ---------- panel resize ---------- */
  useEffect(() => {
    if (!resizing) return;
    const move = (e: PointerEvent) => {
      if (resizing === "left") setLeftW(clamp(e.clientX, RAIL_W + 244, 480));
      else setRightW(clamp(window.innerWidth - e.clientX, 280, 480));
    };
    const up = () => setResizing(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [resizing]);

  /* ---------- editing ---------- */
  const primaryId = selectedIds[selectedIds.length - 1] ?? null;
  const selected = useMemo(() => {
    for (const g of groups) {
      const it = g.items.find((i) => i.id === primaryId);
      if (it) return it;
    }
    return drag?.item.id === primaryId ? (drag?.item ?? null) : null;
  }, [groups, primaryId, drag]);

  useEffect(() => {
    if (!selected && sheet === "edit") setSheet(null);
  }, [selected, sheet]);

  const patchSelected = (patch: Partial<Item>) => {
    if (!primaryId) return;
    const id = primaryId;
    /* a locked part is not to be changed at all: its panel is behind a blur, and anything that asks for a change anyway
     * -- a shortcut, the phone's panel -- is turned away (lib/core `set_item`); consecutive edits of one field are one step */
    const done = runOp(ops.setItem, { id, patch }, { history: { coalesce: id + ":" + Object.keys(patch).join(",") }, label: "Edit" });
    if (done === undefined && store.get().doc.groups.some((g) => g.locked && g.items.some((it) => it.id === id))) return;
    if (dragRef.current?.item.id === id) {
      dragRef.current.item = { ...dragRef.current.item, ...("look" in patch ? { ...patch, look: tidyLook(patch.look) } : patch) };
    }
  };

  const deleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const before = store.get().doc.groups;
    /* nothing deletable when every selected part sits in a locked group: no step, the selection kept */
    const out = runOp(ops.removeNodes, { ids: selectedIds }, { history: "step", refused: () => showToast(lockedGroupMsg()) });
    if (!out) return;
    /* some of the selection sits in a locked group: the rest went, and the author is told why that part stayed */
    if (out.kept) showToast(t("lockedKept", getLang()));
    /* a run whose first part went has a new anchor: it is drawn there at once */
    for (const id of movedGroups(before, store.get().doc.groups)) instantRef.current.add(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, store]);

  /** every group holding a selected part is locked, so the menu offers to unlock instead */
  const selectedLocked = useMemo(() => {
    const ids = new Set(selectedIds);
    const held = groups.filter((g) => g.items.some((it) => ids.has(it.id)));
    return held.length > 0 && held.every((g) => !!g.locked);
  }, [groups, selectedIds]);

  /** the selection can be placed in a screen: something in it is not a bar, and all of that
   *  stands on one screen -- a selection of bars alone, or one spread over several screens,
   *  has no one body to go to */
  const selectionPlaceable = useMemo(() => {
    const ids = new Set(selectedIds);
    const units = groups.filter((g) => g.items.some((it) => ids.has(it.id)) && !holdsEdgeBar(g) && !g.inFlow);
    if (!units.length) return false;
    const f = frameOfGroup(units[0], frames, widths);
    return !!f && units.every((g) => frameOfGroup(g, frames, widths)?.id === f.id);
  }, [groups, frames, widths, selectedIds]);

  /** the selection covers every group it touches, so locking it locks nothing that was not selected */
  const selectionWhole = useMemo(() => {
    const ids = new Set(selectedIds);
    const held = groups.filter((g) => g.items.some((it) => ids.has(it.id)));
    return held.length > 0 && held.every((g) => g.items.every((it) => ids.has(it.id)));
  }, [groups, selectedIds]);

  /** locks every group holding a selected part, or unlocks them all when they already are */
  const toggleLockSelected = useCallback(() => {
    if (!selectedIds.length) return;
    runOp(ops.toggleLock, { ids: selectedIds }, { history: "step" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, store]);

  /** duplicates everything selected a step aside, and selects the copies */
  const duplicateSelected = useCallback(() => {
    if (!selectedIds.length) return;
    runOp(ops.duplicateNodes, { ids: selectedIds, primary: primaryId ?? undefined }, { history: "step" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, primaryId, store]);

  /* The in-app clipboard: Ctrl+C keeps a copy of the selection (whole groups where the
   * selection covers them) with its offset inside its screen, so Ctrl+V can put it at the
   * same spot on another screen, or a step aside on the same one. The offset is that of the
   * selection's top-left corner, so several units keep their places relative to each other. */
  const clipboardRef = useRef<Clip | null>(null);

  const copySelected = useCallback(() => {
    if (!selected) return;
    const clip = clipOf(store.get(), selectedIds, selected.id, widthsRef.current);
    if (clip) clipboardRef.current = clip;
  }, [selected, selectedIds, store]);

  const pasteClipboard = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip) return;
    /* pasted into a definition, an instance must not put that definition inside itself */
    runOp(ops.pasteClip, { clip, selected: selected?.id }, { history: "step", refused: (e) => e.code === "refused" && showToast(t("nestRefused", getLang())) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, store]);

  /** the free group the whole selection belongs to, if it is exactly one */
  const selectedGroup = useMemo(() => {
    if (selectedIds.length === 0) return null;
    const g = groups.find((x) => x.free && x.items.some((it) => it.id === selectedIds[0]));
    if (!g) return null;
    const ids = new Set(g.items.map((it) => it.id));
    return selectedIds.every((id) => ids.has(id)) && selectedIds.length === g.items.length ? g : null;
  }, [groups, selectedIds]);

  /** Puts the selection at one of nine spots in its screen's body, the box Tidy fills between the bars, as one block,
   *  clear of what is already there (lib/core `place_in_screen`). */
  const placeSelected = useCallback(
    (col: "left" | "centerH" | "right", row: "top" | "centerV" | "bottom") => {
      runOp(ops.placeInScreen, { ids: selectedIds, col, row }, { history: "step" });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, store],
  );

  /** the selected parts lined up against each other, the way their own edges say */
  const alignSelected = useCallback(
    (how: AlignHow) => {
      runOp(ops.align, { ids: selectedIds, how }, { history: "step" });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, store],
  );

  /** the selected parts spread out evenly; with `gap`, that exact space between them */
  const distributeSelected = useCallback(
    (axis: "x" | "y", gap?: number) => {
      runOp(ops.distribute, { ids: selectedIds, axis, gap }, { history: "step" });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, store],
  );

  /** Figma's Tidy up: the selected parts as an even row, column or grid, read off where they stand */
  const tidyUpSelected = useCallback(() => {
    runOp(ops.tidyUp, { ids: selectedIds }, { history: "step" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, store]);

  /** The selected parts in nested containers that keep them the way they stand: rows, columns and grids read off their
   *  places, as Figma suggests auto layout. A lone container takes the layout itself; a lone part goes in a row. */
  const autoLayoutSelected = useCallback(() => {
    runOp(ops.autoLayout, { ids: selectedIds }, { history: "step" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, store]);

  /** The body of a screen in nested auto layouts: what stands at its edges (bars, a FAB, a dialog, a rail, its picture)
   *  and what is locked keep their places. */
  const autoLayoutScreen = (f: Frame) => {
    if (!runOp(ops.autoLayoutScreen, { screen: f.id }, { history: "step", refused: () => showToast(t("suggestNone", getLang())) })) return;
    tidyRef.current = null;
  };

  /** the selected parts, with what they hold, as a new definition and an instance of it in their place */
  const makeComponentOfSelection = useCallback(() => {
    if (!runOp(ops.makeComponentOp, { ids: selectedIds, name: t("componentDefaultName", getLang()).replace("{n}", String((store.get().doc.components?.length ?? 0) + 1)) }, { history: "step", refused: () => showToast(lockedGroupMsg()) })) return;
    setLeftTab("components");
    setLeftOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, store]);

  /** Opens a definition as the one screen of the canvas. The document's screens and its history wait in the store
   *  until it is done; while it is open every tool works on it as on any screen. */
  const editDefinition = (id: string) => {
    const def = store.get().doc.components?.find((c) => c.id === id);
    if (!def || mobileRef.current) return;
    const open = store.get().editing;
    if (open?.id === id) return;
    if (open) finishDefinitionRef.current();
    pending.current = () => {
      defViewRef.current = viewRef.current;
      tidyRef.current = null;
      store.openDefinition(id);
      frameRef.current = "phone";
      setSelectedLinkId(null);
    };
    /* out of the definition open now, the view says so only after the next draw */
    if (open) return;
    pending.current();
    pending.current = null;
  };
  /** the definition to open once the one open now has closed */
  const pending = useRef<(() => void) | null>(null);

  /** Closes the definition being edited: the document comes back, with its instances following. One undo takes it all back. */
  const finishDefinition = () => {
    if (!store.get().editing) return;
    store.closeDefinition();
    frameRef.current = store.get().doc.frame;
    if (defViewRef.current) setView(defViewRef.current);
    defViewRef.current = null;
    tidyRef.current = null;
  };
  const finishDefinitionRef = useRef(finishDefinition);
  finishDefinitionRef.current = finishDefinition;
  /* one definition left for another: this one opens now the draw has brought the document back */
  useEffect(() => {
    if (defEdit || !pending.current) return;
    const open = pending.current;
    pending.current = null;
    open();
  }, [defEdit]);
  /* the screen of a definition is brought into view when it opens */
  useEffect(() => {
    if (defEdit) requestAnimationFrame(() => fitRef.current());
  }, [defEdit?.id]);

  /** the definition's name, from the tab or the bar over its screen */
  const renameComponent = (id: string, name: string) => runOp(ops.renameComponent, { id, name }, { history: { coalesce: `component:${id}:name` } });

  /** a definition gone: its instances, on the screens and in other definitions, become the parts they showed. The screens
   *  wait outside a definition's history: this could not be taken back from in there, and the panel says so */
  const deleteComponent = (id: string) => {
    if (store.get().editing) return;
    runOp(ops.removeComponentOp, { id }, { history: "step" });
  };

  /** one instance, back to plain parts */
  const detachGroup = (id: string) => runOp(ops.detach, { id }, { history: "step" });

  /** how many instances each definition has, on the screens and in the other definitions */
  const componentUses = useMemo(() => {
    const out: Record<string, number> = {};
    for (const g of [...(defEdit?.main.groups ?? groups), ...(components ?? []).flatMap((c) => c.groups)]) if (g.instanceOf) out[g.instanceOf] = (out[g.instanceOf] ?? 0) + 1;
    return out;
  }, [defEdit, groups, components]);

  /** Pull the selected parts out of their runs into one free group that keeps
   *  their positions. It takes the layer slot of the topmost run involved. */
  const groupSelected = useCallback(() => {
    if (selectedIds.length < 2) return;
    const before = store.get().doc.groups;
    /* regrouping would carry a locked group's parts into an unlocked group; an instance or a repeat would be lost in it */
    if (!runOp(ops.groupNodes, { ids: selectedIds }, { history: "step", refused: (e) => (e.code === "locked" ? showToast(lockedGroupMsg()) : e.code === "refused" ? showToast(groupRefusedMsg()) : undefined) })) return;
    for (const id of movedGroups(before, store.get().doc.groups)) instantRef.current.add(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, store]);

  /** Split a free group back into single runs at their current positions, in the same layer slot. */
  const ungroupSelected = useCallback(() => {
    const g = selectedGroup;
    if (!g) return;
    /* ungrouping would replace a locked group with unlocked single runs */
    const out = runOp(ops.ungroup, { id: g.id }, { history: "step" });
    for (const id of out?.ids ?? []) instantRef.current.add(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroup, store]);

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (selectedIds.length === 0 && selectedFrameId) {
        if (!framesRef.current.some((x) => x.id === selectedFrameId)) return;
        const out = runOp(ops.nudge, { screen: selectedFrameId, dx, dy }, { history: { coalesce: "nudge:frame:" + selectedFrameId } });
        for (const id of out?.moved ?? []) instantRef.current.add(id);
        return;
      }
      if (selectedIds.length === 0) return;
      /* a locked group stays where it is, even when its parts are selected; a layout places what it holds */
      runOp(ops.nudge, { ids: selectedIds, dx, dy }, { history: { coalesce: "nudge:" + selectedIds.join(",") } });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, selectedFrameId, store],
  );

  const clearAll = () => {
    setConfirmClear(false);
    /* with a definition open, clearing empties the definition; its screen stays what it is edited on */
    if (store.get().editing) {
      didOp(ops.clearAll, {}, { history: "step" });
      return;
    }
    if (groupsRef.current.length === 0 && framesRef.current.length === 0) return;
    setDraftBefore(null);
    setQuickUndo(false);
    persist.writeBefore(null);
    didOp(ops.clearAll, {}, { history: "step" });
  };

  /** Opening a project file replaces the canvas with the same restore path the saved
   *  document goes through, then starts the editor fresh on it. */
  const importDoc = (next: Doc) => {
    hadDocRef.current = true;
    /* whatever was under review is over: a file, a clear or a new arrival replaces it */
    setDraftBefore(null);
    setQuickUndo(false);
    persist.writeBefore(null);
    leaveForNewDoc();
    /* the whole document being replaced stays one undo away */
    store.replace(next, { trusted: true });
    frameRef.current = store.get().doc.frame;
    setSelectedLinkId(null);
    queueMicrotask(() => fitRef.current());
  };

  /* A link with a design in its hash offers it once the editor is ready to take it,
     whether the page opened on that link or the link was pasted into this tab. */
  useEffect(() => {
    if (editAccess !== "editable" || typeof window === "undefined") return;
    let active = true;
    const offer = () => {
      if (!hasShareHash(window.location.hash)) return;
      void readShareHash(window.location.hash).then((next) => {
        if (!active) return;
        if (next) {
          setShareOpen(false);
          arrive(next);
          clearShareHash();
        } else {
          clearShareHash();
          showToast(t("invalidProject", getLang()), 3000, "error");
        }
      });
    };
    offer();
    window.addEventListener("hashchange", offer);
    return () => {
      active = false;
      window.removeEventListener("hashchange", offer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editAccess]);

  /** Asks the author's own model for a design and puts it on the canvas. The guide it reads
   *  is the one a coding agent reads (public/agent.md). The replaced design waits in
   *  `draftBefore` until the author keeps or undoes the draft. */
  /** A design that arrived from a model or a link takes the canvas with its colours easing
   *  over; the design it replaced waits in `draftBefore` until the author keeps or undoes it. */
  const arrive = (next: Doc) => {
    /* the phone editor has no keep / undo buttons: a link simply opens there, undoable as usual */
    if (mobileRef.current) {
      importDoc(next);
      return;
    }
    const before = draftBeforeRef.current ?? docRef.current;
    setRevealing(true);
    if (revealTimer.current) clearTimeout(revealTimer.current);
    revealTimer.current = setTimeout(() => setRevealing(false), 900);
    importDoc(next);
    setDraftBefore(before);
    persist.writeBefore(before);
  };

  /* A model guesses how tall its parts come out. Once a new draft's parts have held their measured
   * sizes for a moment (icons and lazy widgets arrive late), what ran together is moved apart. */
  const settleDraftRef = useRef(false);
  /* A style is built to other sizes, so the screens are laid out its way once its parts have been measured in it,
   * and once more when what that resized has been measured too. */
  const relayoutRef = useRef<Relayout | null>(null);
  useEffect(() => {
    if (!settleDraftRef.current && !relayoutRef.current) return;
    const id = setTimeout(() => {
      const again = relayoutRef.current;
      if (again) {
        /* the next pass waits only a while: a pass that changed no size is never measured, and nothing would set it off */
        relayoutRef.current = afterPass(again, Date.now());
        const laid = layoutForStyle(groupsRef.current, framesRef.current, widthsRef.current, themeRef.current, { together: again.together, pick: true });
        if (laid) {
          setGroups(laid.groups);
          setFrames(laid.frames);
        }
      }
      if (!settleDraftRef.current) return;
      settleDraftRef.current = false;
      /* a draft in a style is laid out that style's way before what ran together is moved apart */
      const styled = themeRef.current.style || isStrict(themeRef.current) ? layoutForStyle(groupsRef.current, framesRef.current, widthsRef.current, themeRef.current) : null;
      const out = pushApart(styled?.groups ?? groupsRef.current, styled?.frames ?? framesRef.current, widthsRef.current);
      if (out || styled) {
        setGroups(out?.groups ?? styled!.groups);
        setFrames(out?.frames ?? styled!.frames);
      }
    }, 700);
    return () => clearTimeout(id);
  }, [widths]);

  /** Puts a style on the document: its colors, its shapes, and unless the author said not to, its layout. One undo step.
   *  A style is a spec, so what the parts carry against it comes off (lib/core `apply_style`); the author is told how
   *  many parts that touched, and one tap on the notice takes it all back. */
  const applyStyle = (key: string) => {
    /* what stands on what is read now: in the style's sizes a part may grow into the next without being put on it */
    const s = store.get();
    const together = standingTogether(s.doc.groups, s.doc.frames, s.session.widths, metricsOf(s.doc.theme));
    const out = runOp(ops.applyStyle, { style: key }, { history: "whole" });
    if (!out) return;
    tidyRef.current = null;
    relayoutRef.current = startRelayout(together, Date.now());
    /* nothing may change size, and then nothing else would set it off */
    setWidths({});
    if (!out.stripped) return;
    const step = store.view().history.steps;
    const lang = getLang();
    const pack = styleOf(key);
    showToast(t("styleStripped", lang).replace("{style}", pack ? styleTextOf(pack.name, lang) : "Android").replace("{n}", String(out.stripped)), 8000, "format_paint", {
      label: t("undo", lang),
      /* only while the pick is still the last step: anything done since is what an undo would take back */
      run: () => {
        if (store.view().history.steps === step && !store.canRedo()) undo();
      },
    });
  };
  /** a style card picked: the one already on the document changes nothing, not even what the author made of it */
  const pickStyle = (key: string) => {
    if ((themeRef.current.style ?? "") === key) return;
    applyStyle(key);
  };
  /** holds the document to its style's rules, or lets it go; coming back is putting the style on again. One undo step. */
  const setRules = (on: boolean) => {
    if (on) {
      applyStyle(store.get().doc.theme.style ?? "");
      return;
    }
    runOp(ops.setRules, { on: false }, { history: "whole" });
  };

  /* Held to a style's rules, nothing stays where the rules would not put it. Whatever just changed, a part dropped, added,
   * removed or resized, or a word that made one wider, the screens are laid out again once it has come to rest, and what
   * a part carries against the rules comes off. It belongs to the change: an undo takes both back. */
  const strictNow = isStrict(theme);
  useEffect(() => {
    if (!strictNow || drag || gesture || defEdit || previewId !== null) return;
    let id: ReturnType<typeof setTimeout>;
    const run = () => {
      if (dragRef.current || gestureRef.current || settleDraftRef.current) return;
      /* a style's own passes go first; one that is not coming is not waited for past its time */
      const due = relayoutRef.current;
      if (relayoutDue(due, Date.now())) {
        id = setTimeout(run, Math.max(50, due.until - Date.now() + 20));
        return;
      }
      relayoutRef.current = null;
      /* nothing has been measured yet: its sizes are coming, and with them this again */
      if (!Object.keys(widthsRef.current).length) return;
      const conformed = conformGroups(groupsRef.current, themeRef.current);
      const laid = layoutForStyle(conformed, framesRef.current, widthsRef.current, themeRef.current);
      if (laid) {
        tidyRef.current = null;
        store.update("Layout", "system", (st) => withFrames(withGroups(st, laid.groups), laid.frames));
      } else if (conformed !== groupsRef.current) store.update("Style rules", "system", (st) => withGroups(st, conformed));
    };
    id = setTimeout(run, 150);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strictNow, theme, groups, frames, widths, drag, gesture, defEdit, previewId]);
  /** lays every screen out by the document's theme, as one undo step */
  const relayout = () => {
    if (didOp(ops.relayout, {}, { history: "step" })) tidyRef.current = null;
  };
  /** one layout setting changed, and the screens follow it */
  const patchUx = (patch: Partial<StyleUX>) => {
    store.update("Style layout", "user", (st) => withDoc(st, { theme: { ...st.doc.theme, ux: { ...st.doc.theme.ux, ...patch } as Theme["ux"] } }));
    relayout();
  };

  /* ---------- a scene's picture ---------- */
  const [paintingScene, setPaintingScene] = useState<string | null>(null);
  const paintAbort = useRef<AbortController | null>(null);
  const canPaint = hasImageKey(aiSettings) && isSecureUrl(aiSettings.imageBaseUrl?.trim() || imageSpec(aiSettings.imageProvider).baseUrl);
  const sceneItem = (id: string) => groupsRef.current.flatMap((g) => g.items).find((it) => it.id === id && it.component === "scene");
  /** paints scenes one at a time, each showing as soon as it is done; what was painted stays if a later one fails */
  const paintScenes = async (scenes: Item[], look: Theme = theme) => {
    if (!scenes.length) return;
    if (!canPaint) {
      showToast(t("scenesWaiting", lang).replace("{n}", String(scenes.length)), 6000);
      return;
    }
    paintAbort.current?.abort();
    const ac = new AbortController();
    paintAbort.current = ac;
    let painted = 0;
    try {
      for (const [i, item] of scenes.entries()) {
        const id = item.id;
        const def = partBySlug("scene");
        if (!def) continue;
        setPaintingScene(id);
        if (scenes.length > 1) showToast(t("scenesPainting", lang).replace("{n}", String(i + 1)).replace("{all}", String(scenes.length)), 60000, "auto_awesome");
        const p = reader(def, item.props);
        const moving = p.s("motion") === "animated";
        /* a scene that names no style of its own is painted in the document's */
        const image = await generateImage(aiSettings, scenePrompt(p.s("prompt"), p.s("style").trim() || artOf(look), moving), { w: p.n("width"), h: p.n("height") }, ac.signal, moving ? { frames: Math.round(p.n("frames")), ms: Math.round(p.n("frameMs")) } : undefined);
        if (ac.signal.aborted) return;
        setGroups((gs) => gs.map((g) => (g.items.some((it) => it.id === id) ? { ...g, items: g.items.map((it) => (it.id === id ? { ...it, props: { ...it.props, image } } : it)) } : g)));
        painted++;
      }
      showToast(t("scenesPainted", lang).replace("{n}", String(painted)), 2600, "check");
    } catch (e) {
      if (!ac.signal.aborted) showToast(aiErrorText(e, lang), 6000, "error");
    } finally {
      if (paintAbort.current === ac) setPaintingScene(null);
    }
  };

  const startDraft = async (idea: string) => {
    setShareOpen(false);
    setDraftBusy(true);
    try {
      if (guideRef.current === null) {
        const res = await fetch(`${BASE_PATH}/agent.md`);
        if (!res.ok) throw new Error("guide");
        guideRef.current = await res.text();
      }
      const held = isStrict(themeRef.current) ? themeRef.current : null;
      const drafted = await draftDesign(aiSettings, guideRef.current, idea, lang, undefined, held ? rulesForModel(held) : undefined);
      /* the model was told; what it wrote regardless does not stand. A design from a model is held to rules from then on */
      const look = normalizeTheme({ ...drafted.theme, ...(held ? { style: held.style } : {}), strict: true });
      const next = conformDoc({ ...drafted, theme: look }, look);
      settleDraftRef.current = true;
      arrive(next);
      void paintScenes(scenesToPaint(next.groups), normalizeTheme(next.theme));
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      showToast(m === "json" ? t("aiErrorJson", lang) : m === "refusal" ? t("aiErrorRefusal", lang) : m === "long" ? t("aiErrorLong", lang) : t("aiError", lang), 3200, "error");
    } finally {
      setDraftBusy(false);
    }
  };
  /** true after a kept draft until the author undoes something, so the header's undo also sits by the opener */
  const [quickUndo, setQuickUndo] = useState(false);
  const keepDraft = () => {
    setDraftBefore(null);
    setQuickUndo(true);
    persist.writeBefore(null);
  };
  const undoDraft = () => {
    settleDraftRef.current = false;
    paintAbort.current?.abort();
    setPaintingScene(null);
    if (draftBefore) {
      setRevealing(true);
      if (revealTimer.current) clearTimeout(revealTimer.current);
      revealTimer.current = setTimeout(() => setRevealing(false), 900);
      importDoc(draftBefore);
    }
    setDraftBefore(null);
  };

  /** drops the design from the URL once it has been taken or declined */
  const clearShareHash = () => {
    if (typeof window !== "undefined" && window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  };

  const selectedFrame = useMemo(
    () => frames.find((f) => f.id === selectedFrameId) ?? null,
    [frames, selectedFrameId],
  );
  const selectedMinLength = useMemo(
    () => (selectedFrame ? minFrameLength(groups, selectedFrame, frames, widths) : 0),
    [groups, selectedFrame, frames, widths],
  );
  const selectedRect = useMemo(() => {
    if (!primaryId) return null;
    const g = groups.find((g) => g.items.some((it) => it.id === primaryId));
    if (!g) return null;
    const b = groupBounds(g, widths);
    return { x: b.l, y: b.t, w: b.r - b.l, h: b.b - b.t };
  }, [primaryId, groups, widths]);

  /** the selection is one instance: what its panel needs */
  const selectedInstance = useMemo(() => {
    if (selectedIds.length !== 1 || !primaryId) return null;
    const group = groups.find((g) => g.instanceOf && g.items[0]?.id === primaryId);
    const def = group && components?.find((c) => c.id === group.instanceOf);
    if (!group || !def || !components) return null;
    return {
      group,
      def,
      components,
      onEdit: () => editDefinition(def.id),
      onDetach: () => detachGroup(group.id),
      onOverrides: (overrides: Group["overrides"]) => runOp(ops.setOverrides, { id: group.id, overrides: overrides ?? null }, { history: { coalesce: `overrides:${group.id}` } }),
    };
    // the panel's handlers read the refs; only what it shows matters here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, primaryId, groups, components]);

  /** a container's auto layout places the selected part, so its place is not the author's to set */
  const selectedInFlow = useMemo(() => {
    const g = primaryId ? groups.find((x) => x.items.some((it) => it.id === primaryId)) : undefined;
    const host = g?.inFlow ? groups.find((x) => x.id === g.inFlow) : undefined;
    return !!host && !!flowOf(host);
  }, [primaryId, groups]);
  /** the layout that places the selected part, for how it is sized and lined up in it */
  const selectedFlowParent = useMemo(() => {
    const g = primaryId ? groups.find((x) => x.items.some((it) => it.id === primaryId)) : undefined;
    const host = g?.inFlow ? groups.find((x) => x.id === g.inFlow) : undefined;
    return host ? flowOf(host) : null;
  }, [primaryId, groups]);
  /** the selected part stands loose in its layout, where it was put: its place is the author's again */
  const selectedLoose = useMemo(() => {
    const it = primaryId ? groups.flatMap((g) => g.items).find((x) => x.id === primaryId) : undefined;
    return childLayoutOf(it).absolute;
  }, [primaryId, groups]);

  /** the selected part put at a place given in numbers */
  const moveSelectedTo = useCallback(
    (x: number, y: number) => {
      if (selectedRect) nudge(x - selectedRect.x, y - selectedRect.y);
    },
    [selectedRect, nudge],
  );

  const selectedPartFrame = useMemo(() => {
    if (!primaryId || frame !== "phone") return null;
    const g = groups.find((g) => g.items.some((it) => it.id === primaryId));
    return g ? (frameOfGroup(g, frames, widths) ?? null) : null;
  }, [primaryId, frame, groups, frames, widths]);

  /** the screen the tidy button works on: the selected one, or the one under the selected part */
  const tidyTarget = useMemo((): Frame | null => {
    if (frame !== "phone" || isMobile || defEdit) return null;
    if (selectedFrame) return selectedFrame;
    if (!primaryId) return null;
    const g = groups.find((g) => g.items.some((it) => it.id === primaryId));
    return g ? (frameOfGroup(g, frames, widths) ?? null) : null;
  }, [frame, isMobile, defEdit, selectedFrame, primaryId, groups, frames, widths]);

  /** Entering phone mode with no frames wraps the existing parts in one. */
  const ensureFrame = () => store.update("Screens", "user", (s) => ensureScreen(s, widthsRef.current, uid(), t("home")));

  const ensureFrameRef = useRef(() => {});
  ensureFrameRef.current = ensureFrame;

  /** A palette tile chosen without a pointer, and the phone's plus button, drop a part where
   *  the view is looking, landing as a drop there would. Over a screen it is kept inside it and
   *  nudged down when that spot is already taken; over empty canvas it stays at the centre of
   *  the view, so the new part is always in sight */
  const addPart = (slug: string, instance?: ComponentDef) => {
    const sz = instance ? { w: instance.w, h: instance.h } : freshSize(freshPart(slug));
    /* the selected screen or the one in view, never the gap between two; the phone shows one screen at a time */
    const { f, cx, cy } = landingSpot();
    let x = cx - sz.w / 2;
    let y = cy - sz.h / 2;
    if (f) {
      const { w } = frameSizeOf(f);
      const h = frameLengthOf(f);
      const lx = f.x + Math.min(FRAME_MARGIN, (w - sz.w) / 2);
      const ly = f.y + Math.min(FRAME_MARGIN, (h - sz.h) / 2);
      x = clamp(x, lx, Math.max(lx, f.x + w - FRAME_MARGIN - sz.w));
      y = clamp(y, ly, Math.max(ly, f.y + h - FRAME_MARGIN - sz.h));
      const taken = (yy: number) =>
        itemRects().some((o) => o.l < x + sz.w && o.r > x && o.t < yy + sz.h && o.b > yy);
      let tries = 0;
      while (taken(y) && y + sz.h * 2 < f.y + h && tries++ < 12) y += sz.h + 12;
    }
    /* a scene is its screen's picture: it fills the screen in view, or the one selected, behind everything on it */
    const backdrop = { screen: (framesRef.current.find((fr) => fr.id === selectedFrameIdRef.current) ?? f)?.id, x: cx, y: cy };
    const added = instance
      ? runOp(ops.addInstance, { component: instance.id, at: { x, y } }, { history: "step", refused: (e) => e.code === "refused" && showToast(t("nestRefused", getLang())) })
      : runOp(ops.addPart, { slug, at: { x, y }, seed: true, backdrop }, { history: "step" });
    if (!added) return;
    setRightTab("edit");
    setSheet(null);
  };

  /** a definition added without a drag, where the view is looking */
  const addInstance = (id: string) => {
    const def = componentsRef.current?.find((c) => c.id === id);
    if (!def) return;
    if (!canNest(componentsRef.current, defEditRef.current?.id ?? null, id)) {
      showToast(t("nestRefused", getLang()));
      return;
    }
    addPart("container", def);
  };
  const addPartRef = useRef(addPart);
  addPartRef.current = addPart;
  const addInstanceRef = useRef(addInstance);
  addInstanceRef.current = addInstance;

  const changeFrame = (f: FrameMode) => {
    if (f === frame || defEditRef.current) return;
    if (!didOp(ops.setFrameMode, { mode: f }, { history: "step" })) return;
    frameRef.current = f;
    setSelectedLinkId(null);
    queueMicrotask(() => fitRef.current());
  };

  const addFrame = () => {
    if (defEditRef.current) return;
    const made = runOp(ops.addScreen, {}, { history: "step" });
    const f = made && store.get().doc.frames.find((x) => x.id === made.id);
    if (!f) return;
    const r = canvasRect();
    if (r) {
      const z = viewRef.current.z;
      const { w, h } = frameSizeOf(f);
      setView({
        x: r.width / 2 - (f.x + w / 2) * z,
        y: r.height / 2 - (f.y + h / 2) * z,
        z,
      });
    }
  };

  /** Adds a template's screens beside the existing ones, in the words of the editor's language, and
   *  selects the first. On a blank canvas it brings the screens back: they are what it adds. */
  const addTemplate = (slug: string) => {
    if (!templateBySlug(slug) || defEditRef.current) return;
    const added = runOp(ops.addTemplate, { slug }, { history: "step" });
    if (!added) return;
    frameRef.current = "phone";
    tidyRef.current = null;
    /* its parts were placed by a guess at their sizes: once they are drawn it is laid out again by what they came to */
    freshFramesRef.current = { ids: added.frames, until: Date.now() + 4000 };
    retidyRef.current = added.frames;
    setSelectedLinkId(null);
    setRightTab("edit");
    const first = store.get().doc.frames.find((x) => x.id === added.frames[0]);
    if (first) glideToFrame(first);
  };

  const patchFrame = (id: string, patch: Partial<Frame>) => runOp(ops.patchScreen, { id, patch }, { history: { coalesce: "frame:" + id + ":" + Object.keys(patch).join(",") } });

  /* a phone chosen for a screen is the phone the document is drawn for */
  const setFramePreset = (id: string, preset: FramePreset) => resizeFrame(id, { preset });

  /** every phone screen of the document at the size of one model, each kept upright or on its side. One undo step. */
  const setPhoneModel = (size: { w: number; h: number }) => {
    snapshot();
    tidyRef.current = null;
    const out = runOp(ops.setPhoneModel, size, { history: "none" });
    if (!out) return;
    setEasing(true);
    window.setTimeout(() => setEasing(false), SETTLE_MS + 40);
    retidyRef.current = out.frames;
    newPhoneRef.current = { ids: out.frames, until: Date.now() + 4000 };
  };

  /** A screen's new size: the screens to the right move over, parts take the sizes the new screen calls for, and the
   *  screen is laid out again by the tidy rules (lib/core `resize_screen`). */
  const resizeFrame = (id: string, size: { w?: number; h?: number; preset?: FramePreset }) => {
    if (!didOp(ops.resizeScreen, { id, ...size }, { history: "step" })) return;
    tidyRef.current = null;
    setEasing(true);
    window.setTimeout(() => setEasing(false), SETTLE_MS + 40);
    /* overlays drawn open (a dialog's box is the screen it floats in) are laid out here with
     * their old measures; they are re-measured against the new screen size in the measuring
     * pass, and the screen is laid out once more with the sizes that came out */
    retidyRef.current = [id];
  };

  /** the document a run of length changes started from, and what the last of them made of it */
  const lengthRun = useRef<{ id: string; from: { frames: Frame[]; groups: Group[] }; to: { frames: Frame[]; groups: Group[] } } | null>(null);
  /** makes a screen run longer than its device, or back: what stands at its foot goes with the foot.
   *  A slider sends a stream of lengths; each is worked out from where the stream began, so a part
   *  is never taken for one at the foot halfway through and dragged along from then on. */
  /** One drag of a screen's length handle: the document it started from, and whether it took its one undo step */
  type LengthDrag = { from: { frames: Frame[]; groups: Group[] }; snapped: boolean };
  const setFrameLength = (id: string, length: number, drag?: LengthDrag) => {
    const run = lengthRun.current;
    const from = drag
      ? drag.from
      : run && run.id === id && run.to.frames === framesRef.current && run.to.groups === groupsRef.current
        ? run.from
        : { frames: framesRef.current, groups: groupsRef.current };
    if (!didOp(ops.setScreenLength, { id, length, from }, { history: drag ? (drag.snapped ? "none" : "step") : { coalesce: "frame:" + id + ":length" } })) return;
    if (drag) drag.snapped = true;
    lengthRun.current = { id, from, to: { frames: store.get().doc.frames, groups: store.get().doc.groups } };
    tidyRef.current = null;
  };

  /** the screen whose length handle is being dragged: it follows the pointer without easing */
  const [lengthDragId, setLengthDragId] = useState<string | null>(null);
  /** the grip under the chosen screen: dragging it makes the screen run longer or shorter, as the
   *  length slider does, in steps of 4dp. The whole drag is worked out from the document it began
   *  with, and takes one undo step, and only once the length really changes. */
  const onLengthHandleDown = (e: React.PointerEvent, f: Frame) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const pointerId = e.pointerId;
    const startY = e.clientY;
    const start = frameLengthOf(f);
    const deviceH = frameSizeOf(f).h;
    const max = maxFrameLength(f);
    const drag: LengthDrag = { from: { frames: framesRef.current, groups: groupsRef.current }, snapped: false };
    lengthRun.current = null;
    setLengthDragId(f.id);
    /* captured, the pointer's events reach the window through the handle wherever it is let go;
     * should the handle go away mid-drag, they reach the window directly */
    (e.currentTarget as HTMLElement).setPointerCapture(pointerId);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      setFrameLength(f.id, clamp(Math.round((start + (ev.clientY - startY) / viewRef.current.z) / 4) * 4, deviceH, max), drag);
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      lengthRun.current = null;
      setLengthDragId(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };
  /** the same handle from the keyboard: arrows move it by 4dp, with Shift by 40dp */
  const onLengthHandleKey = (e: React.KeyboardEvent, f: Frame) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    e.stopPropagation();
    const step = (e.shiftKey ? 40 : 4) * (e.key === "ArrowDown" ? 1 : -1);
    setFrameLength(f.id, clamp(frameLengthOf(f) + step, frameSizeOf(f).h, maxFrameLength(f)));
  };

  /** the tidy button's state for the screen in play; the layout pass runs only when the document changes */
  const tidyState = useMemo((): TidyState | null => {
    if (!tidyTarget) return null;
    const last = tidyRef.current;
    if (last && last.frameId === tidyTarget.id && last.after === groups) return "undo";
    return tidyFrame(groups, tidyTarget, frames, widths, metricsOf(theme)) ? "tidy" : "done";
  }, [tidyTarget, groups, frames, widths]);

  const tidy = (f: Frame) => {
    const last = tidyRef.current;
    if (last && last.frameId === f.id && last.after === groupsRef.current) {
      /* tidy's own way back, as a step of its own */
      store.transact("Undo tidy", "user", (tx) => tx.set((s) => withGroups(s, last.before)), { history: "step" });
      tidyRef.current = null;
      return;
    }
    const out = runOp(ops.tidyScreen, { screen: f.id }, { history: "step" });
    if (out) tidyRef.current = { frameId: f.id, before: out.before, after: store.get().doc.groups };
  };

  /** what the layout keys do, read by the keyboard handler at the moment a key is pressed */
  const layoutKeysRef = useRef({ tidyUp: () => {}, tidyScreen: () => {}, autoLayout: () => {} });
  layoutKeysRef.current = {
    tidyUp: tidyUpSelected,
    tidyScreen: () => {
      if (tidyTarget) tidy(tidyTarget);
    },
    autoLayout: autoLayoutSelected,
  };

  /** whether the screen in play has buttons side by side that can become one button group */
  const canCombine = useMemo(() => !!tidyTarget && !!combineButtons(groups, tidyTarget, frames, widths), [tidyTarget, groups, frames, widths]);

  /** joins neighbouring buttons into button groups; one undo step */
  const combine = (f: Frame) => {
    if (didOp(ops.combine, { screen: f.id }, { history: "step" })) tidyRef.current = null;
  };

  /** sets where Tidy puts a screen's body, then tidies it that way; one undo step covers both */
  const setPlace = (f: Frame, place: Place) => {
    const before = store.get().doc.groups;
    const out = runOp(ops.setPlace, { id: f.id, place }, { history: "step" });
    tidyRef.current = out?.tidied ? { frameId: f.id, before, after: store.get().doc.groups } : null;
  };

  const toastTimer = useRef<number | null>(null);
  /** the desktop's message pill beside the tidy button; the phone keeps its centered toast */
  const showAiNote = (text: string, icon = "check", ms = 2200, action?: NoteAction) => {
    const hide = () => setAiNote(null);
    /* the notice's own button does its work and takes the notice away */
    setAiNote({ text, icon, ...(action ? { action: { label: action.label, run: () => (action.run(), hide()) } } : {}) });
    if (aiNoteTimer.current) window.clearTimeout(aiNoteTimer.current);
    aiNoteTimer.current = window.setTimeout(hide, ms);
  };

  /** a short message; with an action, a button on it (an undo) for as long as it shows */
  const showToast = (msg: string, ms = 2200, icon = "info", action?: NoteAction) => {
    if (!mobileRef.current) {
      showAiNote(msg, icon, ms, action);
      return;
    }
    const hide = () => setToast(null);
    setToast({ text: msg, icon, ...(action ? { action: { label: action.label, run: () => (action.run(), hide()) } } : {}) });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(hide, ms);
  };

  const updateAiSettings = (s: AiSettings) => {
    setAiSettings(s);
    saveAiSettings(s);
  };

  const aiReady = hasKey(aiSettings) && aiSettings.model.trim().length > 0 && isSecureUrl(aiSettings.baseUrl);
  const aiReason = !aiReady ? t("aiNoKey", lang) : !tidyTarget ? t("aiSelectScreen", lang) : undefined;

  /** Writes one field with the model: a part's behavior note, or a screen's description.
   *  The result goes straight in; the field remembers what it said so the rewrite can be undone. */
  const runAi = async (action: AiActionKey, f: Frame, itemId?: string) => {
    if (!aiReady) {
      showToast(t("aiNoKey", lang));
      return;
    }
    const curDoc = doc;
    aiAbortRef.current?.abort();
    const ac = new AbortController();
    aiAbortRef.current = ac;
    setAiBusy(true);
    setAiFrameId(f.id);
    try {
      if (action === "describe") {
        const r = await proposeDescription(aiSettings, curDoc, widthsRef.current, f, lang, ac.signal);
        if (ac.signal.aborted) return;
        snapshot();
        setFrames((fs) => fs.map((x) => (x.id === f.id ? { ...x, note: r.note, noteHistory: pushHistory(x.noteHistory, x.note), name: r.name ?? x.name } : x)));
        showAiNote(t("aiApplied", lang));
        return;
      }
      if (!itemId) return;
      const note = await proposeBehavior(aiSettings, curDoc, widthsRef.current, f, lang, itemId, ac.signal);
      if (ac.signal.aborted) return;
      if (!note) {
        showToast(t("aiErrorJson", lang));
        return;
      }
      snapshot();
      setGroups((gs) => gs.map((g) => (g.items.some((it) => it.id === itemId) ? { ...g, items: g.items.map((it) => (it.id === itemId ? { ...it, note, noteHistory: pushHistory(it.noteHistory, it.note) } : it)) } : g)));
      showAiNote(t("aiApplied", lang));
    } catch (e) {
      if (!ac.signal.aborted) showToast(aiErrorText(e, lang), 4000, "error");
    } finally {
      if (aiAbortRef.current === ac) {
        aiAbortRef.current = null;
        setAiBusy(false);
        setAiFrameId(null);
      }
    }
  };

  const cancelAi = () => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    setAiBusy(false);
    setAiFrameId(null);
  };

  useEffect(
    () => () => {
      aiAbortRef.current?.abort();
      if (aiNoteTimer.current) window.clearTimeout(aiNoteTimer.current);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  /** a screen takes everything on it along, and links into it are dropped */
  const deleteFrame = useCallback(
    (id: string) => {
      if (defEditRef.current) return;
      runOp(ops.removeScreen, { id }, { history: "step" });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store],
  );

  const duplicateFrame = (id: string) => {
    if (!framesRef.current.some((x) => x.id === id) || defEditRef.current) return;
    /* a copy is a screen of its own, not one more size of this one */
    runOp(ops.duplicateScreen, { id }, { history: "step" });
  };

  /** another size of a screen, beside it: a copy carried to the new size, one undo step */
  const createVariantOf = (id: string, preset: FramePreset) => {
    const made = runOp(ops.createScreenVariant, { id, preset }, { history: "step" });
    if (!made) return;
    tidyRef.current = null;
    retidyRef.current = [made.id];
    const f = store.get().doc.frames.find((x) => x.id === made.id);
    if (f) glideToFrame(f);
  };
  const duplicateFrameRef = useRef(duplicateFrame);
  duplicateFrameRef.current = duplicateFrame;
  /** Ctrl+A: set where the screen the layers list is worked out */
  const selectAllRef = useRef(() => {});

  /** One step forward or back for what is selected, with whatever it holds. */
  const stepSelectedLayers = (dir: 1 | -1) => {
    const all = store.get().doc.groups;
    if (!didOp(ops.zOrder, { ids: selectedIds, to: dir === 1 ? "forward" : "backward" }, { history: { coalesce: "layer-step:" + selectedIds.join(",") } })) return;
    store.get().doc.groups.forEach((g, i) => {
      if (g !== all[i]) instantRef.current.add(g.id);
    });
  };

  /** The screen is re-rendered offscreen at 1:1 with static parts, so the
   *  canvas zoom, selection outlines and in-flight animations never leak into the PNG. */
  const saveFrameImage = async (f: Frame) => {
    setExportFrame(f);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
    try {
      await document.fonts?.ready;
      const el = document.querySelector<HTMLElement>(`[data-export="${f.id}"]`);
      if (!el) return;
      const url = await toPng(el, { pixelRatio: 2, cacheBust: true, width: frameSizeOf(f).w, height: frameLengthOf(f) });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${f.name || "screen"}.png`;
      a.click();
    } finally {
      setExportFrame(null);
    }
  };

  /** One file per screen, one after another: there is one export layer, and browsers drop downloads
   *  that start in the same instant. */
  const saveAllFrameImages = async () => {
    for (const f of framesRef.current) {
      await saveFrameImage(f);
      await new Promise((r) => setTimeout(r, 300));
    }
  };

  /** the runs of one screen drawn with plain divs: the export layer */
  const renderExport = (f: Frame) => {
    const all = expandDoc(doc, widths).groups;
    const off = outOfPane(all, widths);
    const gs = all.filter((g) => frameOfPart(g, all, frames, widths)?.id === f.id && !off.has(g.id));
    const { w } = frameSizeOf(f);
    const h = frameLengthOf(f);
    return (
      <div
        data-export={f.id}
        style={{
          position: "relative",
          width: w,
          height: h,
          background: screenBackground(p[f.bg ?? "surface"], theme),
          overflow: "hidden",
        }}
      >
        {gs.map((g) =>
          g.free ? (
            layoutOf(g, widths).map((pl) => (
              <div key={pl.item.id} style={{ position: "absolute", left: pl.x - f.x, top: pl.y - f.y }}>
                <StaticPart item={pl.item} screen={{ w, h }} />
              </div>
            ))
          ) : (
          <div
            key={g.id}
            style={{
              position: "absolute",
              left: g.x - f.x,
              top: g.y - f.y,
              display: "flex",
              flexDirection: g.axis === "x" ? "row" : "column",
              alignItems: g.axis === "x" ? "center" : "stretch",
              gap: GAP,
            }}
          >
            {g.items.map((it) => (
              <StaticPart key={it.id} item={it} screen={{ w, h }} />
            ))}
          </div>
          ),
        )}
      </div>
    );
  };

  /** the view before the preview opened, restored when it closes */
  const viewBeforePreview = useRef<View | null>(null);
  /** the opening scheduled after the glide, while it is still pending */
  const previewTimer = useRef<number | null>(null);
  /** the camera's return scheduled after a close, with the view it is heading back to */
  const returnTimer = useRef<{ id: number; view: View } | null>(null);
  const cancelReturn = () => {
    if (returnTimer.current !== null) window.clearTimeout(returnTimer.current.id);
    returnTimer.current = null;
  };
  useEffect(() => () => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    if (returnTimer.current !== null) window.clearTimeout(returnTimer.current.id);
  }, []);
  /** the camera glides for a moment: a screen is brought to the center before the
   *  preview opens over it, and the view returns once the preview closes */
  const glide = (v: View) => {
    setCameraEasing(true);
    setView(v);
    window.setTimeout(() => setCameraEasing(false), SETTLE_MS + 40);
  };
  /** Brings one screen to the middle of the canvas at the zoom it fits in, gliding there. A
   *  screen already wholly in view is left where it is, so picking it does not move the camera. */
  const glideToFrame = (f: Frame) => {
    const r = canvasRect();
    if (!r) return;
    const { w } = frameSizeOf(f);
    const h = frameLengthOf(f);
    const boxW = w + BEZEL * 2;
    const boxH = h + BEZEL * 2 + FRAME_LABEL_H;
    const v = viewRef.current;
    const left = (f.x - BEZEL) * v.z + v.x;
    const top = (f.y - BEZEL - FRAME_LABEL_H) * v.z + v.y;
    if (left >= GLIDE_PAD && top >= GLIDE_TOP && left + boxW * v.z <= r.width - GLIDE_PAD && top + boxH * v.z <= r.height - GLIDE_PAD) return;
    const z = clamp(Math.min((r.width - GLIDE_PAD * 2) / boxW, (r.height - GLIDE_TOP - GLIDE_PAD) / boxH, v.z), MIN_Z, MAX_Z);
    glide({ x: (r.width - boxW * z) / 2 - (f.x - BEZEL) * z, y: GLIDE_TOP + (r.height - GLIDE_TOP - GLIDE_PAD - boxH * z) / 2 - (f.y - BEZEL - FRAME_LABEL_H) * z, z });
  };
  const openPreview = (startId?: string | null) => {
    if (frame !== "phone") {
      changeFrame("phone");
    }
    queueMicrotask(() => {
      const id = startId ?? selectedFrameId ?? framesRef.current[0]?.id ?? null;
      const f = framesRef.current.find((x) => x.id === id);
      const r = canvasRect();
      if (f && r) {
        /* the preview's own fit and center, in window coordinates: its stage is sized for the
         * largest screen and sits left of the control column, so the screen lands where the
         * preview will show it */
        const { w, h } = frameSizeOf(f);
        const wide = window.innerWidth >= 720;
        const maxW = Math.max(...framesRef.current.map((x) => frameSizeOf(x).w)) + BEZEL * 2;
        const maxH = Math.max(...framesRef.current.map((x) => frameSizeOf(x).h)) + BEZEL * 2;
        const z = clamp(Math.min(1.4, (window.innerHeight - 32) / maxH, (window.innerWidth - (wide ? 236 : 16)) / maxW), MIN_Z, MAX_Z);
        const cx = (window.innerWidth - (wide ? 220 : 0)) / 2 - r.left;
        const cy = window.innerHeight / 2 - (wide ? 0 : 28) - r.top;
        /* reopening while the camera is still returning keeps the view it was returning
         * to; reopening during the opening glide keeps the view already captured */
        if (returnTimer.current !== null) {
          viewBeforePreview.current = returnTimer.current.view;
          cancelReturn();
        } else if (previewTimer.current === null) {
          viewBeforePreview.current = viewRef.current;
        }
        glide({ x: cx - (f.x + w / 2) * z, y: cy - (f.y + h / 2) * z, z });
        if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
        previewTimer.current = window.setTimeout(() => {
          previewTimer.current = null;
          /* the screen may have gone while the camera moved: an undo can remove it */
          if (framesRef.current.some((x) => x.id === id)) setPreviewId(id);
          else abandonPreview();
        }, SETTLE_MS);
      } else {
        setPreviewId(id);
      }
    });
  };
  /** Gives up an opening that has not happened yet and brings the camera straight back. */
  const abandonPreview = () => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    previewTimer.current = null;
    cancelReturn();
    const back = viewBeforePreview.current;
    viewBeforePreview.current = null;
    if (back) glide(back);
  };
  const closePreview = () => {
    setPreviewId(null);
    const back = viewBeforePreview.current;
    viewBeforePreview.current = null;
    cancelReturn();
    if (back) returnTimer.current = { id: window.setTimeout(() => { returnTimer.current = null; glide(back); }, 220), view: back };
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") tabbedRef.current = true;
      if (editAccess !== "editable") return;
      const t = e.target as HTMLElement;
      const typing =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable);
      if (typing) return;
      // dialogs, the preview and the prompt's full-screen cover own the keyboard while they are up
      if (confirmClear || pendingImport !== null || shareOpen || previewId !== null || promptCoverUp) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (selectedIds.length === 0 && selectedFrameId) duplicateFrameRef.current(selectedFrameId);
        else duplicateSelected();
        return;
      }
      if (mod && e.key.toLowerCase() === "c") {
        /* with nothing selected, or text highlighted somewhere, the browser keeps its own copy */
        if (selectedIds.length === 0 || window.getSelection()?.toString()) return;
        e.preventDefault();
        copySelected();
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        if (!clipboardRef.current) return;
        e.preventDefault();
        pasteClipboard();
        return;
      }
      if (mod && e.key.toLowerCase() === "x") {
        /* the same bargain as copy: highlighted text is the browser's to cut */
        if (selectedIds.length === 0 || window.getSelection()?.toString()) return;
        e.preventDefault();
        copySelected();
        deleteSelected();
        return;
      }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAllRef.current();
        return;
      }
      if (mod && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) ungroupSelected();
        else groupSelected();
        return;
      }
      /* Figma's keys: Ctrl+Alt+T tidies up what is selected, or the screen when one part or none is; Shift+A turns the
       * selection into auto layout. The code of the key, since Alt changes the letter it types on a Mac */
      if (mod && e.altKey && e.code === "KeyT") {
        e.preventDefault();
        if (selectedIds.length > 1) layoutKeysRef.current.tidyUp();
        else layoutKeysRef.current.tidyScreen();
        return;
      }
      if (e.shiftKey && !mod && !e.altKey && e.code === "KeyA" && selectedIds.length) {
        e.preventDefault();
        layoutKeysRef.current.autoLayout();
        return;
      }
      /* Space presses a control reached with Tab instead of holding the hand tool; a button
       * clicked with the mouse keeps focus too, and must not be pressed again */
      if (e.key === " " && tabbedRef.current && t.closest?.("button, [role=button]")) return;
      if (e.key === " " && !e.repeat) {
        e.preventDefault();
        setSpaceHeld(true);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedIds.length === 0 && selectedFrameId)
          deleteFrame(selectedFrameId);
        else deleteSelected();
        return;
      }
      if (e.key === "Escape") {
        /* with nothing left to let go of, Escape leaves the definition being edited */
        if (!selectedIds.length && defEditRef.current) finishDefinitionRef.current();
        setSelectedIds([]);
        setSelectedFrameId(null);
        setSelectedLinkId(null);
        return;
      }
      if (e.key === "p" || e.key === "P") {
        openPreviewRef.current();
        return;
      }
      if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const s = e.shiftKey ? 8 : 1;
        nudge(
          e.key === "ArrowLeft" ? -s : e.key === "ArrowRight" ? s : 0,
          e.key === "ArrowUp" ? -s : e.key === "ArrowDown" ? s : 0,
        );
        return;
      }
      if (mod) return;
      if (e.key === "]" || e.key === "[") {
        if (selectedIds.length === 0) return;
        e.preventDefault();
        stepSelectedLayers(e.key === "]" ? 1 : -1);
        return;
      }
      if (e.key === "v" || e.key === "V") setMode("select");
      if (e.key === "h" || e.key === "H") setMode("hand");
      if (e.key === "=" || e.key === "+") setZoomAt(viewRef.current.z * 1.2);
      if (e.key === "-" || e.key === "_") setZoomAt(viewRef.current.z / 1.2);
      if (e.key === "0") fitRef.current();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") setSpaceHeld(false);
    };
    const onPointer = () => {
      tabbedRef.current = false;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerdown", onPointer, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    deleteSelected,
    duplicateSelected,
    copySelected,
    pasteClipboard,
    groupSelected,
    ungroupSelected,
    nudge,
    redo,
    undo,
    setZoomAt,
    selectedIds,
    selectedFrameId,
    deleteFrame,
    confirmClear,
    pendingImport,
    shareOpen,
    previewId,
    promptCoverUp,
    editAccess,
  ]);
  const openPreviewRef = useRef(openPreview);
  openPreviewRef.current = openPreview;

  /* ---------- render ---------- */
  /* The hole a run holds for a part: where it is, how big, and whether it is still wanted. It
   * outlives the drag by the moment it takes to close, and is the same element throughout, so
   * the closing is a transition rather than a part vanishing. */
  type Gap = { gid: string; index: number; w: number; h: number; open: boolean; /** the hole the part was pulled out of, which stays its full size while the part is in reach */ from: boolean };
  const [gapOut, setGapOut] = useState<Gap | null>(null);
  const gapRef = useRef<Gap | null>(null);
  const gapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (gapTimer.current) clearTimeout(gapTimer.current); }, []);
  const setGap = useCallback((next: Gap | null) => {
    const cur = gapRef.current;
    if (cur === next) return;
    if (cur && next && cur.gid === next.gid && cur.index === next.index && cur.w === next.w && cur.h === next.h && cur.open === next.open && cur.from === next.from) return;
    gapRef.current = next;
    setGapOut(next);
  }, []);
  /** the group keeps the hole a part came out of open, and closes it once the part has moved on */
  const holdGap = useCallback(
    (gid: string, index: number, w: number, h: number, from = false) => {
      if (gapTimer.current) {
        clearTimeout(gapTimer.current);
        gapTimer.current = null;
      }
      setGap({ gid, index, w, h, open: true, from });
    },
    [setGap],
  );
  const closeGap = useCallback(() => {
    const cur = gapRef.current;
    if (!cur || !cur.open) return;
    setGap({ ...cur, open: false });
    if (gapTimer.current) clearTimeout(gapTimer.current);
    gapTimer.current = setTimeout(() => setGap(null), SETTLE_MS + 40);
  }, [setGap]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  /* The document is its own screens and parts even while a definition is open: that definition is
   * what stands on the editing screen, as far as it has got (lib/core `savedDoc`). */
  const doc: Doc = useMemo(() => savedDoc(core), [core.doc, core.editing, widths]);
  /** what the preview plays: everything drawn out. With a definition open, that definition alone. */
  const previewDoc = useMemo(() => (previewId === null ? doc : expandDoc(defEdit ? { ...doc, groups, frames } : doc, widths)), [previewId, doc, defEdit, groups, frames, widths]);
  /** the same document, for callbacks that were created on an earlier render */
  const docRef = useRef(doc);
  docRef.current = doc;

  /** arrows from tappable parts to the frames they open */
  const links = useMemo(() => {
    if (frame !== "phone") return [];
    const rects = itemRects();
    const out: (Route & LinkLine & { t: Transition })[] = [];
    for (const g of groups) {
      const source = frameOfPart(g, groups, frames, widths);
      for (const it of g.items) {
        for (const { slot, action } of actionsOf(it)) {
        if (action.to === BACK_TARGET) continue;
        const at = frames.findIndex((x) => x.id === action.to);
        const r = rects.find((x) => x.id === it.id);
        if (at < 0 || !r) continue;
        const f = frames[at];
        const others = frames.filter((x) => x.id !== f.id && x.id !== source?.id).map(frameRect);
        out.push({
          ...routeLink(r, frameRect(f), others, source ? frameRect(source) : undefined, BEZEL, at * 12),
          id: `${it.id}|${slot}`,
          itemId: it.id,
          to: f.id,
          fromFrame: source?.id,
          nav: isNavPart(it.component),
          t: action.transition,
        });
        }
      }
    }
    return mergeLinks(out);
  }, [groups, frames, frame, itemRects, widths]);
  /** the lines worth drawing right now: most of a design's are noise until asked for */
  const visibleLinks = useMemo(() => shownLinks(links, { all: showAllLinks, selectedIds, selectedFrameId, selectedLinkId }), [links, showAllLinks, selectedIds, selectedFrameId, selectedLinkId]);

  /* a line can stand for several rows that open one screen: what is done to it is done to them all */
  const idsOfLink = (linkId: string) => links.find((l) => l.id === linkId)?.ids ?? [linkId];
  const setLinkTransition = (linkId: string, transition: Transition) => runOp(ops.setLinkTransition, { links: idsOfLink(linkId), transition }, { history: { coalesce: "link:" + linkId } });
  const removeLink = (linkId: string) => {
    /* the arrow is where it goes; what else the tap does stays */
    runOp(ops.removeLinks, { links: idsOfLink(linkId) }, { history: "step" });
    setSelectedLinkId(null);
  };

  /** what a dock's other tabs hold: the canvas draws only the tab that is showing */
  const offTab = useMemo(() => outOfPane(groups, widths), [groups, widths]);
  /** what the preview starts without, with what those parts hold: drawn dimmed, so it can still be selected */
  const startsHidden = useMemo(() => new Set(groups.filter((g) => g.hidden).flatMap((g) => [g.id, ...heldBy(g, groups, widths).map((x) => x.id)])), [groups, widths]);

  /** what the panels that edit behaviour need of the document */
  const behavior = useMemo<Behavior>(() => {
    const group = primaryId ? (groups.find((g) => g.items.some((it) => it.id === primaryId)) ?? null) : null;
    const screen = group ? frameOfPart(group, groups, frames, widths) : undefined;
    const around = group?.inFlow ? groups.find((g) => g.id === group.inFlow) : undefined;
    const repeatHost = !group ? null : flowOf(group) ? group : around && flowOf(around) && groups.find((g) => g.inFlow === around.id) === group ? around : null;
    return {
      vars: vars ?? [],
      setVars: (next) => runOp(ops.setVars, { vars: next }),
      groups: group ? groups.filter((g) => frameOfPart(g, groups, frames, widths)?.id === screen?.id) : [],
      group,
      patchGroup: (patch) => {
        if (!group) return;
        runOp(ops.setGroup, { id: group.id, patch: patch as GroupPatch }, { history: { coalesce: `${group.id}:${Object.keys(patch).join(",")}` } });
      },
      canPaint,
      paintingScene,
      paintScene: (id) => {
        const item = sceneItem(id);
        if (!item) return;
        snapshot();
        void paintScenes([item]);
      },
      copyScenePrompt: (id) => {
        const def = partBySlug("scene");
        const item = sceneItem(id);
        if (!def || !item) return;
        const p = reader(def, item.props);
        void navigator.clipboard.writeText(scenePrompt(p.s("prompt"), p.s("style").trim() || artOf(theme), p.s("motion") === "animated")).then(() => showToast(t("copied", lang), 1400, "check"));
      },
      reorderPanes: (order) => {
        if (group) runOp(ops.reorderPanes, { id: group.id, order });
      },
      collections,
      rowFields: group ? collections?.find((c) => c.id === repeatAround(groups, group, widths)?.repeat?.collection)?.fields : undefined,
      repeatHost: repeatHost,
      patchRepeat: (repeat) => {
        if (!repeatHost) return;
        runOp(ops.setRepeat, { id: repeatHost.id, repeat: repeat ?? null }, { history: { coalesce: `${repeatHost.id}:repeat` } });
      },
    };
    // the panels' handlers read the store; only what they show matters here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vars, primaryId, groups, frames, widths, snapshotFor, collections, canPaint, paintingScene, aiSettings, lang]);

  /** which frame each run sits on (phone mode only) */
  const frameOf = useMemo(() => {
    const m = new Map<string, string>();
    if (frame !== "phone") return m;
    /* a part goes with the layout that holds it: what overflows, or stands on a dock's other tab where it
     * was last laid out, is still on that screen. One walk for each part, so a large document stays quick */
    const byId = new Map(groups.map((g) => [g.id, g]));
    const screenOf = (g: Group, depth = 0): string | undefined => {
      const known = m.get(g.id);
      if (known !== undefined) return known;
      const host = g.inFlow ? byId.get(g.inFlow) : undefined;
      const id = host && host !== g && depth < 32 ? screenOf(host, depth + 1) : frameOfGroup(g, frames, widths)?.id;
      if (id) m.set(g.id, id);
      return id;
    };
    for (const g of groups) screenOf(g);
    return m;
  }, [groups, frames, frame, widths]);

  /** the size of the screen each part sits on, by part: an overlay drawn open never gets a
   *  virtual viewport bigger than the real one it is on */
  const screenByItem = useMemo(() => {
    const m = new Map<string, { w: number; h: number }>();
    for (const g of groups) {
      const fid = frameOf.get(g.id);
      const f = fid ? frames.find((x) => x.id === fid) : undefined;
      if (!f) continue;
      const s = frameSizeOf(f);
      for (const it of g.items) m.set(it.id, s);
    }
    /* what an instance or a row draws is on the screen of the group it stands on */
    for (const { item, owner } of canvas.extra) {
      const f = frames.find((x) => x.id === frameOf.get(owner));
      if (f) m.set(item.id, frameSizeOf(f));
    }
    return m;
  }, [groups, frameOf, frames, canvas]);

  /* the same elements while nothing in them changes, so that a drag does not attach every ref again on each move */
  const measuringLayer = useMemo(
    () =>
      allItems.map((it) => (
        <div
          key={it.id}
          ref={(el) => {
            if (el) measureEls.current.set(it.id, el);
            else measureEls.current.delete(it.id);
          }}
          style={{ display: "inline-flex", boxSizing: "border-box" }}
        >
          <PartView item={it} screen={screenByItem.get(it.id)} />
        </div>
      )),
    [allItems, screenByItem],
  );

  /** the screen whose layers the panel lists: the selection's, else the chosen one */
  const layersFrame = useMemo(() => {
    if (frame !== "phone") return null;
    if (primaryId) {
      const g = groups.find((x) => x.items.some((it) => it.id === primaryId));
      const fid = g ? frameOf.get(g.id) : undefined;
      if (fid) return frames.find((f) => f.id === fid) ?? null;
    }
    if (selectedFrameId) return frames.find((f) => f.id === selectedFrameId) ?? null;
    return frames.find((f) => f.id === layersFrameId) ?? frames[0] ?? null;
  }, [frame, primaryId, groups, frameOf, frames, selectedFrameId, layersFrameId]);
  const layerGroups = useMemo(
    () => (layersFrame ? groups.filter((g) => frameOf.get(g.id) === layersFrame.id) : []),
    [groups, frameOf, layersFrame],
  );
  /* the current screen is the one the layers list; a blank canvas has only the one place */
  selectAllRef.current = () => {
    const on = frame === "phone" ? layerGroups : groups;
    /* what stands on a dock's other tab is not on the canvas: a delete must not reach what cannot be seen */
    setSelectedIds(on.filter((g) => !offTab.has(g.id)).flatMap((g) => g.items.map((it) => it.id)));
    setSelectedFrameId(null);
    setSelectedLinkId(null);
  };
  /** A drag in the layers panel is one undo step: the snapshot is taken when it starts,
   *  and the reorders it fires along the way record nothing more. */
  const layerDragRef = useRef(false);
  const onLayerDragging = (dragging: boolean) => {
    if (dragging && !layerDragRef.current) snapshot();
    layerDragRef.current = dragging;
  };
  /** a reorder from the layers panel: while a drag of it goes on, its step was taken when it began */
  const layerHistory = (key: string) => (layerDragRef.current ? ("none" as const) : { coalesce: key });

  const reorderLayers = (topFirst: string[]) => {
    if (!didOp(ops.reorderLayers, { order: topFirst }, { history: layerHistory("layers:" + (layersFrame?.id ?? "")) })) return;
    for (const id of topFirst) instantRef.current.add(id);
  };

  /** flips a group's lock from its row's lock icon in the Layers panel */
  const toggleGroupLock = (id: string) => {
    const g = store.get().doc.groups.find((x) => x.id === id);
    if (g) runOp(ops.setGroup, { id, patch: { locked: !g.locked } }, { history: "step" });
  };

  /** flips whether a group starts the preview hidden, from its row's eye in the Layers panel */
  const toggleGroupHidden = (id: string) => {
    const g = store.get().doc.groups.find((x) => x.id === id);
    if (g) runOp(ops.setGroup, { id, patch: { hidden: g.hidden ? null : true } }, { history: "step" });
  };

  /** names a group from its row in the Layers panel; no words give up the name */
  const renameGroup = (id: string, name: string) => runOp(ops.setGroup, { id, patch: { name: name || null } }, { history: "step" });

  /** The parts of one group in a new order: reading order for a group laid out along its axis,
   *  back to front for a free group. */
  const reorderGroupItems = (groupId: string, order: string[]) => {
    if (!didOp(ops.reorderItems, { group: groupId, order }, { history: layerHistory("layers:items:" + groupId), refused: () => {} })) return;
    instantRef.current.add(groupId);
  };

  /** what an instance or a repeat draws on a group: it rides along with it and takes no pointer */
  const drawnParts = (parts: DrawnPart[] | undefined, screen?: { w: number; h: number }) =>
    parts?.length ? (
      <div aria-hidden style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, pointerEvents: "none" }}>
        {parts.map((part) => (
          <div key={part.item.id} data-drawn={part.item.id} data-drawn-dim={part.dim ? "" : undefined} style={{ position: "absolute", left: part.dx, top: part.dy, width: "max-content", opacity: part.dim ? ROW_DIM : undefined }}>
            <PartView item={part.item} screen={screen} />
          </div>
        ))}
      </div>
    ) : undefined;

  const renderGroup = (g: Group, ox: number, oy: number, screen?: { w: number; h: number }) => {
    if (g.free) {
      const instantG = instantRef.current.has(g.id);
      const allOn = g.items.every((it) => selectedSet.has(it.id));
      return (
        <motion.div
          key={g.id}
          data-group={g.id}
          initial={false}
          animate={{ x: g.x - ox, y: g.y - oy }}
          transition={instantG ? INSTANT : OPEN}
          /* keep any selection lift inside the group, so canvas-wide layer order is preserved */
          style={{ position: "absolute", left: 0, top: 0, zIndex: drawnOpen(g) ? 1 : undefined, isolation: "isolate", opacity: startsHidden.has(g.id) ? HIDDEN_DIM : undefined }}
        >
          {layoutOf(g, widths).map((pl) => (
            <div key={pl.item.id} style={{ position: "absolute", left: pl.x - g.x, top: pl.y - g.y }}>
              <ComponentNode
                item={canvas.shown.get(pl.item.id) ?? pl.item}
                palette={p}
                widths={widths}
                pressed={false}
                selected={selectedSet.has(pl.item.id)}
                interactive={!handMode}
                onPointerDown={(e) => onItemPointerDown(e, g, pl.index, pl.item)}
                screen={screen}
              />
            </div>
          ))}
          {allOn && (
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: -6,
                top: -6,
                width: groupBounds(g, widths).r - g.x + 12,
                height: groupBounds(g, widths).b - g.y + 12,
                border: `${1.5 / view.z}px dashed ${p.primary}`,
                borderRadius: 10,
                pointerEvents: "none",
              }}
            />
          )}
        </motion.div>
      );
    }
    const hole = gapOut?.gid === g.id ? gapOut : null;
    /* while the part is in reach the hole follows the magnet with no easing of its own, so the
     * run it sits in never wobbles; the closing is eased, and the run's own offset with it */
    /* a hole is either wanted or not: it opens and closes on one curve rather than tracking the
     * magnet, so a part arriving between two others is seen making room for itself. The run's own
     * offset travels on the same curve, so the parts behind the hole never drift. */
    const phMain = hole && hole.open ? (g.axis === "x" ? hole.w : hole.h) : 0;
    /* a hole at the front is taken off the run's own position, so the parts behind it stay put.
     * What it costs the run is its width plus the run's spacing, and a closed hole costs nothing:
     * it has already taken that spacing off its own margin. */
    const front = hole && hole.index === 0 ? -(phMain + (hole.open ? GAP : 0)) : 0;

    type Cell = { ph: true } | { ph: false; item: Item; index: number };
    const cells: Cell[] = [];
    for (let i = 0; i <= g.items.length; i++) {
      if (hole && hole.index === i) cells.push({ ph: true });
      if (i < g.items.length)
        cells.push({ ph: false, item: g.items[i], index: i });
    }
    const instant = instantRef.current.has(g.id);
    /* A FAB sits in the corner of a screen, and that is the corner it grows out of: the run is
     * drawn hanging from its own bottom right, so a box changing size moves its top and its left
     * and nothing else. Nothing has to be kept in step, because nothing else moves. */
    const corner = g.items.length === 1 && roleOf(g.items[0]) === "fab" ? sizeOf(g.items[0], widths) : null;
    /* The corner is held by the run's own translate rather than by the offset it is animated to.
     * Both halves of it -- the size in pixels and the box's own 100% -- are then settled by the
     * browser in the frame React hands them over in, so a size being dragged cannot leave the
     * drawn box a step behind the offset and make it shiver. */
    const hang = corner ? `calc(${corner.w}px - 100%) calc(${corner.h}px - 100%)` : undefined;

    return (
      <motion.div
        key={g.id}
        data-group={g.id}
        initial={false}
        animate={{
          x: g.x - ox + (g.axis === "x" ? front : 0),
          y: g.y - oy + (g.axis === "y" ? front : 0),
        }}
        transition={instant ? INSTANT : hole ? GAP_TWEEN : OPEN}
        style={{
          zIndex: drawnOpen(g) ? 1 : undefined,
          opacity: startsHidden.has(g.id) ? HIDDEN_DIM : undefined,
          position: "absolute",
          left: 0,
          top: 0,
          marginLeft: widthShift?.gid === g.id ? widthShift.dx : undefined,
          marginTop: widthShift?.gid === g.id ? widthShift.dy : undefined,
          /* hung from its own corner, a FAB changes size without moving that corner */
          translate: hang,
          display: "flex",
          flexDirection: g.axis === "x" ? "row" : "column",
          alignItems: g.axis === "x" ? "center" : "stretch",
          gap: GAP,
          /* keep any selection lift inside the run, so canvas-wide layer order is preserved */
          isolation: "isolate",
        }}
      >
        {cells.map((c) => {
          if (c.ph) {
            /* the hole is moved by the same clock the run's own offset is, and on the same
             * curve: a frame where one has moved and the other has not is a frame where the
             * parts behind the hole appear somewhere they never were */
            return (
              <motion.div
                key="__gap"
                /* The hole a part came out of is already the part's size; one a part is arriving
                 * into opens from nothing. The run's own spacing sits beside the hole whatever
                 * its width, so the hole takes that much off its own margin as it closes: what
                 * it costs the run then travels to nothing exactly as the run's offset does. */
                initial={
                  hole?.from
                    ? false
                    : g.axis === "x"
                      ? { width: 0, height: hole?.h ?? 0, marginRight: -GAP }
                      : { height: 0, width: hole?.w ?? 0, marginBottom: -GAP }
                }
                animate={
                  g.axis === "x"
                    ? { width: phMain, height: hole?.h ?? 0, marginRight: hole?.open ? 0 : -GAP }
                    : { height: phMain, width: hole?.w ?? 0, marginBottom: hole?.open ? 0 : -GAP }
                }
                transition={GAP_TWEEN}
                style={{ flex: "0 0 auto" }}
              />
            );
          }
          return (
            <ComponentNode
              key={c.item.id}
              item={canvas.shown.get(c.item.id) ?? c.item}
              palette={p}
              widths={widths}
              pressed={pressedId === c.item.id}
              selected={selectedSet.has(c.item.id)}
              instant={widthDragId === c.item.id}
              interactive={!handMode}
              onPointerDown={(e) => onItemPointerDown(e, g, c.index, c.item)}
              onDoubleClick={g.instanceOf ? () => g.instanceOf && editDefinition(g.instanceOf) : undefined}
              screen={screen}
            >
              {drawnParts(canvas.drawn.get(g.id), screen)}
            </ComponentNode>
          );
        })}
      </motion.div>
    );
  };

  const handMode = !isMobile && (mode === "hand" || spaceHeld);
  const panning = gesture?.kind === "pan";
  const marquee = gesture?.kind === "marquee" && gesture.moved ? gesture : null;
  const canvasBg = frame === "phone" ? p.surfaceContainerLow : "#ffffff";

  const panelStyle: React.CSSProperties = {
    background: p.surface,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    position: "relative",
    flex: "0 0 auto",
  };

  const showRight = rightOpen && !isMobile;
  const overBin = (!!drag?.active && drag.overBin) || (gesture?.kind === "group" && gesture.overBin);
  const guide = drag?.active ? drag.guide : gesture?.kind === "group" && gesture.moved ? (gesture.guide ?? null) : null;
  /* what a part being carried would go into when let go, marked before it is: the button it would
   * join, or the container that would lay it out */
  const carriedGroups = gesture?.kind === "group" && gesture.moved && !gesture.overBin ? { groups, id: gesture.id } : drag?.active && !drag.overBin ? { groups: carriedDrag(groups, drag.item, drag.px - drag.offX, drag.py - drag.offY), id: CARRIED } : null;
  const joinHint = carriedGroups && joinTargetOf(carriedGroups.groups, carriedGroups.id, widths);
  const flowHint = carriedGroups && !joinHint ? flowHostAt(carriedGroups.groups, carriedGroups.id, widths) : null;
  const flowHintBox = flowHint && groupBounds(flowHint, widths);
  /* the slot it would take there, marked in place of the distances a free drop shows */
  const flowSlot = flowHint && carriedGroups ? slotIn(flowHint, carriedGroups.groups, carriedGroups.id, widths) : null;
  /* what the numbers of a drag's guides keep clear of: the parts it lines up with, worked out when it started */
  const guideAvoid = guide && guideCache.current ? targetRects(guideCache.current.targets) : undefined;

  return (
    <LangContext.Provider value={lang}>
    <PartThemeContext.Provider value={partTheme}>
    <BehaviorContext.Provider value={behavior}>
    <StyleRulesContext.Provider value={isStrict(theme)}>
      <PartThemeStyle seed={partTheme.seed} contrast={partTheme.contrast} />
      <PartStyleSheet theme={theme} />
      <div
        className={`app-root${revealing ? " m3e-reveal" : ""}`}
        /* the preview sits outside this tree and owns the keyboard while it is up */
        inert={editAccess !== "editable" || previewId !== null}
        aria-hidden={editAccess !== "editable" || previewId !== null}
        style={{
          /* the settle time and curve the stylesheet eases with, from the one place they are set */
          ...(SETTLE_CSS_VARS as React.CSSProperties),
          display: "flex",
          overflow: "hidden",
          background: p.surfaceContainer,
          cursor: resizing ? "col-resize" : undefined,
          userSelect: resizing ? "none" : undefined,
          ["--sb" as string]: p.outlineVariant,
        }}
      >
        {/* hidden measuring layer for text-sized kinds */}
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: -99999,
            top: 0,
            visibility: "hidden",
            pointerEvents: "none",
            fontFamily: fontFamilyOf(theme.font, lang),
          }}
        >
          {measuringLayer}
        </div>

        {exportFrame && (
          <div aria-hidden style={{ position: "fixed", left: -99999, top: 0, pointerEvents: "none", fontFamily: fontFamilyOf(theme.font, lang) }}>
            {renderExport(exportFrame)}
          </div>
        )}


        {/* the part in flight rides above every panel so it stays visible while crossing them */}
        {drag?.active && (() => {
          const r = canvasRect();
          return (
            <div aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 60, overflow: "hidden" }}>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  transform: `translate(${(r?.left ?? 0) + view.x}px, ${(r?.top ?? 0) + view.y}px) scale(${view.z})`,
                  transformOrigin: "0 0",
                  fontFamily: fontFamilyOf(theme.font, lang),
                }}
              >
      {/* the part in flight */}
      {drag?.active && (
        <motion.div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            x: sx,
            y: sy,
            pointerEvents: "none",
            zIndex: 50,
          }}
          animate={{
            opacity: drag.vanishing ? 0 : drag.overBin ? 0.4 : 1,
            scale: drag.vanishing ? 0.6 : drag.overBin ? 0.84 : 1,
          }}
          transition={
            drag.vanishing
              ? VANISH
              : {
                  type: "spring",
                  stiffness: 520,
                  damping: 34,
                  mass: 0.6,
                }
          }
        >
          <ComponentNode item={drag.item} palette={p} widths={drag.kit ? { ...widths, ...drag.kit.measures } : widths} dragging>
            {drag.kit && drawnParts(drag.kit.groups.slice(1).flatMap((g) => layoutOf(g, drag.kit!.measures)).map((pl) => ({ item: pl.item, dx: pl.x, dy: pl.y, dim: false })))}
            {drag.instance &&
              drawnParts(
                expandInstances({ groups: [{ id: "carried", x: 0, y: 0, axis: "x", instanceOf: drag.instance, items: [drag.item] }], components, collections })
                  .slice(1)
                  .flatMap((g) => layoutOf(g, widths))
                  .map((pl) => ({ item: pl.item, dx: pl.x, dy: pl.y, dim: false })),
              )}
          </ComponentNode>
        </motion.div>
      )}
              </div>
            </div>
          );
        })()}

        {/* ---- left: rail + parts / layers ---- */}
        {!isMobile && (
          <aside style={{ ...panelStyle, width: leftOpen ? leftW : RAIL_W, flexDirection: "row", transition: "width 200ms cubic-bezier(0.2, 0, 0, 1)" }}>
            {/* dropping a canvas part anywhere on this side deletes it, whichever tab is open */}
            {overBin && (
              <div style={{ position: "absolute", inset: 0, zIndex: 5, background: "rgba(179,38,30,0.10)", display: "grid", placeItems: "center", pointerEvents: "none", color: p.error }}>
                <div style={{ width: 72, height: 72, borderRadius: 36, background: p.errorContainer, color: p.onErrorContainer, display: "grid", placeItems: "center", boxShadow: "0 4px 14px rgba(0,0,0,0.14)" }}>
                  <Icon name="delete" size={34} />
                </div>
              </div>
            )}
            <div
              onPointerEnter={() => setRailHover(true)}
              onPointerLeave={() => setRailHover(false)}
              onClick={(e) => {
                // a click on the rail's empty background opens the panel
                if (!leftOpen && e.target === e.currentTarget) setLeftOpen(true);
              }}
              style={{
                width: RAIL_W,
                flex: "0 0 auto",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                padding: "10px 0",
                background: p.surfaceContainerLow,
                cursor: leftOpen ? undefined : "pointer",
              }}
            >
              {!leftOpen && railHover ? (
                <IconBtn icon="left_panel_open" p={p} on onClick={() => setLeftOpen(true)} title={t("openPanel", lang)} size={40} />
              ) : (
                <div
                  onClick={() => !leftOpen && setLeftOpen(true)}
                  style={{ width: 40, height: 40, display: "grid", placeItems: "center", cursor: leftOpen ? "default" : "pointer" }}
                >
                  <Logo size={32} color={p.primary} glyph={p.onPrimary} />
                </div>
              )}
              {/* a short window scrolls the tabs: what stands at the ends of the rail stays in reach */}
              <div
                className="no-scrollbar"
                onClick={(e) => {
                  if (!leftOpen && e.target === e.currentTarget) setLeftOpen(true);
                }}
                style={{ flex: 1, minHeight: 0, width: "100%", overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "6px 0" }}
              >
                {LEFT_TABS.map((tab) => (
                  <div key={tab.key} style={{ flex: "0 0 auto", marginTop: tab.key === "color" || tab.key === "ai" ? 10 : 0 }}>
                    <IconBtn
                      icon={tab.icon}
                      p={p}
                      on={leftOpen && leftTab === tab.key}
                      onClick={() => {
                        setLeftTab(tab.key);
                        setLeftOpen(true);
                      }}
                      title={t(tab.title, lang)}
                      size={44}
                    />
                  </div>
                ))}
              </div>
              <LangMenu p={p} onLang={changeLanguage} side="right" size={44} />
              <GitHubLink p={p} size={44} />
            </div>
            {leftOpen && (
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 10px 0 14px",
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 14,
                    color: p.onSurface,
                    flex: 1,
                  }}
                >
                  {t(LEFT_TABS.find((x) => x.key === leftTab)?.title ?? "parts", lang)}
                </span>
                <IconBtn
                  icon="left_panel_close"
                  p={p}
                  onClick={() => setLeftOpen(false)}
                  title={t("closePanel", lang)}
                />
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                {leftTab === "parts" ? (
                  <PartsPalette
                    palette={p}
                    favorites={favorites}
                    onToggleFavorite={(k) =>
                      setFavorites((f) =>
                        f.includes(k) ? f.filter((x) => x !== k) : [...f, k],
                      )
                    }
                    onPartPointerDown={onPartPointerDown}
                    onPartActivate={addPart}
                    onKitPointerDown={onKitPointerDown}
                    onKitActivate={addKit}
                    kitLook={kitLookOf(theme)}
                  />
                ) : leftTab === "templates" ? (
                  <TemplatesPanel p={p} onAdd={addTemplate} blocked={!!defEdit} />
                ) : leftTab === "components" ? (
                  <ComponentsPanel
                    p={p}
                    components={components ?? []}
                    uses={componentUses}
                    editingId={defEdit?.id ?? null}
                    onPointerDown={onComponentPointerDown}
                    onActivate={addInstance}
                    onEdit={editDefinition}
                    onRename={renameComponent}
                    onDelete={deleteComponent}
                  />
                ) : leftTab === "data" ? (
                  <DataPanel
                    p={p}
                    collections={collections ?? []}
                    onChange={(next) => runOp(ops.setCollections, { collections: next }, { history: { coalesce: "collections" } })}
                  />
                ) : leftTab === "style" ? (
                  <StylePanel p={p} theme={theme} onChange={patchTheme} onPick={pickStyle} onUx={patchUx} onRelayout={() => relayout()} onRules={setRules} />
                ) : leftTab === "color" ? (
                  <StyleGate p={p} theme={theme} what="color" onFree={() => setRules(false)}>
                    <ColorPanel
                      p={p}
                      paletteKey={paletteKey}
                      onPalette={pickPalette}
                      custom={customPalette}
                      onCustom={pickCustomPalette}
                      dynamic={dynamicColor}
                      onDynamic={setDynamicColor}
                      theme={theme}
                      onTheme={patchTheme}
                    />
                  </StyleGate>
                ) : leftTab === "shape" ? (
                  <StyleGate p={p} theme={theme} what="shape" onFree={() => setRules(false)}>
                    <ShapePanel p={p} theme={theme} onChange={patchTheme} />
                  </StyleGate>
                ) : leftTab === "type" ? (
                  <StyleGate p={p} theme={theme} what="type" onFree={() => setRules(false)}>
                    <TypePanel p={p} theme={theme} onChange={patchTheme} />
                  </StyleGate>
                ) : leftTab === "motion" ? (
                  <StyleGate p={p} theme={theme} what="motion" onFree={() => setRules(false)}>
                    <MotionPanel p={p} theme={theme} onChange={patchTheme} />
                  </StyleGate>
                ) : leftTab === "ai" ? (
                  <AiPanel p={p} settings={aiSettings} onSettings={updateAiSettings} />
                ) : (
                  <LayersPanel
                    p={p}
                    frames={frames}
                    frameId={layersFrame?.id ?? null}
                    onFrame={(id) => {
                      setLayersFrameId(id);
                      setSelectedIds([]);
                      setSelectedFrameId(id);
                      const f = framesRef.current.find((x) => x.id === id);
                      if (f) glideToFrame(f);
                    }}
                    groups={layerGroups}
                    components={components}
                    widths={widths}
                    selectedIds={selectedIds}
                    onSelect={(ids, add) => {
                      setSelectedIds((cur) => (add ? [...cur.filter((x) => !ids.includes(x)), ...ids] : ids));
                      /* picked on a dock's other tab: the dock comes round to it, or there would be no ring and nothing to work on */
                      const picked = new Set(groupsRef.current.filter((g) => g.items.some((it) => ids.includes(it.id))).map((g) => g.id));
                      const showing = showingGroups(groupsRef.current, picked, widthsRef.current);
                      if (showing !== groupsRef.current) {
                        snapshot();
                        setGroups(showing);
                      }
                      setSelectedFrameId(null);
                      setSelectedLinkId(null);
                      setRightTab("edit");
                    }}
                    onReorder={reorderLayers}
                    onToggleLock={toggleGroupLock}
                    onToggleHidden={toggleGroupHidden}
                    onRename={renameGroup}
                    onReorderItems={reorderGroupItems}
                    onDragging={onLayerDragging}
                  />
                )}
              </div>
            </div>
            )}
            {leftOpen && (
            <div
              onPointerDown={(e) => {
                e.preventDefault();
                setResizing("left");
              }}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                right: -3,
                width: 6,
                cursor: "col-resize",
                zIndex: 5,
              }}
            />
            )}
          </aside>
        )}

        {/* ---- canvas ---- */}
        <main
          style={{
            flex: 1,
            position: "relative",
            minWidth: 0,
            padding: isMobile ? 6 : 8,
          }}
        >
          <div
            ref={canvasRef}
            onPointerDown={onCanvasPointerDown}
            onPointerDownCapture={onTouchCapture}
            style={{
              position: "absolute",
              inset: isMobile ? 6 : 8,
              overflow: "hidden",
              borderRadius: 24,
              background: canvasBg,
              cursor: panning ? "grabbing" : handMode ? "grab" : "default",
              touchAction: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`,
                transformOrigin: "0 0",
                transition: cameraEasing ? `transform ${SETTLE_MS}ms cubic-bezier(0.2, 0, 0, 1)` : undefined,
                willChange: "transform",
                visibility: viewReady ? "visible" : "hidden",
                fontFamily: fontFamilyOf(theme.font, lang),
              }}
            >
              {frame === "phone" &&
                frames.map((f) => {
                  const on = f.id === selectedFrameId;
                  const bg = screenBackground(p[f.bg ?? "surface"], theme);
                  const { w, h: fold } = frameSizeOf(f);
                  const h = frameLengthOf(f);
                  const radius = frameRadius(f);
                  const sizes = defEdit ? 1 : familyOf(frames, f.id).length;
                  return (
                    <div
                      key={f.id}
                      data-frame={f.id}
                      style={{ position: "absolute", left: f.x, top: f.y, transition: easing ? `left ${SETTLE_MS}ms cubic-bezier(0.2, 0, 0, 1)` : undefined }}
                    >
                      <div
                        onPointerDown={(e) => onFramePointerDown(e, f)}
                        style={{
                          position: "absolute",
                          left: -BEZEL,
                          top: -BEZEL - FRAME_LABEL_H,
                          height: FRAME_LABEL_H,
                          /* follows the zoom, softened: a little larger when zoomed out, a little smaller when zoomed in */
                          transform: `scale(${clamp(1 / view.z, 0.7, 1.4)})`,
                          transformOrigin: "left bottom",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "0 8px",
                          fontSize: 20,
                          fontWeight: 600,
                          color: on ? p.primary : p.onSurfaceVariant,
                          transition: "color 160ms",
                          cursor: handMode ? "grab" : "move",
                          userSelect: "none",
                          whiteSpace: "nowrap",
                          fontFamily: uiFontFamily(lang),
                        }}
                      >
                        {!defEdit && (
                          <div onPointerDown={(e) => e.stopPropagation()}>
                            <FrameSizePicker frame={f} onChange={(preset) => setFramePreset(f.id, preset)} palette={p} compact />
                          </div>
                        )}
                        {defEdit ? (components?.find((c) => c.id === defEdit.id)?.name ?? f.name) : f.name || t("screen", lang)}
                        {/* sizes of one screen share a name, so each says which size it is */}
                        {sizes > 1 && (
                          <span data-variant-label style={{ padding: "2px 10px", borderRadius: 12, background: p.secondaryContainer, color: p.onSecondaryContainer, fontSize: 14, fontWeight: 600 }}>
                            {sizeWord(f, lang)}
                          </span>
                        )}
                      </div>
                      <div
                        onPointerDown={(e) => onFramePointerDown(e, f)}
                        style={{
                          position: "absolute",
                          left: -BEZEL,
                          top: -BEZEL,
                          overflow: "hidden",
                          width: w + BEZEL * 2,
                          height: h + BEZEL * 2,
                          borderRadius: radius + BEZEL,
                          /* the chosen screen's bezel is painted in the theme's primary; the others stay dark, in a dark design too */
                          backgroundColor: on ? p.primary : theme.dark ? p.surfaceContainerHighest : p.inverseSurface,
                          backgroundImage: draftBusy ? draftGradient(p) : undefined,
                          backgroundSize: draftBusy ? "300% 300%" : undefined,
                          animation: draftBusy ? "m3e-drift 3s ease-in-out infinite" : undefined,
                          boxShadow: on ? "0 18px 50px rgba(0,0,0,0.16)" : "0 18px 50px rgba(0,0,0,0.14)",
                          cursor: handMode ? "grab" : "move",
                          transition: lengthDragId === f.id ? "background-color 160ms, box-shadow 120ms" : `background-color 160ms, box-shadow 120ms, ${SIZE_TRANSITION}`,
                        }}
                      >
                        <AnimatePresence>{aiFrameId === f.id && <ThinkingRing key="ring" p={p} frame={f} />}</AnimatePresence>
                        <div
                          data-screen={f.id}
                          style={{
                            position: "absolute",
                            left: BEZEL,
                            top: BEZEL,
                            width: w,
                            height: h,
                            borderRadius: radius,
                            background: bg,
                            overflow: "hidden",
                            transition: lengthDragId === f.id ? undefined : SIZE_TRANSITION,
                          }}
                        >
                          {/* a mockup to trace lies under everything, and takes no pointer */}
                          {f.backgroundImage && <img data-trace-image alt="" src={f.backgroundImage} draggable={false} style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "auto", opacity: f.backgroundOpacity ?? TRACE_OPACITY, pointerEvents: "none" }} />}
                          {groups
                            .filter((g) => frameOf.get(g.id) === f.id && !offTab.has(g.id))
                            .map((g) => renderGroup(g, f.x, f.y, frameSizeOf(f)))}
                          {f.deviceBars && takesDeviceBars(f) && <DeviceBars p={p} bg={f.bg ?? "surface"} height={fold} zIndex={3} />}
                          {/* where the device ends on a screen that runs further: below it, the body scrolls */}
                          {h > fold && (
                            <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: fold, borderTop: `2px dashed ${p.outline}`, opacity: 0.6, pointerEvents: "none", zIndex: 2 }} />
                          )}
                          {draftBusy && (
                            <div style={{ position: "absolute", inset: 0, zIndex: 90, background: canvasBg, display: "grid", placeItems: "center" }}>
                              <LoadingIndicator size={96} color="url(#m3e-drafting)" />
                            </div>
                          )}
                        </div>
                      </div>
                      {/* the chosen screen's length grip, a small nub on its bottom bezel: drag it down and the body runs on */}
                      {on && !handMode && !draftBusy && (
                        <div
                          role="slider"
                          tabIndex={0}
                          aria-label={t("screenLength", lang)}
                          aria-valuemin={selectedMinLength}
                          aria-valuemax={maxFrameLength(f)}
                          aria-valuenow={h}
                          onPointerDown={(e) => onLengthHandleDown(e, f)}
                          onKeyDown={(e) => onLengthHandleKey(e, f)}
                          style={{
                            position: "absolute",
                            left: w / 2 - 32,
                            top: h - 4,
                            width: 64,
                            height: BEZEL + 8,
                            display: "grid",
                            placeItems: "center",
                            transform: `scale(${clamp(1 / view.z, 1, 2)})`,
                            cursor: "ns-resize",
                            touchAction: "none",
                            zIndex: 1,
                            transition: lengthDragId === f.id ? undefined : `top ${SETTLE_MS}ms cubic-bezier(0.2, 0, 0, 1)`,
                          }}
                        >
                          <div style={{ width: 40, height: 4, borderRadius: 2, background: p.onPrimary, opacity: 0.9 }} />
                        </div>
                      )}
                    </div>
                  );
                })}

              {groups
                .filter((g) => !frameOf.has(g.id) && !offTab.has(g.id))
                .map((g) => renderGroup(g, 0, 0))}

              {/* a lone button shows a handle on each of its four edges, and a lone icon button
                  four points around its circle: dragging one changes the part's size in place,
                  and whatever sits opposite stays where it is */}
              {!handMode && !drag && selectedIds.length === 1 && selected && !!componentAxes(selected) && (() => {
                /* an instance is as big as what its definition comes to: there is nothing to pull */
                const g = groups.find((x) => x.items.length === 1 && !x.free && !x.locked && !x.instanceOf && x.items[0].id === selected.id);
                if (!g) return null;
                const b = groupBounds(g, widths);
                /* the same offset the group is drawn with while its left or top edge is being dragged */
                const sx = widthShift?.gid === g.id ? widthShift.dx : 0;
                const sy = widthShift?.gid === g.id ? widthShift.dy : 0;
                return (
                  <SizeHandles
                    /* the handles belong to this one part: another part picked gets its own, in
                     * place, rather than these flying across the canvas to it */
                    key={selected.id}
                    /* one measure, so the part is held by the points around it rather than by its edges */
                    round={!componentAxes(selected)?.width && !componentAxes(selected)?.height}
                    /* a bar has a width and nothing else: it is held by its two ends; one with only a
                     * height by its top and bottom; a part with both by all four edges */
                    sides={(() => {
                      const ax = componentAxes(selected);
                      return ax?.width && !ax.height ? BAR_SIDES : ax?.height && !ax.width ? TALL_SIDES : undefined;
                    })()}
                    box={{ l: b.l + sx, t: b.t + sy, r: b.r + sx, b: b.b + sy }}
                    z={view.z}
                    instant={widthDragId === selected.id}
                    p={p}
                    onDown={(e, side) => onWidthHandleDown(e, g, selected, side)}
                    onNudge={(side, dir) => nudgeSize(selected, side, dir)}
                  />
                );
              })()}


              {visibleLinks.length > 0 && (
                <svg
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    overflow: "visible",
                    pointerEvents: "none",
                  }}
                  width={1}
                  height={1}
                >
                  <defs>
                    <marker
                      id="m3e-arrow"
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="8"
                      markerHeight="8"
                      orient="auto"
                    >
                      <path d="M0 0 L10 5 L0 10 z" fill={p.primary} />
                    </marker>
                  </defs>
                  {!draftBusy && visibleLinks.map((l) => {
                    const on = l.id === selectedLinkId;
                    return (
                      <g key={l.id}>
                        <path
                          d={l.d}
                          fill="none"
                          stroke="transparent"
                          strokeWidth={18 / view.z}
                          style={{ pointerEvents: "stroke", cursor: "pointer" }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setSelectedLinkId(l.id);
                            setSelectedIds([]);
                            setSelectedFrameId(null);
                          }}
                        />
                        <path
                          d={l.d}
                          fill="none"
                          stroke={p.primary}
                          strokeWidth={on ? 3 : 2}
                          strokeDasharray={on ? undefined : "6 6"}
                          strokeLinecap="round"
                          markerEnd="url(#m3e-arrow)"
                          opacity={on ? 1 : 0.7}
                        />
                      </g>
                    );
                  })}
                </svg>
              )}

              {visibleLinks
                .filter((l) => l.id === selectedLinkId)
                .map((l) => (
                  <div
                    key={l.id}
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{
                      position: "absolute",
                      left: l.mx,
                      top: l.my,
                      transform: `translate(-50%, 14px) scale(${1 / view.z})`,
                      transformOrigin: "50% 0",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: 6,
                      borderRadius: 26,
                      background: p.surfaceContainerLow,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.16)",
                      zIndex: 60,
                    }}
                  >
                    <Segmented<Transition>
                      options={TRANSITIONS.map((t) => ({
                        key: t.key,
                        icon: t.icon,
                        title: t.label,
                      }))}
                      value={l.t}
                      onChange={(t) => setLinkTransition(l.id, t)}
                      p={p}
                      height={36}
                      grow={false}
                    />
                    <IconBtn
                      icon="link_off"
                      p={p}
                      danger
                      onClick={() => removeLink(l.id)}
                      title={t("removeLink", lang)}
                      size={36}
                    />
                  </div>
                ))}

              {flowHintBox && (
                <div
                  data-flow-hint
                  style={{
                    position: "absolute",
                    left: flowHintBox.l,
                    top: flowHintBox.t,
                    width: flowHintBox.r - flowHintBox.l,
                    height: flowHintBox.b - flowHintBox.t,
                    /* the layout is outlined thinly; the slot inside it is what stands out */
                    border: `${1 / view.z}px solid ${p.primary}`,
                    borderRadius: 12 / view.z,
                    pointerEvents: "none",
                  }}
                />
              )}
              {flowSlot && <InsertionMark line={flowSlot.line} z={view.z} p={p} />}
              {joinHint && (
                <div
                  data-join-hint
                  style={{
                    position: "absolute",
                    left: joinHint.l - 4 / view.z,
                    top: joinHint.t - 4 / view.z,
                    width: joinHint.r - joinHint.l + 8 / view.z,
                    height: joinHint.b - joinHint.t + 8 / view.z,
                    border: `${2 / view.z}px dashed ${p.primary}`,
                    borderRadius: 12 / view.z,
                    pointerEvents: "none",
                  }}
                />
              )}
              {guide && !flowSlot && <SmartGuides lines={guide.lines} gaps={guide.gaps} z={view.z} p={p} avoid={guideAvoid} />}
              {resizeGuide && <SmartGuides lines={resizeGuide.lines} gaps={resizeGuide.gaps} z={view.z} p={p} />}
              {measure && !guide && <SmartGuides lines={[]} gaps={measure.gaps} z={view.z} p={p} avoid={measure.avoid} />}

              {marquee && (
                <div
                  style={{
                    position: "absolute",
                    left: Math.min(marquee.x0, marquee.x1),
                    top: Math.min(marquee.y0, marquee.y1),
                    width: Math.abs(marquee.x1 - marquee.x0),
                    height: Math.abs(marquee.y1 - marquee.y0),
                    border: `${1 / view.z}px solid ${p.primary}`,
                    background: `${p.primary}14`,
                    borderRadius: 4 / view.z,
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>
          </div>

          {draftBusy && (
            <div style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} aria-hidden>
              <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
                <defs>
                  <linearGradient id="m3e-drafting" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={p.primary} />
                    <stop offset="50%" stopColor={p.tertiaryContainer} />
                    <stop offset="100%" stopColor={p.primaryContainer} />
                    <animateTransform attributeName="gradientTransform" type="rotate" from="0 0.5 0.5" to="360 0.5 0.5" dur="3s" repeatCount="indefinite" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          )}
          {defEdit && (
            <div
              data-definition-bar
              style={{ position: "absolute", left: "50%", bottom: 24, transform: "translateX(-50%)", zIndex: 45, display: "flex", alignItems: "center", gap: 12, padding: "8px 8px 8px 20px", borderRadius: 28, background: p.surface, boxShadow: "0 4px 18px rgba(0,0,0,0.14)", color: p.onSurface, whiteSpace: "nowrap" }}
            >
              <Icon name="widgets" size={20} color={p.primary} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {t("editingComponent", lang)}: {components?.find((c) => c.id === defEdit.id)?.name}
              </span>
              <button onClick={finishDefinition} data-definition-done className="m3-press" style={{ height: 40, padding: "0 20px", borderRadius: 20, border: "none", background: p.primary, color: p.onPrimary, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                {t("doneEditing", lang)}
              </button>
            </div>
          )}
          <Toolbar
            p={p}
            mode={mode}
            onMode={setMode}
            frame={frame}
            onFrame={changeFrame}
            zoom={view.z}
            onZoom={(z) => setZoomAt(z)}
            onFit={fit}
            allLinks={showAllLinks}
            onAllLinks={() => setShowAllLinks((on) => !on)}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={undo}
            onRedo={redo}
            onClear={() => {
              if (groupsRef.current.length || framesRef.current.length) setConfirmClear(true);
            }}
            onAddFrame={addFrame}
            addFrameBlocked={!!defEdit}
            onPreview={() => openPreview()}
            tidy={selectedIds.length > 1 ? undefined : tidyState ?? undefined}
            onTidyUp={selectedIds.length > 1 ? tidyUpSelected : undefined}
            onAutoLayout={selectedIds.length > 1 ? autoLayoutSelected : undefined}
            onTidy={tidyTarget ? () => tidy(tidyTarget) : undefined}
            place={tidyTarget?.place}
            onPlace={tidyTarget ? (pl) => setPlace(tidyTarget, pl) : undefined}
            note={aiNote}
            onSaveProject={() => saveProject(doc)}
            onOpenProject={() => projectFileRef.current?.click()}
            onShare={!isMobile ? () => setShareOpen(true) : undefined}
            shareState={draftBusy ? "busy" : draftBefore ? "review" : "idle"}
            onDraftKeep={keepDraft}
            onDraftUndo={undoDraft}
            onDraftSave={() => saveProject(doc)}
            quickUndo={quickUndo}
            onAddParts={isMobile && !defEdit ? () => setSheet(sheet === "add" ? null : "add") : undefined}
            rightInset={showRight ? rightW : 0}
            mobile={isMobile}
            onSettings={() => setSheet(sheet === "settings" ? null : "settings")}
            onLangSheet={() => setSheet(sheet === "lang" ? null : "lang")}
            onPrompt={async () => {
              try {
                await navigator.clipboard.writeText(effectivePrompt(doc, widths, lang));
                showToast(t("copied", lang), 1400, "check");
              } catch {}
            }}
          />

          {isMobile && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 80,
                textAlign: "center",
                fontSize: 11,
                lineHeight: 1.4,
                color: p.onSurfaceVariant,
                pointerEvents: "none",
                zIndex: 40,
              }}
            >
              {t("mobileNote", lang)}
            </div>
          )}

          {isMobile && selected && sheet === null && (
            <MobileActionBar
              p={p}
              onEdit={() => setSheet("edit")}
              onDuplicate={duplicateSelected}
              onDelete={deleteSelected}
            />
          )}

          <AnimatePresence>
            {isMobile && sheet === "edit" && selected && (
              <BottomSheet key="edit" p={p} onClose={() => setSheet(null)}>
                {selectedInstance ? (
                  /* an instance is what its definition comes to: the empty container standing in for it has nothing to edit.
                     A definition is only opened on a desktop, so this leaves that way out */
                  <InstanceInspector
                    group={selectedInstance.group}
                    def={selectedInstance.def}
                    components={selectedInstance.components}
                    onDetach={selectedInstance.onDetach}
                    onOverrides={selectedInstance.onOverrides}
                    palette={p}
                    locked={selectedLocked}
                    inFlow={selectedInFlow}
                    onToggleLock={toggleLockSelected}
                    onDuplicate={duplicateSelected}
                    onDelete={() => {
                      deleteSelected();
                      setSheet(null);
                    }}
                    selectionKey={selectedIds.join(" ")}
                  />
                ) : (
                  <MobileInspector
                    item={selected}
                    palette={p}
                    inFlow={selectedInFlow}
                    onChange={patchSelected}
                    onDelete={() => {
                      deleteSelected();
                      setSheet(null);
                    }}
                    onDuplicate={duplicateSelected}
                    onClose={() => setSheet(null)}
                  />
                )}
              </BottomSheet>
            )}
            {isMobile && sheet === "add" && (
              /* the palette as the desktop has it, tiers and search, where a tap adds a part to the screen shown */
              <BottomSheet key="add" p={p} onClose={() => setSheet(null)}>
                <div data-add-sheet style={{ height: "62vh", margin: "0 -14px -16px" }}>
                  <PartsPalette
                    palette={p}
                    favorites={favorites}
                    onToggleFavorite={(k) => setFavorites((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]))}
                    onPartActivate={addPart}
                    onKitActivate={addKit}
                    kitLook={kitLookOf(theme)}
                  />
                </div>
              </BottomSheet>
            )}
            {isMobile && sheet === "settings" && (
              <BottomSheet key="settings" p={p} onClose={() => setSheet(null)}>
                <MobileSettings palette={p} paletteKey={paletteKey} onPalette={pickPalette} theme={theme} onTheme={patchTheme} onStyle={pickStyle} />
              </BottomSheet>
            )}
            {isMobile && sheet === "lang" && (
              <BottomSheet key="lang" p={p} onClose={() => setSheet(null)}>
                <MobileLang
                  palette={p}
                  lang={lang}
                  onLang={(l) => {
                    changeLanguage(l);
                    setSheet(null);
                  }}
                />
              </BottomSheet>
            )}
          </AnimatePresence>

          {toast && (
            <div
              role="status"
              style={{
                position: "absolute",
                left: "50%",
                bottom: 96,
                transform: "translateX(-50%)",
                width: "max-content",
                maxWidth: "calc(100% - 32px)",
                padding: toast.action ? "6px 6px 6px 18px" : "10px 18px",
                borderRadius: 20,
                background: p.inverseSurface,
                color: p.inverseOnSurface,
                fontSize: 13,
                fontWeight: 600,
                zIndex: 47,
                pointerEvents: toast.action ? "auto" : "none",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ minWidth: 0 }}>{toast.text}</span>
              {toast.action && (
                <button onClick={toast.action.run} data-toast-action className="m3-press" style={{ flex: "0 0 auto", height: 32, padding: "0 12px", borderRadius: 16, border: "none", background: "transparent", color: p.inversePrimary, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  {toast.action.label}
                </button>
              )}
            </div>
          )}

          {!rightOpen && !isMobile && (
            <div
              style={{ position: "absolute", right: 20, top: 20, zIndex: 45 }}
            >
              <IconBtn
                icon="right_panel_open"
                p={p}
                on
                onClick={() => setRightOpen(true)}
                title={t("edit", lang)}
                size={44}
              />
            </div>
          )}
        </main>

        {/* ---- right: inspector / prompt ---- */}
        {showRight && (
          <aside style={{ ...panelStyle, width: rightW }}>
            <div
              onPointerDown={(e) => {
                e.preventDefault();
                setResizing("right");
              }}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: -3,
                width: 6,
                cursor: "col-resize",
                zIndex: 5,
              }}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                /* the close button lands exactly where the button that reopens the panel sits */
                padding: "20px 20px 8px 16px",
                /* the band is the panel's own colour; the strip below it carries the fade */
                background: p.surface,
                /* while the prompt stands full screen the band has nothing to do: it fades out as the cover opens and back in as it closes */
                opacity: promptCoverUp ? 0 : 1,
                pointerEvents: promptCoverUp ? "none" : undefined,
                transition: "opacity 220ms ease",
              }}
              inert={promptCoverUp || undefined}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <Segmented<"edit" | "prompt">
                  options={[
                    { key: "edit", icon: "tune", title: t("edit", lang), grow: false, wide: true },
                    { key: "prompt", icon: "auto_awesome", label: t("prompt", lang), title: t("prompt", lang), grow: true },
                  ]}
                  value={rightTab}
                  onChange={setRightTab}
                  p={p}
                  height={40}
                />
              </div>
              {/* the same button in the same spot as the one that reopens the panel, but plain:
                * the filled look belongs to the one that has to be found over the canvas */}
              <IconBtn
                icon="right_panel_close"
                p={p}
                size={44}
                onClick={() => setRightOpen(false)}
                title={t("closePanel", lang)}
              />
            </div>
            <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
              {/* what scrolls past the top of the panel dissolves into the band instead of being cut */}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: PANEL_FADE_H,
                  zIndex: 3,
                  background: `linear-gradient(to bottom, ${p.surface}, ${p.surface}00)`,
                  pointerEvents: "none",
                }}
              />
              {rightTab === "edit" && selectedFrame && !selected ? (
                <FrameInspector
                  frame={selectedFrame}
                  palette={p}
                  onSize={(preset) => setFramePreset(selectedFrame.id, preset)}
                  onPhoneModel={setPhoneModel}
                  onResize={(w, h) => resizeFrame(selectedFrame.id, { w, h })}
                  onChange={(patch) => patchFrame(selectedFrame.id, patch)}
                  onDelete={() => deleteFrame(selectedFrame.id)}
                  onDuplicate={() => duplicateFrame(selectedFrame.id)}
                  onPreview={() => openPreview(selectedFrame.id)}
                  prompt={() => buildPrompt(doc, widths, selectedFrame.id, lang)}
                  onSaveImage={() => saveFrameImage(selectedFrame)}
                  onSaveAllImages={frames.length > 1 ? saveAllFrameImages : undefined}
                  tidy={tidyState ?? "done"}
                  onTidy={() => tidy(selectedFrame)}
                  onSuggestLayout={() => autoLayoutScreen(selectedFrame)}
                  onPlace={(pl) => setPlace(selectedFrame, pl)}
                  canCombine={canCombine && tidyTarget?.id === selectedFrame.id}
                  onCombine={() => combine(selectedFrame)}
                  minLength={selectedMinLength}
                  onLength={(length) => setFrameLength(selectedFrame.id, length)}
                  ai={{ ready: aiReady, reason: aiReason, busy: aiBusy && aiFrameId === selectedFrame.id, onRun: () => runAi("describe", selectedFrame), onCancel: cancelAi }}
                  variants={{
                    family: familyOf(frames, selectedFrame.id),
                    missing: missingSizes(frames, selectedFrame.id),
                    onCreate: (preset) => createVariantOf(selectedFrame.id, preset),
                    onJump: (id) => {
                      setSelectedFrameId(id);
                      const f = frames.find((x) => x.id === id);
                      if (f) glideToFrame(f);
                    },
                  }}
                />
              ) : rightTab === "edit" ? (
                <Inspector
                  ai={{
                    ready: aiReady && !!tidyTarget,
                    reason: aiReason,
                    busy: aiBusy,
                    onRun: () => {
                      if (tidyTarget && selected) runAi("behavior", tidyTarget, selected.id);
                    },
                    onCancel: cancelAi,
                  }}
                  item={selectedIds.length > 1 ? null : selected}
                  frame={selectedPartFrame}
                  palette={p}
                  frames={frame === "phone" ? frames : []}
                  onChange={patchSelected}
                  onDelete={deleteSelected}
                  onDuplicate={duplicateSelected}
                  locked={selectedLocked}
                  onToggleLock={toggleLockSelected}
                  onPlace={selectionPlaceable ? placeSelected : undefined}
                  selfRect={selectedRect}
                  allFrames={frames}
                  multi={selectedIds.length}
                  grouped={!!selectedGroup}
                  selectionWhole={selectionWhole}
                  selectionKey={selectedIds.join(" ")}
                  onGroup={groupSelected}
                  onUngroup={ungroupSelected}
                  onAlign={alignSelected}
                  onDistribute={distributeSelected}
                  onAutoLayout={autoLayoutSelected}
                  onTidyUp={tidyUpSelected}
                  inFlow={selectedInFlow}
                  flowParent={selectedFlowParent}
                  onMoveTo={selectedInFlow && !selectedLoose ? undefined : moveSelectedTo}
                  onMakeComponent={makeComponentOfSelection}
                  onSplit={splitSelected}
                  instance={selectedInstance}
                />
              ) : (
                <PromptPanel
                  doc={doc}
                  widths={widths}
                  palette={p}
                  onCover={setPromptCoverUp}
                  onDoc={(patch) =>
                    runOp(ops.setPrompt, {
                      ...(patch.title !== undefined ? { title: patch.title } : {}),
                      ...(patch.brief !== undefined ? { brief: patch.brief } : {}),
                      ...("promptEdit" in patch ? { promptEdit: patch.promptEdit ?? null } : {}),
                      ...("promptOptions" in patch ? { promptOptions: patch.promptOptions ?? null } : {}),
                    })
                  }
                />
              )}
            </div>
          </aside>
        )}

        <input
          ref={projectFileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void readProject(file).then((next) => (next ? setPendingImport(next) : showToast(t("invalidProject", lang), 3000, "error")));
          }}
        />

        <ConfirmDialog
          open={pendingImport !== null}
          icon="file_open"
          title={t("replaceProjectTitle", lang)}
          body={t("replaceProject", lang)}
          p={p}
          onCancel={() => setPendingImport(null)}
          onConfirm={() => {
            if (pendingImport) importDoc(pendingImport);
            setPendingImport(null);
          }}
        />

        <ShareDialog
          p={p}
          doc={doc}
          widths={widths}
          aiReady={aiReady}
          idea={ideaText}
          onIdea={setIdeaText}
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          onDraft={(idea) => void startDraft(idea)}
          onSetupAi={() => {
            setShareOpen(false);
            setLeftOpen(true);
            setLeftTab("ai");
          }}
        />


        <ConfirmDialog
          open={confirmClear}
          title={t("clearAllTitle", lang)}
          body={t("clearAllBody", lang)}
          p={p}
          onCancel={() => setConfirmClear(false)}
          onConfirm={clearAll}
        />
      </div>

      <AnimatePresence>
        {previewId !== null && frames.length > 0 && (
          <Preview
            key="preview"
            doc={previewDoc}
            widths={widths}
            palette={p}
            startId={previewId}
            onClose={closePreview}
          />
        )}
      </AnimatePresence>

      {editAccess === "readonly" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-access-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "grid",
            placeItems: "center",
            padding: 24,
            background: "rgba(0,0,0,0.32)",
          }}
        >
            <div
              style={{
                width: "min(420px, 100%)",
                padding: 24,
                borderRadius: 28,
                background: p.surfaceContainerHigh,
                color: p.onSurface,
                boxShadow: "0 12px 40px rgba(0,0,0,0.22)",
              }}
            >
              <Icon name="lock" size={28} />
              <h1 id="edit-access-title" style={{ margin: "16px 0 8px", fontSize: 22, lineHeight: 1.25 }}>
                {t("readOnlyTitle", lang)}
              </h1>
              <p style={{ margin: 0, color: p.onSurfaceVariant, fontSize: 14, lineHeight: 1.5 }}>
                {t("readOnlyBody", lang)}
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
                <button
                  autoFocus
                  className="m3-press"
                  onClick={() => window.location.reload()}
                  style={{
                    minHeight: 40,
                    padding: "0 20px",
                    border: "none",
                    borderRadius: 20,
                    background: p.primary,
                    color: p.onPrimary,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {t("reload", lang)}
                </button>
              </div>
            </div>
        </div>
      )}
    </StyleRulesContext.Provider>
    </BehaviorContext.Provider>
    </PartThemeContext.Provider>
    </LangContext.Provider>
  );
}
