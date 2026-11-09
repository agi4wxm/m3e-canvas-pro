/* The stand-in React the kit and the shared runtime (lib/app, outside this package) are loaded with in this package's
 * tests, one for the whole run. Bun keeps a module once it is loaded: the kit's and the runtime's contexts are made by
 * whichever React they met first, and which test file loads them first (kit.test.ts through the transport and the
 * icons, table.test.ts through the screens) differs between machines. A file that loads them and draws nothing itself
 * imports this first, so that React is a stand-in's; the table draws with this one. */
import { mock } from "bun:test";

import { createTinyReact } from "./table/tinyReact";

export const runtimeTiny = createTinyReact();
mock.module("react", () => runtimeTiny.react);
mock.module("react/jsx-runtime", () => runtimeTiny.jsxRuntime);
mock.module("react/jsx-dev-runtime", () => runtimeTiny.jsxRuntime);
mock.module(Bun.resolveSync("react", new URL("../../lib/app/", import.meta.url).pathname), () => runtimeTiny.react);
