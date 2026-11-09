/* The preview answered by a local game loop (lib/gameLoop, docs/玩法契约.md “本地 game-loop”): the preview bar's choice
 * between the mock library and a game loop at an address, kept in the project's configuration (`external.gameLoop`,
 * through `onChange`), the transport the preview's calls and channels go through while the game loop answers, how it is
 * (asked once it is chosen, again on “try again”, and every few seconds while nothing answers), and the worlds it plays.
 * The mock library stays as it was, one click away. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Doc } from "@/lib/tokens";
import type { Transport } from "@/lib/api/transport";
import type { World } from "@/lib/world/types";
import { checkGameLoop, createGameLoopTransport, createGameLoopWorld, gameLoopOf, type ExpectedContract, type GameLoopHello, type GameLoopLink, type GameLoopStatus, type HelloFetch } from "@/lib/gameLoop";

export type PreviewGameLoop = {
  /** the address the project keeps, and whether the preview answers from it */
  link: GameLoopLink | undefined;
  /** the game loop answers the preview now (its transport is the preview's) */
  on: boolean;
  /** how it is, while it is on */
  status: GameLoopStatus;
  /** what the preview calls through while it is on */
  transport: Transport | null;
  /** counts the times it came to answer after it did not: the preview starts over each time, and loads again */
  session: number;
  /** the game loop at `url` answers from now on */
  connect: (url: string) => void;
  /** the mock library answers again; the address stays, for next time */
  toMocks: () => void;
  /** asks it again now */
  recheck: () => void;
  /** a world view's world, played by the game loop */
  world: (part: string) => World;
};

/** how long to wait before asking again a game loop that did not answer */
const AGAIN_MS = 4000;

const expectedOf = (doc: Pick<Doc, "game">): ExpectedContract => {
  const c = doc.game?.contract;
  return c ? { namespace: c.namespace, contractVersion: c.contractVersion } : undefined;
};

export function usePreviewGameLoop(doc: Pick<Doc, "api" | "game" | "external">, onChange?: (link: GameLoopLink | undefined) => void): PreviewGameLoop {
  /* the preview's own choice from the moment it opens, kept by the project as it changes */
  const [link, setLink] = useState<GameLoopLink | undefined>(() => gameLoopOf(doc));
  const url = link?.preview ? link.url : undefined;
  const api = doc.api;
  const expected = expectedOf(doc);
  const expectKey = expected ? `${expected.namespace}@${expected.contractVersion}` : "";
  /* what the hello said, read by the transport and the worlds when they need it: the hello coming in changes nothing
     else of them, since another transport would start the preview over */
  const heard = useRef<{ hello?: GameLoopHello; offset?: number } | undefined>(undefined);
  const transport = useMemo(() => (url ? createGameLoopTransport({ url, api, hello: () => heard.current }) : null), [url, api]);
  const [status, setStatus] = useState<GameLoopStatus>({ state: "checking" });
  const [asked, setAsked] = useState(0);
  const [session, setSession] = useState(0);
  const wasOk = useRef<boolean | null>(null);

  useEffect(() => {
    heard.current = undefined;
    wasOk.current = null;
    setStatus({ state: "checking" });
  }, [url]);
  useEffect(() => {
    if (!url) return;
    let live = true;
    let again: ReturnType<typeof setTimeout> | undefined;
    const fetchNow = globalThis.fetch?.bind(globalThis) as unknown as HelloFetch;
    void checkGameLoop(url, expected, fetchNow).then(({ status: s, offset }) => {
      if (!live) return;
      heard.current = "hello" in s ? { hello: s.hello, ...(offset !== undefined ? { offset } : {}) } : undefined;
      setStatus(s);
      const ok = s.state === "ok";
      /* it answers now, where it did not: what the screens hold came from nothing, so the preview starts over */
      if (ok && wasOk.current === false) setSession((n) => n + 1);
      wasOk.current = ok;
      if (s.state === "unreachable" || s.state === "cors" || s.state === "not-a-game-loop") again = setTimeout(() => setAsked((n) => n + 1), AGAIN_MS);
    });
    return () => {
      live = false;
      if (again) clearTimeout(again);
    };
    // the expected contract is read through its key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, expectKey, asked]);

  const change = useCallback(
    (next: GameLoopLink | undefined) => {
      setLink(next);
      onChange?.(next);
    },
    [onChange],
  );
  const connect = useCallback((to: string) => change({ url: to, preview: true }), [change]);
  const toMocks = useCallback(() => change(link ? { url: link.url } : undefined), [change, link]);
  const recheck = useCallback(() => {
    setStatus({ state: "checking" });
    setAsked((n) => n + 1);
  }, []);
  const world = useCallback((part: string) => createGameLoopWorld({ url: url ?? "", hello: () => heard.current?.hello, view: part, now: () => transport?.now?.() ?? Date.now() }), [url, transport]);

  return { link, on: !!url, status: url ? status : { state: "checking" }, transport, session, connect, toMocks, recheck, world };
}
