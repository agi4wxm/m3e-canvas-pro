/* The preview's instances spawned on events (docs/交互规则.md “按事件生成”, lib/spawn.ts): one pool for the preview
 * session on show, which the interpreter's `spawn` fills and each screen draws in the copies of its templates
 * (lib/spawnDom.ts), through no React state. */

import { createContext } from "react";
import type { Spawns } from "@/lib/spawn";

/** the instances of the preview session on show; none outside a preview */
export const PreviewSpawns = createContext<Spawns | null>(null);
