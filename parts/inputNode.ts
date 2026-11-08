import type { PNode } from "./node";

/* Which node of a part's tree is the control that holds the part's input (`PartDef.input`): the preview draws that one
 * controlled (parts/render.tsx). The mark is a field of the node beside `type`, `props` and `children`, not a prop: the
 * printers read only those three, so the code they print is the same with it or without it. It is kept out of
 * parts/node.ts, which exported projects carry as it is. */

type Marked = PNode & { input?: true };

/** `node` marked as the control that holds its part's input */
export const inputNode = (node: PNode): PNode => ({ ...node, input: true }) as Marked;

/** whether a tree marks this node as its part's input */
export const isInputNode = (node: PNode): boolean => (node as Marked).input === true;
