
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { buildPrompt, effectivePrompt } from "@/lib/prompt";
import {
  draftGradient,
  BEZEL,
  clamp,
  Doc,
  Frame,
  FRAME_LABEL_H,
  FrameMode,
  frameOfPart,
  frameRadius,
  frameSizeOf,
  frameLengthOf,
  Group,
  groupBounds,
  frameRect,
  unionRect,
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
import { GitHubLink, Toolbar } from "@/components/Toolbar";
import { LangMenu } from "@/components/Menus";
import { AgentPanel } from "@/components/AgentPanel";
import { PromptBar, usePromptBarKey } from "@/components/PromptBar";
import { McpConnect } from "@/components/McpPanel";
import { PANEL_FADE_H } from "@/components/ui";
import { loadAiSettings, scenePrompt, scenesToPaint } from "@/lib/ai";
import { maxFrameLength } from "@/lib/tidy";
import { joinTargetOf } from "@/lib/combine";
import { flowHostAt, flowOf, showingGroups } from "@/lib/flow";
import { targetRects } from "@/lib/guides";
import { InsertionMark, SmartGuides } from "@/components/SmartGuides";
import { expandInstances } from "@/lib/instances";
import { expandDoc } from "@/lib/expand";
import { repeatAround } from "@/lib/collections";
import { familyOf, missingSizes } from "@/lib/variants";
import { ComponentsPanel, DataPanel, InstanceInspector, sizeWord } from "@/components/ReusePanels";
import { sharedOf } from "@/components/DesignPanel";
import { Behavior, BehaviorContext, StyleRulesContext } from "@/components/EffectsPanel";
import { readProject } from "@/lib/project";
import { downloadProject } from "@/lib/projects/download";
import { editorProjects } from "@/lib/projects/opening";
import { ProjectsPersist } from "@/lib/projects/persist";
import { ProjectsHome } from "@/components/ProjectsHome";
import { DropCover, FileConflictDialog, OpenFileDialog, ProjectMenu, ProjectPill } from "@/components/ProjectChrome";
import { LoadingIndicator } from "@/components/Loading";
import { ShareDialog } from "@/components/ShareMenu";
import { ColorPanel } from "@/components/ColorPanel";
import { MotionPanel, ShapePanel, TypePanel } from "@/components/ThemePanel";
import { PartStyleSheet, PartThemeContext, PartThemeStyle, type PartTheme } from "@/parts/theme";
import { artOf, isStrict, screenBackground, setDocStyles } from "@/lib/styles";
import { StyleGate, StylePanel } from "@/components/StylePanel";
import { partBySlug, reader } from "@/parts/registry";
import { kitOfKey } from "@/parts/kits";
import { kitLookOf } from "@/lib/kits";
import { BottomSheet, MobileActionBar, MobileInspector, MobileLang, MobileSettings } from "@/components/Mobile";
import { ConfirmDialog, DenseContext, IconBtn, Segmented } from "@/components/ui";
import { Lang, LangContext, setGlobalLang, t } from "@/lib/i18n";
import { OpError, ops, savedDoc, translateSnapshot, withDoc, withFrames, withGroups, type Op, type TxOptions } from "@/lib/core";
import { useStore } from "@/lib/core/react";
import type { PersistAdapter } from "@/lib/core/persist";
import { type GroupPatch } from "@/lib/core/ops/nodes";
import { editorStore } from "./editor/store";
import { useViewport } from "./editor/useViewport";
import { useMeasure } from "./editor/useMeasure";
import { usePersistence } from "./editor/usePersistence";
import { useProject } from "./editor/useProject";
import { useShortcuts } from "./editor/useShortcuts";
import { seed, SEED_FRAMES } from "./editor/seed";
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
import { useLayers } from "./editor/useLayers";
import { itemsUnder, type LayerTree } from "@/lib/layerTree";
import { useLinks } from "./editor/useLinks";
import { useScreenLength } from "./editor/useScreenLength";
import { useCanvasView } from "./editor/useCanvasView";
import { useSelection } from "./editor/useSelection";
import { useCommands } from "./editor/useCommands";
import { useDefinitions } from "./editor/useDefinitions";
import { useScreens } from "./editor/useScreens";
import { useAdding } from "./editor/useAdding";
import { useFrameImages } from "./editor/useFrameImages";
import { useScreenshots } from "./editor/useScreenshots";
import { useAgent } from "./editor/useAgent";
import { usePageChrome } from "./editor/usePageChrome";
import { usePhoneLayout } from "./editor/usePhoneLayout";
import { usePanels } from "./editor/usePanels";
import { useRememberUi } from "./editor/useRememberUi";
import {
  BAR_SIDES,
  CARRIED,
  carriedDrag,
  componentAxes,
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
} from "./editor/model";

export default function Editor({ initialLang, onReady, persist = editorProjects() }: { initialLang: Lang; onReady?: () => void; /** where the document is kept between visits (lib/core/persist.ts); projects in IndexedDB by default (lib/projects) */ persist?: PersistAdapter }) {
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  /* ---------- document ---------- */
  const [lang, setLang] = useState<Lang>(initialLang);
  const [editAccess, setEditAccess] = useState<"checking" | "editable" | "readonly">("checking");
  /* The document lives in the document core's store (lib/core): the canvas's screens and parts, the theme, the data,
   * the selection and the measures, and the history. Everything here reads it and changes it through it. */
  const [store] = useState(() => editorStore(seed(initialLang), [{ ...SEED_FRAMES[0], name: t("home", initialLang) }]));
  const { state: core, history } = useStore(store);
  /* the document's own styles in reach (lib/styles/book.ts) before anything below reads a style by its key */
  setDocStyles(core.doc.styles);
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
  /** the definition open for editing, if one is: then `groups` and `frames` are its screen, not the document's.
   *  Read live from the store. */
  const defEditRef = { get current() { return store.get().editing; } };
  /** the prompt's full-screen cover is up: the panel's own band steps aside while it is */
  const [promptCoverUp, setPromptCoverUp] = useState(false);
  /** the author's explicit target; null follows the screens (web once a desktop screen exists) */
  const [shareOpen, setShareOpen] = useState(false);

  /* ---------- editor ui ---------- */
  /* the tool, the side panels, their tabs and widths, the favourites (src/editor/usePanels.ts) */
  const { mode, setMode, spaceHeld, setSpaceHeld, leftOpen, setLeftOpen, rightOpen, setRightOpen, leftW, setLeftW, leftTab, setLeftTab, railHover, setRailHover, layersFrameId, setLayersFrameId, rightW, setRightW, rightTab, setRightTab, favorites, setFavorites, showAllLinks, setShowAllLinks, resizing, setResizing } = usePanels();
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
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

  /** the canvas as layers, as of the last draw: what a press on the canvas selects goes by it (src/editor/useLayers.ts) */
  const layersRef = useRef<LayerTree | null>(null);
  /** the row under the pointer in the layers panel, outlined on the canvas */
  const [hoverLayer, setHoverLayer] = useState<string | null>(null);
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
  /** the same, for what draws differently once the document is in */
  const [loaded, setLoaded] = useState(false);
  /** the phone's layout applied again, for a document read after it first ran */
  const phoneLayoutRef = useRef<(() => void) | null>(null);
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
  const { ideaText, setIdeaText, draftBusy, draftProgress, draftBefore, setDraftBefore, revealing, quickUndo, setQuickUndo, importDoc, startDraft, keepDraft, undoDraft, settleDraftRef } = useDrafts({ store, persist, editAccess, lang, aiSettings, mobileRef, docRef, themeRef, frameRef, hadDocRef, fitRef, leaveForNewDoc, setSelectedLinkId, setShareOpen, showToast, paintScenes, stopPainting });

  /** the editor's own settings as they were left: the camera, the panels, the favourites */
  const restoreUi = () => {
    const u = localStorage.getItem(UI_KEY);
    if (!u) {
      queueMicrotask(() => fitRef.current());
      return false;
    }
    const ui = JSON.parse(u);
    /* the camera as it was left on this project; another project's starts fitted */
    const projectId = persist instanceof ProjectsPersist ? persist.id : null;
    if (ui.view && (!ui.viewOf || !projectId || ui.viewOf === projectId)) setView(ui.view);
    else queueMicrotask(() => fitRef.current());
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
    onLoaded: (late) => {
      setAiSettings(loadAiSettings());
      loadedRef.current = true;
      setLoaded(true);
      /* read after the phone's layout ran: it runs again for the document that came */
      if (late) phoneLayoutRef.current?.();
      /* the document is in state; one frame later it is on screen and the boot overlay may go.
         Not cancelled on cleanup: the development double-run skips this effect the second time. */
      requestAnimationFrame(() => onReadyRef.current?.());
    },
    showToast: (msg, ms, icon) => showToast(msg, ms, icon),
  });

  /* the page's language, fonts, icons, background and height (src/editor/usePageChrome.ts) */
  usePageChrome({ lang, theme, p, setWidths });

  /* a phone gets one fixed screen and the select tool only (src/editor/usePhoneLayout.ts) */
  usePhoneLayout({ store, setIsMobile, mobileRef, setMode, setSheet, hadDocRef, initialLangRef, setGroups, setFrames, frameRef, setFrame, ensureFrame: () => ensureFrameRef.current(), fitRef, setViewReady, againRef: phoneLayoutRef });

  /* the editor's own settings written down as they change (src/editor/useRememberUi.ts) */
  useRememberUi({ loadedRef, view, leftOpen, rightOpen, leftW, rightW, favorites, mode, lang, showAllLinks, p, frame, projectId: loaded && persist instanceof ProjectsPersist ? persist.id : null });

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
  /* parts, kits and instances added where the view is looking, and a composite split (src/editor/useAdding.ts) */
  const { buildKit, landKit, addKit, addKitRef, splitSelected, addPart, addInstance, addPartRef, addInstanceRef } = useAdding({ store, runOp, showToast, selectedIds, selectedFrameId, canvasRect, viewRef, frameRef, framesRef, groupsRef, widthsRef, mobileRef, defEditRef, componentsRef, itemRects, setRightTab, setSheet });

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

  const carrying = gesture !== null || !!drag;
  /* a screen's length, from its slider or its grip (src/editor/useScreenLength.ts) */
  const { lengthRun, setFrameLength, lengthDragId, onLengthHandleDown, onLengthHandleKey } = useScreenLength({ store, didOp, framesRef, groupsRef, viewRef, tidyRef });
  /* instances, repeats and container layouts worked out, and the screen each part is on (src/editor/useCanvasView.ts) */
  const { canvas, allItems, offTab, startsHidden, frameOf, screenByItem } = useCanvasView({ carrying, groups, frames, frame, components, collections, widths, drag, instantRef, tidyRef, lengthRun, setGroups });

  /* ---------- editing ---------- */
  /* what the selection is, read off the document (src/editor/useSelection.ts) */
  const { primaryId, selected, selectedSet, selectedLocked, selectionPlaceable, selectionWhole, selectedGroup, selectedFrame, selectedMinLength, selectedRect, selectedInFlow, selectedFlowParent, selectedLoose, selectedPartFrame, tidyTarget } = useSelection({ selectedIds, selectedFrameId, groups, frames, widths, frame, drag, isMobile, defEdit });

  useEffect(() => {
    if (!selected && sheet === "edit") setSheet(null);
  }, [selected, sheet]);

  /* what is done to the selection, each one operation and one undo step (src/editor/useCommands.ts) */
  const { patchSelected, setEachSelected, deleteSelected, toggleLockSelected, duplicateSelected, clipboardRef, copySelected, pasteClipboard, placeSelected, alignSelected, distributeSelected, tidyUpSelected, autoLayoutSelected, makeComponentOfSelection, groupSelected, ungroupSelected, nudge, moveSelectedTo, stepSelectedLayers } = useCommands({
    store,
    runOp,
    didOp,
    showToast,
    selectedIds,
    selectedFrameId,
    primaryId,
    selected,
    selectedGroup,
    selectedRect,
    dragRef,
    instantRef,
    framesRef,
    widthsRef,
    setLeftTab,
    setLeftOpen,
  });

  /* what is done to screens, each one operation and one undo step (src/editor/useScreens.ts) */
  const { easing, autoLayoutScreen, ensureFrameRef, changeFrame, addFrame, addTemplate, patchFrame, setFramePreset, setPhoneModel, resizeFrame, tidyState, tidy, canCombine, combine, setPlace, deleteFrame, duplicateFrame, duplicateFrameRef, createVariantOf } = useScreens({
    store,
    runOp,
    didOp,
    showToast,
    snapshot,
    frame,
    groups,
    frames,
    widths,
    theme,
    tidyTarget,
    tidyRef,
    frameRef,
    framesRef,
    groupsRef,
    widthsRef,
    defEditRef,
    viewRef,
    canvasRect,
    setView,
    fitRef,
    glideToFrame,
    retidyRef,
    freshFramesRef,
    newPhoneRef,
    setSelectedLinkId,
    setRightTab,
  });

  /* a definition opened on the canvas and closed again, and what else is done to components (src/editor/useDefinitions.ts) */
  const { editDefinition, finishDefinition, finishDefinitionRef, renameComponent, deleteComponent, detachGroup, componentUses } = useDefinitions({ store, runOp, defEdit, groups, components, mobileRef, viewRef, setView, fitRef, frameRef, tidyRef, setSelectedLinkId });

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
  const { relayoutRef, pickStyle, setRules, changeStyles, relayout, patchUx } = useStyleLayout({ store, runOp, didOp, undo, showToast, theme, groups, frames, widths, drag, gesture, defEdit, previewId, groupsRef, framesRef, widthsRef, themeRef, dragRef, gestureRef, settleDraftRef, tidyRef, setGroups, setFrames, setWidths });

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

  /** what the layout keys do, read by the keyboard handler at the moment a key is pressed */
  const layoutKeysRef = useRef({ tidyUp: () => {}, tidyScreen: () => {}, autoLayout: () => {} });
  layoutKeysRef.current = {
    tidyUp: tidyUpSelected,
    tidyScreen: () => {
      if (tidyTarget) tidy(tidyTarget);
    },
    autoLayout: autoLayoutSelected,
  };

  const aiReason = !aiReady ? t("aiNoKey", lang) : !tidyTarget ? t("aiSelectScreen", lang) : undefined;

  /** Ctrl+A: set where the screen the layers list is worked out */
  const selectAllRef = useRef(() => {});

  /* a screen, or all of them, saved as pictures (src/editor/useFrameImages.ts) */
  const { exportFrame, saveFrameImage, saveAllFrameImages, savePartImage, frameThumb } = useFrameImages(framesRef);

  /* the project open in this tab: its name, its picture, the file it is saved to, other projects (src/editor/useProject.ts) */
  const project = useProject({ store, persist, docRef, framesRef, lang, loaded, editable: editAccess === "editable", frameThumb, importDoc, pickFallback: () => projectFileRef.current?.click(), showToast });

  /* the in-app agent: its eyes (src/editor/useScreenshots.ts), its conversation and turns (src/editor/useAgent.ts) */
  const { shotFrame, renderer: shotRenderer } = useScreenshots(store);
  const agent = useAgent({ store, settings: aiSettings, lang, renderer: shotRenderer, editable: editAccess === "editable", showToast });
  /** the Cmd/Ctrl+K prompt bar is up */
  const [promptBarOpen, setPromptBarOpen] = useState(false);
  usePromptBarKey(editAccess === "editable" && !isMobile && !confirmClear && project.pendingOpen === null && !project.homeOpen && !project.conflictOpen && !shareOpen && previewId === null && !promptCoverUp, () => setPromptBarOpen(true));
  const askAgent = (words: string) => {
    setPromptBarOpen(false);
    setLeftOpen(true);
    setLeftTab("ai");
    void agent.send(words);
  };
  const waitingScenes = scenesToPaint(groups);

  /* the keyboard: undo, clipboard, grouping, layout keys, nudges, tools and zoom (src/editor/useShortcuts.ts) */
  useShortcuts({
    editable: editAccess === "editable",
    blocked: confirmClear || project.pendingOpen !== null || project.homeOpen || project.conflictOpen || shareOpen || previewId !== null || promptCoverUp || promptBarOpen,
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

  /** what several selected parts share, for the panel of several (components/DesignPanel.tsx) */
  const sharedSelection = useMemo(() => {
    if (selectedIds.length < 2) return undefined;
    const ids = new Set(selectedIds);
    const items = groups.flatMap((g) => g.items).filter((it) => ids.has(it.id));
    const rects = new Map(itemRects().filter((r) => ids.has(r.id)).map((r) => [r.id, { x: r.l, y: r.t, w: r.r - r.l, h: r.b - r.t }]));
    const origin = (id: string) => {
      const g = groups.find((x) => x.items.some((it) => it.id === id));
      const f = g ? frames.find((x) => x.id === frameOf.get(g.id)) : undefined;
      return { x: f?.x ?? 0, y: f?.y ?? 0 };
    };
    return sharedOf(items, rects, origin);
    // the rects are read off the groups and the measures named here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, groups, widths, frames, frameOf]);
  /** the selected part saved as a picture, cut out of its screen's */
  const exportSelected = (scale: number) => {
    if (!selectedRect || !selectedPartFrame || !selected) return;
    void savePartImage(selectedPartFrame, selectedRect, scale, selected.label || selected.component || "part").then((ok) => !ok && showToast(t("dzExportFailed", lang), 2400, "error"));
  };

  /* ---------- render ---------- */
  /** what the preview plays: everything drawn out. With a definition open, that definition alone. */
  const previewDoc = useMemo(() => (previewId === null ? doc : expandDoc(defEdit ? { ...doc, groups, frames } : doc, widths)), [previewId, doc, defEdit, groups, frames, widths]);

  /* the arrows from tappable parts to the screens they open (src/editor/useLinks.ts) */
  const { visibleLinks, setLinkTransition, removeLink } = useLinks({ frame, groups, frames, widths, itemRects, showAllLinks, selectedIds, selectedFrameId, selectedLinkId, setSelectedLinkId, runOp });

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

  /* the Layers panel: the screen it lists and what its rows do (src/editor/useLayers.ts) */
  const { tree: layers, layersFrame, selectAll, moveLayerTo, toggleGroupLock, toggleGroupHidden, renameGroup, reorderGroupItems } = useLayers({ store, frame, primaryId, groups, frames, widths, frameOf, selectedFrameId, layersFrameId, offTab, carrying, instantRef, runOp, didOp, setSelectedIds, setSelectedFrameId, setSelectedLinkId });
  selectAllRef.current = selectAll;
  layersRef.current = layers;

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
  /** about how wide the canvas is between the panels, for what in its toolbar row gives way when it is narrow */
  const canvasWidth = (typeof window === "undefined" ? 1440 : window.innerWidth) - (leftOpen ? leftW : RAIL_W) - (showRight ? rightW : 0);
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
  /* what the layer row under the pointer covers on the canvas, outlined there */
  const hoverBox = (() => {
    if (!hoverLayer || carrying) return null;
    const n = layers.nodes.get(hoverLayer);
    if (!n) return null;
    if (n.kind === "screen") {
      const f = frames.find((x) => x.id === n.frameId);
      return f ? frameRect(f) : null;
    }
    const ids = new Set(itemsUnder(layers, hoverLayer));
    const rects = itemRects().filter((r) => ids.has(r.id));
    return rects.length ? unionRect(rects) : null;
  })();
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
        {/* a screen the agent is looking at, drawn the same way */}
        {shotFrame && (
          <div aria-hidden data-shot style={{ position: "fixed", left: -99999, top: 0, pointerEvents: "none", fontFamily: fontFamilyOf(theme.font, lang) }}>
            {renderExport(shotFrame, { doc, widths, frames, p, theme })}
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
              {/* MCP clients (Claude Desktop, Codex) working on this canvas: components/McpPanel.tsx */}
              <McpConnect store={store} p={p} theme={theme} lang={lang} enabled={editAccess === "editable"} />
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
                  <StylePanel p={p} theme={theme} onChange={patchTheme} onPick={pickStyle} onUx={patchUx} onRelayout={() => relayout()} onRules={setRules} styles={core.doc.styles} onStyles={changeStyles} />
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
                  <AgentPanel
                    p={p}
                    settings={aiSettings}
                    onSettings={updateAiSettings}
                    agent={agent}
                    quick={{
                      draft: () => setShareOpen(true),
                      polish: tidyTarget ? () => void agent.send(t("agentQuickPolishAsk", lang)) : undefined,
                      describe: aiReady && tidyTarget ? () => void runAi("describe", tidyTarget) : undefined,
                      behavior: aiReady && tidyTarget && selected ? () => void runAi("behavior", tidyTarget, selected.id) : undefined,
                      paint: canPaint && waitingScenes.length ? () => void paintScenes(waitingScenes) : undefined,
                    }}
                  />
                ) : (
                  <LayersPanel
                    p={p}
                    tree={layers}
                    groups={groups}
                    frames={frames}
                    components={components}
                    selectedIds={selectedIds}
                    selectedFrameId={selectedFrameId}
                    focusFrameId={layersFrame?.id ?? null}
                    onSelectScreen={(id) => {
                      setLayersFrameId(id);
                      setSelectedIds([]);
                      setSelectedFrameId(id);
                      setSelectedLinkId(null);
                      setRightTab("edit");
                      const f = framesRef.current.find((x) => x.id === id);
                      if (f) glideToFrame(f);
                    }}
                    onSelect={(ids, how) => {
                      setSelectedIds((cur) => (how === "toggle" ? (ids.every((x) => cur.includes(x)) ? cur.filter((x) => !ids.includes(x)) : [...cur.filter((x) => !ids.includes(x)), ...ids]) : ids));
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
                    onMove={moveLayerTo}
                    onReorderItems={reorderGroupItems}
                    onToggleLock={toggleGroupLock}
                    onToggleHidden={toggleGroupHidden}
                    onRename={renameGroup}
                    onRenameScreen={(id, name) => patchFrame(id, { name })}
                    onHover={setHoverLayer}
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
                        <AnimatePresence>{(aiFrameId === f.id || agent.agentFrameId === f.id) && <ThinkingRing key="ring" p={p} frame={f} />}</AnimatePresence>
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

              {hoverBox && (
                <div
                  aria-hidden
                  data-hover-outline
                  style={{ position: "absolute", left: hoverBox.l, top: hoverBox.t, width: hoverBox.r - hoverBox.l, height: hoverBox.b - hoverBox.t, boxShadow: `0 0 0 ${1.5 / view.z}px ${p.primary}`, borderRadius: 2 / view.z, pointerEvents: "none", zIndex: 70 }}
                />
              )}
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
          <PromptBar
            p={p}
            open={promptBarOpen}
            busy={agent.running}
            about={selectedIds.length ? t("agentOnSelection", lang).replace("{n}", String(selectedIds.length)) : selectedFrameId ? t("agentOnScreen", lang).replace("{name}", frames.find((f) => f.id === selectedFrameId)?.name ?? "") : t("agentOnDocument", lang)}
            onClose={() => setPromptBarOpen(false)}
            onSend={askAgent}
          />
          {draftBusy && draftProgress && draftProgress.chars + draftProgress.reasoning > 0 && (
            <div data-draft-progress style={{ position: "absolute", left: "50%", bottom: 24, transform: "translateX(-50%)", zIndex: 45, padding: "8px 16px", borderRadius: 20, background: p.surface, boxShadow: "0 4px 18px rgba(0,0,0,0.14)", color: p.onSurfaceVariant, fontSize: 13, whiteSpace: "nowrap" }}>
              {t("agentDrafting", lang).replace("{n}", String(draftProgress.chars))}
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
            project={
              <ProjectPill
                p={p}
                name={project.meta?.name ?? (doc.title || t("untitledProject", lang))}
                link={project.link}
                onHome={() => project.setHomeOpen(true)}
                onReconnect={() => void project.reconnect()}
                onConflict={() => project.setConflictOpen(true)}
                /* the toolbar row shares the canvas's width: the name gives way first */
                size={canvasWidth < 640 ? "icon" : canvasWidth < 860 ? "compact" : "full"}
              />
            }
            projectMenu={(close) => (
              <ProjectMenu
                p={p}
                close={close}
                a={{
                  onHome: () => project.setHomeOpen(true),
                  onSaveToFile: () => void project.saveToFile(),
                  onSaveToFolder: project.canPickFolder && project.projects ? () => void project.saveToFolder() : undefined,
                  onOpenFile: () => void project.openFile(),
                  onOpenFolder: project.canPickFolder ? () => void project.openFolder() : undefined,
                  onDownload: project.downloadCopy,
                  onStopSaving: project.link ? project.stopSaving : undefined,
                  canSync: project.canSyncFile && !!project.projects,
                  link: project.link,
                }}
              />
            )}
            onShare={!isMobile ? () => setShareOpen(true) : undefined}
            shareState={draftBusy ? "busy" : draftBefore ? "review" : "idle"}
            onDraftKeep={keepDraft}
            onDraftUndo={undoDraft}
            onDraftSave={() => downloadProject(doc, project.meta?.name)}
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
                {project.projects && (
                  <button
                    className="m3-press"
                    data-mobile-projects
                    onClick={() => {
                      setSheet(null);
                      project.setHomeOpen(true);
                    }}
                    style={{ width: "100%", minHeight: 56, marginBottom: 12, padding: "0 16px", borderRadius: 20, border: "none", background: p.secondaryContainer, color: p.onSecondaryContainer, display: "flex", alignItems: "center", gap: 12, fontSize: 15, fontWeight: 600, cursor: "pointer", textAlign: "left" }}
                  >
                    <Icon name="stacks" size={22} fill />
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.meta?.name ?? t("allProjects", lang)}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, opacity: 0.8 }}>{t("allProjects", lang)}</span>
                    <Icon name="chevron_right" size={20} />
                  </button>
                )}
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
              {/* the design panel at Figma's density; the prompt keeps its own room */}
              <DenseContext.Provider value={rightTab === "edit"}>
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
                  shared={sharedSelection}
                  onEach={setEachSelected}
                  onExport={selectedPartFrame ? exportSelected : undefined}
                  strict={isStrict(theme)}
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
              </DenseContext.Provider>
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
            if (file) void readProject(file).then((next) => (next ? project.offerDoc(next, file.name) : showToast(t("invalidProject", lang), 3000, "error")));
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

      {/* the projects, and what a file asks; outside the editor's tree, so a read-only tab can still reach them */}
      <ProjectsHome
        p={p}
        open={project.homeOpen}
        onClose={() => project.setHomeOpen(false)}
        current={project.meta}
        currentDoc={() => docRef.current}
        onOpen={(id, newTab) => void project.goTo(id, newTab)}
        onNew={() => void project.newProject()}
        onOpenFile={() => void project.openFile()}
        blocked={project.mode === "legacy"}
      />
      <OpenFileDialog
        p={p}
        open={project.pendingOpen !== null}
        name={project.pendingOpen?.name ?? ""}
        canBind={!!project.pendingOpen?.handle && !!project.projects}
        onCancel={() => project.setPendingOpen(null)}
        onConfirm={(where, keep) => {
          project.setHomeOpen(false);
          void project.confirmOpen(where, keep);
        }}
      />
      <FileConflictDialog
        p={p}
        open={project.conflictOpen && project.link?.status === "conflict"}
        name={project.link?.name ?? ""}
        onCancel={() => project.setConflictOpen(false)}
        onLoad={() => void project.loadTheirs()}
        onKeep={() => void project.keepMine()}
      />
      <DropCover p={p} on={project.dropping} />

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
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
                {project.projects && (
                  <button
                    className="m3-press"
                    onClick={() => project.setHomeOpen(true)}
                    style={{ minHeight: 40, padding: "0 16px", border: "none", borderRadius: 20, background: "transparent", color: p.primary, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
                  >
                    {t("allProjects", lang)}
                  </button>
                )}
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
