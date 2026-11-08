import { useState, type ReactNode } from "react";
import type { Look } from "./look";
import { cn } from "@/lib/m3e/cn";
import { Button } from "@/components/m3e/button";
import { WidgetIcon } from "./WidgetIcon";
import { useCapability, useHost, type HostProps } from "./host";
import { keysOf, useValue } from "./seed";

/* Text the author wrote, shown the way its kind asks: code, Markdown, a list to reorder. After
 * flutter_shadcn_kit's code snippet, markdown and sortable. No HTML passes through: what a saved file
 * holds is shown as words. */

export function CodeBlock({ code = "", language = "", width = 420, className, style }: { code?: string; language?: string; width?: number } & Look) {
  const [copied, setCopied] = useState(false);
  const invoke = useCapability();
  const copy = async () => {
    /* through the platform's clipboard.write; refused, the button simply does not say it copied */
    if (!(await invoke("clipboard.write", { text: code })).ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div data-slot="code-block" data-copied={copied || undefined} className={cn("bg-surface-container-highest overflow-hidden rounded-xl", className)} style={{ width, ...style }}>
      <div className="text-label-medium text-on-surface-variant flex h-10 items-center justify-between pr-1 pl-4">
        <span>{language}</span>
        <Button variant="text" size="icon-sm" aria-label="Copy" onClick={copy}>
          <WidgetIcon name={copied ? "check" : "content_copy"} />
        </Button>
      </div>
      <pre className="text-body-small text-on-surface overflow-x-auto px-4 pb-4 font-mono">{code}</pre>
    </div>
  );
}

/** bold and inline code: all the marks a line of it reads */
function inline(line: string): ReactNode[] {
  return line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((bit, i) => {
    if (bit.startsWith("**") && bit.endsWith("**") && bit.length > 4) return <strong key={i}>{bit.slice(2, -2)}</strong>;
    if (bit.startsWith("`") && bit.endsWith("`") && bit.length > 2) return <code key={i} className="bg-surface-container-highest rounded px-1 font-mono">{bit.slice(1, -1)}</code>;
    return bit;
  });
}

export function Markdown({ text = "", width = 420, className, style }: { text?: string; width?: number } & Look) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (line.startsWith("```")) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) code.push(lines[i]);
      blocks.push(<pre key={i} className="bg-surface-container-highest text-body-small overflow-x-auto rounded-lg p-3 font-mono">{code.join("\n")}</pre>);
    } else if (/^#{1,3} /.test(line)) {
      const level = line.indexOf(" ");
      const style = ["text-headline-small", "text-title-large", "text-title-medium"][level - 1];
      blocks.push(<div key={i} role="heading" aria-level={level} className={style}>{inline(line.slice(level + 1))}</div>);
    } else if (/^[-*] /.test(line)) {
      const rows: string[] = [];
      for (; i < lines.length && /^[-*] /.test(lines[i]); i++) rows.push(lines[i].slice(2));
      i--;
      blocks.push(<ul key={i} className="list-disc pl-5">{rows.map((r, k) => <li key={k}>{inline(r)}</li>)}</ul>);
    } else if (line.startsWith("> ")) {
      blocks.push(<blockquote key={i} className="border-outline-variant text-on-surface-variant border-l-4 pl-3">{inline(line.slice(2))}</blockquote>);
    } else {
      blocks.push(<p key={i}>{inline(line)}</p>);
    }
  }
  return (
    <div data-slot="markdown" className={cn("text-body-medium text-on-surface flex flex-col gap-2", className)} style={{ width, ...style }}>
      {blocks}
    </div>
  );
}

/* An input of an order: `items` in the order shown is the value, handed out on every move, each move also sent as
 * `reorder` (from where, to where). Rows keep who they are by their words and their place among rows with the same
 * words, so two rows that read the same never take each other's place. A row moves by dragging, or by Alt and an
 * arrow key. */
export function SortableList({ items = [], width = 320, demo, onValueChange, onEvent, wired, className, style }: { items?: string[] | string; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [order, setOrder] = useValue(Array.isArray(items) ? items : String(items).split("\n").filter((w) => w.trim()), host);
  const [dragged, setDragged] = useState(-1);
  const keys = keysOf(order);
  const move = (from: number, to: number) => {
    if (from < 0 || from === to || to < 0 || to >= order.length) return false;
    const next = [...order];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    setOrder(next);
    host.emit("reorder", { from, to });
    return true;
  };
  return (
    <div data-slot="sortable-list" data-order={order.join("|")} role="list" className={cn("flex flex-col gap-1", className)} style={{ width, ...style }}>
      {order.map((row, i) => (
        <div
          key={keys[i]}
          role="listitem"
          draggable
          tabIndex={0}
          aria-label={row}
          data-slot="sortable-list-row"
          data-dragging={i === dragged || undefined}
          className={`text-body-medium text-on-surface flex h-12 cursor-grab items-center gap-2 rounded-lg px-2 ${i === dragged ? "bg-secondary-container" : "bg-surface-container-low"}`}
          onDragStart={() => setDragged(i)}
          onDragEnter={() => {
            if (move(dragged, i)) setDragged(i);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragEnd={() => setDragged(-1)}
          onKeyDown={(e) => {
            if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
            e.preventDefault();
            const to = i + (e.key === "ArrowUp" ? -1 : 1);
            if (move(i, to)) (e.currentTarget.parentElement?.children[to] as HTMLElement | undefined)?.focus();
          }}
        >
          <WidgetIcon name="drag_indicator" className="text-on-surface-variant size-5" />
          <span data-slot="sortable-list-title" className="min-w-0 flex-1 truncate">{row}</span>
        </div>
      ))}
    </div>
  );
}
