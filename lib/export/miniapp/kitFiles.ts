/* The mini-program kit's own files (miniapp-kit/src/kit), by their path under it: what an export copies into the app's
 * src/kit as it is. A test holds this list to the folder (lib/export/miniapp/miniapp.test.ts). */

export const MINIAPP_KIT_FILES = [
  "Placeholder.tsx",
  "Surface.tsx",
  "app/nav.ts",
  "app/screen.tsx",
  "app/spec.ts",
  "app/transport.ts",
  "app/values.ts",
  "app/vars.ts",
  "atoms/basics.tsx",
  "atoms/controls.tsx",
  "atoms/indicators.tsx",
  "atoms/words.tsx",
  "color.ts",
  "composites/bars.tsx",
  "composites/content.tsx",
  "composites/forms.tsx",
  "composites/overlays.tsx",
  "coverage.ts",
  "iconNames.ts",
  "icons.tsx",
  "index.ts",
  "kit.css",
  "layout.tsx",
  "look.ts",
  "parts.generated.ts",
  "parts.ts",
  "recipes.ts",
  "registry.ts",
  "screen.tsx",
  "shapes.generated.ts",
  "split.tsx",
  "styles.ts",
  "theme.generated.ts",
  "theme.ts",
  "value.ts",
] as const;

export const MINIAPP_KIT_DIR = "miniapp-kit/src/kit";

/** A kit file as an app has it: the shared runtime under the product's own name. The kit names it `@m3e/app-runtime`
 *  (its own app maps that to the editor's lib/app); only whole import lines naming it are changed. */
export function kitFileFor(text: string, runtimePackage: string): string {
  return text
    .split("\n")
    .map((line) => (/^(import|export)\s.*\sfrom\s"@m3e\/app-runtime";$/.test(line) ? line.replace('"@m3e/app-runtime"', JSON.stringify(runtimePackage)) : line))
    .join("\n");
}
