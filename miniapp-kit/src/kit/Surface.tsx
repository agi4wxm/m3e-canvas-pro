import { View } from "@tarojs/components";
import { createContext, useContext, useMemo, type ReactNode } from "react";

import { paint, type Appearance } from "./look";
import { sx, type CSS } from "./styles";
import { Ink } from "./theme";

/* A view painted with a part's look: its own style under what the author set (a fill, corners, effects), the words'
 * roles redefined for what it holds, and the look's words for every `Text` inside. Every part with a surface is drawn
 * on one, so the look lands where the web lands it. A tap is the view's own (`onClick`, which stops there: a button in
 * a row is not a tap on the row); while a finger is on it the view dims (`m3e-pressed`, in the kit's stylesheet). */

/** what a look sets on the words of the part it paints, for every `Text` inside */
const TextLook = createContext<CSS | undefined>(undefined);
export const useTextLook = () => useContext(TextLook);

/** the attributes that name a part on the page, for tests and tools: `data-part` */
export const tagOf = (testID: string | undefined): Record<string, string> => (testID ? { "data-part": testID } : {});

export type SurfaceProps = {
  /** the part's own look, before the author's */
  base?: CSS;
  appearance?: Appearance;
  /** what the layout around asks (a cell's fill) */
  style?: CSS;
  onPress?: () => void;
  /** the words' role inside, when the part sets one of its own (a filled button) */
  ink?: string;
  testID?: string;
  label?: string;
  role?: string;
  children?: ReactNode;
};

export function Surface({ base, appearance, style, onPress, ink, testID, label, role, children }: SurfaceProps) {
  const painted = useMemo(() => paint(appearance), [appearance]);
  let body = <>{children}</>;
  const inkRole = painted.ink ?? ink;
  if (inkRole) body = <Ink role={inkRole}>{body}</Ink>;
  if (painted.text) body = <TextLook.Provider value={painted.text}>{body}</TextLook.Provider>;
  return (
    <View
      {...tagOf(testID)}
      style={sx({ boxSizing: "border-box", position: "relative" }, base, painted.style, style)}
      onClick={onPress ? (e) => (e.stopPropagation(), onPress()) : undefined}
      hoverClass={onPress ? "m3e-pressed" : "none"}
      ariaLabel={label}
      ariaRole={role ?? (onPress ? "button" : undefined)}
    >
      {body}
    </View>
  );
}
