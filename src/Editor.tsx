
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { toPng } from "html-to-image";
import { buildPrompt, effectivePrompt } from "@/lib/prompt";
import {
  actionsOf,
  ComponentDef,
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
  Group,
  groupBounds,
  Item,
  heldBy,
  layoutOf,
  Theme,
  fontFamilyOf,
  uiFontFamily,
  Palette,
  paletteOf,
  seedOf,
  shapeScaleOf,
  SETTLE_CSS_VARS,
  SETTLE_MS,
  Transition,
  TRANSITIONS,
  uid,
  takesDeviceBars,
  TRACE_OPACITY,
} from "@/lib/tokens";
import { DeviceBars } from "@/components/DeviceBars";
import { Icon } from "@/components/Icon";
import { ComponentNode } from "@/components/ComponentNode";
import { PartView } from "@/components/PartView";
import { SizeHandles } from "@/components/SizeHandles";
import { LayersPanel } from "@/components/Layers";
import { FrameSizePicker, Inspector } from "@/components/Inspector";
import { FrameInspector } from "@/components/FramePanel";
import { Preview } from "@/components/Preview";
import { Logo } from "@/components/Logo";
import { PartsPalette } from "@/components/PartsPalette";
import { TemplatesPanel } from "@/components/TemplatesPanel";
import { PromptPanel } from "@/components/PromptPanel";
import { GitHubLink, Mode, Toolbar } from "@/components/Toolbar";
import { LangMenu } from "@/components/Menus";
import { AiPanel } from "@/components/AiPanel";
import { TidyState, PANEL_FADE_H } from "@/components/ui";
import { loadAiSettings, scenePrompt } from "@/lib/ai";
import { holdsEdgeBar, maxFrameLength, minFrameLength, tidyFrame } from "@/lib/tidy";
import { combineButtons, joinTargetOf } from "@/lib/combine";
import { type AlignHow } from "@/lib/align";
import { childLayoutOf, flowHostAt, flowOf, outOfPane, showingGroups } from "@/lib/flow";
import { targetRects } from "@/lib/guides";
import { InsertionMark, SmartGuides } from "@/components/SmartGuides";
import { canNest, expandInstances } from "@/lib/instances";
import { canvasView, expandDoc, type CanvasView } from "@/lib/expand";
import { repeatAround } from "@/lib/collections";
import { familyOf, missingSizes } from "@/lib/variants";
import { ComponentsPanel, DataPanel, InstanceInspector, sizeWord } from "@/components/ReusePanels";
import { Behavior, BehaviorContext, StyleRulesContext } from "@/components/EffectsPanel";
import { readProject, saveProject } from "@/lib/project";
import { LoadingIndicator } from "@/components/Loading";
import { isNavPart, mergeLinks, routeLink, shownLinks, type LinkLine, type Route } from "@/lib/links";
import { ShareDialog } from "@/components/ShareMenu";
import { ColorPanel } from "@/components/ColorPanel";
import { MotionPanel, ShapePanel, TypePanel } from "@/components/ThemePanel";
import { ensureFontLoaded, ensureLangFontLoaded } from "@/lib/theme";
import { PartStyleSheet, PartThemeContext, PartThemeStyle, type PartTheme } from "@/parts/theme";
import { artOf, isStrict, screenBackground } from "@/lib/styles";
import { tidyLook } from "@/lib/look";
import { metricsOf } from "@/lib/styleLayout";
import { useIconFamily } from "@/parts/icons";
import { StyleGate, StylePanel } from "@/components/StylePanel";
import { partBySlug, reader } from "@/parts/registry";
import { templateBySlug } from "@/parts/templates";
import { kitOfKey } from "@/parts/kits";
import { defaultMeasures } from "@/parts/templates/kit";
import { kitLookOf, moveTo, treeSize } from "@/lib/kits";
import { BottomSheet, MobileActionBar, MobileInspector, MobileLang, MobileSettings } from "@/components/Mobile";
import { ConfirmDialog, IconBtn, Segmented } from "@/components/ui";
import { Lang, LangContext, getLang, setGlobalLang, t } from "@/lib/i18n";
import { OpError, ops, savedDoc, translateSnapshot, withDoc, withFrames, withGroups, type Op, type TxOptions } from "@/lib/core";
import { useStore } from "@/lib/core/react";
import { localPersist, type PersistAdapter } from "@/lib/core/persist";
import { freshPart, freshSize } from "@/lib/core/ops/common";
import { buildKit as buildKitGroups, clipOf, movedGroups, type Clip, type GroupPatch } from "@/lib/core/ops/nodes";
import { ensureScreen } from "@/lib/core/ops/screens";
import { editorStore } from "./editor/store";
import { useViewport } from "./editor/useViewport";
import { useMeasure } from "./editor/useMeasure";
import { usePersistence } from "./editor/usePersistence";
import { useShortcuts } from "./editor/useShortcuts";
import { mobileSeed, seed, SEED_FRAMES } from "./editor/seed";
import { ThinkingRing } from "./editor/ThinkingRing";
import { drawnParts, renderExport, renderGroup as drawGroup, type GroupView } from "./editor/render";
import { useGap } from "./editor/useGap";
import { useGuides } from "./editor/useGuides";
import { useNotes } from "./editor/useNotes";
import { useAi } from "./editor/useAi";
import { useDrafts } from "./editor/useDrafts";
import { useStyleLayout } from "./editor/useStyleLayout";
import { usePreview } from "./editor/usePreview";
import { useSizeHandles } from "./editor/useSizeHandles";
import { useGestures } from "./editor/useGestures";
import { usePartDrag } from "./editor/usePartDrag";
import {
  BAR_SIDES,
  CARRIED,
  carriedDrag,
  componentAxes,
  FRAME_MARGIN,
  groupRefusedMsg,
  LEFT_TABS,
  lockedGroupMsg,
  RAIL_W,
  SIZE_TRANSITION,
  slotIn,
  TALL_SIDES,
  UI_KEY,
  VANISH,
  type DragState,
  type Gesture,
  type LeftTab,
  type View,
} from "./editor/model";

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
  /* The document is its own screens and parts even while a definition is open: that definition is
   * what stands on the editing screen, as far as it has got (lib/core `savedDoc`). */
  const doc: Doc = useMemo(() => savedDoc(core), [core.doc, core.editing, widths]);
  /** the same document, for callbacks that were created on an earlier render */
  const docRef = useRef(doc);
  docRef.current = doc;
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

  /* ---------- editor ui ---------- */
  /** screens ease to their new place and size for a moment after one changes size */
  const [easing, setEasing] = useState(false);
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
  const [resizing, setResizing] = useState<"left" | "right" | null>(null);
  /* ---------- tidy and ai ---------- */
  /** the groups before and after the last tidy; "undo" is offered only while the after-state is still current */
  const tidyRef = useRef<{ frameId: string; before: Group[]; after: Group[] } | null>(null);
  const projectFileRef = useRef<HTMLInputElement>(null);

  const p = useMemo(() => paletteOf(paletteKey, customPalette, theme), [paletteKey, customPalette, theme]);
  /* corner helpers read the shape scale outside React; keep it current before anything renders */
  /* the shadcn M3E components are drawn in the same scheme the code asks for: the sketch's seed color */
  const partTheme = useMemo<PartTheme>(
    () => ({ seed: seedOf(paletteKey, customPalette, theme), dark: theme.dark, contrast: theme.contrast, shape: shapeScaleOf(theme.shape) }),
    [paletteKey, customPalette, theme],
  );

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
  const leftOpenRef = useRef(leftOpen);
  leftOpenRef.current = leftOpen;
  const leftWRef = useRef(leftW);
  leftWRef.current = leftW;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const spaceRef = useRef(spaceHeld);
  spaceRef.current = spaceHeld;
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const mobileRef = useRef(isMobile);
  mobileRef.current = isMobile;
  /* the short messages: a pill beside the tidy button, a toast on a phone (src/editor/useNotes.ts) */
  const { toast, aiNote, showToast, showAiNote } = useNotes(mobileRef);
  /* the camera: pan, zoom, fit, glide; two fingers give up whatever one finger started */
  const { view, setView, viewRef, viewReady, setViewReady, cameraEasing, canvasRef, canvasRect, inCanvas, toWorld, setZoomAt, fit, fitRef, onTouchCapture, glide, glideToFrame } = useViewport({
    groupsRef,
    framesRef,
    widthsRef,
    frameRef,
    mobileRef,
    onPinch: () => {
      dragRef.current = null;
      setDrag(null);
      setPressedId(null);
      gestureRef.current = null;
      setGesture(null);
    },
  });
  /* the preview, opened from a screen and closed back to the view it left (src/editor/usePreview.ts) */
  const { previewId, openPreview, closePreview, leavePreview } = usePreview({ frame, selectedFrameId, framesRef, viewRef, canvasRect, glide, changeFrame: (m) => changeFrame(m) });
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

  /* ---------- ai ---------- */
  /* the author's model writing a field or painting a scene (src/editor/useAi.ts) */
  const { aiSettings, setAiSettings, updateAiSettings, aiReady, aiBusy, aiFrameId, runAi, cancelAi, canPaint, paintingScene, sceneItem, paintScenes, stopPainting } = useAi({ lang, theme, doc, groupsRef, widthsRef, snapshot, setGroups, setFrames, showToast, showAiNote });

  /* ---------- persistence ---------- */
  /** What a whole document arriving does to what was open over the one it replaces: the preview closes (or an opening
   *  still on its way is dropped), and a style's layout still to come is not for it. */
  const leaveForNewDoc = () => {
    leavePreview();
    relayoutRef.current = null;
  };

  /* a project file, a design from a link or a draft from the model taking the canvas (src/editor/useDrafts.ts) */
  const { ideaText, setIdeaText, draftBusy, draftBefore, setDraftBefore, revealing, quickUndo, setQuickUndo, importDoc, startDraft, keepDraft, undoDraft, settleDraftRef } = useDrafts({ store, persist, editAccess, lang, aiSettings, mobileRef, docRef, themeRef, frameRef, hadDocRef, fitRef, leaveForNewDoc, setSelectedLinkId, setShareOpen, showToast, paintScenes, stopPainting });

  /** the editor's own settings as they were left: the camera, the panels, the favourites */
  const restoreUi = () => {
    const u = localStorage.getItem(UI_KEY);
    if (!u) {
      queueMicrotask(() => fitRef.current());
      return false;
    }
    const ui = JSON.parse(u);
    if (ui.view) setView(ui.view);
    if (typeof ui.leftOpen === "boolean") setLeftOpen(ui.leftOpen);
    if (typeof ui.rightOpen === "boolean") setRightOpen(ui.rightOpen);
    if (ui.leftW) setLeftW(Math.max(RAIL_W + 244, ui.leftW));
    if (ui.rightW) setRightW(ui.rightW);
    if (Array.isArray(ui.favorites)) setFavorites(ui.favorites.filter((f: unknown): f is string => typeof f === "string" && (!!partBySlug(f) || !!kitOfKey(f))));
    if (ui.mode) setMode(ui.mode);
    if (ui.showAllLinks === true) setShowAllLinks(true);
    return true;
  };

  /* the document saved last comes back, every change of it is written down, one tab edits (lib/core/persist.ts) */
  usePersistence({
    store,
    persist,
    docRef,
    docKey: [core.doc, core.editing],
    editAccess,
    setEditAccess,
    setDraftBefore,
    loadedRef,
    hadDocRef,
    initialLang,
    initialLangRef,
    leaveForNewDoc,
    restoreUi,
    seed: () => ({ groups: seed(initialLang), frames: [{ ...SEED_FRAMES[0], name: t("home", initialLang) }] }),
    onLoaded: () => {
      setAiSettings(loadAiSettings());
      loadedRef.current = true;
      /* the document is in state; one frame later it is on screen and the boot overlay may go.
         Not cancelled on cleanup: the development double-run skips this effect the second time. */
      requestAnimationFrame(() => onReadyRef.current?.());
    },
    showToast: (msg, ms, icon) => showToast(msg, ms, icon),
  });

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
  /* every part measured as drawn; screens whose parts came out another size laid out again by what they came to */
  const { retidyRef, freshFramesRef, newPhoneRef } = useMeasure({ store, measureEls, groupsRef, framesRef, widthsRef, themeRef });


  /* ---------- coordinates ---------- */
  /* only the open left panel accepts a drop for deletion; the narrow rail never does */
  const inBin = (clientX: number) =>
    !mobileRef.current && leftOpenRef.current && clientX >= 0 && clientX <= leftWRef.current;



  /* what a drag lines up with, and where every part stands on the canvas (src/editor/useGuides.ts) */
  const { guideCache, targetsFor, endGuides, overFlow, guideFor, itemRects } = useGuides({ groupsRef, framesRef, widthsRef, frameRef, themeRef, viewRef });

  /* ---------- pointer: parts ---------- */
  /** A kit's groups for the document as it is: in the variant asked for or the one its style calls for,
   *  in the editor's language, no wider than a phone's content. */
  const buildKit = (slug: string, variant: string | undefined, screen: Frame | undefined) => buildKitGroups(store.get(), slug, variant, screen, getLang());

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

  /* a lone part's size handles, pulled or stepped (src/editor/useSizeHandles.ts) */
  const { widthDragId, widthShift, resizeGuide, onWidthHandleDown, nudgeSize } = useSizeHandles({ snapshot, setGroups, instantRef, viewRef, widthsRef, targetsFor, endGuides, patchSelected: (patch) => patchSelected(patch) });


  /* ---------- pointer: canvas (pan / marquee) ---------- */

  const clearSelection = () => {
    setSelectedIds([]);
    setSelectedFrameId(null);
    setSelectedLinkId(null);
  };

  /* the hole a run keeps for a part carried out of it or into it (src/editor/useGap.ts) */
  const { gapOut, holdGap, closeGap } = useGap();
  /* the pointer on the canvas: pan, sweep, a group or a screen carried, Alt's measures (src/editor/useGestures.ts) */
  const { gesture, setGesture, startPan, onCanvasPointerDown, onFramePointerDown, measure } = useGestures({ dragRef, gestureRef, selectedIds, isMobile, mobileRef, modeRef, spaceRef, defEditRef, groupsRef, framesRef, widthsRef, viewRef, instantRef, toWorld, setView, inBin, snapshot, setGroups, setFrames, runOp, showToast, endGuides, guideFor, overFlow, itemRects, clearSelection, setSelectedIds, setSelectedFrameId, setSelectedLinkId, setRightTab });
  /* a part carried: out of its run, or new from the palette, the Components tab or a kit (src/editor/usePartDrag.ts) */
  const { drag, setDrag, pressedId, setPressedId, sx, sy, onItemPointerDown, onPartPointerDown, onComponentPointerDown, onKitPointerDown } = usePartDrag({
    dragRef,
    gestureRef,
    setGesture,
    startPan,
    modeRef,
    spaceRef,
    groupsRef,
    framesRef,
    widthsRef,
    componentsRef,
    defEditRef,
    viewRef,
    instantRef,
    toWorld,
    inCanvas,
    inBin,
    snapshot,
    setGroups,
    runOp,
    showToast,
    endGuides,
    guideFor,
    overFlow,
    holdGap,
    closeGap,
    setSelectedIds,
    setSelectedFrameId,
    setSelectedLinkId,
    setRightTab,
    buildKit,
    landKit,
    addPart: (slug) => addPartRef.current(slug),
    addInstance: (id) => addInstanceRef.current(id),
    addKit: (slug, variant) => addKitRef.current(slug, variant),
  });

  /* Containers with a layout put what they hold in its place after every change. It waits while
   * something is being carried, which is what lets a part be dragged out of its row or across it,
   * and it is part of whatever change caused it, so it never makes an undo step of its own. */
  const carrying = gesture !== null || !!drag;
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



  /* a style put on, its layout passes, a draft settled, a document held to its style's rules (src/editor/useStyleLayout.ts) */
  const { relayoutRef, pickStyle, setRules, relayout, patchUx } = useStyleLayout({ store, runOp, didOp, undo, showToast, theme, groups, frames, widths, drag, gesture, defEdit, previewId, groupsRef, framesRef, widthsRef, themeRef, dragRef, gestureRef, settleDraftRef, tidyRef, setGroups, setFrames, setWidths });



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

  const aiReason = !aiReady ? t("aiNoKey", lang) : !tidyTarget ? t("aiSelectScreen", lang) : undefined;


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



  /* the keyboard: undo, clipboard, grouping, layout keys, nudges, tools and zoom (src/editor/useShortcuts.ts) */
  useShortcuts({
    editable: editAccess === "editable",
    blocked: confirmClear || pendingImport !== null || shareOpen || previewId !== null || promptCoverUp,
    selectedIds,
    selectedFrameId,
    canPaste: () => !!clipboardRef.current,
    editingDefinition: () => !!defEditRef.current,
    undo,
    redo,
    duplicateSelected,
    duplicateFrame: (id) => duplicateFrameRef.current(id),
    copySelected,
    pasteClipboard,
    deleteSelected,
    deleteFrame,
    selectAll: () => selectAllRef.current(),
    groupSelected,
    ungroupSelected,
    tidyUp: () => layoutKeysRef.current.tidyUp(),
    tidyScreen: () => layoutKeysRef.current.tidyScreen(),
    autoLayout: () => layoutKeysRef.current.autoLayout(),
    finishDefinition: () => finishDefinitionRef.current(),
    clearSelection: () => {
      setSelectedIds([]);
      setSelectedFrameId(null);
      setSelectedLinkId(null);
    },
    openPreview: () => openPreviewRef.current(),
    nudge,
    stepLayers: stepSelectedLayers,
    setMode,
    setSpaceHeld,
    zoom: (dir) => setZoomAt(dir === "in" ? viewRef.current.z * 1.2 : viewRef.current.z / 1.2),
    fit: () => fitRef.current(),
  });
  const openPreviewRef = useRef(openPreview);
  openPreviewRef.current = openPreview;

  /* ---------- render ---------- */
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  /** what the preview plays: everything drawn out. With a definition open, that definition alone. */
  const previewDoc = useMemo(() => (previewId === null ? doc : expandDoc(defEdit ? { ...doc, groups, frames } : doc, widths)), [previewId, doc, defEdit, groups, frames, widths]);

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

  /** a run or a free group on the canvas, drawn as src/editor/render.tsx says */
  const renderGroup = (g: Group, ox: number, oy: number, screen?: { w: number; h: number }) => drawGroup(g, ox, oy, screen, groupView);

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
  const groupView: GroupView = { instantRef, selectedSet, startsHidden, widths, canvas, p, handMode, onItemPointerDown, view, gapOut, widthShift, pressedId, widthDragId, editDefinition };

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
            {renderExport(exportFrame, { doc, widths, frames, p, theme })}
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
