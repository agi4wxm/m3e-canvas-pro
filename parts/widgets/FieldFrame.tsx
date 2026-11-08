import { useId, type ReactNode, type SyntheticEvent, type KeyboardEvent } from "react";
import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { Spinner } from "@/components/m3e/spinner";
import { useSay } from "@/components/m3e/say";

/* What a control's field states say around it (parts/fieldState.ts `fieldFrame`): the message under it while it is in
 * error and a spinner while it loads (required is said by the control: its `required`, a star on its label, here a
 * mark for styles and tests). A widget that cannot be held
 * itself is held here: disabled, its buttons and fields are off (a fieldset does that natively) and it is dimmed as M3
 * dims a disabled control; read-only, a press, a typed word, a paste or a drop does not reach it, while it can still be
 * focused and read. */

/** the keys that change a control: what read-only lets through is moving around (Tab, the arrows) */
const CHANGING = new Set(["Enter", " ", "Backspace", "Delete"]);

export function FieldFrame({
  disabled,
  readOnly,
  required,
  invalid,
  mark,
  message,
  loading,
  label,
  children,
  className,
  style,
}: { disabled?: boolean; readOnly?: boolean; required?: boolean; invalid?: boolean; mark?: boolean; message?: string; loading?: boolean; label?: string; children?: ReactNode } & Look) {
  const say = useSay();
  const id = useId();
  /* loading only says so: what it waits for (options, a check) does not stop the visitor */
  const held = !!readOnly && !disabled;
  const stop = (e: SyntheticEvent) => {
    if (!held) return;
    e.preventDefault();
    e.stopPropagation();
  };
  const keys = (e: KeyboardEvent) => {
    if (held && CHANGING.has(e.key)) stop(e);
  };
  /* the message shows while the field is in error */
  const note = invalid ? (message ?? "") : "";
  return (
    <div
      data-slot="field-frame"
      data-disabled={disabled || undefined}
      data-readonly={readOnly || undefined}
      data-required={required || undefined}
      data-invalid={invalid || undefined}
      data-loading={loading || undefined}
      role={label ? "group" : undefined}
      aria-label={label || undefined}
      aria-invalid={invalid || undefined}
      aria-busy={loading || undefined}
      aria-describedby={note ? `${id}-note` : undefined}
      className={cn("inline-flex max-w-full flex-col gap-1", className)}
      style={style}
      onClickCapture={stop}
      onBeforeInputCapture={stop}
      onPasteCapture={stop}
      onDropCapture={stop}
      onKeyDownCapture={keys}
    >
      <div className="relative flex items-center gap-2">
        <fieldset disabled={disabled || undefined} className={cn("m-0 min-w-0 border-0 p-0", disabled && "opacity-38", mark && "rounded-xs outline outline-1 outline-offset-2 outline-error")}>
          {children}
        </fieldset>
        {required && (
          <span aria-hidden className="text-body-large text-error">
            *
          </span>
        )}
        {loading && <Spinner aria-label={say("Loading")} className="size-5 shrink-0" />}
      </div>
      {note && (
        <p id={`${id}-note`} data-slot="field-frame-note" role={message ? "alert" : undefined} className={cn("text-body-small px-4", message ? "text-error" : "text-on-surface-variant")}>
          {note}
        </p>
      )}
    </div>
  );
}
