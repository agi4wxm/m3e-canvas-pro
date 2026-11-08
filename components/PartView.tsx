
import { Component, Suspense, memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { Item } from "@/lib/tokens";
import { boundItem } from "@/lib/variables";
import { BoundValues } from "./boundValues";
import { useLang, type Lang } from "@/lib/i18n";
import { useIcons } from "@/parts/icons";
import { SayLanguage } from "@/components/m3e/say";
import { PartSurface } from "@/parts/theme";
import { appearanceOf } from "@/parts/appearance";
import { partBySlug, viewOf } from "@/parts/registry";
import { axisValue, resizeOf } from "@/parts/resize";
import type { Screen } from "@/parts/types";
import { renderNode } from "@/parts/render";
import { holdModules, loadModules, modulesIn, modulesOf, subscribeModules } from "@/parts/components";
import { REMEASURE } from "@/parts/contained";
import type { PNode } from "@/parts/node";
import { withoutOutside } from "@/lib/outside";
import { outsideBlocked, subscribeOutside } from "@/lib/outsidePolicy";

const NOTHING: PNode = { type: "span" };
const NONE: readonly string[] = [];

/** Whether every module a tree names has arrived (parts/components.ts). What is missing is asked for at once, and the
 *  part is drawn again when it has come. Asking is idempotent, and asking while drawing saves the frame an effect
 *  would wait for. */
export function usePartModules(tree: PNode | null): boolean {
  const keys = tree ? modulesOf(tree) : NONE;
  const ready = useSyncExternalStore(subscribeModules, () => modulesIn(keys), () => modulesIn(keys));
  if (!ready) void loadModules(keys);
  /* what is on screen is what the next start fetches first */
  useEffect(() => holdModules(keys), [keys]);
  return ready;
}

/** What holds a part's place while its drawing is on its way: an empty box at the size the part is about to be. It is
 *  marked `data-fit`, which the editor's measure pass reads as "what this part is drawn as has not mounted yet": a part
 *  measured before keeps its last size rather than taking the stand-in's for a moment, so nothing laid out by it moves. */
export function PartPlaceholder({ width, height }: { width?: number; height?: number }) {
  return <div data-part-waiting="" data-fit="" aria-busy="true" style={{ width, height }} />;
}

/** A part no definition stands for. It says which one, rather than leaving a hole or a crash. */
function MissingPart({ item }: { item: Item }) {
  const name = item.component;
  return (
    <div
      data-missing-part={name}
      style={{ width: 160, height: 56, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", padding: 8, overflow: "hidden", border: "1px dashed #B3261E", borderRadius: 8, color: "#B3261E", fontSize: 12, textAlign: "center" }}
    >
      Unknown part {name}
    </div>
  );
}

/** what a part that failed to draw says in its place */
export const CANT_DRAW: Record<Lang, string> = { en: "Can't draw", zh: "无法绘制", ja: "描画できません", ko: "그릴 수 없음" };

/** A part that threw while it was drawn: a small mark in its place, so the rest of the screen, and the
 *  editor around it, carry on. */
export function BrokenPart({ name }: { name?: string }) {
  const lang = useLang();
  const words = CANT_DRAW[lang] ?? CANT_DRAW.en;
  return (
    <div
      data-broken-part={name}
      role="img"
      aria-label={words}
      style={{ width: 160, height: 56, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", padding: 8, overflow: "hidden", border: "1px dashed #B3261E", borderRadius: 8, color: "#B3261E", fontSize: 12, textAlign: "center" }}
    >
      {words}
    </div>
  );
}

type BoundaryProps = { /** a change of any of these is a new chance to draw */ again: readonly unknown[]; name?: string; children: ReactNode };
type BoundaryState = { failed: boolean; again: readonly unknown[] };

/** Catches what one part throws while drawing, on the canvas, in the preview and in the gallery: a
 *  document from a file or a link can hold anything, and one part of it must not take the editor down.
 *  It tries again as soon as what it draws changes. */
export class PartBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false, again: this.props.again };
  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { failed: true };
  }
  static getDerivedStateFromProps(props: BoundaryProps, state: BoundaryState): Partial<BoundaryState> | null {
    const changed = props.again.length !== state.again.length || props.again.some((v, i) => !Object.is(v, state.again[i]));
    return changed ? { failed: false, again: props.again } : null;
  }
  componentDidCatch(error: unknown) {
    console.error(`part ${this.props.name ?? ""} could not be drawn`, error);
  }
  render() {
    return this.state.failed ? <BrokenPart name={this.props.name} /> : this.props.children;
  }
}

type PartViewProps = { item: Item; live?: boolean; /** the frame the part is on: an open overlay's box is no larger than it */ screen?: Screen; /** in the preview, an effect has opened this menu or popover: it is drawn open as on the canvas, and still works */ held?: boolean };

/** What a tree sets only once, when it is first drawn (`defaultValue`, `defaultChecked`…). A component
 *  ignores a later change to these, so on the canvas, where they are what the author is editing, a change
 *  has to draw it afresh. */
export function startingValuesOf(node: PNode | string): string {
  if (typeof node === "string") return "";
  const own = Object.entries(node.props ?? {})
    .filter(([k]) => /^default[A-Z]/.test(k))
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
  return [...own, ...(node.children ?? []).map(startingValuesOf).filter(Boolean)].join(";");
}

/** A part drawn as the real shadcn M3E component it stands for. On the canvas it is inert: a press
 *  belongs to the part (to select and drag it), not to the button inside it. In the preview
 *  (`live`) it works. */
function PartViewBody({ item: own, live = false, screen, held = false }: PartViewProps) {
  const values = useContext(BoundValues);
  const item = useMemo(() => (values ? boundItem(own, values) : own), [own, values]);
  const def = partBySlug(item.component);
  /* a prop left at its default shows the default of the editor's language */
  const lang = useLang();
  /* a project from elsewhere fetches nothing from other sites until the author allows it (lib/outside.ts) */
  const blocked = useSyncExternalStore(subscribeOutside, outsideBlocked, outsideBlocked);
  const props = useMemo(() => (blocked && def ? withoutOutside(def, item.props) : item.props), [blocked, def, item.props]);
  const tree = useMemo(() => (def ? viewOf(def, props, appearanceOf(item), screen, live && !held, item.id) : null), [def, props, item.fill, item.textColor, item.corners, item.look, item.id, screen?.w, screen?.h, live, held, lang]);
  /* the icon component is memoized: icons that arrive after the first draw show only in a fresh tree */
  const icons = useIcons(tree ?? NOTHING);
  /* the components it is drawn with are fetched the first time a part needs them */
  const ready = usePartModules(tree);
  /* in the preview, a part that holds an input draws that control controlled (parts/render.tsx): the value it shows is
   * the one it is drawn with, and what the visitor does goes to the part host (components/preview/LivePart.tsx) */
  const controls = live && !!def?.input;
  /* the same elements for the same tree: React then leaves the whole component under them alone */
  const drawn = useMemo(() => (tree && ready ? renderNode(tree, undefined, controls) : null), [tree, ready, controls]);
  /* drawn at last where its stand-in stood: the canvas measured the stand-in, so it measures again */
  const waited = useRef(false);
  useLayoutEffect(() => {
    if (!ready) waited.current = true;
    else if (waited.current) {
      waited.current = false;
      window.dispatchEvent(new Event(REMEASURE));
    }
  }, [ready]);
  /* in the preview they stay as they are: what a visitor has changed is the part's own */
  const starting = useMemo(() => (tree && !live ? startingValuesOf(tree) : ""), [tree, live]);
  if (!tree) return <MissingPart item={item} />;
  /* a part sized for its screen holds that size, not the size parts of its kind usually are: a picture on a screen on its
   * side would otherwise be measured as an upright phone until it has loaded, and everything on it laid out by that */
  const axes = resizeOf(def, item.props);
  const held_w = axes?.width ? axisValue(axes.width, item.props) : def?.w;
  const held_h = axes?.height ? axisValue(axes.height, item.props) : def?.h;
  const hold = <PartPlaceholder width={held_w} height={held_h} />;
  return (
    <PartSurface>
      {/* an inline box inside the part's block would sit on the strut's baseline, ~a line's
       *  leading low; top-aligned, the part's content starts at the part's own top */}
      <div key={`${icons}:${starting}`} inert={!live} style={{ display: "inline-flex", verticalAlign: "top", pointerEvents: live ? undefined : "none" }}>
        {/* the words the components say by themselves (a picker's title, an icon button's name) are in the canvas
         *  language, passed down rather than read off the page, which takes it only after this has drawn */}
        <SayLanguage.Provider value={lang}>
          {/* until its components have come, its guessed size holds the place; the boundary stays for anything inside a
           *  component that waits on its own */}
          {ready ? <Suspense fallback={hold}>{drawn}</Suspense> : hold}
        </SayLanguage.Provider>
      </div>
    </PartSurface>
  );
}

/* The canvas draws every part twice over, on the screen and in the measuring layer, and the editor
 * renders on every pointer move of a drag: a part that has not changed must not be drawn again. A
 * screen is compared by its size, since the canvas works one out afresh each time. */
function GuardedPartView(props: PartViewProps) {
  const { item, live, held, screen } = props;
  return (
    <PartBoundary name={item.component} again={[item, live, held, screen?.w, screen?.h]}>
      <PartViewBody {...props} />
    </PartBoundary>
  );
}

export const PartView = memo(GuardedPartView, (a, b) => a.item === b.item && a.live === b.live && a.held === b.held && a.screen?.w === b.screen?.w && a.screen?.h === b.screen?.h);
