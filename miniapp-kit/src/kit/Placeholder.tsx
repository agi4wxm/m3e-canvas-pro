import type { ReactNode } from "react";

import { heldLayout, Held, type PartBase } from "./atoms/basics";
import { Words } from "./atoms/words";
import { c } from "./color";
import { Glyph } from "./icons";
import { useFill, type FlowProps } from "./layout";
import { Surface } from "./Surface";
import { corner, typeStyle, useKit } from "./theme";

/* A part the kit has no component for and no tree of atoms to stand in for it: a frame of the part's size that says
 * which part goes there, so a screen keeps its layout and the gap is plain to see. The exporter lists every one it
 * prints (`warnings`); what a container holds is still laid out inside it. */

export type PlaceholderProps = PartBase &
  FlowProps & {
    /** the part's id (`prize-wheel`) */
    part: string;
    /** what it is called */
    name?: string;
    width?: number;
    height?: number;
    children?: ReactNode;
  };

export function Placeholder({ part, name, width, height, children, ...rest }: PlaceholderProps) {
  const kit = useKit();
  const fill = useFill();
  const holds = !!children && (rest.layout ?? "free") !== "free";
  const base = {
    border: `1.5px dashed ${c("outline")}`,
    borderRadius: corner(kit, "md"),
    backgroundColor: c("surface-container-low"),
    overflow: "hidden",
    flexShrink: 0,
    ...(holds ? heldLayout({ ...rest, width, height }, fill) : { width, height, minWidth: 96, minHeight: 48, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 8, rowGap: 4, ...fill }),
  };
  return (
    <Surface base={base} appearance={rest} onPress={rest.onPress} testID={rest.testID ?? `placeholder-${part}`} label={name ?? part}>
      {holds ? (
        <Held>{children}</Held>
      ) : (
        <>
          <Glyph name="extension" size={20} color="on-surface-variant" />
          <Words text={name ?? part} lines={2} style={{ ...typeStyle(kit, "label-medium"), color: c("on-surface-variant"), textAlign: "center" }} />
          <Words text={part} lines={1} style={{ ...typeStyle(kit, "label-small"), fontFamily: "monospace", color: c("outline") }} />
          {children}
        </>
      )}
    </Surface>
  );
}
