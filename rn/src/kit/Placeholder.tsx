import type { ReactNode } from "react";
import { Text as RNText, View } from "react-native";

import { heldLayout, Held, type PartBase } from "./atoms/basics";
import { Glyph } from "./icons/Icon";
import { useFill, type FlowProps } from "./layout";
import { Surface } from "./Surface";
import { corner, typeStyle, useKit } from "./theme/ThemeProvider";

/* A part the kit has no component for and no tree of atoms to stand in for it: a frame of the part's size that says
 * which part goes there, so a screen keeps its layout and the gap is plain to see. The exporter lists every one it
 * prints (lib/export/rn: `warnings`); what a container holds is still laid out inside it. */

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
    borderWidth: 1.5,
    borderStyle: "dashed" as const,
    borderColor: kit.colors.outline,
    borderRadius: corner(kit, "md"),
    backgroundColor: kit.colors["surface-container-low"],
    overflow: "hidden" as const,
    ...(holds ? heldLayout({ ...rest, width, height }, fill) : { width, height, minWidth: 96, minHeight: 48, alignItems: "center" as const, justifyContent: "center" as const, padding: 8, rowGap: 4, ...fill }),
  };
  return (
    <Surface base={base} appearance={rest} onPress={rest.onPress} testID={rest.testID ?? `placeholder-${part}`} accessibilityLabel={name ?? part}>
      {holds ? (
        <Held p={rest}>{children}</Held>
      ) : (
        <>
          <Glyph name="extension" size={20} color={kit.colors["on-surface-variant"]} />
          <RNText numberOfLines={2} style={{ ...typeStyle(kit, "label-medium"), color: kit.colors["on-surface-variant"], textAlign: "center" }}>
            {name ?? part}
          </RNText>
          <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-small"), fontFamily: "monospace", color: kit.colors.outline }}>
            {part}
          </RNText>
          {children ? <View>{children}</View> : null}
        </>
      )}
    </Surface>
  );
}
