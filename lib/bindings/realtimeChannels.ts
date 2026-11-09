/* The contract's realtime channels (AsyncAPI, docs/接口.md) as the realtime client (lib/export/files/api/realtime.ts,
 * an exported product's packages/api/src/realtime.ts) tells their messages apart: the messages the server sends over
 * each, with the fields each payload must have and those fixed to one value. The export prints them into
 * packages/api (lib/export/targets/api.ts `channelsSource`); the preview hands the same list to the client when a
 * local game loop answers its channels (lib/gameLoop). */

import type { ApiSpec, JsonSchema } from "../api/types";
import type { RealtimeChannel } from "../export/files/api/realtime";
import { resolved } from "./contract";

export function realtimeChannelsOf(api: ApiSpec | undefined): RealtimeChannel[] {
  return (api?.channels ?? []).map((c) => {
    const sent = new Set(c.operations.filter((o) => o.action === "send").flatMap((o) => o.messages ?? c.messages.map((m) => m.name)));
    const messages = c.messages
      .filter((m) => sent.has(m.name))
      .map((m) => {
        const schema = api ? resolved(api, m.payload) : undefined;
        const required = Array.isArray(schema?.required) ? schema.required.filter((k): k is string => typeof k === "string") : [];
        const fixed: Record<string, unknown> = {};
        for (const [k, p] of Object.entries(schema?.properties ?? {})) {
          const one = api ? resolved(api, p as JsonSchema) : undefined;
          if (one && "const" in one) fixed[k] = one.const;
          else if (Array.isArray(one?.enum) && one.enum.length === 1) fixed[k] = one.enum[0];
        }
        return { name: m.name, ...(required.length ? { required } : {}), ...(Object.keys(fixed).length ? { fixed } : {}) };
      });
    return { id: c.id, address: c.address, ...(c.transport === "sse" ? { transport: "sse" as const } : {}), messages };
  });
}
