/* The standard capabilities (report 2.3, docs/平台能力.md): what each takes, gives back, sends and how it fails, as
 * JSON Schema. Every app reads the same entries: the editor checks an `invoke` against them, the preview's mocks answer
 * with their examples, the export prints their types and registry from them. A product's own capabilities are declared
 * the same way in `Doc.capabilities.own`. Bumping an entry's `version` is how a change to it is told apart.
 *
 * No imports but this folder's types, so the file goes into an exported app's packages/capabilities as it is. */

import type { CapabilityDef, CapabilitySchema, CapabilitySpec } from "./types";

const str = (description?: string, more: Record<string, unknown> = {}): CapabilitySchema => ({ type: "string", ...(description ? { description } : {}), ...more });
const num = (description?: string, more: Record<string, unknown> = {}): CapabilitySchema => ({ type: "number", ...(description ? { description } : {}), ...more });
const bool = (description?: string): CapabilitySchema => ({ type: "boolean", ...(description ? { description } : {}) });
const obj = (properties: Record<string, CapabilitySchema>, required: string[] = [], more: Record<string, unknown> = {}): CapabilitySchema => ({ type: "object", properties, ...(required.length ? { required } : {}), ...more });
const point = obj({ lat: num("latitude", { minimum: -90, maximum: 90 }), lng: num("longitude", { minimum: -180, maximum: 180 }) }, ["lat", "lng"]);
const file = obj({ name: str(), type: str("its media type"), size: num("bytes"), url: str("where the app can read it: a data:, blob: or file: URL") }, ["name", "type", "url"]);
const NOTHING: CapabilitySchema = obj({}, [], { examples: [{}] });

/** the providers a sign-in or a payment button may name */
export const PROVIDERS = ["apple", "google", "wechat", "alipay", "paypal", "stripe", "github", "facebook", "x", "line", "kakao", "other"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const CAPABILITY_CATALOG: readonly CapabilityDef[] = [
  {
    name: "payment.pay",
    kind: "call",
    version: 1,
    summary: "Hands an order the back end created (and signed) to the platform's payment sheet. It only says the payment was submitted: whether the order is paid is the order's status, from the back end.",
    args: obj(
      {
        orderId: str("the order the back end created"),
        amount: num("what the order costs, as the back end said: shown on the sheet, never decided here"),
        currency: str("ISO 4217 code", { examples: ["CNY", "USD"] }),
        method: str("how the visitor pays", { examples: ["wechat", "alipay", "card", "apple", "google"] }),
        payload: { type: "object", description: "the payment parameters the back end signed for the platform's SDK" },
      },
      ["orderId"],
    ),
    result: obj({ status: str("the platform took the payment for processing", { enum: ["submitted"] }) }, ["status"], { examples: [{ status: "submitted" }] }),
    failures: ["cancelled", "failed", "unavailable"],
  },
  {
    name: "iap.purchase",
    kind: "call",
    version: 1,
    summary: "Buys a product of the app store. The receipt goes to the back end to check: it decides what was bought.",
    args: obj({ productId: str("the store's product id") }, ["productId"]),
    result: obj({ receipt: str("for the back end to verify"), productId: str(), transactionId: str() }, ["receipt"], { examples: [{ receipt: "mock-receipt", productId: "premium.monthly", transactionId: "mock-transaction" }] }),
    failures: ["cancelled", "failed", "unavailable"],
  },
  {
    name: "auth.oauth",
    kind: "call",
    version: 1,
    summary: "Signs in with another service. The code or token it gives back goes to the API's sign-in endpoint: the back end decides who it is.",
    args: obj({ provider: str("the service", { enum: [...PROVIDERS] }), scopes: { type: "array", items: str() } }, ["provider"]),
    result: obj({ provider: str(), code: str("an authorization code for the back end"), idToken: str("an OpenID Connect token for the back end") }, ["provider"], { examples: [{ provider: "wechat", code: "mock-code" }] }),
    failures: ["cancelled", "failed", "unavailable"],
  },
  {
    name: "location.current",
    kind: "call",
    version: 1,
    summary: "Where the device is now. Asks for the permission when it has to; a refusal is `denied`.",
    args: obj({ accuracy: str("how close", { enum: ["low", "balanced", "high"] }) }),
    result: obj({ lat: num(), lng: num(), accuracy: num("metres") }, ["lat", "lng"], { examples: [{ lat: 31.2304, lng: 121.4737, accuracy: 20 }] }),
    failures: ["denied", "unavailable", "timeout"],
  },
  {
    name: "scan.code",
    kind: "call",
    version: 1,
    summary: "Scans a QR code or a barcode with the camera and gives back what it says.",
    args: obj({ formats: { type: "array", items: str(undefined, { examples: ["qr", "ean13", "code128"] }) } }),
    result: obj({ text: str(), format: str() }, ["text"], { examples: [{ text: "https://example.com/item/42", format: "qr" }] }),
    failures: ["cancelled", "denied", "unavailable"],
  },
  {
    name: "push.register",
    kind: "call",
    version: 1,
    summary: "Asks for the permission to send notifications and gives back the device's token, for the back end to register.",
    args: NOTHING,
    result: obj({ token: str(), platform: str(undefined, { examples: ["apns", "fcm", "web", "miniapp"] }) }, ["token"], { examples: [{ token: "mock-push-token", platform: "web" }] }),
    failures: ["denied", "unavailable"],
  },
  {
    name: "push.opened",
    kind: "event",
    version: 1,
    summary: "The visitor opened a notification: the screen it points at, with its params.",
    payload: obj({ route: str("a screen"), params: { type: "object" }, data: { type: "object" } }),
  },
  {
    name: "share.open",
    kind: "call",
    version: 1,
    generic: true,
    summary: "The platform's share sheet, with words and a link.",
    args: obj({ title: str(), text: str(), url: str(undefined, { format: "uri" }) }),
    result: NOTHING,
    failures: ["cancelled", "unavailable"],
  },
  {
    name: "clipboard.write",
    kind: "call",
    version: 1,
    generic: true,
    summary: "Copies words to the clipboard.",
    args: obj({ text: str() }, ["text"]),
    result: NOTHING,
    failures: ["failed", "denied"],
  },
  {
    name: "link.open",
    kind: "call",
    version: 1,
    generic: true,
    summary: "Opens a web page outside the app (an http or https address).",
    args: obj({ url: str(undefined, { format: "uri" }) }, ["url"]),
    result: NOTHING,
    failures: ["failed"],
  },
  {
    name: "file.pick",
    kind: "call",
    version: 1,
    generic: true,
    summary: "Lets the visitor pick files: from the photo album, a new picture from the camera, or any file.",
    args: obj({ accept: str("media types or extensions, as an input's accept", { examples: ["image/*", ".pdf"] }), multiple: bool(), source: str(undefined, { enum: ["album", "camera", "file"] }) }),
    result: obj({ files: { type: "array", items: file } }, ["files"]),
    failures: ["cancelled", "denied"],
  },
  {
    name: "analytics.track",
    kind: "call",
    version: 1,
    silent: true,
    summary: "Records that something happened. Never fails: nothing waits for it.",
    args: obj({ event: str(), props: { type: "object" } }, ["event"]),
    result: NOTHING,
    failures: [],
  },
  {
    name: "biometric.verify",
    kind: "call",
    version: 1,
    summary: "Checks the visitor's fingerprint or face with the device. Says only whether it matched: what that unlocks is the back end's.",
    args: obj({ reason: str("why it is asked, shown to the visitor") }),
    result: obj({ ok: bool() }, ["ok"], { examples: [{ ok: true }] }),
    failures: ["cancelled", "unavailable"],
  },
  {
    name: "rtc.call",
    kind: "call",
    version: 1,
    view: "rtc.view",
    summary: "Starts an audio or video call in a room the back end made. How it goes is the call view's props.",
    args: obj({ room: str("the room the back end made"), video: bool() }, ["room"]),
    result: obj({ callId: str() }, ["callId"], { examples: [{ callId: "mock-call" }] }),
    failures: ["failed", "denied", "unavailable"],
  },
  {
    name: "rtc.view",
    kind: "view",
    version: 1,
    summary: "The picture and the controls of a call. Its state comes in as props; hanging up and muting go out as events.",
    props: obj({
      name: str("who is called"),
      connected: bool("the call is connected"),
      status: str("what it says while not connected: Calling…"),
      mic: bool("the microphone is on"),
      camera: bool("the camera is on"),
      speaker: bool("the speaker is on"),
      startedAt: str("when it was connected, from the back end", { format: "date-time" }),
      image: str("the other side's picture"),
    }),
    events: [{ name: "connected" }, { name: "ended" }, { name: "muted", payload: obj({ muted: bool() }) }],
  },
  {
    name: "map",
    kind: "view",
    version: 1,
    summary: "A map: where it is centred, how close, the markers (bindable to data), a route, the marker chosen. It sends which marker was tapped, where it was moved and where it was pressed.",
    props: obj({
      label: str("what the place is called"),
      center: point,
      zoom: num(undefined, { minimum: 1, maximum: 20 }),
      markers: { type: "array", items: obj({ id: str(), lat: num(), lng: num(), title: str() }, ["id", "lat", "lng"]) },
      route: { type: "array", items: point },
      selected: str("the id of the marker chosen"),
    }),
    events: [
      { name: "markerTap", payload: obj({ id: str() }) },
      { name: "regionChange", payload: obj({ center: point, zoom: num() }) },
      { name: "longPress", payload: point },
    ],
    failures: ["unavailable"],
  },
  {
    name: "camera",
    kind: "view",
    version: 1,
    summary: "The camera's picture on the screen: a photo or a video taken, or a code scanned. The visitor may refuse it (`denied`).",
    props: obj({ facing: str(undefined, { enum: ["back", "front"] }), mode: str(undefined, { enum: ["photo", "video", "scan"] }), state: str("what the design draws: the picture, or the camera refused or missing", { enum: ["live", "denied", "unavailable"] }), denied: str("the words shown when it is refused") }),
    events: [
      { name: "captured", payload: obj({ file }) },
      { name: "scanned", payload: obj({ text: str(), format: str() }) },
    ],
    failures: ["denied", "unavailable"],
  },
];

const BY_NAME = new Map(CAPABILITY_CATALOG.map((c) => [c.name, c]));

/** a standard capability by its name */
export const standardCapability = (name: string): CapabilityDef | undefined => BY_NAME.get(name);

/** A capability by its name: a product's own first (it may stand in for a standard one), then the catalog's. */
export function capabilityOf(spec: CapabilitySpec | undefined, name: string): CapabilityDef | undefined {
  return spec?.own?.find((c) => c.name === name) ?? BY_NAME.get(name);
}

/** every capability a document can name: the catalog's, then its own (an own one of a standard name in its place) */
export function allCapabilities(spec: CapabilitySpec | undefined): CapabilityDef[] {
  const own = spec?.own ?? [];
  const mine = new Set(own.map((c) => c.name));
  return [...CAPABILITY_CATALOG.filter((c) => !mine.has(c.name)), ...own];
}

/** the failures a call may come to: what it declares, and `not-implemented`; a silent one comes to none */
export function failuresOf(def: CapabilityDef | undefined): string[] {
  if (def?.silent) return [];
  return [...new Set([...(def?.failures ?? ["failed", "unavailable"]), "not-implemented"])];
}

/** the first example a schema gives, as a plain value */
export function exampleOf(schema: CapabilitySchema | undefined): unknown {
  if (!schema || typeof schema !== "object") return undefined;
  const examples = schema.examples;
  return Array.isArray(examples) && examples.length ? examples[0] : undefined;
}

/** the names of a call's arguments, when its schema lists them and takes no others; undefined when it takes any */
export function argNamesOf(def: CapabilityDef): string[] | undefined {
  const a = def.args;
  if (!a || typeof a !== "object") return undefined;
  const props = a.properties;
  if (!props || typeof props !== "object" || a.additionalProperties === true) return undefined;
  return Object.keys(props);
}

/** the arguments a call cannot go without */
export function requiredArgsOf(def: CapabilityDef): string[] {
  const a = def.args;
  return a && typeof a === "object" && Array.isArray(a.required) ? a.required.filter((k): k is string => typeof k === "string") : [];
}
