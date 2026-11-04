
import { Suspense, useMemo } from "react";
import { Item } from "@/lib/tokens";
import { useLang } from "@/lib/i18n";
import { useIcons } from "@/parts/icons";
import { PartSurface } from "@/parts/theme";
import { appearanceOf } from "@/parts/appearance";
import { partBySlug, viewOf } from "@/parts/registry";
import type { Screen } from "@/parts/types";
import { renderNode } from "@/parts/render";
import type { PNode } from "@/parts/node";

const NOTHING: PNode = { type: "span" };

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

/** A part drawn as the real shadcn M3E component it stands for. On the canvas it is inert: a press
 *  belongs to the part (to select and drag it), not to the button inside it. In the preview
 *  (`live`) it works. */
export function PartView({ item, live = false, screen }: { item: Item; live?: boolean; /** the frame the part is on: an open overlay's box is no larger than it */ screen?: Screen }) {
  const def = partBySlug(item.component);
  /* a prop left at its default shows the default of the editor's language */
  const lang = useLang();
  const tree = useMemo(() => (def ? viewOf(def, item.props, appearanceOf(item), screen, live) : null), [def, item.props, item.fill, item.textColor, item.corners, screen?.w, screen?.h, live, lang]);
  /* the icon component is memoized: icons that arrive after the first draw show only in a fresh tree */
  const icons = useIcons(tree ?? NOTHING);
  if (!tree) return <MissingPart item={item} />;
  return (
    <PartSurface>
      {/* an inline box inside the part's block would sit on the strut's baseline, ~a line's
       *  leading low; top-aligned, the part's content starts at the part's own top */}
      <div key={icons} inert={!live} style={{ display: "inline-flex", verticalAlign: "top", pointerEvents: live ? undefined : "none" }}>
        {/* a pack's component is fetched when first drawn: its guessed size holds the place */}
        <Suspense fallback={<div style={{ width: def?.w, height: def?.h }} />}>{renderNode(tree)}</Suspense>
      </div>
    </PartSurface>
  );
}
