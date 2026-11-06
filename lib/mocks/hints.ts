/* What a field is, read from what it is called, its format and its enum, when the author has not said: `avatar` is a
 * picture of a face, `email` an address at example.com, `name` a person's name in a User and a product's name in a
 * Product, `createdAt` a moment in the last months, `status` one of its values with the first the most common. The
 * author (or the AI) can always say otherwise with a hint of their own (MockModelConfig.hints). */

import { isRecord } from "../api/schema";
import type { JsonSchema, JsonSchemaObject } from "../api/types";
import type { MockHint, MockKind } from "./types";

/** a name in lowercase words: createdAt → created at, avatar_url → avatar url */
export function wordsOf(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** the JSON types a schema allows, null apart */
export function typesOf(s: JsonSchemaObject): string[] {
  const list = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
  const out = list.filter((t) => t !== "null");
  if (out.length) return out;
  if (isRecord(s.properties)) return ["object"];
  if (s.items !== undefined) return ["array"];
  if (Array.isArray(s.enum) && s.enum.length) return [typeof s.enum[0] === "number" ? "number" : typeof s.enum[0] === "boolean" ? "boolean" : "string"];
  return [];
}

const PERSONS = /^(user|users|person|people|customer|member|author|owner|profile|account|contact|employee|staff|student|teacher|doctor|patient|player|friend|follower|buyer|seller|driver|guest|admin|creator|sender|recipient|participant|attendee|speaker|candidate|applicant|reviewer|commenter|host)$/;
const PRODUCTS = /^(product|products|item|items|goods|sku|merchandise|article|dish|menu|course|plan|ticket|book|listing|offer|deal|gift|service)$/;
const COMPANIES = /^(company|companies|organization|organisation|org|store|shop|brand|merchant|vendor|supplier|business|team|restaurant|hotel|venue|school|clinic|agency)$/;
const PLACES = /^(place|location|city|venue|address|region|area|spot|destination)$/;

/** what kind of thing a model holds, by its name's words */
function modelSort(model: string | undefined): "person" | "product" | "company" | "place" | undefined {
  if (!model) return undefined;
  const words = wordsOf(model);
  for (const w of [...words].reverse()) {
    if (PERSONS.test(w)) return "person";
    if (PRODUCTS.test(w)) return "product";
    if (COMPANIES.test(w)) return "company";
    if (PLACES.test(w)) return "place";
  }
  return undefined;
}

const has = (words: string[], ...any: string[]) => words.some((w) => any.includes(w));
const last = (words: string[]) => words[words.length - 1] ?? "";

/** The hint a field gets when nobody gave one: from its format first, then its name, then its type. `model` is the
 *  model the field belongs to (a `name` is a person's in a User). */
export function inferHint(name: string, schema: JsonSchema | undefined, model?: string): MockHint {
  const s: JsonSchemaObject = isRecord(schema) ? (schema as JsonSchemaObject) : {};
  const types = typesOf(s);
  const type = types[0];
  const format = typeof s.format === "string" ? s.format : "";
  /* a list is named in the plural: images are images, categories categories */
  const words = wordsOf(name).flatMap((w) => (w.length > 3 && w.endsWith("ies") ? [w, `${w.slice(0, -3)}y`] : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") ? [w, w.slice(0, -1)] : [w]));
  const end = last(wordsOf(name)) === "ids" ? "id" : last(wordsOf(name));
  const sort = modelSort(model);
  const numeric = type === "number" || type === "integer";
  const text = type === "string" || type === undefined;

  if (s.const !== undefined) return { kind: "constant", value: s.const };
  if (Array.isArray(s.enum) && s.enum.length) return { kind: has(words, "status", "state") ? "status" : "enum" };

  /* the format says it best */
  if (text) {
    if (format === "uuid") return { kind: has(words, "id", "uuid", "guid") || end === "id" ? "id" : "uuid" };
    if (format === "email") return { kind: "email" };
    if (format === "date-time") return { kind: "dateTime", ...dateRange(words) };
    if (format === "date") return { kind: "date", ...dateRange(words) };
    if (format === "time") return { kind: "time" };
    if (format === "binary" || format === "byte") return { kind: fileKind(words, s) };
    if (format === "password") return { kind: "password" };
    if (format === "ipv4" || format === "ipv6") return { kind: "ip" };
    if (format === "phone" || format === "tel") return { kind: "phone" };
    if (format === "uri" || format === "url" || format === "iri" || format === "uri-reference") {
      if (has(words, "avatar", "photo", "picture", "image", "img", "thumbnail", "thumb", "cover", "banner", "logo", "icon", "poster", "portrait", "headshot")) return { kind: has(words, "avatar", "portrait", "headshot") || (sort === "person" && has(words, "photo", "picture")) ? "avatar" : "image" };
      if (has(words, "audio", "voice", "sound", "music", "song", "podcast", "track")) return { kind: "audio" };
      if (has(words, "video", "clip", "movie", "trailer")) return { kind: "video" };
      if (has(words, "file", "attachment", "document", "pdf", "download", "receipt", "invoice", "resume", "cv")) return { kind: "file" };
      return { kind: "url" };
    }
    if (typeof s.contentMediaType === "string") return { kind: fileKind([...words, ...wordsOf(s.contentMediaType)], s) };
  }

  if (type === "boolean") return { kind: "boolean" };

  /* ids and references to other records */
  if (end === "id" || end === "uuid" || end === "guid" || name === "_id") return { kind: "id" };

  if (numeric) {
    if (has(words, "price", "amount", "cost", "total", "subtotal", "fee", "balance", "salary", "revenue", "budget", "payment", "refund", "discount", "tax", "tip")) return { kind: "price" };
    if (has(words, "rating", "stars", "score") && !has(words, "count")) return { kind: "rating" };
    if (has(words, "percent", "percentage", "progress", "ratio", "rate", "completion")) return { kind: "percent" };
    if (end === "age" || has(words, "age")) return { kind: "age" };
    if (has(words, "lat", "latitude")) return { kind: "latitude" };
    if (has(words, "lng", "lon", "long", "longitude")) return { kind: "longitude" };
    if (has(words, "quantity", "qty", "count", "stock", "inventory", "likes", "views", "followers", "comments", "number", "num", "size", "seats", "votes")) return { kind: "quantity" };
    if (has(words, "year")) return { kind: "integer", min: 2000, max: 2030 };
    if (has(words, "timestamp", "time", "at") || (has(words, "created", "updated", "deleted", "expires", "published") && type === "integer")) return { kind: "dateTime", ...dateRange(words) };
    return { kind: type === "integer" ? "integer" : "number" };
  }

  if (!text) return { kind: "auto" };

  /* a string, by its name */
  if (has(words, "email", "mail")) return { kind: "email" };
  if (has(words, "phone", "mobile", "tel", "telephone", "cell", "fax")) return { kind: "phone" };
  if (has(words, "avatar", "portrait", "headshot")) return { kind: "avatar" };
  if (has(words, "photo", "picture", "image", "img", "thumbnail", "thumb", "cover", "banner", "logo", "poster")) return { kind: sort === "person" && has(words, "photo", "picture") ? "avatar" : "image" };
  if (has(words, "audio", "voice", "sound", "song", "podcast")) return { kind: "audio" };
  if (has(words, "video", "clip", "movie", "trailer")) return { kind: "video" };
  if (has(words, "attachment", "document", "pdf", "receipt", "invoice", "resume")) return { kind: "file" };
  if (has(words, "url", "link", "website", "homepage", "href", "site", "uri")) return { kind: "url" };
  if (has(words, "username", "login", "handle", "nickname", "screen") || (has(words, "user") && end === "name")) return { kind: "username" };
  if (end === "name" && has(words, "first", "given")) return { kind: "firstName" };
  if (end === "name" && has(words, "last", "family", "sur")) return { kind: "lastName" };
  if (end === "name" && has(words, "full", "display", "real", "contact", "author", "owner", "customer", "person", "recipient", "sender")) return { kind: "personName" };
  if (end === "name" && has(words, "company", "org", "organization", "store", "shop", "brand", "merchant", "vendor", "business")) return { kind: "company" };
  if (end === "name" && has(words, "product", "item", "goods")) return { kind: "productName" };
  if (end === "name" && has(words, "city", "town")) return { kind: "city" };
  if (name === "name" || end === "name") return { kind: sort === "person" ? "personName" : sort === "product" ? "productName" : sort === "company" ? "company" : sort === "place" ? "city" : "title" };
  if (has(words, "company", "organization", "organisation", "employer", "brand", "merchant", "vendor", "store", "shop")) return { kind: "company" };
  if (has(words, "job", "position", "occupation", "role") && !has(words, "roles")) return { kind: has(words, "job", "position", "occupation") ? "jobTitle" : "word" };
  if (has(words, "street", "line1", "line")) return { kind: "street" };
  if (has(words, "address", "addr")) return { kind: "address" };
  if (has(words, "city", "town")) return { kind: "city" };
  if (has(words, "province", "region", "prefecture", "county") || (end === "state" && (sort === "place" || /address|location/i.test(model ?? "")))) return { kind: "region" };
  if (has(words, "country", "nation")) return { kind: "country" };
  if (has(words, "zip", "postcode", "postal", "postalcode", "zipcode")) return { kind: "postcode" };
  if (has(words, "currency")) return { kind: "currency" };
  if (has(words, "status", "state")) return { kind: "status" };
  if (has(words, "color", "colour")) return { kind: "color" };
  if (has(words, "slug")) return { kind: "slug" };
  if (has(words, "sku", "code", "barcode", "isbn", "serial", "coupon", "voucher", "promo", "reference", "ref", "number", "no")) return { kind: "code" };
  if (has(words, "token", "secret", "key", "nonce", "hash", "signature")) return { kind: "token" };
  if (has(words, "password", "pwd", "passcode", "pin")) return { kind: "password" };
  if (has(words, "ip")) return { kind: "ip" };
  if (has(words, "version")) return { kind: "version" };
  if (has(words, "date", "day", "birthday", "dob", "deadline")) return { kind: "date", ...dateRange(words) };
  if (has(words, "time", "at", "timestamp")) return { kind: "dateTime", ...dateRange(words) };
  if (has(words, "category", "categories", "genre", "department", "section")) return { kind: "category" };
  if (has(words, "tag", "tags", "label", "labels", "keyword", "keywords", "topic", "topics")) return { kind: "tag" };
  if (has(words, "title", "headline", "subject", "caption", "heading", "question")) return { kind: "title" };
  if (has(words, "description", "content", "body", "text", "details", "story", "article", "answer", "html", "markdown")) return { kind: "paragraph" };
  if (has(words, "summary", "bio", "about", "intro", "message", "comment", "note", "notes", "remark", "excerpt", "review", "reply", "tagline", "subtitle", "motto")) return { kind: "sentence" };
  if (has(words, "type", "kind", "gender", "role", "level", "tier", "plan", "mode")) return { kind: "word" };
  return { kind: "word" };
}

/** the range a date falls in, by what it is the date of: things past, things to come, birthdays */
function dateRange(words: string[]): Pick<MockHint, "from" | "to"> {
  if (has(words, "birthday", "birth", "dob", "born")) return { from: "-65y", to: "-18y" };
  if (has(words, "expires", "expiry", "expiration", "due", "deadline", "end", "until", "scheduled", "next", "valid", "starts", "start", "departure", "arrival", "checkin", "checkout", "event")) return { from: "+0d", to: "+60d" };
  if (has(words, "updated", "modified", "edited", "last", "seen", "read")) return { from: "-14d", to: "now" };
  return { from: "-180d", to: "now" };
}

/** what kind of file a binary field holds, by its name or its media type */
function fileKind(words: string[], s: JsonSchemaObject): MockKind {
  const media = typeof s.contentMediaType === "string" ? s.contentMediaType : "";
  if (media.startsWith("image/") || has(words, "avatar", "photo", "picture", "image", "img", "thumbnail", "cover", "logo", "png", "jpeg", "jpg")) return has(words, "avatar") ? "avatar" : "image";
  if (media.startsWith("audio/") || has(words, "audio", "voice", "sound", "music", "song")) return "audio";
  if (media.startsWith("video/") || has(words, "video", "clip", "movie")) return "video";
  return "file";
}

/** the kinds a field of this type may take, for the editor's menu: the ones that make sense for it first */
export function kindsFor(schema: JsonSchema | undefined): MockKind[] {
  const s: JsonSchemaObject = isRecord(schema) ? (schema as JsonSchemaObject) : {};
  const t = typesOf(s)[0];
  if (t === "boolean") return ["auto", "boolean", "constant"];
  if (t === "integer" || t === "number") return ["auto", "integer", "number", "price", "quantity", "rating", "percent", "age", "latitude", "longitude", "dateTime", "id", "constant"];
  if (t === "array" || t === "object") return ["auto"];
  return [
    "auto", "id", "uuid", "personName", "firstName", "lastName", "username", "avatar", "email", "phone", "address", "street", "city", "region", "country", "postcode", "company", "jobTitle", "productName", "category", "tag",
    "price", "currency", "title", "sentence", "paragraph", "word", "slug", "code", "color", "url", "image", "file", "audio", "video", "date", "dateTime", "time", "enum", "status", "token", "password", "ip", "version", "constant",
  ];
}
