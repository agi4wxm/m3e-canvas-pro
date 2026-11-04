import { useState } from "react";
import { PackIcon } from "../PackIcon";

/* A line of text with a button that copies it. The button says so when it has, and says nothing was
 * copied when the browser refused (a page that is not focused, or not served over https). */
export function ClipboardRow({ text = "", width = 280 }: { text?: string; width?: number }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1500);
  };
  return (
    <div data-slot="clipboard" data-state={state} className="bg-surface-container-high flex h-10 items-center gap-2 rounded-md pr-1 pl-3" style={{ width }}>
      <code className="text-body-small text-on-surface min-w-0 flex-1 truncate">{text}</code>
      <button type="button" aria-label="Copy" className="text-on-surface-variant hover:bg-on-surface/8 flex size-8 shrink-0 items-center justify-center rounded-full" onClick={copy}>
        <PackIcon name={state === "copied" ? "check" : state === "failed" ? "error" : "content_copy"} className="size-4" />
      </button>
    </div>
  );
}
