/* Drawing with a model from the MCP server: only when OPENAI_API_KEY is in the server's own environment. The key is
 * read here and nowhere else; it never travels in an MCP message or over the live bridge, and it is never logged.
 * In file mode the generative tools run here; in live mode they run in the tab and ask this process for the drawing.
 *
 * Node's own fetch does not go through HTTPS_PROXY, so when one is set the requests go through undici with a proxy
 * agent that reads HTTPS_PROXY and NO_PROXY (Bun's fetch reads them itself). */

import { EnvHttpProxyAgent, fetch as undiciFetch } from "undici";
import { imageSpec, providerSpec, type AiSettings } from "../../lib/ai";
import { schemaError } from "../../lib/core";
import { openAiResponses } from "../../lib/llm/openai";
import type { DrawRequest, DrawResult } from "../../lib/mcp/protocol";
import { drawSvg, generateSvg, paintPicture } from "../../lib/tools/generate";
import { ToolFailure, type GenerateEnv } from "../../lib/tools/types";

type Env = Record<string, string | undefined>;

const proxyOf = (env: Env) => env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy;

/** A fetch that goes through the proxy the environment names, or undefined when the built-in one will do (no proxy,
 *  Bun, or Node told to use the environment's proxy itself). */
export function proxyFetch(env: Env = process.env): typeof fetch | undefined {
  if (!proxyOf(env) || "Bun" in globalThis || env.NODE_USE_ENV_PROXY === "1") return undefined;
  const dispatcher = new EnvHttpProxyAgent();
  return ((input: Parameters<typeof fetch>[0], init?: RequestInit) => undiciFetch(input as never, { ...(init as object), dispatcher } as never)) as unknown as typeof fetch;
}

/** what the server draws with, from its environment; undefined without OPENAI_API_KEY */
export function generationFromEnv(env: Env = process.env, f: typeof fetch | undefined = proxyFetch(env)): GenerateEnv | undefined {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) return undefined;
  const baseUrl = env.OPENAI_BASE_URL?.trim() || providerSpec("openai").baseUrl;
  const model = env.M3E_MCP_TEXT_MODEL?.trim() || providerSpec("openai").model;
  const imageModel = env.M3E_MCP_IMAGE_MODEL?.trim() || imageSpec("openai").model;
  const settings: AiSettings = { provider: "openai", baseUrl, model, key, imageProvider: "openai", imageBaseUrl: baseUrl, imageModel, imageKey: key };
  return { settings, adapter: openAiResponses({ baseUrl, model, key, effort: "low", summary: null, fetch: f }), fetch: f };
}

/** Draws what a tab asked for, with this server's key. The arguments are checked as the tool itself checks them. */
export function drawerFor(gen: GenerateEnv) {
  return async (req: DrawRequest, signal: AbortSignal): Promise<DrawResult> => {
    if (req.what === "svg") {
      const bad = schemaError(generateSvg.input, req.args, "args");
      if (bad) throw new ToolFailure("bad_args", `generate_svg: ${bad}`);
      return drawSvg(req.args as never, gen, signal);
    }
    const a = req.args as { prompt?: unknown; box?: { w?: unknown; h?: unknown } };
    const ok = typeof a?.prompt === "string" && a.prompt.length <= 4000 && typeof a.box?.w === "number" && typeof a.box?.h === "number";
    if (!ok) throw new ToolFailure("bad_args", "An image is asked with {prompt, box: {w, h}}.");
    const box = { w: Math.min(1600, Math.max(24, a.box!.w as number)), h: Math.min(1600, Math.max(24, a.box!.h as number)) };
    return { picture: await paintPicture(gen, a.prompt as string, box, signal) };
  };
}
