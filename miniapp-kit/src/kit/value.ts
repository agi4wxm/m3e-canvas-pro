import { useEffect, useRef, useState } from "react";

/** A control's value: its own, starting at what the design gives, or, when `onChange` is given, the one it is handed
 *  (the screen's runtime keeps it: a form's field, a variable, what a condition reads). */
export function useValue<T>(value: T, onChange?: (v: T) => void): [T, (v: T) => void] {
  const [own, setOwn] = useState(value);
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });
  const controlled = !!onChange;
  return [controlled ? value : own, (v: T) => (controlled ? latest.current?.(v) : setOwn(v))];
}
