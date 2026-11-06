/* A live check of the provider layer against the real OpenAI API; not part of the test suite.
 *
 *   bun scripts/llm-smoke.ts [--only loop,image,svg,svgstream,code] [--record <dir>]
 *   (SMOKE_EFFORT=low|medium|high sets the reasoning effort; low by default, to keep it cheap)
 *
 * It runs, through the streaming Responses adapter: a loop with two tools (a fake lookup and a
 * calculator, the lookups asked for in parallel); the same conversation resumed with a picture from
 * the author and one returned by a tool; then an SVG from the Images API, the same through the
 * Responses API's image_generation tool (streamed), and one written by the text model. Events and usage are printed as they come. The key is read from OPENAI_API_KEY; where a
 * proxy adds the key on its way out, the placeholder is replaced there. The key is never printed.
 * Bun's fetch goes through HTTPS_PROXY; Node's does not without NODE_USE_ENV_PROXY=1. */

import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { generateSvgCode, generateSvgImage, generateSvgImageStreamed, openAiResponses, runAgent, type AgentEvent, type Message, type ToolDef, type Usage } from "../lib/llm";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = new Set((flag("--only") ?? "loop,image,svg,svgstream,code").split(","));
const recordDir = flag("--record");
const BASE = "https://api.openai.com/v1";
const KEY = process.env.OPENAI_API_KEY || "proxy-injected";
const MODEL = process.env.SMOKE_MODEL || "gpt-6.1-sol";
const IMAGE_MODEL = process.env.SMOKE_IMAGE_MODEL || "gpt-image-2.6-sunburst";

/* ---------- counting (and, if asked, recording) every call ---------- */

const calls: { url: string; status: number; ms: number }[] = [];
let recorded = 0;
const counted: typeof fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  const t0 = Date.now();
  const res = await fetch(input, init);
  calls.push({ url: url.replace(BASE, ""), status: res.status, ms: Date.now() - t0 });
  if (!recordDir || !res.body) return res;
  const [a, b] = res.body.tee();
  const name = `${String(++recorded).padStart(2, "0")}-${url.split("/").pop()}.${res.headers.get("content-type")?.includes("event-stream") ? "sse" : "json"}`;
  void new Response(b).text().then((t) => writeFileSync(`${recordDir}/${name}`, t));
  return new Response(a, { status: res.status, statusText: res.statusText, headers: res.headers });
};
if (recordDir) mkdirSync(recordDir, { recursive: true });

/* ---------- small pictures, made here so the script needs no files ---------- */

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function png(w: number, h: number, px: (x: number, y: number) => [number, number, number]): string {
  const raw = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(x, y);
      raw.set([r, g, b], y * (w * 3 + 1) + 1 + x * 3);
    }
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, w);
  new DataView(ihdr.buffer).setUint32(4, h);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", new Uint8Array(deflateSync(raw))), chunk("IEND", new Uint8Array())];
  return `data:image/png;base64,${Buffer.concat(parts).toString("base64")}`;
}
const halves = png(96, 48, (x) => (x < 48 ? [220, 30, 30] : [30, 60, 220]));
const circle = png(64, 64, (x, y) => ((x - 32) ** 2 + (y - 32) ** 2 < 22 ** 2 ? [20, 170, 60] : [255, 255, 255]));

/* ---------- the tools ---------- */

const POPULATION: Record<string, number> = { lumen: 48210, ostra: 13377 };

/** + - * / and parentheses over numbers; nothing else is read */
function calculate(expr: string): number {
  const s = expr.replace(/\s+/g, "");
  let i = 0;
  const num = (): number => {
    if (s[i] === "(") {
      i++;
      const v = sum();
      if (s[i++] !== ")") throw new Error("missing )");
      return v;
    }
    if (s[i] === "-") {
      i++;
      return -num();
    }
    const m = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (!m) throw new Error(`unexpected "${s[i] ?? "end"}" at ${i}`);
    i += m[0].length;
    return Number(m[0]);
  };
  const product = (): number => {
    let v = num();
    while (s[i] === "*" || s[i] === "/") v = s[i++] === "*" ? v * num() : v / num();
    return v;
  };
  const sum = (): number => {
    let v = product();
    while (s[i] === "+" || s[i] === "-") v = s[i++] === "+" ? v + product() : v - product();
    return v;
  };
  const v = sum();
  if (i !== s.length) throw new Error(`unexpected "${s[i]}" at ${i}`);
  return v;
}

const tools: ToolDef[] = [
  { name: "lookup", description: "The population of a city in this test world.", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"], additionalProperties: false } },
  { name: "calc", description: "Evaluate an arithmetic expression with + - * / and parentheses.", parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"], additionalProperties: false } },
  { name: "screenshot", description: "A screenshot of the current canvas, as an image.", parameters: { type: "object", properties: {}, additionalProperties: false } },
];

/* ---------- printing ---------- */

const out = (s: string) => process.stdout.write(s);
let inText = false;
let inThink = false;
function print(e: AgentEvent) {
  const line = (s: string) => {
    if (inText || inThink) out("\n");
    inText = inThink = false;
    console.log(s);
  };
  if (e.type === "text") {
    if (!inText) out(inThink ? "\n  [text] " : "  [text] ");
    inThink = false;
    inText = true;
    out(e.delta);
  } else if (e.type === "reasoning") {
    if (!inThink) out(inText ? "\n  [think] " : "  [think] ");
    inText = false;
    inThink = true;
    out(e.delta);
  } else if (e.type === "step") line(`-- step ${e.step}`);
  else if (e.type === "tool_call_start") line(`  [call start] ${e.name} ${e.id}`);
  else if (e.type === "tool_call") line(`  [call] ${e.call.name}(${e.call.argsText})`);
  else if (e.type === "tool_end") line(`  [result ${e.ms}ms] ${e.call.name} -> ${e.result.isError ? "ERROR " : ""}${e.result.content.map((p) => (p.type === "text" ? p.text : `<image ${p.dataUrl.length}b>`)).join(" ")}`);
  else if (e.type === "usage") line(`  [usage] ${fmt(e.usage)}`);
  else if (e.type === "retry") line(`  [retry ${e.attempt}] in ${e.delayMs}ms: ${String((e.error as Error)?.message ?? e.error)}`);
  else if (e.type === "done") line(`  [done] stop=${e.stop} parts=${e.message.content.map((p) => p.type).join(",")}`);
  else if (e.type === "error") line(`  [error] ${String((e.error as Error)?.message ?? e.error)}`);
}
const fmt = (u: Usage) => `in=${u.input} (cached ${u.cachedInput}, written ${u.cacheWrite}) out=${u.output} (reasoning ${u.reasoning})`;

/* ---------- the runs ---------- */

const EFFORT = (process.env.SMOKE_EFFORT || "low") as "low" | "medium" | "high";
const adapter = openAiResponses({ baseUrl: BASE, model: MODEL, key: KEY, effort: EFFORT, summary: "auto", maxOutputTokens: 8000, fetch: counted });
const system = "You are a careful assistant in a test harness. Use the tools for every fact and every calculation; never compute in your head. Ask for independent lookups in parallel. Answer in one or two short sentences.";
const total: Usage = { input: 0, output: 0, reasoning: 0, cachedInput: 0, cacheWrite: 0 };
const addTotal = (u: Usage) => {
  for (const k of Object.keys(total) as (keyof Usage)[]) total[k] += u[k];
};
let transcript: Message[] = [];

async function execute(call: { name: string; args: Record<string, unknown> | null }) {
  if (call.name === "lookup") {
    const v = POPULATION[String(call.args?.city ?? "").toLowerCase()];
    if (v === undefined) throw new Error(`no city called ${String(call.args?.city)}`);
    return String(v);
  }
  if (call.name === "calc") return String(calculate(String(call.args?.expression ?? "")));
  if (call.name === "screenshot") return { content: [{ type: "text" as const, text: "Canvas screenshot, 64x64:" }, { type: "image" as const, dataUrl: circle }] };
  throw new Error(`no tool ${call.name}`);
}

const LIGHTHOUSE = "A flat icon of a lighthouse on a small rock with two light beams. Two colours, simple geometric shapes, centred, no text.";

if (only.has("loop")) {
  console.log("\n== 1. two tools, streamed through the Responses API");
  const t0 = Date.now();
  const r = await runAgent({ adapter, system, tools, execute, onEvent: print, maxSteps: 6, messages: [{ role: "user", content: "Look up the populations of Lumen and Ostra, then compute Lumen * 3 + Ostra with the calculator." }] });
  addTotal(r.usage);
  transcript = r.messages;
  console.log(`== stop=${r.stop} steps=${r.steps} ${Date.now() - t0}ms usage: ${fmt(r.usage)}\n== answer: ${r.text.trim()}\n== expected: ${48210 * 3 + 13377}`);
  if (r.error) console.log("== error:", (r.error as Error)?.message ?? r.error);
}

if (only.has("image")) {
  console.log("\n== 2. the same conversation resumed, with a picture from the author and one from a tool");
  const t0 = Date.now();
  const r = await runAgent({
    adapter,
    system,
    tools,
    execute,
    onEvent: print,
    maxSteps: 4,
    messages: [...transcript, { role: "user", content: [{ type: "text", text: "Here is a picture. What colour is its left half and its right half? Then take a screenshot with the tool and tell me what shape and colour it shows. Also repeat the number you computed before, if there was one." }, { type: "image", dataUrl: halves }] }],
  });
  addTotal(r.usage);
  console.log(`== stop=${r.stop} steps=${r.steps} ${Date.now() - t0}ms usage: ${fmt(r.usage)}\n== answer: ${r.text.trim()}`);
  if (r.error) console.log("== error:", (r.error as Error)?.message ?? r.error);
}

if (only.has("svg")) {
  console.log(`\n== 3. SVG from the Images API (${IMAGE_MODEL}, author ${MODEL})`);
  try {
    const r = await generateSvgImage({ prompt: LIGHTHOUSE, key: KEY, baseUrl: BASE, model: IMAGE_MODEL, authorModel: MODEL, authorEffort: "low", complexity: "low", size: "1024x1024", fetch: counted });
    console.log(`== ${r.ms}ms raw ${r.raw.length} chars -> clean ${r.markup.length} chars; svg_usage ${JSON.stringify(r.svgUsage)}; image tokens ${r.imageTokens}`);
    console.log(`== warnings: ${r.warnings.join(" | ") || "none"}`);
    console.log(r.markup.slice(0, 600) + (r.markup.length > 600 ? "…" : ""));
  } catch (e) {
    console.log("== error:", (e as Error)?.message ?? e);
  }
}

if (only.has("svgstream")) {
  console.log(`\n== 3b. the same SVG through the Responses image_generation tool, streamed (${IMAGE_MODEL}, author ${MODEL})`);
  const t0 = Date.now();
  try {
    const r = await generateSvgImageStreamed({ prompt: LIGHTHOUSE, key: KEY, baseUrl: BASE, model: IMAGE_MODEL, textModel: MODEL, authorEffort: "low", complexity: "low", size: "1024x1024", fetch: counted, onProgress: (s) => console.log(`  [progress +${Date.now() - t0}ms] ${s}`) });
    addTotal(r.usage);
    console.log(`== ${r.ms}ms raw ${r.raw.length} chars -> clean ${r.markup.length} chars; svg_usage ${JSON.stringify(r.svgUsage)}; outer usage ${fmt(r.usage)}`);
    console.log(`== warnings: ${r.warnings.join(" | ") || "none"}`);
    console.log(r.markup.slice(0, 600) + (r.markup.length > 600 ? "…" : ""));
  } catch (e) {
    console.log(`== error after ${Date.now() - t0}ms:`, (e as Error)?.message ?? e);
  }
}

if (only.has("code")) {
  console.log(`\n== 4. SVG written by the text model (${MODEL})`);
  try {
    const r = await generateSvgCode({ adapter, prompt: "A settings gear icon with eight teeth and a round hole in the middle.", viewBox: "0 0 24 24", onEvent: (e) => print({ ...e, step: 1 }) });
    addTotal(r.usage);
    console.log(`== ${r.ms}ms attempts=${r.attempts} usage: ${fmt(r.usage)}; raw ${r.raw.length} -> clean ${r.markup.length} chars`);
    console.log(`== warnings: ${r.warnings.join(" | ") || "none"}`);
    console.log(r.markup);
  } catch (e) {
    console.log("== error:", (e as Error)?.message ?? e);
  }
}

console.log("\n== calls");
for (const c of calls) console.log(`  ${c.status} ${c.url} ${c.ms}ms (headers)`);
console.log(`== text calls: ${calls.filter((c) => c.url.endsWith("/responses")).length}, image calls: ${calls.filter((c) => c.url.includes("/images/")).length}`);
console.log(`== text usage total: ${fmt(total)}`);
