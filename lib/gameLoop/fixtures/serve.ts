/* The stand-in game loop (standIn.ts) behind a real HTTP and WebSocket server, for the end-to-end tests (Bun runs them):
 * `serveStandIn()` listens on a free port of the loopback and gives back its address, the stand-in to steer, and how
 * to stop it. Also runnable by hand, to try the preview's “local game loop” against it:
 *
 *   bun lib/gameLoop/fixtures/serve.ts [port]
 */

import { createStandIn, type StandIn, type StandInOptions, type StandInSocket } from "./standIn";

/* Bun's server, the little of it used here: the repo's TypeScript has no Bun types (it runs under Node and Vite too) */
type BunSocket = { data: { url: string; s?: StandInSocket }; send(text: string): void; close(): void };
type BunServer = { port: number; stop(force?: boolean): void; upgrade(req: Request, o: { data: { url: string } }): boolean };
declare const Bun: {
  serve(o: {
    port: number;
    hostname: string;
    fetch(req: Request, server: BunServer): Response | Promise<Response> | undefined;
    websocket: { open(ws: BunSocket): void; message(ws: BunSocket, m: string | Uint8Array): void; close(ws: BunSocket): void };
  }): BunServer;
};

export type ServedStandIn = { url: string; port: number; standIn: StandIn; stop(): void };

export function serveStandIn(o: StandInOptions & { port?: number } = {}): ServedStandIn {
  const standIn = createStandIn(o);
  const server = Bun.serve({
    port: o.port ?? 0,
    hostname: "127.0.0.1",
    fetch(req, srv) {
      if (req.headers.get("upgrade")?.toLowerCase() === "websocket" && standIn.socketPath(req.url)) {
        return srv.upgrade(req, { data: { url: req.url } }) ? undefined : new Response("no upgrade", { status: 400 });
      }
      return standIn.handle(req);
    },
    websocket: {
      open(ws) {
        ws.data.s = standIn.connect(ws.data.url, { send: (t) => ws.send(t), close: () => ws.close() });
        if (!ws.data.s) ws.close();
      },
      message(ws, m) {
        ws.data.s?.text(typeof m === "string" ? m : new TextDecoder().decode(m));
      },
      close(ws) {
        ws.data.s?.close();
      },
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    port: server.port,
    standIn,
    stop() {
      standIn.stop();
      server.stop(true);
    },
  };
}

if ((import.meta as { main?: boolean }).main) {
  const port = Number((globalThis as { process?: { argv: string[] } }).process?.argv[2] ?? 8787);
  const s = serveStandIn({ port });
  console.log(`stand-in game loop at ${s.url} (contract ${s.standIn.state.contractVersion})`);
}
