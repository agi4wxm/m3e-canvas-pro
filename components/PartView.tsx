
import { Suspense, memo, useMemo } from "react";
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

type PartViewProps = { item: Item; live?: boolean; /** the frame the part is on: an open overlay's box is no larger than it */ screen?: Screen; /** in the preview, an effect has opened this menu or popover: it is drawn open as on the canvas, and still works */ held?: boolean };

/** A part drawn as the real shadcn M3E component it stands for. On the canvas it is inert: a press
 *  belongs to the part (to select and drag it), not to the button inside it. In the preview
 *  (`live`) it works. */
function PartViewBody({ item, live = false, screen, held = false }: PartViewProps) {
  const def = partBySlug(item.component);
  /* a prop left at its default shows the default of the editor's language */
  const lang = useLang();
  const tree = useMemo(() => (def ? viewOf(def, item.props, appearanceOf(item), screen, live && !held) : null), [def, item.props, item.fill, item.textColor, item.corners, screen?.w, screen?.h, live, held, lang]);
  /* the icon component is memoized: icons that arrive after the first draw show only in a fresh tree */
  const icons = useIcons(tree ?? NOTHING);
  /* the same elements for the same tree: React then leaves the whole component under them alone */
  const drawn = useMemo(() => (tree ? renderNode(tree) : null), [tree]);
  if (!tree) return <MissingPart item={item} />;
  return (
    <PartSurface>
      {/* an inline box inside the part's block would sit on the strut's baseline, ~a line's
       *  leading low; top-aligned, the part's content starts at the part's own top */}
      <div key={icons} inert={!live} style={{ display: "inline-flex", verticalAlign: "top", pointerEvents: live ? undefined : "none" }}>
        {/* a widget is fetched when first drawn: its guessed size holds the place */}
        <Suspense fallback={<div style={{ width: def?.w, height: def?.h }} />}>{drawn}</Suspense>
      </div>
    </PartSurface>
  );
}

/* The canvas draws every part twice over, on the screen and in the measuring layer, and the editor
 * renders on every pointer move of a drag: a part that has not changed must not be drawn again. A
 * screen is compared by its size, since the canvas works one out afresh each time. */
export const PartView = memo(PartViewBody, (a, b) => a.item === b.item && a.live === b.live && a.held === b.held && a.screen?.w === b.screen?.w && a.screen?.h === b.screen?.h);
