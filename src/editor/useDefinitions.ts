/* Components: a definition opened as the one screen of the canvas and closed again (the store keeps the document and
 * its history meanwhile, lib/core `openDefinition`), renamed, deleted, an instance detached, and how often each is used. */

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ComponentDef, FrameMode, Group } from "@/lib/tokens";
import type { ComponentsApi } from "@/components/ReusePanels";
import { ops, type CoreState, type DocStore, type Op, type TxOptions } from "@/lib/core";
import type { View } from "./model";

export type DefinitionInputs = {
  store: DocStore;
  runOp: <A, R>(o: Op<A, R>, args: A, opts?: TxOptions & { label?: string }) => R | undefined;
  defEdit: CoreState["editing"];
  groups: Group[];
  components: ComponentDef[] | undefined;
  mobileRef: RefObject<boolean>;
  viewRef: RefObject<View>;
  setView: (v: View) => void;
  fitRef: RefObject<() => void>;
  frameRef: { current: FrameMode };
  tidyRef: { current: unknown };
  setSelectedLinkId: (id: string | null) => void;
};

export function useDefinitions({ store, runOp, defEdit, groups, components, mobileRef, viewRef, setView, fitRef, frameRef, tidyRef, setSelectedLinkId }: DefinitionInputs) {
  /** the view the canvas had before a definition opened, to come back to */
  const defViewRef = useRef<View | null>(null);
  /** the instance the definition open now was reached from (Go to main component): finishing goes back to it */
  const [fromInstance, setFromInstance] = useState<string | null>(null);
  /** Opens a definition as the one screen of the canvas. The document's screens and its history wait in the store
   *  until it is done; while it is open every tool works on it as on any screen. */
  const editDefinition = (id: string) => {
    const def = store.get().doc.components?.find((c) => c.id === id);
    if (!def || mobileRef.current) return;
    const open = store.get().editing;
    if (open?.id === id) return;
    if (open) finishDefinitionRef.current();
    pending.current = () => {
      defViewRef.current = viewRef.current;
      tidyRef.current = null;
      store.openDefinition(id);
      frameRef.current = "phone";
      setSelectedLinkId(null);
    };
    /* out of the definition open now, the view says so only after the next draw */
    if (open) return;
    pending.current();
    pending.current = null;
  };
  /** the definition to open once the one open now has closed */
  const pending = useRef<(() => void) | null>(null);

  /** Closes the definition being edited: the document comes back, with its instances following. One undo takes it all back. */
  const finishDefinition = () => {
    if (!store.get().editing) return;
    setFromInstance(null);
    store.closeDefinition();
    frameRef.current = store.get().doc.frame;
    if (defViewRef.current) setView(defViewRef.current);
    defViewRef.current = null;
    tidyRef.current = null;
  };
  const finishDefinitionRef = useRef(finishDefinition);
  finishDefinitionRef.current = finishDefinition;
  /* one definition left for another: this one opens now the draw has brought the document back */
  useEffect(() => {
    if (defEdit || !pending.current) return;
    const open = pending.current;
    pending.current = null;
    open();
  }, [defEdit]);
  /* the screen of a definition is brought into view when it opens */
  useEffect(() => {
    if (defEdit) requestAnimationFrame(() => fitRef.current());
  }, [defEdit?.id]);

  /** the definition's name, from the tab or the bar over its screen */
  const renameComponent = (id: string, name: string) => runOp(ops.renameComponent, { id, name }, { history: { coalesce: `component:${id}:name` } });

  /** a definition gone: its instances, on the screens and in other definitions, become the parts they showed. The screens
   *  wait outside a definition's history: this could not be taken back from in there, and the panel says so */
  const deleteComponent = (id: string) => {
    if (store.get().editing) return;
    runOp(ops.removeComponentOp, { id }, { history: "step" });
  };

  /** one instance, back to plain parts */
  const detachGroup = (id: string) => runOp(ops.detach, { id }, { history: "step" });

  /** Figma's Go to main component: the definition opens, and finishing it comes back to the instance, still selected */
  const goToMain = (instanceId: string, componentId: string) => {
    editDefinition(componentId);
    setFromInstance(instanceId);
  };

  /** what the components tab does to variants and properties */
  const componentsApi: ComponentsApi = {
    addVariant: (id) => runOp(ops.addVariant, { component: id }, { history: "step" }),
    updateSet: (id, patch) => runOp(ops.updateComponentSet, { id, ...patch }, { history: { coalesce: `set:${id}:${Object.keys(patch).join(",")}` } }),
    setVariantValues: (id, values) => runOp(ops.setVariantValues, { component: id, values }, { history: "step" }),
    setProp: (component, prop) => runOp(ops.setComponentProp, { component, ...prop }, { history: { coalesce: `prop:${component}:${prop.id ?? "new"}` } }),
    removeProp: (component, id) => runOp(ops.removeComponentProp, { component, id }, { history: "step" }),
  };

  /** how many instances each definition has, on the screens and in the other definitions */
  const componentUses = useMemo(() => {
    const out: Record<string, number> = {};
    for (const g of [...(defEdit?.main.groups ?? groups), ...(components ?? []).flatMap((c) => c.groups)]) if (g.instanceOf) out[g.instanceOf] = (out[g.instanceOf] ?? 0) + 1;
    return out;
  }, [defEdit, groups, components]);
  return { editDefinition, finishDefinition, finishDefinitionRef, renameComponent, deleteComponent, detachGroup, componentUses, goToMain, fromInstance, componentsApi };
}
