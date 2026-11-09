import { View } from "@tarojs/components";

import { sx, type CSS } from "../styles";

/** Words in a block of their own: `lines` keeps them to so many lines and ends them with "…". A string inside a view is
 *  a text node in every mini-program, and a view can be clamped where <text> cannot. `holder` is handed the page's node
 *  the words are in, which a frame writes into (frame.tsx). */
export function Words({ text, style, lines, onPress, holder }: { text: string | undefined; style?: CSS; lines?: number; onPress?: () => void; holder?: (node: unknown) => void }) {
  const clamp: CSS | undefined =
    lines === 1
      ? { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }
      : lines && lines > 1
        ? { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines, overflow: "hidden" }
        : { whiteSpace: "pre-wrap" };
  return (
    <View ref={holder as never} style={sx({ overflowWrap: "break-word", minWidth: 0 }, clamp, style)} onClick={onPress ? (e) => (e.stopPropagation(), onPress()) : undefined}>
      {text ?? ""}
    </View>
  );
}
