/* The preview listens for its own keys on the whole window: Escape closes, Backspace and ← go back. A key meant for a
 * control on the screen is not one of them: typing or deleting in a field, moving in a list, a slider or a row of tabs,
 * or a key an input method is still composing. */

/** what takes Backspace and the arrow keys for itself: what is typed in, and the widgets an arrow moves inside */
const OWNS_KEYS = [
  "input",
  "textarea",
  "select",
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="combobox"]',
  '[role="spinbutton"]',
  '[role="slider"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[role="menubar"]',
  '[role="radiogroup"]',
  '[role="tablist"]',
  '[role="grid"]',
  '[role="tree"]',
  '[role="treegrid"]',
  '[role="toolbar"]',
].join(", ");

export type KeyPress = Pick<KeyboardEvent, "key" | "isComposing" | "keyCode" | "defaultPrevented" | "altKey" | "ctrlKey" | "metaKey"> & { target: EventTarget | null };

/** an input method is putting a character together: its keys are its own (229 is what browsers report meanwhile) */
export const composing = (e: Pick<KeyboardEvent, "isComposing" | "keyCode">): boolean => e.isComposing || e.keyCode === 229;

/** whether the focus is on something that takes Backspace and the arrows itself */
function ownsKeys(target: EventTarget | null): boolean {
  const el = target as (Element & { isContentEditable?: boolean }) | null;
  if (!el || typeof el.closest !== "function") return false;
  return el.isContentEditable === true || !!el.closest(OWNS_KEYS);
}

/** Whether a key press asks the preview to go back: Backspace or ← with no modifier held, not while an input method
 *  composes, not one a control has already answered, and not with the focus on a control that takes the key itself. */
export function goesBack(e: KeyPress): boolean {
  if (e.key !== "Backspace" && e.key !== "ArrowLeft") return false;
  if (composing(e) || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return false;
  return !ownsKeys(e.target);
}
