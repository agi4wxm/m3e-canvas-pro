import { useState } from "react";
import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { Button } from "@/components/m3e/button";
import { WidgetIcon } from "./WidgetIcon";
import { useCapability } from "./host";

/* A line of text with a button that copies it, through the platform's `clipboard.write` (the app's capabilities, else
 * the browser's). The button says so when it has, and says nothing was copied when it was refused (a page that is not
 * focused, or not served over https). */
export function ClipboardRow({ text = "", width = 280, className, style }: { text?: string; width?: number } & Look) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const invoke = useCapability();
  const copy = async () => {
    setState((await invoke("clipboard.write", { text })).ok ? "copied" : "failed");
    setTimeout(() => setState("idle"), 1500);
  };
  return (
    <div data-slot="clipboard" data-state={state} className={cn("bg-surface-container-high flex h-10 items-center gap-2 rounded-md pr-1 pl-3", className)} style={{ width, ...style }}>
      <code className="text-body-small text-on-surface min-w-0 flex-1 truncate">{text}</code>
      <Button variant="text" size="icon-sm" aria-label="Copy" className="shrink-0" onClick={copy}>
        <WidgetIcon name={state === "copied" ? "check" : state === "failed" ? "error" : "content_copy"} className="size-4" />
      </Button>
    </div>
  );
}
