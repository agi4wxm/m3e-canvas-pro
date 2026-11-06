import { Icon as PartIcon } from "@/components/m3e/icon";

export function Icon({
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
  /* one of the document's own icons (svg:<id>) is a drawing, not a ligature: the parts' icon component draws it, so
   * every panel cell that shows a part's icon shows it as the canvas does */
  if (name.startsWith("svg:"))
    return (
      <span aria-hidden style={{ display: "inline-flex", width: size, height: size, color, flex: "0 0 auto" }}>
        <PartIcon name={name} size={size} />
      </span>
    );
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
}
