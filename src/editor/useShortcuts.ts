/* The editor's keyboard: undo and redo, copy, cut, paste and duplicate, select all, group, Figma's layout keys,
 * delete, nudges, layer steps, going into and out of boxes and along siblings, the tools and the zoom. What is typed into a field is the field's, and a dialog, the
 * preview or the prompt's full-screen cover own the keyboard while they are up. */

import { useEffect, useRef } from "react";

export type ShortcutInputs = {
  /** this tab may edit the document */
  editable: boolean;
  /** something over the canvas owns the keyboard */
  blocked: boolean;
  selectedIds: string[];
  selectedFrameId: string | null;
  /** a copy waits to be pasted */
  canPaste: () => boolean;
  /** a definition is open for editing */
  editingDefinition: () => boolean;
  undo: () => void;
  redo: () => void;
  duplicateSelected: () => void;
  duplicateFrame: (id: string) => void;
  copySelected: () => void;
  pasteClipboard: () => void;
  deleteSelected: () => void;
  deleteFrame: (id: string) => void;
  selectAll: () => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  tidyUp: () => void;
  tidyScreen: () => void;
  autoLayout: () => void;
  finishDefinition: () => void;
  clearSelection: () => void;
  openPreview: () => void;
  nudge: (dx: number, dy: number) => void;
  stepLayers: (dir: 1 | -1) => void;
  setMode: (mode: "select" | "hand") => void;
  setSpaceHeld: (held: boolean) => void;
  zoom: (dir: "in" | "out") => void;
  fit: () => void;
  /** Ctrl/Cmd+0: the zoom at 100% */
  zoomTo100: () => void;
  /** Shift+2: the selection fills the view */
  zoomToSelection: () => void;
  /** Enter: the selection's children; Shift+Enter or Escape: its parent (false when there is none) */
  enterChildren: () => void;
  selectParent: (escape: boolean) => boolean;
  /** Tab and Shift+Tab: the next and the previous sibling (false when there is none) */
  selectSibling: (dir: 1 | -1) => boolean;
  /** `?`: the sheet of shortcuts */
  showShortcuts: () => void;
};

export function useShortcuts(inputs: ShortcutInputs) {
  /* the handlers read what is current when a key is pressed, so they are bound once */
  const latest = useRef(inputs);
  latest.current = inputs;
  /** focus last moved with Tab, not with a pointer */
  const tabbedRef = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = latest.current;
      if (e.key === "Tab") tabbedRef.current = true;
      if (!k.editable) return;
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (typing) return;
      // dialogs, the preview and the prompt's full-screen cover own the keyboard while they are up
      if (k.blocked) return;
      const mod = e.ctrlKey || e.metaKey;
      const { selectedIds, selectedFrameId } = k;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) k.redo();
        else k.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        k.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (selectedIds.length === 0 && selectedFrameId) k.duplicateFrame(selectedFrameId);
        else k.duplicateSelected();
        return;
      }
      if (mod && e.key.toLowerCase() === "c") {
        /* with nothing selected, or text highlighted somewhere, the browser keeps its own copy */
        if (selectedIds.length === 0 || window.getSelection()?.toString()) return;
        e.preventDefault();
        k.copySelected();
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        if (!k.canPaste()) return;
        e.preventDefault();
        k.pasteClipboard();
        return;
      }
      if (mod && e.key.toLowerCase() === "x") {
        /* the same bargain as copy: highlighted text is the browser's to cut */
        if (selectedIds.length === 0 || window.getSelection()?.toString()) return;
        e.preventDefault();
        k.copySelected();
        k.deleteSelected();
        return;
      }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        k.selectAll();
        return;
      }
      if (mod && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) k.ungroupSelected();
        else k.groupSelected();
        return;
      }
      /* Figma's keys: Ctrl+Alt+T tidies up what is selected, or the screen when one part or none is; Shift+A turns the
       * selection into auto layout. The code of the key, since Alt changes the letter it types on a Mac */
      if (mod && e.altKey && e.code === "KeyT") {
        e.preventDefault();
        if (selectedIds.length > 1) k.tidyUp();
        else k.tidyScreen();
        return;
      }
      if (e.shiftKey && !mod && !e.altKey && e.code === "KeyA" && selectedIds.length) {
        e.preventDefault();
        k.autoLayout();
        return;
      }
      /* Space presses a control reached with Tab instead of holding the hand tool; a button
       * clicked with the mouse keeps focus too, and must not be pressed again */
      if (e.key === " " && tabbedRef.current && t.closest?.("button, [role=button]")) return;
      if (e.key === " " && !e.repeat) {
        e.preventDefault();
        k.setSpaceHeld(true);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedIds.length === 0 && selectedFrameId) k.deleteFrame(selectedFrameId);
        else k.deleteSelected();
        return;
      }
      if (e.key === "Escape") {
        /* as in Figma, Escape goes up to the parent; at the top it lets go, and with nothing left to let go of it
         * leaves the definition being edited */
        if (selectedIds.length && k.selectParent(true)) return;
        if (!selectedIds.length && k.editingDefinition()) k.finishDefinition();
        k.clearSelection();
        return;
      }
      /* Enter goes into the selection, Shift+Enter up to its parent; a focused button keeps its own Enter */
      if (e.key === "Enter" && !mod && !e.altKey && !t.closest?.("button, [role=button], a, [role=treeitem]")) {
        if (!selectedIds.length) return;
        e.preventDefault();
        if (e.shiftKey) k.selectParent(false);
        else k.enterChildren();
        return;
      }
      /* Tab walks the siblings of the selection while nothing in the panels has the focus */
      if (e.key === "Tab" && !mod && !e.altKey && selectedIds.length && (t === document.body || !!t.closest?.("[data-canvas]"))) {
        if (k.selectSibling(e.shiftKey ? -1 : 1)) e.preventDefault();
        return;
      }
      if (e.key === "?" || (e.shiftKey && e.code === "Slash")) {
        e.preventDefault();
        k.showShortcuts();
        return;
      }
      /* Figma's zoom keys: Shift+1 everything, Shift+2 the selection; Ctrl/Cmd with +, - and 0 */
      if (e.shiftKey && !mod && !e.altKey && e.code === "Digit1") {
        e.preventDefault();
        k.fit();
        return;
      }
      if (e.shiftKey && !mod && !e.altKey && e.code === "Digit2") {
        e.preventDefault();
        k.zoomToSelection();
        return;
      }
      if (mod && !e.altKey && (e.key === "=" || e.key === "+" || e.code === "Equal" || e.code === "NumpadAdd")) {
        e.preventDefault();
        k.zoom("in");
        return;
      }
      if (mod && !e.altKey && (e.key === "-" || e.key === "_" || e.code === "Minus" || e.code === "NumpadSubtract")) {
        e.preventDefault();
        k.zoom("out");
        return;
      }
      if (mod && !e.altKey && (e.key === "0" || e.code === "Digit0" || e.code === "Numpad0")) {
        e.preventDefault();
        k.zoomTo100();
        return;
      }
      if (e.key === "p" || e.key === "P") {
        k.openPreview();
        return;
      }
      if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const s = e.shiftKey ? 8 : 1;
        k.nudge(e.key === "ArrowLeft" ? -s : e.key === "ArrowRight" ? s : 0, e.key === "ArrowUp" ? -s : e.key === "ArrowDown" ? s : 0);
        return;
      }
      if (mod) return;
      if (e.key === "]" || e.key === "[") {
        if (selectedIds.length === 0) return;
        e.preventDefault();
        k.stepLayers(e.key === "]" ? 1 : -1);
        return;
      }
      if (e.key === "v" || e.key === "V") k.setMode("select");
      if (e.key === "h" || e.key === "H") k.setMode("hand");
      if (e.key === "=" || e.key === "+") k.zoom("in");
      if (e.key === "-" || e.key === "_") k.zoom("out");
      if (e.key === "0") k.fit();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") latest.current.setSpaceHeld(false);
    };
    const onPointer = () => {
      tabbedRef.current = false;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, []);
}
