/* The preview's world views (docs/交互规则.md “输入动作”): one channel for each, by its item id, which the interpreter's
 * input actions are sent on and the view's stand-in (parts/widgets/World.tsx) listens on, through the part host. */

import { createContext } from "react";
import type { Worlds } from "@/lib/world/channel";
import type { MockWorld } from "@/parts/widgets/mockWorld";

/** the channels of the preview session on show; none outside a preview */
export const PreviewWorlds = createContext<Worlds | null>(null);

/** the mock world the preview's bar has chosen (docs/模拟库.md “世界脚本”), on the mocks' clock; none outside a preview or
 *  when none is chosen */
export const PreviewMockWorld = createContext<MockWorld | null>(null);
