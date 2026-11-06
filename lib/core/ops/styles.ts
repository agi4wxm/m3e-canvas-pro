/* One custom style put into the document, without having to write out every other style it already has: what a model
 * (or an MCP client) does with a style it wrote or was handed. It goes through the same validation as a style file
 * (lib/styles/custom.ts `validateCustomStyle`): whatever comes in, what lands is a complete, safe style, and the result
 * says what was changed and what is left for someone to look at (colors that read too faintly). */

import { CUSTOM_PREFIX, validateCustomStyle, withStyle, type StyleProblem } from "../../styles";
import { op, OpError, S } from "../op";
import { applyStyle, setStyles } from "./document";

/** a style's problems in a line each, for a model to fix */
export const problemLines = (problems: StyleProblem[]) => problems.map((p) => `${p.path || "style"}: ${p.en} (${p.fix})`);

/** a key a style without one is given: its name made a word, so writing the same style again replaces it */
function keyOf(input: Record<string, unknown>): string | undefined {
  if (typeof input.key === "string" && input.key.trim()) return undefined;
  const name = typeof input.name === "string" ? input.name : input.name && typeof input.name === "object" ? String((input.name as Record<string, unknown>).en ?? Object.values(input.name)[0] ?? "") : "";
  const slug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return slug ? `${CUSTOM_PREFIX}${slug}` : undefined;
}

export const addCustomStyle = op<{ style: Record<string, unknown>; wear?: boolean }, { key: string; worn: boolean; problems: string[] }>({
  name: "add_custom_style",
  summary:
    "Adds a custom style to the document's own styles, or replaces the one with its key, validated like a style file: roles as #RRGGBB with contrast checked, faces, icon families, shapes and control recipes from the catalog, CSS rules on data-slot selectors with safe properties only. With wear, the document puts it on in the same step. Returns {key, worn, problems}: what validation changed or wants looked at.",
  args: S.obj(
    {
      style: S.any("the style (get_style of a custom style shows the shape): key (custom:…), name, extends (a built-in style to start from), seed, light and dark roles, mode, font, display, icons, shape, motion, control, recipes, ux, screen, type, tokens, rules"),
      wear: S.bool("put it on the document"),
    },
    ["style"],
  ),
  label: () => "Style",
  run(s, a, ctx) {
    if (!a.style || typeof a.style !== "object" || Array.isArray(a.style)) throw new OpError("invalid_value", "style should be an object: {name, extends?, light?, dark?, recipes?…}.", "style");
    const key = keyOf(a.style);
    const { style, problems } = validateCustomStyle(key ? { ...a.style, key } : a.style);
    if (!style) throw new OpError("invalid_value", `That is not a style: ${problemLines(problems).join("; ")}`, "style");
    const styles = withStyle(s.doc.styles, style);
    const worn = !!a.wear || s.doc.theme.style === style.key;
    const out = a.wear ? applyStyle.run(s, { style: style.key, styles }, ctx) : setStyles.run(s, { styles }, ctx);
    return { ...out, result: { key: style.key, worn, problems: problemLines(problems.filter((p) => p.code !== "key")) } };
  },
});
