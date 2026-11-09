/* The tool that reads a screen's keyboard and gamepad focus (lib/focus): where it starts, what cancel runs, and each part
 * that takes it in reading order with where each direction goes from it, worked out from where the parts stand and the
 * parts' own overrides. Nothing changes. */

import { focusMap } from "../focus/design";
import { tool, ToolFailure, type Tool } from "./types";

const describeFocus = tool<{ screen: string }>({
  name: "describe_focus",
  group: "read",
  description:
    "How a keyboard's or a gamepad's focus moves over a screen: first (the part it starts on), cancel (the part whose tap Escape or B runs there before going back), wrap, and each part that takes the focus in reading order with its box and where up, down, left and right go from it. set_focus changes it.",
  input: { type: "object", properties: { screen: { type: "string" } }, required: ["screen"], additionalProperties: false },
  output: "{screen, first, cancel?, wrap?, parts: [{id, label, box, next: {up?, down?, left?, right?}}]}",
  readOnly: true,
  destructive: false,
  run(a, env) {
    const s = env.store.get();
    const f = s.doc.frames.find((x) => x.id === a.screen);
    if (!f) throw new ToolFailure("not_found", `There is no screen ${JSON.stringify(a.screen)}.`, "list_screens lists them.");
    return { result: focusMap(s.doc, f, s.session.widths) };
  },
});

export const FOCUS_READ_TOOLS: Tool<never>[] = [describeFocus] as unknown as Tool<never>[];
