/* What each exported app (web, React Native, mini-program) gets for the platform capabilities its design uses
 * (docs/平台能力.md): a registry its runtime invokes them through (the adapters written in `src/custom/capabilities.ts`,
 * the platform's defaults for the generic ones, else `not-implemented`, said in development), and a slot for each
 * capability view (report 9.3): `src/custom/slots/<Name>.tsx`, written once, draws the real map, camera or call and
 * is handed what the design gives the part; the generated screens draw it with the design's stand-in as its children,
 * which is what it shows until it is written. A product that uses no capability gets none of it. */

import { partBySlug } from "../../parts/registry";
import { WIDGET_SOURCES } from "../../parts/widgets/sources";
import { capabilitiesUsed, usedDefinitions } from "../capabilities/doc";
import { groupsInFrame, type Doc } from "../tokens";
import { GENERATED, jsonCode, str } from "./code";
import { schemaTypeTs } from "../api/typescript";
import type { JsonSchema } from "../api/types";
import { EXAMPLE_WORLD_CONTRACT, type WorldContract } from "../world/contract";
import { typeBase } from "./targets/capabilities";
import { generated, seeded, type ProductContext, type ProductFiles } from "./types";
import { NATIVE as RN_NATIVE } from "../../rn/src/kit/coverage";
import { NATIVE as MINI_NATIVE } from "../../miniapp-kit/src/kit/coverage";

export type AppPlatform = "web" | "mobile" | "miniapp";

/* ---------- slots ---------- */

/** A slot the product draws a part with: a capability view's (`view`: the capability, `map`) or a world view's (`view`
 *  is `WORLD_VIEW`: the engine goes there), drawn by its stand-in until written, or a part the design marks as the
 *  product's own (`Item.slot`; `view` is ""), drawn as the design has it until written. `slug` is the part's. */
export type SlotSpec = { item: string; name: string; view: string; screen: string; slug: string };

/** what a world view's slot says it is a view of (docs/边界与契约.md “实时玩法”): an engine's world, no capability */
export const WORLD_VIEW = "world";

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

/** what a screen's file names from its kits besides their parts' components */
const KIT_NAMES = ["At", "Pin", "Cell", "Repeat", "DockPane", "Layer", "Box", "TabBar", "Screen", "Placeholder"];

/** Names no slot takes: what a screen's file already names, the kits' components (a slot's screen draws them, and the
 *  part a slot draws is one) and the stand-ins a slot draws until it is written among them, and the web's own widgets
 *  a web screen draws its stand-in with (a map's default slot, `MapView`, is the web's map widget: it takes
 *  `MapView2`). A name that clashes with none of them stays as it was. */
const TAKEN = new Set(["Screen", "View", "Text", "Image", "Placeholder", "Slot", "Fragment", "React", "MapStandIn", "CameraStandIn", "CallStandIn", "WorldStandIn", "ExampleWorld", ...Object.keys(WIDGET_SOURCES), ...KIT_NAMES, ...Object.values(RN_NATIVE), ...Object.values(MINI_NATIVE)]);

/** Every slot of the document, screen by screen, each with a name of its own: a capability view's is the part's name
 *  (its group's, else its label), else the view's (MapView, CameraView); a part's the one the design gives it
 *  (`slot: "BuyButton"`), else its group's, else its kind's (`ButtonSlot`). The same name for the same design on every
 *  export, so a slot written for it stays its own; a name given in the design stays the same whatever else changes. */
export function slotsOf(doc: Doc, widths: Record<string, number> = {}): SlotSpec[] {
  const out: SlotSpec[] = [];
  const names = new Set<string>(TAKEN);
  const seen = new Set<string>();
  for (const f of doc.frames)
    for (const g of groupsInFrame(doc.groups, f, doc.frames, widths))
      for (const it of g.items) {
        const def = partBySlug(it.component);
        /* a world view is a view too: its slot is where the engine goes */
        const view = def?.capability ?? (def?.world ? WORLD_VIEW : undefined);
        if (!def || (!view && !it.slot) || seen.has(it.id)) continue;
        seen.add(it.id);
        const base = view ? pascal(g.name ?? "") || pascal(it.label ?? "") || (view === WORLD_VIEW ? "GameWorld" : `${typeBase(view)}View`) : (typeof it.slot === "string" && pascal(it.slot)) || (g.items.length === 1 && pascal(g.name ?? "")) || `${pascal(def.slug)}Slot`;
        let name = base;
        for (let n = 2; names.has(name); n++) name = `${base}${n}`;
        names.add(name);
        out.push({ item: it.id, name, view: view ?? "", screen: f.name, slug: def.slug });
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

/** a screen's name as a comment may hold it: letters, digits, spaces */
const screenWords = (s: SlotSpec) => s.screen.replace(/[^\p{L}\p{N} _-]/gu, "");

/** a capability view's slot written once: what it is handed and how it sends the view's events, the design's stand-in
 *  until then */
const VIEW_SLOT = (scope: string, s: SlotSpec, platform: AppPlatform) => {
  const t = typeBase(s.view);
  const where = platform === "web" ? "a web map library, the browser's camera (getUserMedia), a WebRTC call" : platform === "mobile" ? "react-native-maps, expo-camera, a WebRTC or vendor call SDK" : "Taro's <Map>, <Camera>, <LivePusher>/<LivePlayer> or a vendor plugin";
  return `import type { ReactNode } from "react";
${importLine([`${t}Events`, `${t}Props`, "ViewSlotProps"], `${scope}/capabilities`, true)}

/* The ${s.view} view the design places on the screen "${screenWords(s)}" (written once by the export, never
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

/** where a slot's files reach the kit and each other: from the generated module, and from a slot written once (the
 *  kit, and the generated modules beside the slots' module) */
export type SlotPaths = { kit: string; custom: string; kitFromCustom: string; generatedFromCustom: string };
const PRODUCT_PATHS: SlotPaths = { kit: "../kit", custom: "../custom/slots", kitFromCustom: "../../kit", generatedFromCustom: "../../generated" };

/** A world view's slot written once (docs/边界与契约.md “实时玩法”): what it is handed (the world's state from the
 *  design, its size, the channel its input actions come in on, `onEvent` for the world's events) and where the engine
 *  goes. Until one is plugged in it draws the design's stand-in, which lists the inputs it hears; `plugged` writes it
 *  with M3E's example engine plugged in instead (a test bed's, showing the view hosting one). */
const UNTIL = "Until then it draws the design's\n   stand-in (children), which lists the inputs it hears.";
const WORLD_SLOT = (scope: string, s: SlotSpec, platform: AppPlatform, paths: SlotPaths, plugged: boolean) => {
  const where = platform === "web" ? "a canvas or WebGL loop, a Godot web export, Phaser, PixiJS" : platform === "mobile" ? "a native engine view, react-native-skia, a GL view" : "a Cocos mini-game, a <Canvas> loop";
  const head = plugged ? `import type { ReactNode } from "react";
${importLine(["WorldSlotProps"], `${scope}/app-runtime`, true)}
${importLine(["ExampleWorld"], `${paths.generatedFromCustom}/exampleWorld`)}` : `import type { ReactNode } from "react";
${importLine(["WorldSlotProps"], `${scope}/app-runtime`, true)}`;
  const body = plugged ? `export default function ${s.name}(props: Props) {\n  return <ExampleWorld {...props} />;\n}` : `export default function ${s.name}({ children }: Props) {\n  return <>{children}</>;\n}`;
  return `${head}

/* The world view the design places on the screen "${screenWords(s)}" (written once by the export, never overwritten:
   it is the product's own). The picture, the physics, the camera and the rules are the engine's: plug it in here
   (${where}).

   An engine implements World (${scope}/app-runtime) and is connected to what this view is handed with
   connectWorld(world, channel, onEvent): the design's input actions (move, press, release) come in on the
   channel, and the events it sends (hit, collected, ended) run the design's actions. The props are the world's
   state the design shows (its entities, score, status), for the HUD around it. M3E's example engine is
   src/generated/exampleWorld.tsx: return <ExampleWorld {...props} /> plays it. ${plugged ? "Here it is plugged in." : UNTIL} */
type Props = WorldSlotProps<ReactNode>;

${body}
`;
};

/** The world's contract as the app has it (lib/world/contract.ts, docs/世界宿主契约.md): the contract itself, as data an
 *  engine-side host can read too, and the TypeScript types generated from its JSON Schemas (the snapshot, each event's
 *  payload) and its input actions. The world today is M3E's example engine's; a game loop authored elsewhere hands in
 *  its own contract of the same shape later, and the same types come out of it. */
export function worldContractModule(scope: string, contract: WorldContract = EXAMPLE_WORLD_CONTRACT): string {
  const ts = (x: unknown) => schemaTypeTs(x as JsonSchema, { comments: false });
  const inputs = Object.entries(contract.inputs).map(([name, d]) => `  ${name}: ${d.type === "vec2" ? "Vec2" : "boolean"}`);
  const events = Object.entries(contract.events).map(([name, e]) => `  ${name}: ${ts(e.payload)}`);
  return `${GENERATED}
import type { Vec2, WorldContract } from ${str(`${scope}/app-runtime`)}

/** the contract of the world the design's world views are drawn to: its input actions, its snapshot and its events as
 *  JSON Schema, its clock (docs/世界宿主契约.md in the design editor) */
export const WORLD_CONTRACT: WorldContract = ${jsonCode(contract)}

/** what the world's view() gives, from its schema */
export type WorldSnapshot = ${ts(contract.snapshot)}

/** the input actions the world takes, by name, with what each carries */
export type WorldInputs = {
${inputs.join("\n")}
}

/** the events the world sends, by name, with what each carries, from their schemas */
export type WorldEventPayloads = {
${events.join("\n")}
}
`;
}

/** M3E's example engine (lib/world/example.ts) as a world view's slot draws it, on each platform: the web on a canvas
 *  in a requestAnimationFrame loop, a phone and a mini-program stepped by a timer and drawn by the kit's stand-in. Any
 *  engine plugs in the same way: create it, `connectWorld` it to the channel and `onEvent`, step it, draw it. */
export function exampleWorldModule(scope: string, platform: AppPlatform, paths: SlotPaths = PRODUCT_PATHS): string {
  const runtime = `${scope}/app-runtime`;
  const about = `/* M3E's example engine (src/engine/world/example.ts in ${runtime}): the player moves the way the move input points,
   picks up coins and items (collected; the last one ends the round, ended) and hits enemies near it with attack (hit).
   It decides nothing for the product: replace it with your engine in the world view's slot (src/custom/slots). It is
   spoken to only through the World interface (mount, connectWorld, view, subscribe, unmount: docs/世界宿主契约.md in
   the design editor), its world time runs off the app's clock, and it has no picture of its own: this host draws its
   view`;
  if (platform === "web")
    return `${GENERATED}
import { useEffect, useRef } from "react"
import { connectWorld, createExampleWorld, type WorldSlotProps, type WorldState } from ${str(runtime)}
import { domainNow } from "@/components/widgets/host"

${about} on a canvas. */

/** what each kind of entity is drawn in */
const TONE: Record<string, string> = { player: "--md-sys-color-primary", enemy: "--md-sys-color-error", coin: "--md-sys-color-tertiary", item: "--md-sys-color-tertiary" }

export function ExampleWorld({ label, entities, score, status, follow, width, height, channel, onEvent }: WorldSlotProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const emit = useRef(onEvent)
  useEffect(() => {
    emit.current = onEvent
  })
  /* the engine starts over from what the design says whenever that changes */
  const start = JSON.stringify({ entities, score, status, follow })
  useEffect(() => {
    const world = createExampleWorld(JSON.parse(start) as WorldState, { now: domainNow })
    const off = connectWorld(world, channel, (name, payload) => emit.current?.(name, payload))
    const css = getComputedStyle(document.documentElement)
    let frame = 0
    const draw = () => {
      frame = 0
      const c = canvas.current?.getContext("2d")
      if (!c) return
      c.clearRect(0, 0, width, height)
      for (const e of world.view().entities ?? []) {
        c.fillStyle = css.getPropertyValue(TONE[e.kind] ?? "--md-sys-color-outline").trim() || "#888"
        c.beginPath()
        c.arc((e.x / 100) * width, (e.y / 100) * height, 8, 0, Math.PI * 2)
        c.fill()
      }
    }
    /* drawn again on the next frame after the world changed */
    const unsub = world.subscribe(() => {
      if (!frame) frame = requestAnimationFrame(draw)
    })
    world.mount(canvas.current, { w: width, h: height })
    draw()
    return () => {
      if (frame) cancelAnimationFrame(frame)
      world.unmount()
      unsub()
      off()
    }
  }, [start, channel, width, height])
  return <canvas ref={canvas} width={width} height={height} aria-label={label || "World"} data-score={score} />
}
`;
  return `${GENERATED}
import { useEffect, useRef, useState } from "react"
import { connectWorld, createExampleWorld, type WorldSlotProps, type WorldState } from ${str(runtime)}
import { kitNow, WorldStandIn } from ${str(paths.kit)}

${about} with the kit's stand-in, the world's own state in place of the design's. */
export function ExampleWorld({ label, scene, entities, score, status, follow, width, height, channel, onEvent }: WorldSlotProps) {
  const emit = useRef(onEvent)
  useEffect(() => {
    emit.current = onEvent
  })
  const start = JSON.stringify({ entities, score, status, follow })
  /* what the world shows, once it has moved since it started from what the design says */
  const [seen, setSeen] = useState<{ start: string; view: WorldState } | null>(null)
  const shown = seen && seen.start === start ? seen.view : (JSON.parse(start) as WorldState)
  useEffect(() => {
    const world = createExampleWorld(JSON.parse(start) as WorldState, { now: kitNow })
    const off = connectWorld(world, channel, (name, payload) => emit.current?.(name, payload))
    const unsub = world.subscribe(() => setSeen({ start, view: world.view() }))
    world.mount(null, { w: width, h: height })
    return () => {
      world.unmount()
      unsub()
      off()
    }
  }, [start, channel, width, height])
  return <WorldStandIn label={label} scene={scene} entities={shown.entities} follow={follow} score={shown.score} status={shown.status} width={width} height={height} channel={channel} />
}
`;
}

/** the kit's component that draws a part on an app, when the kit has one of its own (the web draws parts as trees) */
const kitComponent = (s: SlotSpec, platform: AppPlatform): string | undefined => (platform === "mobile" ? (RN_NATIVE as Record<string, string>)[s.slug] : platform === "miniapp" ? (MINI_NATIVE as Record<string, string>)[s.slug] : undefined);

/** A part's slot written once. On a phone and in a mini-program a part the kit has a component for is handed what
 *  that component is handed (its props as the design sets them, its taps, its events and what its input holds wired
 *  to the design's actions and data, typed as the component's), and the kit's drawing of it as children; a part drawn
 *  otherwise (as its atoms) and a web part are handed their size or their props, and the design's drawing as children.
 *  Either way it draws its children until it is changed: the exported app looks as the design does. */
const PART_SLOT = (s: SlotSpec, platform: AppPlatform, paths: SlotPaths) => {
  const kit = kitComponent(s, platform);
  const handed = kit
    ? [`It is handed what the kit's ${kit} is handed: its props as the design sets them, its taps, events and input`, "wired to the design's actions and data. Its children are the kit's drawing of it, which is what it draws until", "you change it."]
    : platform === "web"
      ? ["It is handed the props of the design's drawing of it. Its children are that drawing, which is what it draws", "until you change it."]
      : ["It is handed its size. Its children are the design's drawing of it (the kit draws it as its parts), which is", "what it draws until you change it."];
  const head = kit ? `import type { ComponentProps, ReactNode } from "react";\nimport type { ${kit} } from ${str(paths.kitFromCustom)};` : 'import type { ReactNode } from "react";';
  const props = kit ? `ComponentProps<typeof ${kit}> & { children?: ReactNode }` : platform === "web" ? "Record<string, unknown> & { children?: ReactNode }" : "{ width: number; height: number; children?: ReactNode }";
  return `${head}

/* The part "${s.slug}" the design places on the screen "${screenWords(s)}", marked as the product's own: written
   once by the export, never overwritten. Draw it your own way here.

   ${handed.join("\n   ")} */
type Props = ${props};

export default function ${s.name}({ children }: Props) {
  return <>{children}</>;
}
`;
};

/** The slots' files: each written once, and the module the screens import them from. A part drawn by its kit's
 *  component is drawn by its slot with the kit's drawing as children, both handed the same props (the screen prints
 *  them once): the module is a `.tsx` then. */
export function slotFiles(scope: string, slots: SlotSpec[], platform: AppPlatform, paths: SlotPaths = PRODUCT_PATHS, o: { plugExample?: boolean } = {}): ProductFiles {
  if (!slots.length) return {};
  const files: ProductFiles = {};
  for (const s of slots) files[`src/custom/slots/${s.name}.tsx`] = seeded(s.view === WORLD_VIEW ? WORLD_SLOT(scope, s, platform, paths, !!o.plugExample) : s.view ? VIEW_SLOT(scope, s, platform) : PART_SLOT(s, platform, paths));
  /* M3E's example engine, for a world view's slot to plug in (rewritten on every export) */
  if (slots.some((s) => s.view === WORLD_VIEW)) {
    files["src/generated/exampleWorld.tsx"] = generated(exampleWorldModule(scope, platform, paths));
    files["src/generated/worldContract.ts"] = generated(worldContractModule(scope));
  }
  const wrapped = slots.filter((s) => !s.view && kitComponent(s, platform));
  const passed = slots.filter((s) => !wrapped.includes(s));
  if (!wrapped.length) {
    files["src/generated/slots.ts"] = generated(`${GENERATED}
/* The capability views' slots (src/custom/slots, the product's own): the screens draw each with the design's stand-in. */
${passed.map((s) => `export { default as ${s.name} } from "${paths.custom}/${s.name}"`).join("\n")}
`);
    return files;
  }
  const kits = [...new Set(wrapped.map((s) => kitComponent(s, platform)!))].sort();
  files["src/generated/slots.tsx"] = generated(`${GENERATED}
/* The slots (src/custom/slots, the product's own): a capability view's the screens draw with the design's stand-in, a
   part's with the kit's drawing of it, both handed the props the screen gives the part. */
import type { ComponentProps } from "react";
import { ${kits.join(", ")} } from ${str(paths.kit)};
${wrapped.map((s) => `import ${s.name}Slot from ${str(`${paths.custom}/${s.name}`)};`).join("\n")}
${passed.map((s) => `export { default as ${s.name} } from ${str(`${paths.custom}/${s.name}`)};`).join("\n")}${passed.length ? "\n" : ""}
${wrapped
  .map((s) => {
    const kit = kitComponent(s, platform)!;
    return `/** the ${s.slug} the product draws itself: its slot, handed the kit's drawing of it */
export function ${s.name}(props: ComponentProps<typeof ${kit}>) {
  return (
    <${s.name}Slot {...props}>
      <${kit} {...props} />
    </${s.name}Slot>
  );
}
`;
  })
  .join("\n")}`);
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
  /* `fail` only where a default can fail with it */
  const defaults = `${GENERATED}
${defaultImports(platform, mine)}${mine.length ? "import { fail, type Capabilities }" : "import type { Capabilities }"} from ${str(pkg)}

/** What the platform does for the generic capabilities with no SDK and no permission to declare; an adapter of the same
 *  name in src/custom/capabilities.ts takes its place. */
export const PLATFORM_CAPABILITIES: Capabilities = {
${mine.map((n) => DEFAULT_CODE[platform][n]).join("\n")}
}
`;
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
