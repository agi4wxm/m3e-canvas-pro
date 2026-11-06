import { partBySlug } from "../../../parts/registry";

/** the icon names a part's props draw: its icon props and the icons of its rows */
export function iconNamesOf(slug: string, props: Record<string, unknown>): string[] {
  const def = partBySlug(slug);
  if (!def) return [];
  const out: string[] = [];
  for (const d of def.props) {
    const v = props[d.key];
    if (d.kind === "icon" && typeof v === "string" && v) out.push(v);
    if (d.kind === "list" && Array.isArray(v)) for (const row of v) if (row && typeof row === "object" && typeof (row as { icon?: unknown }).icon === "string" && (row as { icon: string }).icon) out.push((row as { icon: string }).icon);
  }
  return out;
}
