/* The agent's conversation kept with its project (in the projects database's small key–value store, lib/projects/db.ts
 * `kv`), so a reload, or opening the project again, picks up where it was: what the model was told and answered (its
 * reasoning replayed as it came), the turns as the panel showed them, the tool sets loaded and the pictures the author
 * attached. The screenshots the agent looked at are not kept: the panel shows them while a turn runs. */

import { getKv, putKv } from "@/lib/projects/db";
import type { Message } from "@/lib/llm/types";
import type { Attachment } from "@/lib/tools/types";

/** what a turn looked like in the panel, as far as it is kept */
export type KeptTurn = Record<string, unknown> & { id: string; request: string };

export type Memory = { version: 1; messages: Message[]; turns: KeptTurn[]; sets: string[]; attachments: Attachment[] };

const keyOf = (project: string) => `agent:conversation:${project}`;

export async function loadMemory(project: string): Promise<Memory | null> {
  try {
    const m = await getKv<Memory>(keyOf(project));
    return m && m.version === 1 && Array.isArray(m.messages) && Array.isArray(m.turns) ? m : null;
  } catch {
    return null;
  }
}

/** keeps the conversation; an empty one is kept as nothing */
export async function saveMemory(project: string, m: Omit<Memory, "version">): Promise<void> {
  try {
    await putKv(keyOf(project), m.messages.length || m.turns.length ? ({ version: 1, ...m } satisfies Memory) : undefined);
  } catch {
    /* a conversation that cannot be kept is still the one on show */
  }
}
