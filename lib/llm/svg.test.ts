import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AiHttpError } from "../ai";
import { sanitizeSvg } from "../../parts/svg";
import { checkSvg, cleanToMarkup, extractSvg, generateSvgCode, generateSvgImage, generateSvgImageStreamed, svgSystemPrompt } from "./svg";
import { fakeFetch, jagged, jsonResponse, scriptedAdapter, sseResponse, sseText } from "./testkit";
import type { UserMessage } from "./types";

/* recorded from the live Images API: one SVG drawn by gpt-image-2.6-sunburst and traced by gpt-6.1-sol */
const RECORDED = JSON.parse(readFileSync(new URL("./fixtures/images-svg.json", import.meta.url), "utf8"));
/* recorded from the live Responses API: the image_generation tool drawing SVG, streamed; 31 s passed between "generating" and "completed" */
const STREAMED = readFileSync(new URL("./fixtures/responses-image-svg.sse", import.meta.url), "utf8");

const GOOD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="shade"><stop offset="0" stop-color="#fff"/></linearGradient></defs><path d="M2 2h20v20H2z" fill="url(#shade)" style="stroke: currentColor; stroke-width: 2; position: fixed"/><use href="#dot"/><circle id="dot" cx="12" cy="12" r="3" fill-opacity=".5"/></svg>';

describe("cleanToMarkup", () => {
  it("writes out what the sanitizer kept, with short names and references that still point home", () => {
    const markup = cleanToMarkup(sanitizeSvg(GOOD, "item-1")!);
    expect(markup).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="p0"><stop offset="0" stop-color="#fff"/></linearGradient></defs><path d="M2 2h20v20H2z" fill="url(#p0)" style="stroke:currentColor;stroke-width:2"/><use href="#p1"/><circle id="p1" cx="12" cy="12" r="3" fill-opacity=".5"/></svg>',
    );
    /* read again, it is written out the same: the round trip loses nothing the sanitizer keeps */
    expect(cleanToMarkup(sanitizeSvg(markup, "x")!)).toBe(markup);
    expect(JSON.stringify(sanitizeSvg(markup, "x")).replace(/-p0(?=[")])/g, "-shade").replace(/-p1(?=[")])/g, "-dot")).toBe(JSON.stringify(sanitizeSvg(GOOD, "x")));
  });

  it("keeps nothing that runs or reaches out, and escapes what it writes", () => {
    const evil = '<svg viewBox="0 0 10 10" fill="red" onload="alert(1)"><script>alert(1)</script><image href="https://x.test/a.png"/><rect width="5" height="5" fill="url(https://evil.test/#x)" data-x="1"/><path d="M0 0L5 5" stroke="a&quot;b"/><foreignObject><div/></foreignObject><text>hi</text></svg>';
    const markup = cleanToMarkup(sanitizeSvg(evil)!);
    expect(markup).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" fill="red"><rect width="5" height="5"/><path d="M0 0L5 5" stroke="a&quot;b"/></svg>');
    expect(markup).not.toMatch(/script|onload|https|image|text|foreign/);
  });
});

describe("checkSvg", () => {
  it("finds the drawing in prose and a code fence", () => {
    expect(extractSvg('Here:\n```svg\n<svg viewBox="0 0 1 1"><rect/></svg>\n```')).toBe('<svg viewBox="0 0 1 1"><rect/></svg>');
    expect(extractSvg("no drawing")).toBeNull();
    expect(checkSvg(GOOD).problems).toEqual([]);
  });

  it("names every rule a drawing breaks", () => {
    const bad = '<svg xmlns="http://www.w3.org/2000/svg"><style>.a{fill:red}</style><text x="1">Hi</text><image href="data:image/png;base64,AA"/><rect class="a" width="4" height="4"/></svg>';
    const r = checkSvg(bad);
    expect(r.problems.join(" ")).toMatch(/<style>, <text>, <image>/);
    expect(r.problems.join(" ")).toMatch(/no viewBox/);
    expect(r.problems.join(" ")).toMatch(/outside the drawing/);
    expect(r.problems.join(" ")).toMatch(/class attributes/);
    expect(r.markup).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="4" height="4"/></svg>');
    /* leniently, the same things are only warnings */
    expect(checkSvg(bad, false).problems).toEqual([]);
    expect(checkSvg(bad, false).warnings.length).toBe(3);
    expect(checkSvg("<svg><text>only words</text></svg>").markup).toBeNull();
  });

  it("warns when a drawing is longer than the editor keeps", () => {
    const huge = `<svg viewBox="0 0 10 10">${'<rect width="1" height="1"/>'.repeat(9000)}</svg>`;
    const r = checkSvg(huge, false);
    expect(r.warnings.join(" ")).toMatch(/keeps the first 200000/);
    expect(r.warnings.join(" ")).toMatch(/keeps the first 4000/);
  });
});

describe("generateSvgImage", () => {
  it("asks the Images API for SVG and cleans what comes back (recorded answer)", async () => {
    const f = fakeFetch(jsonResponse(RECORDED));
    const r = await generateSvgImage({ prompt: "a paper airplane badge", key: "k", authorEffort: "low", complexity: "low", size: "1024x1024", fetch: f });
    expect(f.calls[0].url).toBe("https://api.openai.com/v1/images/generations");
    expect(f.calls[0].body).toEqual({ model: "gpt-image-2.6-sunburst", prompt: "a paper airplane badge", n: 1, output_format: "svg", size: "1024x1024", complexity: "low", svg: { model: "gpt-6.1-sol", reasoning: { effort: "low" } } });
    expect(r.raw).toMatch(/^<svg viewBox="0 0 1024 1024"/);
    expect(r.raw).toContain("<title>Paper airplane badge</title>");
    expect(r.markup.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">')).toBe(true);
    expect(r.markup).not.toContain("title");
    expect(r.markup).toContain('<g id="p0">');
    expect(r.markup.match(/<path /g)).toHaveLength(3);
    expect(r.svgUsage).toEqual({ input: 1572, output: 286, reasoning: 23, model: "gpt-6.1-sol" });
    expect(r.imageTokens).toBe(2578);
    expect(r.warnings).toEqual([]);
  });

  it("leaves the author model to the API when asked, and maps errors to statuses", async () => {
    const f = fakeFetch(jsonResponse(RECORDED));
    await generateSvgImage({ prompt: "p", key: "", authorModel: null, model: "gpt-image-2.6-flare", baseUrl: "https://proxy.test/v1/", fetch: f });
    expect(f.calls[0].url).toBe("https://proxy.test/v1/images/generations");
    expect(f.calls[0].body).not.toHaveProperty("svg");
    expect(f.calls[0].init.headers).not.toHaveProperty("authorization");
    const g = fakeFetch(jsonResponse({ error: { message: "Your organization must be verified" } }, 403));
    await expect(generateSvgImage({ prompt: "p", key: "k", fetch: g })).rejects.toMatchObject({ status: 403 });
    await expect(generateSvgImage({ prompt: "p", key: "k", fetch: g })).rejects.toBeInstanceOf(AiHttpError);
    await expect(generateSvgImage({ prompt: "p", key: "k", fetch: fakeFetch(jsonResponse({ data: [{}] })) })).rejects.toThrow("empty");
    const words = btoa("<svg><text>no drawing</text></svg>");
    await expect(generateSvgImage({ prompt: "p", key: "k", fetch: fakeFetch(jsonResponse({ data: [{ b64_json: words }] })) })).rejects.toThrow("svg");
  });
});

describe("generateSvgImageStreamed", () => {
  it("asks the Responses API's drawing tool for SVG and reports progress (recorded answer)", async () => {
    const f = fakeFetch(sseResponse(STREAMED, { sizes: jagged(4, 300) }));
    const stages: string[] = [];
    const r = await generateSvgImageStreamed({ prompt: "a lighthouse", key: "k", authorEffort: "low", complexity: "low", size: "1024x1024", fetch: f, onProgress: (s) => stages.push(s) });
    expect(f.calls[0].url).toBe("https://api.openai.com/v1/responses");
    expect(f.calls[0].body).toMatchObject({
      model: "gpt-6.1-sol",
      input: [{ role: "user", content: [{ type: "input_text", text: "a lighthouse" }] }],
      tools: [{ type: "image_generation", model: "gpt-image-2.6-sunburst", output_format: "svg", size: "1024x1024", complexity: "low", svg: { model: "gpt-6.1-sol", reasoning: { effort: "low" } } }],
      tool_choice: { type: "image_generation" },
      store: false,
      stream: true,
    });
    expect(stages).toEqual(["in_progress", "generating", "completed"]);
    expect(r.raw.length).toBe(1542);
    expect(r.markup.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">')).toBe(true);
    expect(checkSvg(r.markup).problems).toEqual([]);
    expect(r.svgUsage).toEqual({ input: 1635, output: 690, reasoning: 0, model: "gpt-6.1-sol" });
    expect(r.usage).toMatchObject({ input: 1748, output: 110 });
  });

  it("passes on a drawing that failed, and a stream error", async () => {
    const failed = sseText([{ type: "response.output_item.done", item: { type: "image_generation_call", status: "failed", error: { code: "moderation_blocked", message: "blocked" } } }, { type: "response.completed", response: { usage: {} } }]);
    await expect(generateSvgImageStreamed({ prompt: "p", key: "k", fetch: fakeFetch(sseResponse(failed)) })).rejects.toMatchObject({ status: 400, message: expect.stringContaining("blocked") });
    const err = sseText([["error", { type: "error", code: "rate_limit_exceeded", message: "slow" }]]);
    await expect(generateSvgImageStreamed({ prompt: "p", key: "k", fetch: fakeFetch(sseResponse(err)) })).rejects.toMatchObject({ status: 429 });
    const nothing = sseText([{ type: "response.completed", response: { output: [], usage: {} } }]);
    await expect(generateSvgImageStreamed({ prompt: "p", key: "k", fetch: fakeFetch(sseResponse(nothing)) })).rejects.toThrow("empty");
  });
});

describe("generateSvgCode", () => {
  it("asks under strict rules and takes a good first answer", async () => {
    const adapter = scriptedAdapter([{ text: "```svg\n" + GOOD + "\n```" }]);
    const r = await generateSvgCode({ adapter, prompt: "a framed dot", viewBox: "0 0 24 24" });
    expect(r.attempts).toBe(1);
    expect(r.markup).toContain('fill="url(#p0)"');
    expect(adapter.requests[0].toolChoice).toBe("none");
    expect(adapter.requests[0].system).toBe(svgSystemPrompt({ viewBox: "0 0 24 24" }));
    expect(adapter.requests[0].system).toMatch(/currentColor/);
    expect(adapter.requests[0].system).toMatch(/No letters, numbers or words/);
  });

  it("sends a broken answer back once with the reasons", async () => {
    const adapter = scriptedAdapter([{ text: '<svg><text>A</text><rect width="2" height="2"/></svg>', usage: { input: 10, output: 50 } }, { text: GOOD, usage: { input: 30, output: 40 } }]);
    const r = await generateSvgCode({ adapter, prompt: "a framed dot", reference: "data:image/png;base64,AAAA" });
    expect(r.attempts).toBe(2);
    expect(r.usage.output).toBe(90);
    expect(r.warnings).toEqual([]);
    const retry = adapter.requests[1].messages;
    expect(retry.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect((retry[0] as UserMessage).content).toEqual([{ type: "text", text: "a framed dot" }, { type: "image", dataUrl: "data:image/png;base64,AAAA" }]);
    expect((retry[2] as UserMessage).content).toMatch(/<text>[\s\S]*no viewBox[\s\S]*corrected SVG only/);
  });

  it("uses a second answer that still breaks a rule when something drawable is left, and gives up when nothing is", async () => {
    const twice = scriptedAdapter([{ text: '<svg><rect width="2" height="2"/><text>A</text></svg>' }, { text: '<svg viewBox="0 0 4 4"><rect width="2" height="2"/><text>A</text></svg>' }]);
    const r = await generateSvgCode({ adapter: twice, prompt: "p", colors: ["#123456"], lettering: true });
    expect(r.attempts).toBe(2);
    expect(r.markup).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="2" height="2"/></svg>');
    expect(r.warnings.join(" ")).toMatch(/<text>/);
    expect(twice.requests[0].system).toMatch(/Use only these colours: #123456/);
    expect(twice.requests[0].system).toMatch(/outlined paths/);
    await expect(generateSvgCode({ adapter: scriptedAdapter([{ text: "Sorry." }, { text: "Still no." }]), prompt: "p" })).rejects.toThrow("svg");
    await expect(generateSvgCode({ adapter: scriptedAdapter([{ text: "no", stop: "refusal" }]), prompt: "p" })).rejects.toThrow("refusal");
  });

  it("asks again when the drawing was cut off at the output limit", async () => {
    const adapter = scriptedAdapter([{ text: '<svg viewBox="0 0 4 4"><rect width="2" height="2"/><path d="M0 0', stop: "max_tokens" }, { text: GOOD }]);
    const r = await generateSvgCode({ adapter, prompt: "p" });
    expect(r.attempts).toBe(2);
    expect((adapter.requests[1].messages[2] as UserMessage).content).toMatch(/cut off/);
  });
});
