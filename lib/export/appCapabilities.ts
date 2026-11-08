/* What each exported app (web, React Native, mini-program) gets for the platform capabilities its design uses
 * (docs/平台能力.md): a registry its runtime invokes them through (the adapters written in `src/custom/capabilities.ts`,
 * the platform's defaults for the generic ones, else `not-implemented`, said in development), and a slot for each
 * capability view (report 9.3): `src/custom/slots/<Name>.tsx`, written once, draws the real map, camera or call and
 * is handed what the design gives the part; the generated screens draw it with the design's stand-in as its children,
 * which is what it shows until it is written. A product that uses no capability gets none of it. */

import { partBySlug } from "../../parts/registry";
import { capabilitiesUsed, usedDefinitions } from "../capabilities/doc";
import { groupsInFrame, type Doc } from "../tokens";
import { GENERATED, str } from "./code";
import { typeBase } from "./targets/capabilities";
import { generated, seeded, type ProductContext, type ProductFiles } from "./types";

export type AppPlatform = "web" | "mobile" | "miniapp";

/* ---------- slots ---------- */

/** a capability view the design draws, and the slot that draws it in an app */
export type SlotSpec = { item: string; name: string; view: string; screen: string };

/** words as a component's name: letters and digits, each word capitalized; "" when nothing of it is ASCII */
const pascal = (words: string) =>
  words
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9 _-]+/g, " ")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("")
    .replace(/^\d+/, "")
    .slice(0, 40);

/** names no slot takes: what a screen's file already names, the kits' stand-ins a slot draws until it is written among them */
const TAKEN = new Set(["Screen", "View", "Text", "Image", "Placeholder", "Slot", "Fragment", "React", "MapStandIn", "CameraStandIn", "CallStandIn"]);

/** Every capability view of the document, screen by screen, each with a slot's name of its own: the part's name (its
 *  group's, else its label), else the view's (MapView, CameraView); the same name for the same design on every
 *  export, so a slot written for it stays its own. */
export function slotsOf(doc: Doc, widths: Record<string, number> = {}): SlotSpec[] {
  const out: SlotSpec[] = [];
  const names = new Set<string>(TAKEN);
  const seen = new Set<string>();
  for (const f of doc.frames)
    for (const g of groupsInFrame(doc.groups, f, doc.frames, widths))
      for (const it of g.items) {
        const view = partBySlug(it.component)?.capability;
        if (!view || seen.has(it.id)) continue;
        seen.add(it.id);
        const base = pascal(g.name ?? "") || pascal(it.label ?? "") || `${typeBase(view)}View`;
        let name = base;
        for (let n = 2; names.has(name); n++) name = `${base}${n}`;
        names.add(name);
        out.push({ item: it.id, name, view, screen: f.name });
      }
  return out;
}

/** the slots by the item they draw */
export const slotNames = (slots: SlotSpec[]): Record<string, string> => Object.fromEntries(slots.map((s) => [s.item, s.name]));

/** An import as Prettier prints it at the product's width (.prettierrc.json, 100): on one line when it fits, else one
 *  name a line (a single name stays on its line, as Prettier leaves it). The files written once are custom code, which
 *  the product's lint holds to Prettier. */
const importLine = (names: string[], from: string, type = false) => {
  const kind = type ? "type " : "";
  const one = `import ${kind}{ ${names.join(", ")} } from ${str(from)};`;
  return one.length <= 100 || names.length < 2 ? one : `import ${kind}{\n${names.map((n) => `  ${n},`).join("\n")}\n} from ${str(from)};`;
};

/** a slot written once: what it is handed and how it sends the view's events, the design's stand-in until then */
const SLOT = (scope: string, s: SlotSpec, platform: AppPlatform) => {
  const t = typeBase(s.view);
  const where = platform === "web" ? "a web map library, the browser's camera (getUserMedia), a WebRTC call" : platform === "mobile" ? "react-native-maps, expo-camera, a WebRTC or vendor call SDK" : "Taro's <Map>, <Camera>, <LivePusher>/<LivePlayer> or a vendor plugin";
  return `import type { ReactNode } from "react";
${importLine([`${t}Events`, `${t}Props`, "ViewSlotProps"], `${scope}/capabilities`, true)}

/* The ${s.view} view the design places on the screen "${s.screen.replace(/[^\p{L}\p{N} _-]/gu, "")}" (written once by the export, never
   overwritten: it is the product's own). Draw the real one here with the platform's own component (${where}), from the
   props the design hands it, and send what the visitor does with onEvent: the design's actions on the part's events
   run on them. M3E embeds no SDK, key or permission declaration: add the package, its keys and the permissions this
   app needs yourself. Until then it draws the design's stand-in (children). */
type Props = ViewSlotProps<${t}Props, ${t}Events, ReactNode>;

export default function ${s.name}({ children }: Props) {
  return <>{children}</>;
}
`;
};

/** the slots' files: each written once, and the module the screens import them from */
export function slotFiles(scope: string, slots: SlotSpec[], platform: AppPlatform): ProductFiles {
  if (!slots.length) return {};
  const files: ProductFiles = {};
  for (const s of slots) files[`src/custom/slots/${s.name}.tsx`] = seeded(SLOT(scope, s, platform));
  files["src/generated/slots.ts"] = generated(`${GENERATED}
/* The capability views' slots (src/custom/slots, the product's own): the screens draw each with the design's stand-in. */
${slots.map((s) => `export { default as ${s.name} } from "../custom/slots/${s.name}"`).join("\n")}
`);
  return files;
}

/* ---------- the registry ---------- */

/** the generic capabilities each platform has a default for, with no SDK and no permission to declare */
const DEFAULTS: Record<AppPlatform, string[]> = {
  web: ["link.open", "clipboard.write", "share.open", "file.pick", "location.current"],
  mobile: ["link.open", "share.open", "file.pick"],
  miniapp: ["clipboard.write", "link.open", "file.pick"],
};

/** the defaults' code, by capability */
const DEFAULT_CODE: Record<AppPlatform, Record<string, string>> = {
  web: {
    "link.open": `  "link.open": ({ url }) => {
    if (!/^https?:\\/\\//i.test(url)) throw fail("failed", "only an http or https address opens")
    window.open(url, "_blank", "noopener,noreferrer")
    return {}
  },`,
    "clipboard.write": `  "clipboard.write": async ({ text }) => {
    if (!navigator.clipboard) throw fail("unavailable")
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      throw fail("denied")
    }
    return {}
  },`,
    "share.open": `  "share.open": async ({ title, text, url }) => {
    if (!navigator.share) throw fail("unavailable")
    try {
      await navigator.share({ ...(title ? { title } : {}), ...(text ? { text } : {}), ...(url ? { url } : {}) })
    } catch (e) {
      throw fail(e instanceof DOMException && e.name === "AbortError" ? "cancelled" : "failed")
    }
    return {}
  },`,
    "file.pick": `  "file.pick": ({ accept, multiple, source }) =>
    new Promise((resolve, reject) => {
      const input = document.createElement("input")
      input.type = "file"
      if (accept) input.accept = accept
      input.multiple = multiple === true
      if (source === "camera") input.setAttribute("capture", "environment")
      input.addEventListener("cancel", () => reject(fail("cancelled")))
      input.addEventListener("change", () => {
        const files = Array.from(input.files ?? [])
        if (!files.length) return reject(fail("cancelled"))
        resolve({ files: files.map((f) => ({ name: f.name, type: f.type, size: f.size, url: URL.createObjectURL(f) })) })
      })
      input.click()
    }),`,
    "location.current": `  "location.current": ({ accuracy }) =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(fail("unavailable"))
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        (e) => reject(fail(e.code === e.PERMISSION_DENIED ? "denied" : e.code === e.TIMEOUT ? "timeout" : "unavailable")),
        { enableHighAccuracy: accuracy === "high", timeout: 15000 },
      )
    }),`,
  },
  mobile: {
    "link.open": `  "link.open": async ({ url }) => {
    if (!/^https?:\\/\\//i.test(url)) throw fail("failed", "only an http or https address opens")
    await Linking.openURL(url)
    return {}
  },`,
    "share.open": `  "share.open": async ({ title, text, url }) => {
    const out = await Share.share({ message: [text, url].filter(Boolean).join(" ") || title || "", ...(title ? { title } : {}), ...(url ? { url } : {}) })
    if (out.action === Share.dismissedAction) throw fail("cancelled")
    return {}
  },`,
    "file.pick": `  "file.pick": async ({ accept, multiple }) => {
    const out = await DocumentPicker.getDocumentAsync({ type: accept ? accept.split(",").map((t) => t.trim()) : "*/*", multiple: multiple === true })
    if (out.canceled) throw fail("cancelled")
    return { files: out.assets.map((a) => ({ name: a.name, type: a.mimeType ?? "application/octet-stream", size: a.size ?? 0, url: a.uri })) }
  },`,
  },
  miniapp: {
    "clipboard.write": `  "clipboard.write": async ({ text }) => {
    await Taro.setClipboardData({ data: text })
    return {}
  },`,
    /* a mini-program opens no outside page: the link is copied, as its link actions are */
    "link.open": `  "link.open": async ({ url }) => {
    await Taro.setClipboardData({ data: url })
    return {}
  },`,
    "file.pick": `  "file.pick": async ({ accept, multiple, source }) => {
    try {
      if (source === "file" || (accept && !/image/.test(accept))) {
        const out = await Taro.chooseMessageFile({ count: multiple ? 9 : 1, type: "all" })
        return { files: out.tempFiles.map((f) => ({ name: f.name, type: f.type, size: f.size, url: f.path })) }
      }
      const out = await Taro.chooseImage({ count: multiple ? 9 : 1, sourceType: source === "camera" ? ["camera"] : ["album"] })
      return { files: out.tempFiles.map((f, i) => ({ name: \`image\${i + 1}\`, type: f.type ?? "image/jpeg", size: f.size, url: f.path })) }
    } catch (e) {
      throw fail(/cancel/i.test(String((e as { errMsg?: string }).errMsg ?? e)) ? "cancelled" : "denied")
    }
  },`,
  },
};

/** What the defaults' code imports, for the defaults a design uses: only what they reach, so a product with none of
 *  them imports nothing (a lint that denies unused imports passes). */
function defaultImports(platform: AppPlatform, mine: string[]): string {
  if (platform === "miniapp") return mine.length ? 'import Taro from "@tarojs/taro"\n' : "";
  if (platform !== "mobile") return "";
  const native = [...(mine.includes("link.open") ? ["Linking"] : []), ...(mine.includes("share.open") ? ["Share"] : [])];
  return (native.length ? `import { ${native.join(", ")} } from "react-native"\n` : "") + (mine.includes("file.pick") ? 'import * as DocumentPicker from "expo-document-picker"\n' : "");
}

/** where a development build is told it is one */
const DEV: Record<AppPlatform, string> = { web: "import.meta.env.DEV", mobile: "__DEV__", miniapp: 'process.env.NODE_ENV !== "production"' };

/** The registry's files for an app, and the package it needs; null for a product that uses no capability. */
export function capabilityFiles(ctx: ProductContext, platform: AppPlatform): { files: ProductFiles; dependency: Record<string, string> } | null {
  const used = capabilitiesUsed(ctx.doc);
  if (!used.length) return null;
  const defs = usedDefinitions(ctx.doc);
  const calls = defs.filter((d) => d.kind === "call");
  const mine = DEFAULTS[platform].filter((n) => calls.some((d) => d.name === n));
  const pkg = `${ctx.scope}/capabilities`;
  const list = calls.map((d) => ` *   ${d.name}: ${(d.summary ?? "").split(". ")[0].replace(/\*\//g, "")}`).join("\n");
  const custom = `${importLine(["Capabilities"], pkg, true)}

/* The adapters of the platform capabilities the design uses (written once by the export, never overwritten: they are
 * the product's own). Each takes what the design gives it and gives back the result, or throws fail("cancelled")
 * (denied, unavailable, timeout, failed) for an outcome the design shows. Whatever is left out answers
 * "not-implemented", and a development build says so in the console.
${list}
 *
 * M3E embeds no SDK, key or permission declaration: add the SDK's package and its keys, and declare what the
 * platform asks for, yourself. A payment's adapter only submits it: the back end decides whether the order is paid. */
export const capabilities: Capabilities = {};
`;
  const defaults = `${GENERATED}
${defaultImports(platform, mine)}import { fail, type Capabilities } from ${str(pkg)}

/** What the platform does for the generic capabilities with no SDK and no permission to declare; an adapter of the same
 *  name in src/custom/capabilities.ts takes its place. */
export const PLATFORM_CAPABILITIES: Capabilities = {
${mine.map((n) => DEFAULT_CODE[platform][n]).join("\n")}
}
`.replace(/import \{ fail, type Capabilities \}/, mine.length ? "import { fail, type Capabilities }" : "import type { Capabilities }");
  const registry = `${GENERATED}
import { createAppCapabilities } from ${str(pkg)}
import { capabilities } from "../custom/capabilities"
import { PLATFORM_CAPABILITIES } from "./platformCapabilities"

/** what the app's taps invoke the platform capabilities through: the adapters written for it, the platform's defaults,
 *  else "not-implemented" (said in the console of a development build) */
export const registry = createAppCapabilities({ adapters: capabilities, defaults: PLATFORM_CAPABILITIES, dev: ${DEV[platform]} })
`;
  return {
    files: {
      "src/custom/capabilities.ts": seeded(custom),
      "src/generated/platformCapabilities.ts": generated(defaults),
      "src/generated/capabilities.ts": generated(registry),
    },
    dependency: { [pkg]: "0.1.0" },
  };
}

/** what an app's runtime is created with for the capabilities: its registry, when the design uses any */
export const runtimeCapabilities = (doc: Doc) => (capabilitiesUsed(doc).length ? { importLine: 'import { registry } from "./capabilities"', option: "  capabilities: registry," } : null);
