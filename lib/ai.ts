import { Doc, Frame, Group, Item, frameOfGroup } from "./tokens";
import { partBySlug } from "../parts/registry";
import { labelOfPart } from "../parts/resize";
import { buildPrompt } from "./prompt";
import { loadDocument } from "./project";
import { lookForModel } from "./look";
import { Lang } from "./i18n";
import { AiHttpError, isLocalUrl as isLocal, isSecureUrl, readError } from "./llm/errors";

export { AiHttpError, isSecureUrl, readError };

/* Optional AI helpers. The browser talks to the model provider directly with the
 * author's own key; there is no server in between. Every action has a fixed
 * prompt and a fixed JSON answer shape, and the result is only applied after the
 * author has looked at it. Coordinates are never touched by the model. */

export type Provider = "claude" | "openai" | "gemini" | "deepseek";

export type AiSettings = {
  provider: Provider;
  baseUrl: string;
  model: string;
  key: string;
  /** who paints a scene: a model that writes cannot, so this is set apart */
  imageProvider?: ImageProvider;
  imageBaseUrl?: string;
  imageModel?: string;
  imageKey?: string;
  /** how hard the text model thinks in the agent and the drafts; medium when left out */
  effort?: Effort;
  /** The keys are kept in this browser's storage. Left out, they last as long as this tab: they are kept for the
   *  session only, and asked for again in a new one. */
  rememberKey?: boolean;
};

export type Effort = "low" | "medium" | "high";
export const EFFORTS: Effort[] = ["low", "medium", "high"];

/** one question and its answer: `complete`, or the same streamed (lib/agent/complete.ts) */
export type Complete = (s: AiSettings, system: string, user: string, signal?: AbortSignal, maxTokens?: number) => Promise<string>;

export type ImageProvider = "openai" | "gemini";

export const IMAGE_PROVIDERS: { key: ImageProvider; label: string; baseUrl: string; model: string; keysUrl: string }[] = [
  { key: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-image-2.6-sunburst", keysUrl: "https://platform.openai.com/api-keys" },
  { key: "gemini", label: "Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash-image", keysUrl: "https://aistudio.google.com/apikey" },
];

export const imageSpec = (k: ImageProvider | undefined) => IMAGE_PROVIDERS.find((p) => p.key === k) ?? IMAGE_PROVIDERS[0];

export const PROVIDERS: { key: Provider; label: string; baseUrl: string; model: string; keysUrl?: string }[] = [
  { key: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-6.1-sol", keysUrl: "https://platform.openai.com/api-keys" },
  { key: "claude", label: "Claude", baseUrl: "https://api.anthropic.com", model: "claude-sonnet-5-5", keysUrl: "https://console.anthropic.com/settings/keys" },
  { key: "gemini", label: "Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.8-flash", keysUrl: "https://aistudio.google.com/apikey" },
  { key: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-flash", keysUrl: "https://platform.deepseek.com/api_keys" },
];

export const providerSpec = (k: Provider) => PROVIDERS.find((p) => p.key === k) ?? PROVIDERS[0];

export const DEFAULT_AI: AiSettings = { provider: PROVIDERS[0].key, baseUrl: PROVIDERS[0].baseUrl, model: PROVIDERS[0].model, key: "" };

const STORE_KEY = "m3e:ai";
/** where the keys wait for this tab's session when they are not remembered */
const SESSION_KEY = "m3e:ai:keys";

const readJson = (store: () => Storage, key: string): Record<string, unknown> => {
  try {
    const v = JSON.parse(store().getItem(key) ?? "null");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
};

/** The settings as this browser keeps them. The keys come from this tab's session unless the author chose to have
 *  them remembered; a key saved before there was that choice was remembered, and stays so until they say otherwise. */
export function loadAiSettings(): AiSettings {
  const s = { ...DEFAULT_AI };
  const v = readJson(() => localStorage, STORE_KEY) as Partial<AiSettings>;
  if (PROVIDERS.some((p) => p.key === v.provider)) s.provider = v.provider as Provider;
  if (typeof v.baseUrl === "string") s.baseUrl = v.baseUrl;
  if (typeof v.model === "string") s.model = v.model;
  if (IMAGE_PROVIDERS.some((p) => p.key === v.imageProvider)) s.imageProvider = v.imageProvider;
  if (typeof v.imageBaseUrl === "string") s.imageBaseUrl = v.imageBaseUrl;
  if (typeof v.imageModel === "string") s.imageModel = v.imageModel;
  if (EFFORTS.includes(v.effort as Effort)) s.effort = v.effort;
  const older = v.rememberKey === undefined && ((typeof v.key === "string" && !!v.key) || (typeof v.imageKey === "string" && !!v.imageKey));
  s.rememberKey = v.rememberKey === true || older;
  const keys = s.rememberKey ? v : (readJson(() => sessionStorage, SESSION_KEY) as Partial<AiSettings>);
  if (typeof keys.key === "string") s.key = keys.key;
  if (typeof keys.imageKey === "string") s.imageKey = keys.imageKey;
  return s;
}

/** Settings live in this browser only, like the document itself, and never in a document. The keys go to this tab's
 *  session, and to the browser's storage only when the author chose to have them remembered; choosing not to takes
 *  them out of it. */
export function saveAiSettings(s: AiSettings) {
  const { key, imageKey, ...rest } = s;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s.rememberKey ? s : { ...rest, rememberKey: false }));
  } catch {}
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ key, ...(imageKey !== undefined ? { imageKey } : {}) }));
  } catch {}
}

/** a hosted endpoint needs a key; a server on this machine may run without one */
export const hasKey = (s: AiSettings) => s.key.trim().length > 0 || isLocal(s.baseUrl);

const trimSlash = (u: string) => u.trim().replace(/\/+$/, "");

/** one round trip: a system prompt and a user message in, the model's text out */
export async function complete(s: AiSettings, system: string, user: string, signal?: AbortSignal, maxTokens = 4096): Promise<string> {
  const base = trimSlash(s.baseUrl);
  const model = s.model.trim();
  if (!model) throw new Error("model");
  if (!isSecureUrl(base)) throw new Error("insecure");
  if (s.provider === "claude") {
    /* where the model declines, Anthropic's API re-runs the request on one that can answer */
    const fallback = model === "claude-sonnet-5-5" && base === "https://api.anthropic.com";
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": s.key.trim(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        ...(fallback ? { "anthropic-beta": "server-side-fallback-2026-07-01" } : {}),
      },
      body: JSON.stringify({ model, max_tokens: Math.min(maxTokens, 16000), system, messages: [{ role: "user", content: user }], ...(fallback ? { fallbacks: "default" } : {}) }),
    });
    if (!res.ok) throw await readError(res, s.key);
    const j = await res.json();
    if (j.stop_reason === "refusal") throw new Error("refusal");
    if (j.stop_reason === "max_tokens") throw new Error("long");
    return (j.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");
  }
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (s.key.trim()) headers.authorization = `Bearer ${s.key.trim()}`;
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal,
    headers,
    body: JSON.stringify({
      model,
      /* OpenAI's newer models refuse `max_tokens` and default generously, so they get no budget;
         the other compatible endpoints cap around 8k */
      ...(s.provider === "openai" ? {} : { max_tokens: Math.min(maxTokens, 8192) }),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw await readError(res, s.key);
  const j = await res.json();
  if (j.choices?.[0]?.finish_reason === "length") throw new Error("long");
  const c = j.choices?.[0]?.message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((x: { text?: string }) => x.text ?? "").join("");
  throw new Error("empty");
}

/** The key that pays for a picture: its own, or the writing model's when both are the same provider. */
const imageKeyOf = (s: AiSettings) => s.imageKey?.trim() || (s.provider === (s.imageProvider ?? "openai") ? s.key.trim() : "");

export const hasImageKey = (s: AiSettings) => !!imageKeyOf(s) || isLocal(s.imageBaseUrl ?? "");

/** which file a base64 picture is, by how it starts */
const mimeOf = (b64: string) => (b64.startsWith("/9j/") ? "image/jpeg" : b64.startsWith("UklGR") ? "image/webp" : b64.startsWith("R0lGOD") ? "image/gif" : "image/png");

/** an animation's frames: how many, and how long each stands */
export type Animated = { frames: number; ms: number };

/** One picture from the provider's OpenAI-style endpoint, as a data address. Tall or wide by the box it is for. */
export async function generateImage(s: AiSettings, prompt: string, box: { w: number; h: number }, signal?: AbortSignal, animated?: Animated): Promise<string> {
  const spec = imageSpec(s.imageProvider);
  const base = trimSlash(s.imageBaseUrl?.trim() || spec.baseUrl);
  const model = s.imageModel?.trim() || spec.model;
  if (!isSecureUrl(base)) throw new Error("insecure");
  const tall = box.h > box.w * 1.15;
  const wide = box.w > box.h * 1.15;
  /* only OpenAI's models animate; every frame counts against a request's pixels, so an animation's are smaller */
  const moving = animated && s.imageProvider !== "gemini" ? animated : undefined;
  const size = moving ? (tall ? "512x768" : wide ? "768x512" : "640x640") : tall ? "1024x1536" : wide ? "1536x1024" : "1024x1024";
  const key = imageKeyOf(s);
  const res = await fetch(`${base}/images/generations`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    /* OpenAI's models always answer in base64 and refuse the old switch; Gemini needs it. A JPEG at medium quality keeps a scene small. */
    body: JSON.stringify({ model, prompt, n: 1, size, ...(s.imageProvider === "gemini" ? { response_format: "b64_json" } : moving ? { quality: "medium", output_format: "gif", frame_count: moving.frames, frame_duration_ms: moving.ms } : { quality: "medium", output_format: "jpeg" }) }),
  });
  if (!res.ok) throw await readError(res, key);
  const first = (await res.json())?.data?.[0];
  if (typeof first?.b64_json === "string" && first.b64_json) return `data:${mimeOf(first.b64_json)};base64,${first.b64_json}`;
  if (typeof first?.url === "string" && /^https:\/\//i.test(first.url)) return first.url;
  throw new Error("empty");
}

/** what is asked of the picture: the words of the scene, its style, and that the interface is not part of it */
export const scenePrompt = (prompt: string, style: string, animated = false) =>
  [style.trim(), prompt.trim(), animated ? "A seamless loop: the view and the composition hold still, and only small things move gently, like flames, water, leaves or dust." : "", "No text, letters, logos, buttons or user interface anywhere in the picture."].filter(Boolean).join(". ").replace(/\.\.+/g, ".").replace(/。\./g, "。");

/** the scenes in a document with words to paint and no picture yet */
export function scenesToPaint(groups: Group[]): Item[] {
  return groups.flatMap((g) => g.items).filter((it) => it.component === "scene" && typeof it.props?.prompt === "string" && it.props.prompt.trim() && !it.props.image);
}

/** A scene draws behind what stands on it, so it comes first in the document whatever order the model wrote. */
export function scenesFirst(doc: Doc): Doc {
  const isScene = (g: Group) => g.items.some((it) => it.component === "scene");
  return { ...doc, groups: [...doc.groups.filter(isScene), ...doc.groups.filter((g) => !isScene(g))] };
}

/** parts with no surface of their own: their words stand directly on whatever is behind them */
const BARE_WORDS = new Set(["text", "stat-bar", "skill-button", "section-header", "asset-pill", "marquee", "shimmer-text", "number-ticker", "timer"]);

/** A scene's picture is unknown until it is painted, and most are darker than a page. Words standing bare on
 *  one are drawn light, over a picture darkened behind them; a part with its own surface keeps its own. */
export function readableOnScenes(doc: Doc): Doc {
  const scenes = doc.groups.filter((g) => g.items.some((it) => it.component === "scene"));
  if (!scenes.length) return doc;
  const bounds = (g: Group) => {
    const it = g.items[0];
    const w = Number(it.props?.width) || partBySlug("scene")!.w;
    const h = Number(it.props?.height) || partBySlug("scene")!.h;
    return { l: g.x, t: g.y, r: g.x + w, b: g.y + h };
  };
  const onScene = (g: Group) => scenes.find((s) => {
    const b = bounds(s);
    return s !== g && g.x >= b.l && g.x < b.r && g.y >= b.t && g.y < b.b;
  });
  const needsDark = new Set<string>();
  const groups = doc.groups.map((g) => {
    const host = onScene(g);
    if (!host || !g.items.some((it) => BARE_WORDS.has(it.component ?? ""))) return g;
    needsDark.add(host.id);
    return { ...g, items: g.items.map((it) => (BARE_WORDS.has(it.component ?? "") && !it.textColor ? { ...it, textColor: "inverseOnSurface" as const } : it)) };
  });
  return {
    ...doc,
    groups: groups.map((g) => {
      if (!needsDark.has(g.id)) return g;
      return { ...g, items: g.items.map((it) => (it.component === "scene" && (!it.props?.scrim || it.props.scrim === "none") ? { ...it, props: { ...it.props, scrim: "full" } } : it)) };
    }),
  };
}

/** the first JSON object in a reply, with any code fence stripped */
function parseJsonObject(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const a = cleaned.indexOf("{");
  const b = cleaned.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("json");
  let v: unknown;
  /* a reply cut off inside the object, or one that is not JSON at all, is a reply that could not be read */
  try {
    v = JSON.parse(cleaned.slice(a, b + 1));
  } catch {
    throw new Error("json");
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("json");
  return v as Record<string, unknown>;
}

/* ---------- actions ---------- */

const LANG_NAME: Record<Lang, string> = { ja: "Japanese", en: "English", zh: "Simplified Chinese", ko: "Korean" };

const hasText = (v?: string | null) => !!v && v.trim().length > 0;

const itemsOnFrame = (doc: Doc, frame: Frame, widths: Record<string, number>): Item[] =>
  doc.groups.filter((g: Group) => frameOfGroup(g, doc.frames, widths)?.id === frame.id).flatMap((g) => g.items);

const describeItem = (it: Item) => {
  const bits = [`id=${it.id}`, `part=${it.component}`];
  const words = labelOfPart(partBySlug(it.component), it.props);
  if (hasText(words)) bits.push(`says=${JSON.stringify(words)}`);
  if (it.action) bits.push(`tap=${it.action.to}`);
  if (hasText(it.note)) bits.push(`current_note=${JSON.stringify(it.note)}`);
  return bits.join(" ");
};

const context = (doc: Doc, widths: Record<string, number>, frame: Frame, lang: Lang) =>
  [
    "The author is sketching a Material 3 Expressive app. Below is the generated description of the whole design, then the screen to work on.",
    "",
    "=== Whole design ===",
    buildPrompt(doc, widths, undefined, lang),
    "",
    `=== Screen to work on: ${JSON.stringify(frame.name || "(unnamed)")} ===`,
  ].join("\n");

const SYSTEM = "You help an app designer finish a sketch. Answer with a single JSON object and nothing else: no prose, no markdown fence.";

/** picks the strings the model returned for exactly the parts asked about */
function pickStrings(v: unknown, parts: Item[], max: number): Record<string, string> {
  const map = (v ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const it of parts) {
    const s = map[it.id];
    if (typeof s === "string" && s.trim()) out[it.id] = s.trim().slice(0, max);
  }
  return out;
}

/** a short behavior note for one part; an existing note is refined rather than replaced */
export async function proposeBehavior(s: AiSettings, doc: Doc, widths: Record<string, number>, frame: Frame, lang: Lang, itemId: string, signal?: AbortSignal): Promise<string | undefined> {
  const parts = itemsOnFrame(doc, frame, widths).filter((it) => it.id === itemId);
  if (!parts.length) return undefined;
  const user = [
    context(doc, widths, frame, lang),
    "",
    "For the part listed below, write what happens when the user interacts with it: what it does, where it leads, what it shows. One sentence, concrete, in the voice of a product spec (no 'should', no hedging). Infer from the labels, icons and the other screens; do not invent screens that do not exist.",
    "A part with a current_note already has the author's own wording: keep its intent and facts, and improve it (clearer, more specific, consistent with the rest of the screen). Do not contradict it.",
    `Write in ${LANG_NAME[lang]}.`,
    "",
    "Part:",
    describeItem(parts[0]),
    "",
    'Answer as {"notes": {"<id>": "<sentence>"}} using exactly the id above.',
  ].join("\n");
  const j = parseJsonObject(await complete(s, SYSTEM, user, signal));
  return pickStrings(j.notes, parts, 300)[itemId];
}

/** a name (only when the screen has none) and a one-line purpose for the screen; an existing description is refined */
export async function proposeDescription(s: AiSettings, doc: Doc, widths: Record<string, number>, frame: Frame, lang: Lang, signal?: AbortSignal): Promise<{ name?: string; note: string }> {
  const user = [
    context(doc, widths, frame, lang),
    "",
    "Describe this screen's purpose in one or two sentences: who opens it, what they see and what they can do here. Also propose a short screen name (one to three words).",
    hasText(frame.note) ? `The author's current description is ${JSON.stringify(frame.note)}: keep its intent and facts, and improve it.` : "",
    `Write in ${LANG_NAME[lang]}.`,
    "",
    'Answer as {"name": "<name>", "description": "<sentences>"}.',
  ]
    .filter((l) => l !== "")
    .join("\n");
  const j = parseJsonObject(await complete(s, SYSTEM, user, signal));
  const note = typeof j.description === "string" ? j.description.trim().slice(0, 400) : "";
  if (!note) throw new Error("json");
  const name = typeof j.name === "string" ? j.name.trim().slice(0, 40) : "";
  return { name: !hasText(frame.name) && name ? name : undefined, note };
}

/** the value a rewritten field had before, so the rewrite can be undone; an empty field leaves nothing to go back to */
export const pushHistory = (history: string[] | undefined, replaced: string | undefined): string[] | undefined => {
  const cur = (replaced ?? "").trim();
  return cur ? [cur] : history?.length ? history : undefined;
};

/** the patch that swaps a field with what it said before the AI wrote it; pressing again swaps back */
export function popHistory<V extends string, H extends string>(current: string | undefined, history: string[] | undefined, valueKey: V, historyKey: H): Record<V, string> & Record<H, string[] | undefined> {
  const [prev] = history ?? [];
  const cur = (current ?? "").trim();
  return { [valueKey]: prev ?? "", [historyKey]: cur ? [cur] : undefined } as Record<V, string> & Record<H, string[] | undefined>;
}

/** A whole design from an idea, drafted by the author's own model. `guide` is the same
 *  agent guide a coding agent reads (public/agent.md), so both paths follow one spec.
 *  The answer is the document itself; a link would be pointless here. */
export async function draftDesign(s: AiSettings, guide: string, idea: string, lang: Lang, signal?: AbortSignal, rules?: string, ask: Complete = complete): Promise<Doc> {
  const system = [
    "You draft M3E Canvas designs. Follow the guide below exactly.",
    "Reply with the JSON document only: no share link, no prose, no markdown fence, no explanation.",
    "",
    guide,
  ].join("\n");
  /* a document held to a style is told its rules, which leave looks to the style; any other may be given effects */
  const free = `${lookForModel()}\nThis canvas is not held to a style's rules: if you name a \`theme.style\`, also write \`"strict": false\` in \`theme\`, and these looks stay.`;
  const user = [`Sketch this app: ${idea.trim()}`, `Write every label, title and note in ${LANG_NAME[lang]}.`, "Three to five screens. Keep it simple.", "", rules || free].join("\n");
  const j = parseJsonObject(await ask(s, system, user, signal, 16000));
  /* the same way in as any document: migrated, checked, cleaned, what this version does not know kept */
  const loaded = loadDocument(j);
  /* a model has no newer version to write in: one that says so wrote something else */
  if (!loaded || loaded.newer) throw new Error("json");
  return readableOnScenes(scenesFirst(withoutSampleWords(loaded.doc)));
}

/** Words a model left out are words the app does not need, but a part left to itself shows its sample
 *  text ("12 new messages" under every row of a menu). What it left out stays empty; a default that is
 *  a setting rather than words (a colour, an address, a list of states) stays. */
export function withoutSampleWords(doc: Doc): Doc {
  const clean = (g: Group): Group => ({
    ...g,
    items: g.items.map((it) => {
      const def = partBySlug(it.component);
      if (!def) return it;
      const props = { ...it.props };
      for (const d of def.props) if (d.kind === "text" && props[d.key] === undefined && !/^#|^https?:|,/.test(d.default)) props[d.key] = "";
      return { ...it, props };
    }),
  });
  return { ...doc, groups: doc.groups.map(clean), ...(doc.components ? { components: doc.components.map((c) => ({ ...c, groups: c.groups.map(clean) })) } : {}) };
}

