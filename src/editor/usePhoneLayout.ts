/* The editor on a phone: one fixed screen, the select tool only, and a document of screens. A phone that opens with
 * nothing saved starts from the phone's own seed. Bound once: everything it reads is a ref or the store. */

import { useEffect, type RefObject } from "react";
import { Frame, FrameMode, Group, uid } from "@/lib/tokens";
import type { Mode } from "@/components/Toolbar";
import { t, type Lang } from "@/lib/i18n";
import type { DocStore } from "@/lib/core";
import { mobileSeed } from "./seed";

export type PhoneLayoutInputs = {
  store: DocStore;
  setIsMobile: (on: boolean) => void;
  mobileRef: { current: boolean };
  setMode: (mode: Mode) => void;
  setSheet: (sheet: null) => void;
  /** a document is on the canvas already, saved or seeded: no seed over it */
  hadDocRef: { current: boolean };
  initialLangRef: RefObject<Lang>;
  setGroups: (groups: Group[]) => void;
  setFrames: (frames: Frame[]) => void;
  frameRef: { current: FrameMode };
  setFrame: (mode: FrameMode) => void;
  /** the document has a screen for what it holds */
  ensureFrame: () => void;
  fitRef: RefObject<() => void>;
  setViewReady: (ready: boolean) => void;
};

export function usePhoneLayout({ store, setIsMobile, mobileRef, setMode, setSheet, hadDocRef, initialLangRef, setGroups, setFrames, frameRef, setFrame, ensureFrame, fitRef, setViewReady }: PhoneLayoutInputs) {
  /* everyone works on phone screens; a phone gets one fixed screen and the select tool only */
  useEffect(() => {
    const mq = window.matchMedia(
      "(max-width: 840px), (pointer: coarse) and (max-width: 1024px)",
    );
    const apply = () => {
      const m = mq.matches;
      setIsMobile(m);
      mobileRef.current = m;
      /* a phone edits screens only: a document arriving or a step brought back keeps it on them */
      store.pinFrameMode(m ? "phone" : null);
      if (m) {
        setMode("select");
        setSheet(null);
        if (!hadDocRef.current) {
          hadDocRef.current = true;
          setGroups(mobileSeed(initialLangRef.current));
          setFrames([{ id: uid(), name: t("home", initialLangRef.current), x: 0, y: 0 }]);
        }
      }
      hadDocRef.current = true;
      if (frameRef.current !== "phone") {
        setFrame("phone");
        frameRef.current = "phone";
      }
      ensureFrame();
      queueMicrotask(() => {
        fitRef.current();
        setViewReady(true);
      });
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
}
