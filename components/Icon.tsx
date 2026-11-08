import { memo, useEffect, useSyncExternalStore } from "react";
import { Icon as Iconify } from "@iconify/react/offline";
import { Icon as PartIcon } from "@/components/m3e/icon";
import { ensureIcons, useIconVersion } from "@/parts/icons";

/* The editor's own icons are ligatures of Material Symbols Rounded, a font index.html takes from Google Fonts. When it
 * cannot be had (offline, or the font blocked) a ligature would show as a few clipped letters of its name, so the icons
 * are drawn instead from the Rounded glyphs the canvas bundles (components/m3e/icon-sets, loaded by parts/icons.ts); a
 * name the bundle lacks leaves its box empty, and the control keeps its own label. */

const FONT = '24px "Material Symbols Rounded"';
type Font = "waiting" | "ok" | "missing";
let font: Font = "waiting";
let checked = false;
const heard = new Set<() => void>();

/** whether the font came: asked once, the first time an icon is drawn in a browser */
function checkFont() {
  if (checked || typeof document === "undefined" || !document.fonts) return;
  checked = true;
  const settle = (next: Font) => {
    font = next;
    heard.forEach((l) => l());
  };
  /* the stylesheet that declares the font has loaded (or failed) before any script runs: no face, or a face that does
   * not load, is a font that is not there */
  document.fonts.load(FONT, "home").then(
    (faces) => settle(faces.length ? "ok" : "missing"),
    () => settle("missing"),
  );
}

const useFont = () =>
  useSyncExternalStore(
    (l) => {
      heard.add(l);
      checkFont();
      return () => heard.delete(l);
    },
    () => font,
    (): Font => "waiting",
  );

/** a name drawn from the bundled Rounded glyphs, once they have been loaded */
function BundledGlyph({ name, size, color, fill }: { name: string; size: number; color?: string; fill?: boolean }) {
  const version = useIconVersion();
  useEffect(() => ensureIcons([name]), [name]);
  const glyph = `material-symbols:${name.replaceAll("_", "-")}${fill ? "" : "-outline"}-rounded`;
  return (
    <span aria-hidden data-icon-fallback={name} style={{ display: "inline-flex", width: size, height: size, color, flex: "0 0 auto" }}>
      <Iconify key={version} icon={glyph} width={size} height={size} />
    </span>
  );
}

/* the panels draw a few hundred of these and render with the editor: one whose props are the same is not drawn again */
export const Icon = memo(function Icon({
  name,
  size = 24,
  color,
  fill,
}: {
  name: string;
  size?: number;
  color?: string;
  fill?: boolean;
}) {
  const ligatures = useFont() !== "missing";
  /* one of the document's own icons (svg:<id>) is a drawing, not a ligature: the parts' icon component draws it, so
   * every panel cell that shows a part's icon shows it as the canvas does */
  if (name.startsWith("svg:"))
    return (
      <span aria-hidden style={{ display: "inline-flex", width: size, height: size, color, flex: "0 0 auto" }}>
        <PartIcon name={name} size={size} />
      </span>
    );
  if (!ligatures) return <BundledGlyph name={name} size={size} color={color} fill={fill} />;
  return (
    <span
      className="msr"
      /* the ligature is a picture, not words: a screen reader should not spell out its name */
      aria-hidden
      data-fill={fill ? "1" : "0"}
      style={{ fontSize: size, color }}
    >
      {name}
    </span>
  );
});
