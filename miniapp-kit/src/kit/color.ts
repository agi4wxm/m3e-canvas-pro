/* Colors as the stylesheet has them: every M3 role is a CSS variable on the screen's root (`--md-sys-color-<role>`, and
 * its red, green and blue as `--md-sys-color-<role>-rgb` so an opacity can be laid over it), the style's own colors are
 * `--m3e-st-<name>`. A painted surface redefines the words' roles for what it holds (`inkVars`), the way the web's
 * parts redefine `--md-sys-color-on-surface` (parts/appearance.ts). */

const kebab = (s: string) => s.replace(/[A-Z]/g, (x) => `-${x.toLowerCase()}`);
const round = (n: number) => Math.round(n * 1000) / 1000;

/** a role: `var(--md-sys-color-primary)` */
export const c = (role: string) => `var(--md-sys-color-${role})`;

/** a role with an opacity (0 to 1) laid over it */
export const ca = (role: string, alpha: number) => `rgba(var(--md-sys-color-${role}-rgb), ${round(alpha)})`;

/** one of the style's own colors (the switch's on-color, the chosen tab, the bars' ground) */
export const st = (name: string) => `var(--m3e-st-${kebab(name)})`;

/** A color the document or a style names, as CSS: a role (`primary`, `on-surface`), a role with an opacity
 *  (`primary/40`) or a hex. Anything else is nothing. */
export function css(ref: string | undefined): string | undefined {
  if (!ref || typeof ref !== "string") return undefined;
  if (ref.startsWith("#")) return /^#[0-9a-f]{3,8}$/i.test(ref) ? ref : undefined;
  const [role, alpha] = ref.split("/");
  if (!/^[a-z][a-z0-9-]*$/.test(role)) return undefined;
  return alpha === undefined ? c(role) : ca(role, Number(alpha) / 100);
}

/** a fill role as the document writes it (`primaryContainer`) as CSS */
export const roleCss = (camel: string | undefined) => (camel && /^[a-zA-Z]+$/.test(camel) ? c(kebab(camel)) : undefined);

/** red, green and blue of a hex, for a `-rgb` variable */
export function rgbOf(hex: string): string | undefined {
  const m = /^#([0-9a-f]{3,8})$/i.exec(hex);
  if (!m) return undefined;
  let h = m[1];
  if (h.length <= 4) h = [...h].map((x) => x + x).join("");
  return `${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}`;
}

/** What a surface sets so that the words inside read in `ref` (a role, a role with an opacity, or a hex): the words'
 *  two roles redefined for its subtree. A role never points at itself, which would leave the variable unset. */
export function inkVars(ref: string | undefined): Record<string, string> {
  if (!ref) return {};
  const out: Record<string, string> = {};
  if (ref.startsWith("#")) {
    const rgb = rgbOf(ref);
    if (!rgb) return {};
    for (const r of ["on-surface", "on-surface-variant"]) Object.assign(out, { [`--md-sys-color-${r}`]: ref, [`--md-sys-color-${r}-rgb`]: rgb });
    return out;
  }
  const [role, alpha] = ref.split("/");
  if (!/^[a-z][a-z0-9-]*$/.test(role)) return {};
  for (const r of ["on-surface", "on-surface-variant"]) {
    if (r === role && alpha === undefined) continue;
    out[`--md-sys-color-${r}`] = alpha === undefined ? c(role) : ca(role, Number(alpha) / 100);
    out[`--md-sys-color-${r}-rgb`] = `var(--md-sys-color-${role}-rgb)`;
  }
  return out;
}
