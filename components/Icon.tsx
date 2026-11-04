
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
