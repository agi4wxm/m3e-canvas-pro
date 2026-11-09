/* A local game loop answering the preview (docs/玩法契约.md “本地 game-loop”): the project's link to it and its hello
 * (link.ts), the transport its calls and channels go through (transport.ts), and the world it plays (world.ts). The
 * stand-in the tests run against is in fixtures/. No DOM: the platform's fetch and socket are handed in or found. */

export * from "./link";
export * from "./transport";
export * from "./world";
