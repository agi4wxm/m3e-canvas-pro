/* The text and data formats of a record or a list: CSV and TSV (a row a record), JSON, NDJSON, XML, YAML, plain
 * text, Markdown, HTML, RTF, and the formats of things with a time, a person or a place: iCalendar events, vCards,
 * GeoJSON, GPX and KML. All written by hand, all UTF-8. */

import { LOCALES } from "../locales";
import { hash53, rngOf } from "../rng";
import { CENTERS, coordinatesOf, fieldsOf, flatten, paragraphsOf, rowsOf, tableOf, textOf, titleOf, titleOfRecord, xmlText, type Cell, type FileContent } from "./content";

/* ---------- tables ---------- */

const csvCell = (c: Cell) => {
  const s = textOf(c);
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV (RFC 4180): a head of field names, a record a line, CRLF */
export function csvOf(c: FileContent): string {
  const t = tableOf(rowsOf(c));
  return [t.columns.map(csvCell).join(","), ...t.rows.map((r) => r.map(csvCell).join(","))].join("\r\n") + "\r\n";
}

/** TSV (text/tab-separated-values): tabs and line breaks inside a field become spaces */
export function tsvOf(c: FileContent): string {
  const t = tableOf(rowsOf(c));
  const cell = (x: Cell | string) => textOf(x).replace(/[\t\r\n]+/g, " ");
  return [t.columns.map(cell).join("\t"), ...t.rows.map((r) => r.map(cell).join("\t"))].join("\n") + "\n";
}

/* ---------- data ---------- */

/** what a data file holds: the list, the record, or a titled sample */
function dataOf(c: FileContent): unknown {
  if (c.rows?.length) return rowsOf(c);
  if (c.record) return c.record;
  return { title: titleOf(c), items: rowsOf(c) };
}

export const jsonOf = (c: FileContent) => `${JSON.stringify(dataOf(c), null, 2)}\n`;

/** newline-delimited JSON: a record a line */
export function ndjsonOf(c: FileContent): string {
  return rowsOf(c).map((r) => JSON.stringify(r)).join("\n") + "\n";
}

/** an XML name from a field's name: letters, digits, - _ . and no leading digit or "xml" */
function xmlName(s: string): string {
  const n = s.replace(/[^A-Za-z0-9_.-]/g, "_").replace(/^[^A-Za-z_]/, "_$&");
  return /^xml/i.test(n) ? `_${n}` : n || "_";
}

function xmlValue(v: unknown, name: string, indent: string, depth = 0): string {
  const tag = xmlName(name);
  if (v === null || v === undefined) return `${indent}<${tag}/>`;
  if (Array.isArray(v)) {
    if (!v.length) return `${indent}<${tag}/>`;
    return `${indent}<${tag}>\n${v.map((x) => xmlValue(x, "item", `${indent}  `, depth + 1)).join("\n")}\n${indent}</${tag}>`;
  }
  if (typeof v === "object" && depth < 8) {
    const entries = Object.entries(v as Record<string, unknown>);
    if (!entries.length) return `${indent}<${tag}/>`;
    return `${indent}<${tag}>\n${entries.map(([k, x]) => xmlValue(x, k, `${indent}  `, depth + 1)).join("\n")}\n${indent}</${tag}>`;
  }
  return `${indent}<${tag}>${xmlText(typeof v === "object" ? JSON.stringify(v) : String(v))}</${tag}>`;
}

/** XML: the records as elements named after their model, their fields as child elements */
export function xmlOf(c: FileContent): string {
  const one = xmlName((c.model ?? "record").replace(/^./, (x) => x.toLowerCase()));
  const head = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  if (c.record && !c.rows?.length) return `${head}${xmlValue(c.record, one, "")}\n`;
  const rows = rowsOf(c);
  return `${head}<${one}s title="${xmlText(titleOf(c))}">\n${rows.map((r) => xmlValue(r, one, "  ")).join("\n")}\n</${one}s>\n`;
}

const yamlKey = (k: string) => (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(k) && !/^(true|false|null|yes|no|on|off|y|n)$/i.test(k) ? k : JSON.stringify(k));
function yamlScalar(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : ".nan";
  if (typeof v === "boolean") return String(v);
  return JSON.stringify(String(v));
}

function yamlOfValue(v: unknown, indent: string, depth = 0): string {
  if (Array.isArray(v)) {
    if (!v.length) return " []";
    return v
      .map((x) => {
        if (x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length && depth < 8) {
          const inner = yamlOfValue(x, `${indent}  `, depth + 1).replace(/^\n\s*/, "");
          return `\n${indent}- ${inner}`;
        }
        return `\n${indent}-${yamlOfValue(x, `${indent}  `, depth + 1)}`;
      })
      .join("");
  }
  if (v && typeof v === "object" && depth < 8) {
    const entries = Object.entries(v as Record<string, unknown>);
    if (!entries.length) return " {}";
    return entries.map(([k, x]) => `\n${indent}${yamlKey(k)}:${yamlOfValue(x, `${indent}  `, depth + 1)}`).join("");
  }
  return ` ${yamlScalar(v && typeof v === "object" ? JSON.stringify(v) : v)}`;
}

/** YAML: block style, every string in double quotes (JSON's escapes are YAML's) */
export function yamlOf(c: FileContent): string {
  return `# ${titleOf(c).replace(/[\r\n]+/g, " ")}${yamlOfValue(dataOf(c), "")}\n`;
}

/* ---------- documents in text ---------- */

/** plain text: the title underlined, then each record's fields */
export function txtOf(c: FileContent): string {
  const title = titleOf(c);
  const blocks = c.rows?.length ? rowsOf(c).map((r) => Object.entries(flatten(r)).map(([k, v]) => `${k}: ${textOf(v)}`).join("\n")) : c.record ? [fieldsOf(c).map(([k, v]) => `${k}: ${v}`).join("\n")] : paragraphsOf(c.seed, 3);
  return `${title}\n${"=".repeat(Math.min(60, [...title].length))}\n\n${blocks.join("\n\n")}\n`;
}

const mdCell = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");

/** Markdown: the title, a line about it, a table */
export function markdownOf(c: FileContent): string {
  const t = tableOf(rowsOf(c));
  const table = [`| ${t.columns.map(mdCell).join(" | ")} |`, `| ${t.columns.map(() => "---").join(" | ")} |`, ...t.rows.map((r) => `| ${r.map((x) => mdCell(textOf(x))).join(" | ")} |`)].join("\n");
  return `# ${mdCell(titleOf(c))}\n\n${paragraphsOf(c.seed, 1)[0]}\n\n${table}\n`;
}

const htmlText = (s: string) => s.replace(/[<>&"]/g, (x) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[x]!);

/** an HTML page: the title and a table */
export function htmlOf(c: FileContent): string {
  const t = tableOf(rowsOf(c));
  const title = htmlText(titleOf(c));
  return `<!doctype html>
<html lang="${c.locale ?? "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:2rem;color:#1d1b20}table{border-collapse:collapse}th,td{border:1px solid #cac4d0;padding:4px 8px;text-align:left}th{background:#f3edf7}</style>
</head>
<body>
<h1>${title}</h1>
<p>${htmlText(paragraphsOf(c.seed, 1)[0])}</p>
<table>
<thead><tr>${t.columns.map((x) => `<th>${htmlText(x)}</th>`).join("")}</tr></thead>
<tbody>
${t.rows.map((r) => `<tr>${r.map((x) => `<td>${htmlText(textOf(x))}</td>`).join("")}</tr>`).join("\n")}
</tbody>
</table>
</body>
</html>
`;
}

/** RTF text: its control characters escaped, anything beyond ASCII as \uN? */
function rtfText(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === "\\" || ch === "{" || ch === "}") out += `\\${ch}`;
    else if (ch === "\n") out += "\\line ";
    else if (c < 0x20) continue;
    else if (c < 0x80) out += ch;
    else
      for (let i = 0; i < ch.length; i++) {
        const u = ch.charCodeAt(i);
        out += `\\u${u > 32767 ? u - 65536 : u}?`;
      }
  }
  return out;
}

/** Rich Text: the title in large bold, then the fields or the rows, then a paragraph */
export function rtfOf(c: FileContent): string {
  const lines = c.record && !c.rows?.length ? fieldsOf(c).map(([k, v]) => `{\\b ${rtfText(k)}:}\\tab ${rtfText(v)}\\par`) : (() => {
    const t = tableOf(rowsOf(c));
    return [`{\\b ${t.columns.map(rtfText).join("\\tab ")}}\\par`, ...t.rows.map((r) => `${r.map((x) => rtfText(textOf(x))).join("\\tab ")}\\par`)];
  })();
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl{\\f0\\fswiss Helvetica;}}\\f0\\fs22\n{\\b\\fs36 ${rtfText(titleOf(c))}}\\par\\par\n${lines.join("\n")}\n\\par ${rtfText(paragraphsOf(c.seed, 1)[0])}\\par\n}\n`;
}

/* ---------- time, people, places ---------- */

/** a line of iCalendar or vCard folded at 75 octets, CRLF */
function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let len = 0;
  for (const ch of line) {
    const n = ch.codePointAt(0)! < 0x80 ? 1 : ch.codePointAt(0)! < 0x800 ? 2 : ch.codePointAt(0)! < 0x10000 ? 3 : 4;
    if (len + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      len = 0;
    }
    cur += ch;
    len += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsTime = (t: number) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

const DATE_KEYS = ["start", "startAt", "startsAt", "startTime", "startDate", "begin", "date", "time", "scheduledAt", "dueAt", "dueDate", "eventDate", "createdAt"];

/** when a record's event begins: a field named for it, else the first whose name says it is a time (placedAt,
 *  orderDate) and that reads as one */
function startOf(rec: Record<string, unknown> | undefined): number | undefined {
  if (!rec) return undefined;
  const timeOf = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? Date.parse(v) : typeof v === "number" ? (v > 1e11 ? v : v * 1000) : NaN);
  for (const k of [...DATE_KEYS, ...Object.keys(rec).filter((k) => /(At|Date|Time|_at|_date)$/.test(k))]) {
    const t = timeOf(rec[k]);
    if (Number.isFinite(t)) return t;
  }
  return undefined;
}

/** iCalendar (RFC 5545): an event for each record, at its time when it has one */
export function icsOf(c: FileContent): string {
  const rows = rowsOf(c, 5);
  const rng = rngOf(`ics:${c.seed}`);
  const base = Date.UTC(2026, 0, 5, 9);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//M3E Canvas Pro//Mocks//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${icsText(titleOf(c))}`];
  rows.slice(0, 200).forEach((r, i) => {
    const start = startOf(r) ?? base + rng.int(0, 60) * 86_400_000 + rng.int(0, 8) * 3_600_000;
    const summary = titleOfRecord(r) ?? `${titleOf(c)} ${i + 1}`;
    const where = ["location", "address", "venue", "place", "city"].map((k) => r[k]).find((v) => typeof v === "string") as string | undefined;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${hash53(`${c.seed}:${i}`).toString(36)}@mocks.example.com`,
      `DTSTAMP:${icsTime(base)}`,
      `DTSTART:${icsTime(start)}`,
      `DTEND:${icsTime(start + 3_600_000)}`,
      `SUMMARY:${icsText(summary)}`,
      ...(where ? [`LOCATION:${icsText(where)}`] : []),
      `DESCRIPTION:${icsText(Object.entries(flatten(r)).slice(0, 12).map(([k, v]) => `${k}: ${textOf(v)}`).join("\n"))}`,
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

const vcfText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** vCard 3.0 (RFC 2426): a card for each person record, or one person made from the seed */
export function vcfOf(c: FileContent): string {
  const people: Record<string, unknown>[] = c.rows?.length ? [...rowsOf(c)] : c.record ? [c.record] : (() => {
    const L = LOCALES[c.locale ?? "en"] ?? LOCALES.en;
    const rng = rngOf(`vcf:${c.seed}`);
    const [family, familyLatin] = rng.pick(L.family);
    const [given, givenLatin] = rng.pick(L.given);
    return [{ name: L.fullName(family, given), firstName: given, lastName: family, email: `${givenLatin}.${familyLatin}@example.com`.toLowerCase(), phone: L.phone(String(rng.int(1e9, 9e9))), company: L.company(rng.pick(L.companyStems), rng.pick(L.companyKinds), rng.int(0, 11)) }];
  })();
  const str = (r: Record<string, unknown>, ...keys: string[]) => keys.map((k) => r[k]).find((v): v is string => typeof v === "string" && v.length > 0 && !v.startsWith("data:"));
  const cards = people.slice(0, 500).map((r) => {
    const first = str(r, "firstName", "givenName", "first_name") ?? "";
    const last = str(r, "lastName", "familyName", "surname", "last_name") ?? "";
    const full = str(r, "name", "fullName", "displayName", "full_name", "username") ?? ([first, last].filter(Boolean).join(" ") || titleOf(c));
    const email = str(r, "email", "mail", "emailAddress");
    const phone = str(r, "phone", "mobile", "tel", "phoneNumber", "telephone");
    const org = str(r, "company", "organization", "org", "employer");
    const job = str(r, "jobTitle", "position", "role");
    const address = str(r, "address", "street");
    return [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${vcfText(full)}`,
      `N:${vcfText(last)};${vcfText(first || (last ? "" : full))};;;`,
      ...(email ? [`EMAIL;TYPE=INTERNET:${vcfText(email)}`] : []),
      ...(phone ? [`TEL;TYPE=CELL:${vcfText(phone)}`] : []),
      ...(org ? [`ORG:${vcfText(org)}`] : []),
      ...(job ? [`TITLE:${vcfText(job)}`] : []),
      ...(address ? [`ADR;TYPE=HOME:;;${vcfText(address)};;;;`] : []),
      "END:VCARD",
    ]
      .map(fold)
      .join("\r\n");
  });
  return cards.join("\r\n") + "\r\n";
}

/** the places of the records: their own coordinates, else points around a city of the locale */
function placesOf(c: FileContent): { name: string; at: [number, number]; props: Record<string, Cell> }[] {
  const rows = rowsOf(c, 6);
  const [lng, lat] = CENTERS[c.locale ?? "en"] ?? CENTERS.en;
  const rng = rngOf(`geo:${c.seed}`);
  return rows.slice(0, 1000).map((r, i) => {
    const own = coordinatesOf(r);
    const at: [number, number] = own ?? [Number((lng + rng.float(-0.06, 0.06)).toFixed(6)), Number((lat + rng.float(-0.04, 0.04)).toFixed(6))];
    const props = Object.fromEntries(Object.entries(flatten(r)).filter(([k]) => !/^(lat|lng|lon|long|latitude|longitude)$|\.(lat|lng|lon|latitude|longitude)$/.test(k)));
    return { name: titleOfRecord(r) ?? `${titleOf(c)} ${i + 1}`, at, props };
  });
}

/** GeoJSON (RFC 7946): a point for each record, its fields its properties */
export function geojsonOf(c: FileContent): string {
  const features = placesOf(c).map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: p.at }, properties: { name: p.name, ...p.props } }));
  return `${JSON.stringify({ type: "FeatureCollection", features }, null, 2)}\n`;
}

/** a walk of points from a place, for a track */
function trackOf(seed: string, from: [number, number], n = 40): [number, number, number][] {
  const rng = rngOf(`track:${seed}`);
  let [lng, lat] = from;
  let ele = rng.int(5, 120);
  let heading = rng.float(0, Math.PI * 2);
  return Array.from({ length: n }, () => {
    heading += rng.float(-0.5, 0.5);
    lng += Math.cos(heading) * 0.0006;
    lat += Math.sin(heading) * 0.0004;
    ele = Math.max(0, ele + rng.int(-3, 3));
    return [Number(lng.toFixed(6)), Number(lat.toFixed(6)), ele];
  });
}

/** GPX 1.1: the records as waypoints and a track from the first of them */
export function gpxOf(c: FileContent): string {
  const places = placesOf(c);
  const start = Date.UTC(2026, 0, 5, 8);
  const track = trackOf(c.seed, places[0]?.at ?? CENTERS[c.locale ?? "en"]);
  const name = xmlText(titleOf(c));
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="M3E Canvas Pro mocks" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${name}</name><time>${new Date(start).toISOString()}</time></metadata>
${places.map((p) => `  <wpt lat="${p.at[1]}" lon="${p.at[0]}"><name>${xmlText(p.name)}</name></wpt>`).join("\n")}
  <trk><name>${name}</name><trkseg>
${track.map(([lng, lat, ele], i) => `    <trkpt lat="${lat}" lon="${lng}"><ele>${ele}</ele><time>${new Date(start + i * 30_000).toISOString()}</time></trkpt>`).join("\n")}
  </trkseg></trk>
</gpx>
`;
}

/** KML 2.2: a placemark for each record */
export function kmlOf(c: FileContent): string {
  const places = placesOf(c);
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${xmlText(titleOf(c))}</name>
${places.map((p) => `    <Placemark><name>${xmlText(p.name)}</name><Point><coordinates>${p.at[0]},${p.at[1]},0</coordinates></Point></Placemark>`).join("\n")}
  </Document>
</kml>
`;
}
