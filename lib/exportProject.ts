import { familiesOf } from "./variants";
import { strToU8, zipSync } from "fflate";
import { buildScreens, importLines, type ScreenCode } from "./codegen";
import { getLang, type Lang } from "./i18n";
import { BASELINE_SEED } from "./m3e/color";
import { runtimeSource } from "./runtimeSource";
import { SLIDE_SPEC, faceSheetsOf, fontFamilyOf, normalizeTheme, seedOf, shapeScaleOf, type Doc } from "./tokens";
import { APP_SCOPE, recipesOf, styleCss, withDocStyles } from "./styles";
import { colorCss, elevationCss } from "./look";
import { darkSwitchedCss } from "./variables";
import { iconSubset, setsOf } from "../components/m3e/icon-sets/load";
import { SOURCES } from "../components/m3e/icon-sets/manifest";
import { str } from "../parts/print";
import { EXPORT_ALWAYS, EXPORT_DEV } from "./exportPackages";
import { VERSIONS } from "./versions.generated";

/* A document as a project someone can install and run: its screens, the runtime their taps call, its
 * theme, and a copy of only the source files those reach, found by walking their imports. Nothing here
 * touches the page: the files come in through `read`, and the icons out of the bundled sets
 * (components/m3e/icon-sets), so the same code runs in the browser and in scripts/check-export.ts. */

export type ProjectFiles = Record<string, string | Uint8Array>;

type IconData = { icons?: Record<string, unknown>; aliases?: Record<string, { parent?: string }>; not_found?: string[] };

export type ExportOptions = {
  /** one screen instead of all */
  onlyFrameId?: string;
  lang?: Lang;
  /** a source file's text by its path from the repo's root; rejects when there is none */
  read?: (path: string) => Promise<string>;
  /** glyphs no bundled icon set has (a name an author typed); rejects when they cannot be had */
  fetchIcons?: (ids: string[]) => Promise<IconData>;
  /** how far along: files read so far, of those known so far */
  onProgress?: (done: number, total: number) => void;
};

export type Project = {
  /** the package's name, and the zip's */
  name: string;
  files: ProjectFiles;
  /** what is missing but did not stop the export */
  warnings: string[];
};

const json = (v: unknown, indent = 2) => JSON.stringify(v, null, indent);
const dirOf = (p: string) => p.slice(0, p.lastIndexOf("/") + 1);

/** a relative path made plain: `parts/widgets/../icons` is `parts/icons` */
function joined(dir: string, rel: string): string {
  const out: string[] = [];
  for (const piece of `${dir}${rel}`.split("/")) {
    if (piece === "..") out.pop();
    else if (piece !== ".") out.push(piece);
  }
  return out.join("/");
}

/** where a repo file lands. The editor's `parts/` become `src/components/`: printed code knows a widget as `@/components/widgets/…`, and a widget's `../icons` still has to reach its neighbour */
export const projectPath = (path: string) => (path.startsWith("parts/") ? `src/components/${path.slice("parts/".length)}` : `src/${path}`);

const packageOf = (spec: string) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);

/** every module a source names, type imports too since a project has to typecheck */
export function importsIn(source: string, css = false): string[] {
  if (css) return [...source.matchAll(/@import\s+["']([^"']+)["']/g)].map((m) => m[1]);
  const bare = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const found = [...bare.matchAll(/\b(?:import|export)\s[^;"'`]*?\bfrom\s*["']([^"']+)["']/g), ...bare.matchAll(/\bimport\s*["']([^"']+)["']/g), ...bare.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)];
  return [...new Set(found.map((m) => m[1]))];
}

/** Walks the imports from `roots`: the files reached, with their text, and the packages they name. A
 *  module that is neither a package nor a file there is a project that would not build, so it throws. */
export async function importClosure(roots: string[], read: (path: string) => Promise<string>, onFile?: (done: number, total: number) => void): Promise<{ files: Map<string, string>; packages: Set<string> }> {
  const files = new Map<string, string>();
  const packages = new Set<string>();
  const seen = new Set<string>();
  const queue: { spec: string; from: string }[] = roots.map((spec) => ({ spec, from: "" }));
  let done = 0;
  while (queue.length) {
    const { spec, from } = queue.pop()!;
    const local = spec.startsWith("@/") || spec.startsWith(".");
    if (!local) {
      packages.add(packageOf(spec));
      continue;
    }
    /* printed code names a widget by where it lands in the project */
    const stem = spec.startsWith("@/components/widgets/") ? `parts/widgets/${spec.slice("@/components/widgets/".length)}` : spec.startsWith("@/") ? spec.slice(2) : joined(dirOf(from), spec);
    if (seen.has(stem)) continue;
    seen.add(stem);
    const tries = /\.(css|ts|tsx)$/.test(stem) ? [stem] : [`${stem}.ts`, `${stem}.tsx`, `${stem}.d.ts`, `${stem}/index.ts`];
    let found: string | undefined;
    for (const path of tries) {
      try {
        files.set(path, await read(path));
        found = path;
        break;
      } catch {
        // the next spelling of it
      }
    }
    if (!found) throw new Error(`${spec}${from ? ` (imported by ${from})` : ""} is not a file the project can copy`);
    done++;
    onFile?.(done, done + queue.length);
    for (const next of importsIn(files.get(found)!, found.endsWith(".css"))) queue.push({ spec: next, from: found });
  }
  return { files, packages };
}

/* ---------- pictures ---------- */

const EXTENSION: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg", "image/avif": "avif", "image/bmp": "bmp" };

/** the same picture used twice is one file */
function hashOf(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/** a picture's bytes; one whose data cannot be read is an empty file, not a failed export */
function dataToBytes(data: string): Uint8Array {
  const comma = data.indexOf(",");
  const body = data.slice(comma + 1);
  try {
    if (/;base64$/i.test(data.slice(0, comma))) {
      const bin = atob(body);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }
    return strToU8(decodeURIComponent(body));
  } catch {
    return new Uint8Array();
  }
}

/* ---------- icons ---------- */

/** The icon names a source spells out, the way scripts/icons.mjs reads them: `name="x"` on an icon,
 *  any `…icon="x"` attribute, `…icon: "x"` in a list of rows, the strings of a `name={a ? "x" : "y"}`. */
export function iconNamesIn(source: string): Set<string> {
  const out = new Set<string>();
  const scan = (text: string, attr: string) => {
    for (const m of text.matchAll(new RegExp(`\\b${attr}="([a-z0-9_]+)"`, "gi"))) out.add(m[m.length - 1]);
    for (const m of text.matchAll(new RegExp(`\\b${attr}=\\{([^{}]*)\\}`, "gi"))) for (const n of m[m.length - 1].replace(/[!=]==?\s*"[^"]*"/g, "").matchAll(/"([a-z][a-z0-9_]*)"/g)) out.add(n[1]);
  };
  scan(source, "\\w*icon");
  for (const tag of source.matchAll(/<(?:Widget)?Icon\b[^>]*>/g)) scan(tag[0], "name");
  for (const m of source.matchAll(/\b\w*icon:\s*"([a-z0-9_]+)"/gi)) out.add(m[1]);
  return out;
}

const glyphIds = (name: string) => {
  const base = name.replaceAll("_", "-");
  return [`${base}-outline-rounded`, `${base}-rounded`];
};

/** the JSON inside a generated icon-data file */
const iconDataOf = (source: string): IconData => JSON.parse(source.slice(source.indexOf("= ") + 2, source.lastIndexOf("\n\nexport default")));

const iconDataFile = (data: { icons: Record<string, unknown>; aliases: Record<string, unknown> }) => `import type { IconifyJSON } from "@iconify/react/offline"

// Generated by M3E Canvas. The icons this app's screens use.
// Material Symbols Rounded, Apache-2.0, via Iconify.
const data: IconifyJSON = ${json({ prefix: "material-symbols", width: 24, height: 24, icons: data.icons, ...(Object.keys(data.aliases).length ? { aliases: data.aliases } : {}) })}

export default data
`;

async function fromIconify(ids: string[]): Promise<IconData> {
  const out: Required<Pick<IconData, "icons" | "aliases">> = { icons: {}, aliases: {} };
  for (let i = 0; i < ids.length; i += 60) {
    const res = await fetch(`https://api.iconify.design/material-symbols.json?icons=${ids.slice(i, i + 60).join(",")}`);
    if (!res.ok) throw new Error(`Iconify: ${res.status}`);
    const data = (await res.json()) as IconData;
    Object.assign(out.icons, data.icons);
    Object.assign(out.aliases, data.aliases);
  }
  return out;
}

/** the glyphs of a style's icon family, out of the bundled sets, and which of them draws each name */
const styleIconsFile = (sources: string[], map: Record<string, readonly [string, string]>, collections: unknown[]) => `import type { IconifyJSON } from "@iconify/react/offline"

// Generated by M3E Canvas. The icons of this app's style, via Iconify:
// ${sources.join(", ")}. See NOTICE.

/** the glyph that draws each Material name in this style, outlined and filled; a name not here is drawn from Material Symbols Rounded */
export const map: Record<string, readonly [string, string]> = ${json(map)}

const data: IconifyJSON[] = ${json(collections)}

export default data
`;

/* An exported project registers its glyphs up front (icon-data.app.ts, style-icons.ts) and has none of the
 * editor's bundled sets, so the loader the widgets reach is this. */
const ICON_SETS_STUB = `import type { IconFamily } from "../icon-family"

/* In this project every glyph the screens use is registered up front, from
 * components/m3e/icon-data*.ts and src/style-icons.ts: there is nothing more
 * to load, and a name that is not there is fetched from Iconify (parts' icons.ts). */
export async function loadIcons(_family: IconFamily, _names: Iterable<string>): Promise<boolean> {
  return false
}
`;

/* ---------- the files written for this document ---------- */

/** the screens that are sizes of one screen, each with its whole family */
function sizesSource(families: string[][]): string {
  if (!families.length) return "";
  const rows = families.flatMap((family) => family.map((key) => `  ${key}: ${str(family)},`)).join("\n");
  return `
/** the sizes of one screen: the window picks among them, the way the preview's width switch does */
const SIZES: Partial<Record<ScreenId, ScreenId[]>> = {
${rows}
}

/** the device a window of this width is; the family's nearest size to it stands in */
const deviceWidth = (wide: number) => (wide < 600 ? 412 : wide < 1100 ? 834 : 1280)

function useSized(asked: ScreenId): ScreenId {
  const [wide, setWide] = useState(() => window.innerWidth)
  useLayoutEffect(() => {
    const measure = () => setWide(window.innerWidth)
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])
  const family = SIZES[asked]
  if (!family) return asked
  const want = deviceWidth(wide)
  return family.reduce((best, s) => (Math.abs(SCREENS[s].width - want) < Math.abs(SCREENS[best].width - want) ? s : best))
}
`;
}

function appSource(screens: ScreenCode[], motion: string, usesToast: boolean, families: string[][]): string {
  const imports = screens.map((s) => `import { ${s.component} } from "./screens/${s.component}"`).join("\n");
  const table = screens.map((s) => `  ${s.key}: { Screen: ${s.component}, width: ${s.width}, height: ${s.height}, foot: ${Math.round(s.foot)} },`).join("\n");
  return `import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react"
import { AnimatePresence, MotionConfig, motion, useIsPresent, type TargetAndTransition, type Variants } from "motion/react"
import { PortalContainer } from "@/components/m3e/portal-container"
${usesToast ? `import { Toaster } from "@/components/m3e/sonner"\n` : ""}import { useApp, type App as AppState, type ScreenId } from "./runtime"
${imports}

const SCREENS: Record<ScreenId, { Screen: ComponentType; width: number; height: number; foot: number }> = {
${table}
}

${sizesSource(families)}
/** the theme's motion scheme: springs for expressive, eased tweens for standard */
const SPRINGS = ${motion === "expressive"}
const EASE = [0.2, 0, 0, 1] as const
const SLIDE_S = 0.42
const SPRING = { type: "spring" as const, stiffness: 360, damping: 26, mass: 1 }
const SLIDES: Partial<Record<AppState["move"]["transition"], { axis: "x" | "y"; enter: number; exit: number }>> = ${JSON.stringify(SLIDE_SPEC)}

type Pose = TargetAndTransition
const off = (axis: "x" | "y", at: number): Pose => (axis === "x" ? { x: \`\${at * 100}%\`, y: 0 } : { x: 0, y: \`\${at * 100}%\` })

/** where a screen comes in from and goes off to; back plays the same move in reverse */
function poses({ transition, backwards }: AppState["move"]): { initial: Pose; animate: Pose; exit: Pose } {
  const z = { zIndex: { duration: 0 } }
  const slide = SLIDES[transition]
  if (slide) {
    const tr = SPRINGS ? { ...SPRING, ...z } : { duration: SLIDE_S, ease: EASE, ...z }
    return backwards
      ? {
          initial: { ...off(slide.axis, slide.exit), opacity: 0.6, zIndex: 1 },
          animate: { x: 0, y: 0, opacity: 1, zIndex: 1, transition: tr },
          exit: { ...off(slide.axis, slide.enter), opacity: 1, zIndex: 2, transition: tr },
        }
      : {
          initial: { ...off(slide.axis, slide.enter), opacity: 1, zIndex: 2 },
          animate: { x: 0, y: 0, opacity: 1, zIndex: 2, transition: tr },
          exit: { ...off(slide.axis, slide.exit), opacity: 0.6, zIndex: 1, transition: tr },
        }
  }
  if (transition === "fade" || transition === "expand") {
    const far = transition === "expand" ? { from: 0.92, to: 1.06 } : { from: 1, to: 1 }
    const tr = { duration: transition === "fade" ? 0.3 : 0.36, ease: EASE, ...z }
    return {
      initial: { x: 0, y: 0, scale: backwards ? far.to : far.from, opacity: 0, zIndex: backwards ? 1 : 2 },
      animate: { x: 0, y: 0, scale: 1, opacity: 1, zIndex: backwards ? 1 : 2, transition: tr },
      exit: { x: 0, y: 0, scale: backwards ? far.from : far.to, opacity: 0, zIndex: backwards ? 2 : 1, transition: tr },
    }
  }
  const tr = { duration: 0, ...z }
  return {
    initial: { x: 0, y: 0, opacity: 1, zIndex: 2 },
    animate: { x: 0, y: 0, opacity: 1, zIndex: 2, transition: tr },
    exit: { x: 0, y: 0, opacity: 1, zIndex: 1, transition: tr },
  }
}

const VARIANTS: Variants = {
  initial: (m: AppState["move"]) => poses(m).initial,
  animate: (m: AppState["move"]) => poses(m).animate,
  exit: (m: AppState["move"]) => poses(m).exit,
}

/** a screen on its way out takes no more taps */
function Page({ screen }: { screen: ScreenId }) {
  const present = useIsPresent()
  const { Screen } = SCREENS[screen]
  return (
    <div inert={!present} className="absolute inset-0">
      <Screen />
    </div>
  )
}

/** as large as the window allows, never larger than the screen was drawn. A screen far taller than the window is read by scrolling the page */
function useFit(width: number, height: number) {
  const [fit, setFit] = useState(1)
  useLayoutEffect(() => {
    const measure = () => setFit(Math.min(1, window.innerWidth / width, height > window.innerHeight * 1.5 ? 1 : window.innerHeight / height))
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [width, height])
  return fit
}

export function App() {
  ${families.length ? "const { screen: asked, move, snack } = useApp()\n  const screen = useSized(asked)" : "const { screen, move, snack } = useApp()"}
  const shown = SCREENS[screen]
  const fit = useFit(shown.width, shown.height)
  /* overlays open inside the screen, not over the whole window: the transform makes their \`fixed\` lay out in it */
  const [stage, setStage] = useState<HTMLDivElement | null>(null)
  /* a slide between screens of two sizes would drag one shape through the other */
  const was = useRef(screen)
  const from = SCREENS[was.current]
  const changed = from.width !== shown.width || from.height !== shown.height
  const custom: AppState["move"] = changed ? { ...move, transition: "fade" } : move
  useEffect(() => {
    was.current = screen
  })
  return (
    <MotionConfig reducedMotion="user">
      <main className="grid min-h-dvh place-items-center overflow-x-hidden">
        <div style={{ width: shown.width * fit, height: shown.height * fit }}>
          <div
            ref={setStage}
            data-screen={screen}
            className="relative origin-top-left overflow-hidden"
            style={{ width: shown.width, height: shown.height, transform: \`scale(\${fit}) translateZ(0)\` }}
          >
            <PortalContainer container={stage}>
              <AnimatePresence initial={false} mode="popLayout" custom={custom}>
                <motion.div key={screen} custom={custom} variants={VARIANTS} initial="initial" animate="animate" exit="exit" className="absolute inset-0">
                  <Page screen={screen} />
                </motion.div>
              </AnimatePresence>${usesToast ? "\n              <Toaster />" : ""}
            </PortalContainer>
            {snack && (
              <div
                key={snack.id}
                role="status"
                className="bg-inverse-surface text-inverse-on-surface text-body-medium shadow-elevation-3 absolute inset-x-4 z-30 rounded-xs px-4 py-3.5"
                style={{ bottom: 16 + shown.foot }}
              >
                {snack.message}
              </div>
            )}
          </div>
        </div>
      </main>
    </MotionConfig>
  )
}
`;
}

const MAIN = `import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import { AppProvider } from "./runtime"
import { Theme } from "./theme"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Theme>
      <AppProvider>
        <App />
      </AppProvider>
    </Theme>
  </StrictMode>,
)
`;

function themeSource(doc: Doc, name: string): string {
  const theme = normalizeTheme(doc.theme);
  const asked = seedOf(doc.paletteKey, doc.customPalette, theme);
  /* a color, or M3's own: whatever else a file says is not printed */
  const seed = typeof asked === "string" && /^#[0-9a-f]{6}$/i.test(asked) ? asked : BASELINE_SEED;
  /* M3's baseline is a fixed purple whatever the seed: any other seed needs a variant that reads it */
  const variant = seed.toUpperCase() === BASELINE_SEED ? "baseline" : "tonalSpot";
  const shapeScale = shapeScaleOf(theme.shape);
  const mode = theme.bothModes ? "system" : theme.dark ? "dark" : "light";
  const icons = theme.icons && theme.icons !== "rounded" ? theme.icons : undefined;
  return `import type { ReactNode } from "react"
import { ColorModeProvider } from "@/components/m3e/color-mode-provider"
import { M3ThemeProvider, type M3Theme } from "@/components/m3e/m3-theme-provider"
${icons ? `import { registerIconMap, registerIcons, setIconFamily } from "@/components/m3e/icon"\nimport styleIcons, { map as styleIconMap } from "@/style-icons"\n\nstyleIcons.forEach(registerIcons)\nregisterIconMap(${str(icons)}, styleIconMap)\nsetIconFamily(${str(icons)})\n` : ""}
/* The look the document was drawn in. Every color role is generated from the source color,
 * so changing it here is enough; corners and motion follow the other two.${styleCssOf(doc, getLang()) ? " The rest of its style, and the colors it names itself, are in style.css." : ""} */
const THEME: Partial<M3Theme> = {
  source: { primary: ${str(seed)} },
  variant: ${str(variant)},
  contrast: ${str(theme.contrast)},
  motion: ${str(theme.motion)},
  shapeScale: ${shapeScale},
}

export function Theme({ children }: { children: ReactNode }) {
  return (
    <M3ThemeProvider persist={false} defaultTheme={THEME}>
      <ColorModeProvider defaultMode=${str(mode)} storageKey=${str(`${name}:color-mode`)} toggleKey={false}>
        {children}
      </ColorModeProvider>
    </M3ThemeProvider>
  )
}
`;
}

/** the document's style as a stylesheet of its own, or "" when it has none */
function styleCssOf(doc: Doc, lang: Lang): string {
  const theme = normalizeTheme(doc.theme);
  return [styleCss({ ...theme, displayFamily: theme.displayFont ? fontFamilyOf(theme.displayFont, lang) : undefined }, APP_SCOPE), elevationCss(recipesOf(theme).surface, APP_SCOPE), darkSwitchedCss(doc, APP_SCOPE, colorCss)].filter(Boolean).join("\n");
}

function cssSource(doc: Doc, lang: Lang): string {
  const theme = normalizeTheme(doc.theme);
  return `@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "./styles/m3e.css";
${styleCssOf(doc, lang) ? '@import "./style.css";\n' : ""}
@custom-variant dark (&:is(.dark *));

html,
body {
  height: 100%;
}
body {
  margin: 0;
  background: var(--md-sys-color-surface-container);
  color: var(--md-sys-color-on-surface);
  font-family: ${fontFamilyOf(theme.font, lang)};
  overscroll-behavior: none;
}
/* the menus' long lists use this */
.no-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: var(--md-sys-color-outline-variant) transparent;
}
`;
}

function htmlSource(doc: Doc, lang: Lang): string {
  const theme = normalizeTheme(doc.theme);
  const { google: families, css: sheets } = faceSheetsOf(theme, lang);
  const links = (families.length ? `\n    <link rel="preconnect" href="https://fonts.googleapis.com" />\n    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap" />` : "") + sheets.map((href) => `\n    <link rel="stylesheet" href="${href}" />`).join("");
  const title = (doc.title || "App").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${title}</title>
    <link rel="icon" href="data:," />${links}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

const VITE_CONFIG = `import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite-plus"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [{ find: /^@\\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) }],
  },
})
`;

const TSCONFIG = json({
  compilerOptions: {
    target: "ES2022",
    lib: ["dom", "dom.iterable", "esnext"],
    skipLibCheck: true,
    strict: true,
    noEmit: true,
    esModuleInterop: true,
    module: "esnext",
    moduleResolution: "bundler",
    types: ["vite/client"],
    resolveJsonModule: true,
    isolatedModules: true,
    jsx: "react-jsx",
    paths: { "@/*": ["./src/*"] },
  },
  include: ["src"],
});

function readmeSource(doc: Doc, screens: ScreenCode[], copied: string[], missing: string[]): string {
  const dirs = [...new Set(copied.map((p) => p.slice(0, p.lastIndexOf("/"))))].sort();
  /* the title is a heading of one line */
  // eslint-disable-next-line no-control-regex -- a title is one line of plain text: control characters and line separators go
  const title = (doc.title || "").replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").trim() || "App";
  return `# ${title}

Exported from M3E Canvas: ${screens.length} ${screens.length === 1 ? "screen" : "screens"}, working as they did in the preview.

## Run it

\`\`\`bash
bun install
bun run dev
\`\`\`

npm works as well: \`npm install\`, then \`npm run dev\`. It needs Node 22.12 or newer.

\`\`\`bash
bun run build      # to dist/
bun run preview    # serve what was built
bun run typecheck
\`\`\`

## What is where

- \`src/screens/\`: one component per screen. Edit these first.
- \`src/runtime.tsx\`: what the running app remembers. \`useApp()\` holds the current screen and its history, the variables and what is shown; \`go("cart")\`, \`back()\`, \`setVar(…)\`, \`show(…)\` and the rest are plain calls on it.
- \`src/App.tsx\`: draws the current screen, with the transition between screens.
- \`src/theme.tsx\` and \`src/index.css\`: the palette, corners, type and motion.
- \`public/images/\`: the pictures picked in the editor.
- Copied from the editor, only what these screens use: ${dirs.map((d) => `\`${d}/\``).join(", ")}.
${missing.length ? `\n## Before you ship\n\nThese icons could not be fetched when this was exported, so they draw blank: ${missing.join(", ")}. Add their Iconify data to \`src/components/m3e/icon-data.app.ts\`.\n` : ""}
Icons a widget only knows while running are fetched from Iconify, as they are in the editor. The fonts come from Google Fonts, and a face Google does not have (the pixel face with Chinese) from jsDelivr: see \`index.html\`. When the document wears a style, that style's own icon set is bundled in \`src/style-icons.ts\`, so it draws offline.

## License

The copied components are under the licenses in \`LICENSE\` and \`NOTICE\`.
`;
}

const GITIGNORE = `node_modules
dist
*.log
*.tsbuildinfo
.DS_Store
Thumbs.db
`;

/* ---------- the project ---------- */

/** a package name from a title: letters and digits, else a plain name */
export const projectName = (doc: Doc) => (doc.title || "").toLowerCase().match(/[a-z0-9]+/g)?.join("-") || "m3e-app";

/** The exact version this repo builds with: a range in package.json is only what it accepts, the lockfile what it runs.
 *  Read off the lockfile when the editor is built (versions.generated.ts), so the editor does not carry the lockfile. */
function versionOf(name: string): string {
  const version = VERSIONS[name];
  if (version) return version;
  throw new Error(`no version of ${name} in this repo`);
}

const sorted = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

export async function buildProject(doc: Doc, widths: Record<string, number>, o: ExportOptions = {}): Promise<Project> {
  const readAny = o.read ?? (await import("./exportSources")).readSource;
  /* a checkout on Windows may have every source in CRLF; what is written is the same either way */
  const read = async (path: string) => (await readAny(path)).replaceAll("\r\n", "\n");
  const lang = o.lang ?? getLang();
  const name = projectName(doc);
  const warnings: string[] = [];
  const files: ProjectFiles = {};

  const images = new Map<string, string>();
  const image = (data: string) => {
    if (!images.has(data)) {
      const type = /^data:([^;,]+)/.exec(data)?.[1] ?? "";
      images.set(data, `/images/${hashOf(data)}.${EXTENSION[type] ?? "img"}`);
    }
    return images.get(data)!;
  };
  /* Everything that reads the document's style is written first, in one go, with the document's own styles in reach
     (a custom style is resolved from `doc.styles`): nothing in it waits, so no other document's styles can come between */
  const { screens, theme } = withDocStyles(doc.styles, () => {
    const { screens, runtime, usesToast } = buildScreens(doc, widths, { onlyFrameId: o.onlyFrameId, live: true, image });
    if (!screens.length) throw new Error("there is no screen to export");

    const seen = new Set<string>();
    for (const s of screens) {
      /* two screens may not share a file, however their names come out */
      if (seen.has(s.component)) throw new Error(`two screens are both called ${s.component}`);
      seen.add(s.component);
      const lines = importLines(s.imports);
      files[`src/screens/${s.component}.tsx`] = `${lines.join("\n")}${lines.length ? "\n\n" : ""}${s.source}\n`;
    }
    for (const [data, path] of images) files[`public${path}`] = dataToBytes(data);

    const theme = normalizeTheme(doc.theme);
    const keyOf = new Map(screens.map((s) => [s.id, s.key]));
    const families = familiesOf(doc.frames)
      .map((family) => family.flatMap((f) => keyOf.get(f.id) ?? []))
      .filter((family) => family.length > 1);
    const appSrc = appSource(screens, theme.motion, usesToast, families);
    const themeSrc = themeSource(doc, name);
    files["src/App.tsx"] = appSrc;
    files["src/main.tsx"] = MAIN;
    files["src/runtime.tsx"] = runtimeSource(runtime);
    files["src/theme.tsx"] = themeSrc;
    files["src/index.css"] = cssSource(doc, lang);
    const styleSheet = styleCssOf(doc, lang);
    if (styleSheet) files["src/style.css"] = `/* The document's style. It is not in a layer, so it wins over what the components say about themselves. */\n${styleSheet}\n`;
    files["index.html"] = htmlSource(doc, lang);
    return { screens, theme };
  });
  files["vite.config.ts"] = VITE_CONFIG;
  files["tsconfig.json"] = TSCONFIG;
  files[".gitignore"] = GITIGNORE;

  /* the walk starts from what was just written, so it copies what they reach and nothing else */
  const written = Object.keys(files).filter((p) => p.endsWith(".tsx")).map((p) => files[p] as string);
  const roots = new Set<string>(["@/styles/m3e.css", "@/react-css.d.ts"]);
  const here = new Set(["@/runtime", "@/theme", "@/style-icons"]);
  for (const source of written) for (const spec of importsIn(source)) if (!spec.startsWith(".") && !here.has(spec)) roots.add(spec);
  const { files: copied, packages } = await importClosure([...roots], read, o.onProgress);
  for (const [path, text] of copied) files[projectPath(path)] = text;

  /* the icons the screens and widgets name, out of the sets bundled here; only a name none of them has is fetched */
  const missing = new Set<string>();
  const coreIcons = copied.get("components/m3e/icon-data.ts");
  const wanted = new Set<string>();
  for (const source of written) for (const n of iconNamesIn(source)) wanted.add(n);
  for (const [path, text] of copied) if (path.startsWith("parts/widgets/")) for (const n of iconNamesIn(text)) wanted.add(n);
  const core = coreIcons ? iconDataOf(coreIcons) : {};
  if (coreIcons) {
    const inCore = (id: string) => !!(core.icons?.[id] || core.aliases?.[id]);
    const rounded = (await iconSubset("rounded", [...wanted].filter((n) => !glyphIds(n).every(inCore)))).sets.find((s) => s.prefix === "material-symbols");
    const glyphs: Record<string, unknown> = {};
    const aliases: Record<string, { parent?: string }> = {};
    const absent: string[] = [];
    const take = (id: string) => {
      if (inCore(id)) return true;
      const alias = rounded?.aliases?.[id];
      if (alias) aliases[id] = alias;
      const glyph = rounded?.icons[alias?.parent ?? id];
      /* a glyph the set gives its own box keeps it; the file says 24 for the rest */
      if (glyph) glyphs[alias?.parent ?? id] = { ...(rounded?.width && rounded.width !== 24 ? { width: rounded.width, height: rounded.height } : {}), ...glyph };
      return !!glyph;
    };
    for (const n of wanted) for (const id of glyphIds(n)) if (!take(id)) absent.push(id);
    if (absent.length) {
      try {
        const got = await (o.fetchIcons ?? fromIconify)(absent);
        Object.assign(glyphs, got.icons);
        Object.assign(aliases, got.aliases);
      } catch {
        /* an export with blank icons beats no export: the README and the panel say which */
        for (const n of wanted) if (glyphIds(n).every((id) => absent.includes(id))) missing.add(n);
        warnings.push(`icons not fetched: ${[...missing].join(", ")}`);
      }
    }
    files["src/components/m3e/icon-data.app.ts"] = iconDataFile({ icons: glyphs, aliases });
  }
  /* the style's own drawing of them, and of the ones the components draw inside themselves, out of the bundled family */
  if (theme.icons && theme.icons !== "rounded") {
    const inner = [...Object.keys(core.icons ?? {}), ...Object.keys(core.aliases ?? {})].map((n) => n.replace(/(-outline)?-rounded$/, ""));
    const sets = setsOf(theme.icons).filter((s) => s !== "rounded");
    const subsets = await Promise.all(sets.map((s) => iconSubset(s, [...wanted, ...inner])));
    const map = Object.assign({}, ...subsets.map((s) => s.map));
    const collections = subsets.flatMap((s) => s.sets);
    if (sets.length && !collections.length) warnings.push("the style's icons are not bundled: the app draws them from Material Symbols Rounded");
    files["src/style-icons.ts"] = styleIconsFile(sets.map((s) => SOURCES[s]), map, collections);
  }
  /* the editor's loader of its bundled sets has nothing to load here */
  if (copied.has("components/m3e/icon-sets/load.ts")) {
    files["src/components/m3e/icon-sets/load.ts"] = ICON_SETS_STUB;
    delete files["src/components/m3e/icon-sets/manifest.ts"];
    delete files["src/components/m3e/icon-sets/shard.ts"];
  }

  const pkg = JSON.parse(await read("package.json")) as { overrides?: Record<string, string>; engines?: Record<string, string> };
  const deps = new Set([...packages, ...EXPORT_ALWAYS]);
  /* tailwind is a build tool here, though the stylesheet names it */
  const dev = EXPORT_DEV;
  for (const d of dev) deps.delete(d);
  files["package.json"] = `${json({
    name,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: { dev: "vp dev", build: "vp build", preview: "vp preview", typecheck: "tsc --noEmit -p ." },
    ...(pkg.engines ? { engines: pkg.engines } : {}),
    dependencies: sorted(Object.fromEntries([...deps].map((d) => [d, versionOf(d)]))),
    devDependencies: sorted(Object.fromEntries(dev.map((d) => [d, versionOf(d)]))),
    ...(pkg.overrides ? { overrides: pkg.overrides } : {}),
  })}\n`;

  files["README.md"] = readmeSource(doc, screens, [...copied.keys()].map(projectPath), [...missing]);
  files.LICENSE = await read("LICENSE");
  files.NOTICE = `This project was exported from M3E Canvas Pro, whose notice follows. Of the code it names, only the\nfiles in ${[...new Set([...copied.keys()].map((p) => projectPath(p).split("/").slice(0, 3).join("/")))].sort().join(", ")} are copied here.\n\n${await read("NOTICE")}`;
  return { name, files, warnings };
}

export function zipProject(files: ProjectFiles): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([path, body]) => [path, typeof body === "string" ? strToU8(body) : body])));
}
