/* The preview's transport when a local game loop answers it (docs/玩法契约.md “本地 game-loop”): the same client an
 * exported product calls its back end with (lib/export/files/api: fetch's transport, and the realtime channels over the
 * wire the exported server speaks, `withRealtime`), pointed at the game loop's address. Every call of the contract goes
 * there by its path (`POST /game/commands/pull`: the game loop answers the `game.*` operations and refuses with the
 * same problem types the mocks do, so a template needs no change), the contract's channels open under its realtime
 * prefix, and the time the app reads is the game's clock, as its hello said it. */

import type { ApiSpec } from "../api/types";
import type { Query, Transport } from "../api/transport";
import { createFetchTransport, type FetchTransportOptions } from "../export/files/api/fetch";
import { withRealtime, type SocketLike } from "../export/files/api/realtime";
import { realtimeChannelsOf } from "../bindings/realtimeChannels";
import { GAME_LOOP_REALTIME, socketUrlOf, type GameLoopHello } from "./link";

export type GameLoopTransportOptions = {
  /** the game loop's address, as the project keeps it (link.ts `cleanGameLoopUrl`) */
  url: string;
  /** the document's contract: which channels there are and how their messages are told apart */
  api?: ApiSpec;
  /** what the game loop said of itself, and its clock's offset from the device's, read when each is asked for: the
   *  hello may come after the transport is made, and the transport stays the same (another one starts the preview over) */
  hello?: () => { hello?: GameLoopHello; offset?: number } | undefined;
  fetch?: FetchTransportOptions["fetch"];
  /** the platform's socket, the WebSocket by default */
  open?: (url: string) => SocketLike | undefined;
};

/** where the game loop's realtime channels are: its address as a socket's, and its realtime prefix */
export const realtimeUrlOf = (url: string, hello?: GameLoopHello) => `${socketUrlOf(url)}${hello?.realtime ?? GAME_LOOP_REALTIME}`;

/** the query as fetch's transport takes it: a list's empty values left out (the editor's lists may hold them) */
function plainQuery(q: Query | undefined): Record<string, string | number | boolean | (string | number | boolean)[] | null | undefined> | undefined {
  if (!q) return undefined;
  const out: Record<string, string | number | boolean | (string | number | boolean)[] | null | undefined> = {};
  for (const [k, v] of Object.entries(q)) out[k] = Array.isArray(v) ? v.filter((x): x is string | number | boolean => x !== null && x !== undefined) : (v as string | number | boolean | null | undefined);
  return out;
}

export function createGameLoopTransport(o: GameLoopTransportOptions): Transport {
  const http = createFetchTransport({ baseUrl: o.url, ...(o.fetch ? { fetch: o.fetch } : {}) });
  const channels = realtimeChannelsOf(o.api);
  const inner: Transport = {
    request: (r) => http.request({ ...r, query: plainQuery(r.query) }),
    /* the game's clock: the device's, moved by what the hello said the game's was */
    now: () => Date.now() + (o.hello?.()?.offset ?? 0),
  };
  return {
    ...inner,
    connect(address, onMessage, opts) {
      /* the realtime prefix is the hello's, which may have come since the transport was made */
      const rt = withRealtime(inner, { url: realtimeUrlOf(o.url, o.hello?.()?.hello), channels, ...(o.open ? { open: o.open } : {}) });
      return rt.connect!(address, onMessage, opts);
    },
  };
}
