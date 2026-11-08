import { Children, createContext, isValidElement, useCallback, useContext, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

import { FillDown, FillWidth } from "./layout";
import { withAlpha } from "./look";
import type { BuildViewStyle } from "./styles";
import { useKit } from "./theme/ThemeProvider";

/* What a printed screen stands on: the screen itself (its ground, its length when it scrolls), the parts placed where
 * the design has them (`At`), the bars pinned to an edge (`Pin`), and where a tap goes (`useNav`). A free screen is
 * placed in the design's own points, as the web export does; what an auto layout holds, and the bars, adapt to the
 * device. `ScreenStack` is a navigator small enough to read: an app with a router of its own gives `NavProvider` its
 * own `go` and `back` instead. */

/** how a screen is opened: over the current one, with what it is given (its params), in place of the current one */
export type GoOptions = { overlay?: boolean; params?: Record<string, unknown>; replace?: boolean };

/** where a tap goes */
export type Nav = {
  /** to a screen, by its key; over the current one when `overlay` */
  go: (screen: string, opts?: GoOptions) => void;
  back: () => void;
  /** an address outside the app */
  open: (url: string) => void;
  /** what the design asks for that the export does not print yet (setting a variable, showing a part): the key says what */
  todo: (what: string) => void;
};

const SAFE_URL = /^https?:\/\//i;

const NOWHERE: Nav = {
  go: () => {},
  back: () => {},
  open: (url) => {
    if (SAFE_URL.test(url)) void Linking.openURL(url);
  },
  todo: () => {},
};

/* How many times the visitor has gone somewhere (a screen opened, gone back from, laid over, closed): an answer that
   comes after one runs its effects but goes nowhere (lib/actions, docs/交互规则.md “迟到的回答”). Counted as each move
   is asked for, whoever asks: a tap, a scrim closing an overlay, the app's own router. */
let moves = 0;

/** the visitor's moves so far */
export const movesSoFar = () => moves;

/** a move the visitor made that no `Nav` was asked for (a scrim closing what lies over the screen) */
export const moved = () => {
  moves++;
};

const NavContext = createContext<Nav>(NOWHERE);
export const useNav = () => useContext(NavContext);
export function NavProvider({ value, children }: { value: Partial<Nav>; children: ReactNode }) {
  const merged = useMemo<Nav>(() => {
    const nav = { ...NOWHERE, ...value };
    return {
      ...nav,
      go: (...asked) => {
        moved();
        nav.go(...asked);
      },
      back: () => {
        moved();
        nav.back();
      },
    };
  }, [value]);
  return <NavContext.Provider value={merged}>{children}</NavContext.Provider>;
}

/** a part placed on its screen, from the screen's top left; `span` runs it from edge to edge; `bottom` runs it down to
 *  that far from the screen's foot (a list of data that scrolls in what is left of the screen) */
export function At({ x = 0, y = 0, span, z, bottom, children }: { x?: number; y?: number; span?: boolean; z?: number; bottom?: number; children: ReactNode }) {
  const style: BuildViewStyle = span ? { position: "absolute", left: 0, right: 0, top: y } : { position: "absolute", left: x, top: y };
  if (z) style.zIndex = z;
  if (bottom !== undefined) style.bottom = bottom;
  if (bottom !== undefined)
    return (
      <View style={style}>
        <FillDown across={span}>{children}</FillDown>
      </View>
    );
  return <View style={style}>{span ? <FillWidth>{children}</FillWidth> : children}</View>;
}

/** a bar pinned to an edge of the screen, over what scrolls, inside the device's own bars; floating, it stands `bottom`
 *  above the screen's foot (16 unless the design says), over the device's own bar at the bottom */
export function Pin({ edge, x, bottom, children }: { edge: "top" | "bottom" | "floatingBottom"; x?: number; bottom?: number; children: ReactNode }) {
  const insets = useContext(SafeAreaInsetsContext);
  const floating = edge === "floatingBottom";
  const style: ViewStyle =
    edge === "top"
      ? { position: "absolute", left: 0, right: 0, top: 0, paddingTop: insets?.top ?? 0 }
      : { position: "absolute", left: floating && x !== undefined ? x : 0, right: floating && x !== undefined ? undefined : 0, bottom: floating ? (bottom ?? 16) + (insets?.bottom ?? 0) : 0, paddingBottom: floating ? 0 : (insets?.bottom ?? 0), alignItems: floating && x === undefined ? "center" : "stretch" };
  return (
    <View style={[style, { zIndex: 10 }]} pointerEvents="box-none">
      {floating ? children : <FillWidth>{children}</FillWidth>}
    </View>
  );
}

const BG: Record<string, string> = {
  surface: "surface",
  surfaceContainerLow: "surface-container-low",
  surfaceContainer: "surface-container",
  surfaceContainerHigh: "surface-container-high",
  surfaceContainerHighest: "surface-container-highest",
  primaryContainer: "primary-container",
  secondaryContainer: "secondary-container",
  tertiaryContainer: "tertiary-container",
  primary: "primary",
  inverseSurface: "inverse-surface",
};

/** a screen shown over another stands at its own size, its corners rounded, as the preview shows it */
const Overlaid = createContext(false);

export type ScreenProps = {
  /** the screen's ground: a fill role, as the document writes it */
  bg?: string;
  /** the design's width: an overlay's size */
  width?: number;
  /** how tall the design is; longer than the device, the body scrolls under the pinned bars */
  length?: number;
  /** the design's height: what fits without scrolling */
  height?: number;
  children?: ReactNode;
};

/** a screen: its ground, its body (scrolling when the design is longer than the device) and its pinned bars over it */
export function Screen({ bg = "surface", width, length, height, children }: ScreenProps) {
  const kit = useKit();
  const overlaid = useContext(Overlaid);
  const pinned: ReactNode[] = [];
  const body: ReactNode[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === Pin) pinned.push(child);
    else body.push(child);
  });
  const ground = kit.colors[BG[bg] ?? bg] ?? kit.colors.surface;
  const scrolls = !!length && !!height && length > height;
  return (
    <View style={overlaid ? { width, height, borderRadius: 20, backgroundColor: ground, overflow: "hidden" } : { flex: 1, backgroundColor: ground, overflow: "hidden" }}>
      {scrolls ? (
        <ScrollView style={StyleSheet.absoluteFill} contentContainerStyle={{ height: length }}>
          {body}
        </ScrollView>
      ) : (
        <View style={StyleSheet.absoluteFill}>{body}</View>
      )}
      {pinned}
    </View>
  );
}

/** what a screen is given: what it was opened with */
export type ScreenComponent = ComponentType<{ params?: Record<string, unknown> }>;

/** One screen over another and a history to go back through: enough to run a design's flows. */
export function ScreenStack({ screens, initial }: { screens: Record<string, ScreenComponent>; initial: string }) {
  const kit = useKit();
  const [stack, setStack] = useState<{ key: string; overlay?: boolean; params?: Record<string, unknown> }[]>([{ key: initial }]);
  const go = useCallback(
    (key: string, opts?: GoOptions) => {
      if (!screens[key]) return;
      const entry = { key, overlay: opts?.overlay, params: opts?.params };
      setStack((s) => {
        const kept = s.filter((x) => !(opts?.overlay === undefined && x.overlay));
        return opts?.replace && kept.length ? [...kept.slice(0, -1), entry] : [...kept, entry];
      });
    },
    [screens],
  );
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const nav = useMemo(() => ({ go, back }), [go, back]);
  const top = stack[stack.length - 1];
  const under = top.overlay ? [...stack].reverse().find((x) => !x.overlay) : undefined;
  const Top = screens[top.key];
  const Under = under ? screens[under.key] : undefined;
  return (
    <NavProvider value={nav}>
      <View style={{ flex: 1 }}>
        {Under && under ? <Under params={under.params} /> : null}
        {top.overlay ? (
          <Pressable
            accessibilityLabel="Close"
            onPress={() => {
              moved();
              back();
            }}
            style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(kit.colors.scrim ?? "#000000", 0.32), alignItems: "center", justifyContent: "center" }]}>
            <Pressable onPress={() => {}}>
              <Overlaid.Provider value>
                <Top params={top.params} />
              </Overlaid.Provider>
            </Pressable>
          </Pressable>
        ) : (
          <Top params={top.params} />
        )}
      </View>
    </NavProvider>
  );
}

/** a screen shown over another, as the preview shows it: at its own size, its corners rounded, on a scrim that closes
 *  it (an app with a router of its own draws its overlay screens in this) */
export function OverlayFrame({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const kit = useKit();
  return (
    <Pressable
      accessibilityLabel="Close"
      onPress={() => {
        moved();
        onClose();
      }}
      style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(kit.colors.scrim ?? "#000000", 0.32), alignItems: "center", justifyContent: "center" }]}>
      <Pressable onPress={() => {}}>
        <Overlaid.Provider value>{children}</Overlaid.Provider>
      </Pressable>
    </Pressable>
  );
}
