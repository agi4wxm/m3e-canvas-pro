/* How the bindings write values for people: dates (absolute and relative), numbers, money, percentages and file sizes,
 * each in the language the app is shown in, through the platform's Intl. A value that is not what the helper takes
 * comes out as its plain words, never as an error. */

export type FormatContext = {
  /** the app's language: zh, en, ja or ko */
  lang: string;
  /** the time "now" is, in ms: what relative dates are measured from (a test pins it) */
  now?: number;
  /** the currency `currency()` writes when it is given none; by the language otherwise */
  currency?: string;
};

const LOCALE: Record<string, string> = { zh: "zh-CN", en: "en-US", ja: "ja-JP", ko: "ko-KR" };
const CURRENCY: Record<string, string> = { zh: "CNY", en: "USD", ja: "JPY", ko: "KRW" };

const locale = (ctx: FormatContext) => LOCALE[ctx.lang] ?? "en-US";

/** a date from what data carries: an ISO string, a date alone, ms since 1970, seconds since 1970 */
export function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v < 1e11 ? v * 1000 : v);
  if (typeof v !== "string" || !v.trim() || v.length > 64) return null;
  /* a date alone is that day where the app is, not midnight in London */
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  const d = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

const STYLES: Record<string, Intl.DateTimeFormatOptions> = {
  date: { year: "numeric", month: "short", day: "numeric" },
  short: { year: "numeric", month: "2-digit", day: "2-digit" },
  long: { year: "numeric", month: "long", day: "numeric", weekday: "long" },
  time: { hour: "numeric", minute: "2-digit" },
  datetime: { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  weekday: { weekday: "long" },
  month: { year: "numeric", month: "long" },
};

/** A date in words: one of the styles above, or "relative" (3 minutes ago, in 2 days). Not a date: its words. */
export function formatDate(v: unknown, style: string, ctx: FormatContext): string {
  const d = toDate(v);
  if (!d) return v === null || v === undefined ? "" : String(v).slice(0, 200);
  try {
    if (style === "relative") return relative(d, ctx);
    return new Intl.DateTimeFormat(locale(ctx), STYLES[style] ?? STYLES.date).format(d);
  } catch {
    return d.toISOString();
  }
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

function relative(d: Date, ctx: FormatContext): string {
  const now = ctx.now ?? Date.now();
  const secs = Math.round((d.getTime() - now) / 1000);
  const fmt = new Intl.RelativeTimeFormat(locale(ctx), { numeric: "auto" });
  if (Math.abs(secs) < 45) return fmt.format(0, "second");
  for (const [unit, size] of UNITS) if (Math.abs(secs) >= size || unit === "second") return fmt.format(Math.round(secs / size), unit);
  return fmt.format(secs, "second");
}

export type NumberStyle = { style: "decimal" | "currency" | "percent" | "bytes"; currency?: string; digits?: number };

/** A number in words: grouped, as money, as a percentage of a fraction, or as a file size. Not a number: its words. */
export function formatNumber(v: unknown, o: NumberStyle, ctx: FormatContext): string {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return v === null || v === undefined ? "" : String(v).slice(0, 200);
  const digits = o.digits === undefined ? undefined : Math.max(0, Math.min(10, Math.floor(o.digits)));
  try {
    if (o.style === "bytes") return bytes(n, ctx);
    if (o.style === "currency") {
      const code = (o.currency ?? ctx.currency ?? CURRENCY[ctx.lang] ?? "USD").toUpperCase();
      return new Intl.NumberFormat(locale(ctx), { style: "currency", currency: /^[A-Z]{3}$/.test(code) ? code : "USD", ...(digits !== undefined ? { minimumFractionDigits: digits, maximumFractionDigits: digits } : {}) }).format(n);
    }
    if (o.style === "percent") return new Intl.NumberFormat(locale(ctx), { style: "percent", maximumFractionDigits: digits ?? 0, minimumFractionDigits: digits ?? 0 }).format(n);
    return new Intl.NumberFormat(locale(ctx), digits !== undefined ? { minimumFractionDigits: digits, maximumFractionDigits: digits } : { maximumFractionDigits: 3 }).format(n);
  } catch {
    return String(n);
  }
}

const SIZES = ["B", "KB", "MB", "GB", "TB"];

function bytes(n: number, ctx: FormatContext): string {
  let v = Math.abs(n);
  let i = 0;
  while (v >= 1024 && i < SIZES.length - 1) {
    v /= 1024;
    i++;
  }
  const num = new Intl.NumberFormat(locale(ctx), { maximumFractionDigits: i === 0 ? 0 : 1 }).format(v);
  return `${n < 0 ? "-" : ""}${num} ${SIZES[i]}`;
}
