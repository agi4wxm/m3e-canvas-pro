/* The pictures in a conversation: every screenshot the agent takes goes back to the model with every later request,
 * and a turn that looks at its work three or four times carries a dozen of them (a phone screen is some 1,500 input
 * tokens each, a long one many more). Only the last few are kept; older ones become a line of words in their place.
 *
 * Only pictures change, in the author's messages and the tools' results: what the model wrote (its reasoning, signed
 * or encrypted, its calls and its words) is never touched, since providers want it back exactly as it was. Pictures
 * are let go several at a time, when there are more than `max`, down to `keep`, so most requests start the same way
 * as the one before them and the provider's prompt cache still finds them. */

import type { ImagePart, Message, UserPart } from "../llm";

export const KEEP_PICTURES = 3;
export const MAX_PICTURES = 6;

const isImage = (p: UserPart): p is ImagePart => p.type === "image";

const standIn = (p: ImagePart): UserPart => ({
  type: "text",
  text: p.name ? `[${p.name}: left out of the conversation to save room; tools still read it by its id]` : "[a picture shown here earlier was left out to save room; take a new screenshot to see it again]",
});

const countIn = (m: Message): number => (m.role === "user" ? (typeof m.content === "string" ? 0 : m.content.filter(isImage).length) : m.role === "tool" ? m.results.reduce((n, r) => n + r.content.filter(isImage).length, 0) : 0);

/** The conversation with all but the last `keep` pictures in words, once there are more than `max`; the same array
 *  when nothing is let go, and every message that keeps its pictures the same object. */
export function prunePictures(messages: Message[], o: { keep?: number; max?: number } = {}): Message[] {
  const keep = o.keep ?? KEEP_PICTURES;
  const max = o.max ?? MAX_PICTURES;
  const total = messages.reduce((n, m) => n + countIn(m), 0);
  if (total <= max) return messages;
  let drop = total - keep;
  const parts = (list: UserPart[]): UserPart[] => {
    if (!drop || !list.some(isImage)) return list;
    return list.map((p) => {
      if (!isImage(p) || drop <= 0) return p;
      drop--;
      return standIn(p);
    });
  };
  return messages.map((m) => {
    if (!drop) return m;
    if (m.role === "user" && typeof m.content !== "string") {
      const content = parts(m.content);
      return content === m.content ? m : { ...m, content };
    }
    if (m.role === "tool") {
      const results = m.results.map((r) => {
        const content = parts(r.content);
        return content === r.content ? r : { ...r, content };
      });
      return results.every((r, i) => r === m.results[i]) ? m : { ...m, results };
    }
    return m;
  });
}

/** how many pictures a conversation holds */
export const picturesIn = (messages: Message[]) => messages.reduce((n, m) => n + countIn(m), 0);
