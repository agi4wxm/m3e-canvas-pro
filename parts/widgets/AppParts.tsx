import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/m3e/cn";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/m3e/avatar";
import { Button } from "@/components/m3e/button";
import { Checkbox } from "@/components/m3e/checkbox";
import { FilterChip } from "@/components/m3e/chip";
import { Icon } from "@/components/m3e/icon";
import { Input } from "@/components/m3e/input";
import { Switch } from "@/components/m3e/switch";
import { ensureIcons, useIconVersion } from "../icons";
import type { Look } from "./look";
import { amountOf, keysOf, stop, usePicked, useSeeded, useValue } from "./seed";
import { useHost, type HostProps } from "./host";
import { Tap } from "./Tap";
import { WidgetIcon } from "./WidgetIcon";

/* The records most apps are built from: what is for sale, who wrote, what arrived, what was paid.
 * New code written for this project. Rows are the author's own table rows; words a row does not hold
 * inherit the part's text color and fade by opacity, so a fill set on the part reads on all of it. */

const Soft = "opacity-70";

/** an icon that can be filled: a heart once it is liked. Everything else here draws with WidgetIcon. */
function Glyph({ name, filled = false, className }: { name: string; filled?: boolean; className?: string }) {
  const version = useIconVersion();
  useEffect(() => ensureIcons([name]), [name]);
  return <Icon key={version} name={name} fill={filled} className={className} />;
}

/** one or two letters that stand for a name */
const lettersOf = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${Array.from(words[0])[0]}${Array.from(words[1])[0]}`.toUpperCase();
  return (Array.from(words[0] ?? "?")[0] ?? "?").toUpperCase();
};

function Face({ name, image = "", size }: { name: string; image?: string; size?: "sm" | "lg" }) {
  return (
    <Avatar size={size}>
      {image && <AvatarImage src={image} alt={name} />}
      <AvatarFallback>{lettersOf(name)}</AvatarFallback>
    </Avatar>
  );
}

/** the author's picture, or a placeholder until there is one */
function Picture({ src = "", alt = "", icon = "image", className }: { src?: string; alt?: string; icon?: string; className?: string }) {
  if (src) return <img src={src} alt={alt} className={cn("object-cover", className)} />;
  return (
    <span role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true} className={cn("bg-surface-container-high text-outline flex items-center justify-center", className)}>
      <WidgetIcon name={icon} className="size-8" />
    </span>
  );
}

/* ---------- selling ---------- */

/* Whether it is liked, and how many are in the cart, are the shop's to say (`liked`, `added`): the heart (the `like`
 * slot) and the button only ask. A prototype's demo flips the heart and counts additions itself. */
export function ProductCard({ image = "", title = "", subtitle = "", price = "", original = "", badge = "", rating = 0, action = "", done = "", layout = "vertical", liked = false, added: given = 0, width = 200, demo, onValueChange, onEvent, wired, className, style }: { image?: string; title?: string; subtitle?: string; price?: string; original?: string; badge?: string; rating?: number; action?: string; done?: string; layout?: string; liked?: boolean; added?: number; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [mine, setMine] = useSeeded({ from: [liked, given], heart: liked, added: given });
  const heart = host.demo ? mine.heart : liked;
  const added = host.demo ? mine.added : given;
  const across = layout === "horizontal";
  return (
    <div data-slot="product-card" data-liked={heart || undefined} data-added={added || undefined} className={cn("bg-surface-container-low text-on-surface relative flex overflow-hidden rounded-xl", across ? "flex-row" : "flex-col", className)} style={{ width, ...style }}>
      <Tap data-tap="open" data-slot="product-card-media" aria-label={title} className={cn("flex shrink-0", across ? "w-28 self-stretch" : "aspect-square w-full")}>
        <Picture src={image} alt={title} className="size-full" />
      </Tap>
      {badge && <span data-slot="product-card-tag" className="bg-error text-on-error text-label-small absolute top-2 left-2 rounded-full px-2 py-0.5">{badge}</span>}
      <div data-slot="product-card-body" className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <div data-slot="product-card-title" className="text-title-small line-clamp-2">{title}</div>
        {subtitle && <div data-slot="product-card-subtitle" className={`text-body-small truncate ${Soft}`}>{subtitle}</div>}
        {rating > 0 && (
          <div data-slot="product-card-rating" className="text-label-medium flex items-center gap-0.5">
            <Glyph name="star" filled className="text-tertiary size-4" />
            {rating.toFixed(1)}
          </div>
        )}
        <div className="flex items-center gap-1">
          <span data-slot="product-card-price" className="text-title-medium text-primary">{price}</span>
          {original && <span data-slot="product-card-original" className={`text-body-small line-through ${Soft}`}>{original}</span>}
          <Button variant="text" size="icon-sm" aria-label="Favorite" aria-pressed={heart} data-tap="like" className={cn("ml-auto", heart && "text-error")} onClick={host.own("like", () => host.demo && setMine((m) => ({ ...m, heart: !m.heart })))}>
            <Glyph name="favorite" filled={heart} />
          </Button>
        </div>
        {action && (
          <Button variant={added ? "tonal" : "filled"} size="xs" data-tap="action" className="w-full" onClick={() => host.demo && setMine((m) => ({ ...m, added: m.added + 1 }))}>
            {added ? `${done || action} · ${added}` : action}
          </Button>
        )}
      </div>
    </div>
  );
}

export function CartList({ rows = [], currency = "", selectAll = "", total = "", action = "", empty = "", width = 380, className, style }: { rows?: string[][]; currency?: string; selectAll?: string; total?: string; action?: string; empty?: string; width?: number } & Look) {
  const seed = rows.map((r, id) => ({ id, name: r[0] ?? "", spec: r[1] ?? "", price: amountOf(r[2]), count: Math.max(1, Math.round(amountOf(r[3]) || 1)), on: true }));
  const [lines, setLines] = useSeeded(seed);
  const edit = (id: number, change: Partial<(typeof seed)[number]>) => setLines((all) => all.map((l) => (l.id === id ? { ...l, ...change } : l)));
  const picked = lines.filter((l) => l.on);
  const sum = picked.reduce((s, l) => s + l.price * l.count, 0);
  const pieces = picked.reduce((s, l) => s + l.count, 0);
  return (
    <div data-slot="cart-list" data-total={sum.toFixed(2)} data-count={lines.length} className={cn("bg-surface-container-low text-on-surface flex flex-col overflow-hidden rounded-xl", className)} style={{ width, ...style }}>
      {lines.length === 0 && <div className={`text-body-medium p-6 text-center ${Soft}`}>{empty}</div>}
      {lines.map((l) => (
        <div key={l.id} data-line={l.id} data-slot="cart-row" className="flex items-center gap-3 p-3">
          <span onClick={stop} className="flex">
            <Checkbox aria-label={l.name} checked={l.on} onCheckedChange={(on: boolean) => edit(l.id, { on })} />
          </span>
          <Picture alt={l.name} className="size-16 shrink-0 rounded-md" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div data-slot="cart-row-title" className="text-body-medium truncate">{l.name}</div>
            {l.spec && <div data-slot="cart-row-subtitle" className={`text-body-small truncate ${Soft}`}>{l.spec}</div>}
            <div className="flex items-center justify-between gap-1" onClick={stop}>
              <span data-slot="cart-row-price" className="text-title-small text-primary">
                {currency}
                {l.price.toFixed(2)}
              </span>
              <span className="flex items-center">
                <Button variant="text" size="icon-xs" aria-label="Decrease" disabled={l.count <= 1} onClick={() => edit(l.id, { count: l.count - 1 })}>
                  <WidgetIcon name="remove" />
                </Button>
                <span className="text-label-large w-6 text-center tabular-nums">{l.count}</span>
                <Button variant="text" size="icon-xs" aria-label="Increase" onClick={() => edit(l.id, { count: l.count + 1 })}>
                  <WidgetIcon name="add" />
                </Button>
                <Button variant="text" size="icon-xs" aria-label="Remove" onClick={() => setLines((all) => all.filter((x) => x.id !== l.id))}>
                  <WidgetIcon name="delete" />
                </Button>
              </span>
            </div>
          </div>
        </div>
      ))}
      <div data-slot="cart-list-footer" className="bg-surface-container flex items-center gap-3 p-3">
        <label className="text-label-large flex items-center gap-2" onClick={stop}>
          <Checkbox checked={lines.length > 0 && picked.length === lines.length} disabled={!lines.length} onCheckedChange={(on: boolean) => setLines((all) => all.map((l) => ({ ...l, on })))} />
          {selectAll}
        </label>
        <div className="ml-auto text-right">
          <div className={`text-label-small ${Soft}`}>{total}</div>
          <div className="text-title-medium text-primary tabular-nums">
            {currency}
            {sum.toFixed(2)}
          </div>
        </div>
        {action && (
          <Button variant="filled" size="sm" data-tap="action" disabled={!pieces}>
            {action} ({pieces})
          </Button>
        )}
      </div>
    </div>
  );
}

const STUB = 104;

/* Whether the coupon is claimed is the back end's to say (`claimed`): its button only asks. A prototype's demo shows
 * it claimed at once; a product waits for `claimed`, so a refused claim never looks like a success. */
export function Coupon({ amount = "", condition = "", title = "", expiry = "", action = "", done = "", claimed: given = false, width = 340, demo, onValueChange, onEvent, className, style }: { amount?: string; condition?: string; title?: string; expiry?: string; action?: string; done?: string; claimed?: boolean; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent });
  const [claimedHere, setClaimedHere] = useState(false);
  const claimed = given || (host.demo && claimedHere);
  /* the ticket's two bites are cut from the part itself, so they show whatever is behind it */
  const bite = (y: string) => `radial-gradient(circle 8px at ${STUB}px ${y}, transparent 7.5px, black 8px)`;
  return (
    <div data-slot="coupon" data-claimed={claimed || undefined} className={cn("bg-primary-container text-on-primary-container flex min-h-24 rounded-lg", className)} style={{ width, maskImage: `${bite("0")}, ${bite("100%")}`, maskComposite: "intersect", WebkitMaskComposite: "source-in", ...style }}>
      <div data-slot="coupon-stub" className="flex shrink-0 flex-col items-center justify-center gap-0.5 p-2 text-center" style={{ width: STUB }}>
        <span data-slot="coupon-value" className="text-headline-small">{amount}</span>
        {condition && <span data-slot="coupon-condition" className={`text-label-small ${Soft}`}>{condition}</span>}
      </div>
      <div data-slot="coupon-body" className="flex min-w-0 flex-1 items-center gap-2 border-l border-dashed border-current p-3">
        <div className="min-w-0 flex-1">
          <div data-slot="coupon-title" className="text-title-small line-clamp-2">{title}</div>
          {expiry && <div data-slot="coupon-meta" className={`text-body-small truncate ${Soft}`}>{expiry}</div>}
        </div>
        {action && (
          <Button variant={claimed ? "tonal" : "filled"} size="xs" data-tap="action" disabled={claimed} className="shrink-0" onClick={host.demo ? () => setClaimedHere(true) : undefined}>
            {claimed ? done || action : action}
          </Button>
        )}
      </div>
    </div>
  );
}

export function CheckoutBar({ label = "", amount = "", note = "", icons = [], action = "", done = "", width = 412, className, style }: { label?: string; amount?: string; note?: string; icons?: { label: string; icon?: string }[]; action?: string; done?: string; width?: number } & Look) {
  const [pressed, setPressed] = useState<number[]>([]);
  const [placed, setPlaced] = useState(false);
  return (
    <div data-slot="checkout-bar" data-placed={placed || undefined} data-pressed={pressed.join(",")} className={cn("bg-surface-container text-on-surface flex min-h-16 items-center gap-2 px-3 py-2", className)} style={{ width, ...style }}>
      {icons.map((it, i) => {
        const on = pressed.includes(i);
        return (
          <Tap key={i} data-tap={`tab:${i}`} aria-pressed={on} className="text-label-small flex w-12 shrink-0 flex-col items-center gap-0.5 rounded-md py-1" onClick={() => setPressed((all) => (on ? all.filter((x) => x !== i) : [...all, i]))}>
            {it.icon && <Glyph name={it.icon} filled={on} className={cn("size-5", on && "text-primary")} />}
            <span className="w-full truncate">{it.label}</span>
          </Tap>
        );
      })}
      <div className="ml-auto min-w-0 text-right">
        <div className="flex items-baseline justify-end gap-1">
          {label && <span className={`text-label-medium ${Soft}`}>{label}</span>}
          <span data-slot="checkout-bar-price" className="text-title-large text-primary tabular-nums">{amount}</span>
        </div>
        {note && <div data-slot="checkout-bar-meta" className={`text-label-small truncate ${Soft}`}>{note}</div>}
      </div>
      {action && (
        <Button variant={placed ? "tonal" : "filled"} size="sm" data-tap="action" className="shrink-0" onClick={() => done && setPlaced((p) => !p)}>
          {placed ? done : action}
        </Button>
      )}
    </div>
  );
}

/* ---------- money ---------- */

/* Whether the amount is hidden is the visitor's (`hidden`, an input): the eye hands the other one out. */
export function BalanceCard({ title = "", amount = "", change = "", actions = [], hidden = false, width = 380, demo, onValueChange, onEvent, wired, className, style }: { title?: string; amount?: string; change?: string; actions?: { label: string; icon?: string }[]; hidden?: boolean; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [masked, setMasked] = useValue(hidden, host);
  return (
    <div data-slot="balance-card" data-masked={masked || undefined} className={cn("bg-primary-container text-on-primary-container flex flex-col gap-3 rounded-xl p-4", className)} style={{ width, ...style }}>
      <div data-slot="balance-card-header" className="flex items-center gap-1">
        <span data-slot="balance-card-title" className="text-label-large">{title}</span>
        <Button
          variant="text"
          size="icon-xs"
          aria-label={masked ? "Show" : "Hide"}
          aria-pressed={masked}
          className="text-inherit"
          onClick={(e) => {
            stop(e);
            setMasked(!masked);
          }}
        >
          <WidgetIcon name={masked ? "visibility_off" : "visibility"} />
        </Button>
      </div>
      <div className="flex flex-wrap items-baseline gap-2">
        <span data-slot="balance-card-value" className="text-display-small tabular-nums">{masked ? "••••••" : amount}</span>
        {change && <span data-slot="balance-card-meta" className="text-label-large">{masked ? "••" : change}</span>}
      </div>
      {actions.length > 0 && (
        <div className="flex gap-1">
          {actions.map((a, i) => (
            <Tap key={i} data-tap={`tab:${i}`} data-slot="balance-card-action" className="text-label-medium flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg p-2">
              <span data-slot="balance-card-glyph" className="flex size-10 items-center justify-center rounded-full bg-current/10">{a.icon && <WidgetIcon name={a.icon} className="size-5" />}</span>
              <span className="w-full truncate">{a.label}</span>
            </Tap>
          ))}
        </div>
      )}
    </div>
  );
}

/** whether a row is money in: its own column says so ("in", "out"); an older table with no such column, its sign */
const incoming = (r: string[]) => {
  const kind = (r[3] ?? "").trim().toLowerCase();
  return kind ? kind === "in" || kind === "income" : amountOf(r[2]) > 0;
};

/* Which filter is on is the visitor's (`filter`, an input, which a data source can read as a parameter): the rows are
 * the ones given. Only a prototype's demo filters the design's own rows, by their in/out column. */
export function TransactionList({ rows = [], filters = [], filter = 0, width = 380, demo, onValueChange, onEvent, wired, className, style }: { rows?: string[][]; filters?: string[]; filter?: number; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [on, setOn] = useValue(filter, host);
  /* the first filter is everything, the second money in, the third money out */
  const shown = rows.map((r, i) => ({ r, i })).filter(({ r }) => !host.demo || on <= 0 || on > 2 || (on === 1 ? incoming(r) : !incoming(r)));
  return (
    <div data-slot="transaction-list" data-filter={on} data-shown={shown.length} className={cn("bg-surface-container-low text-on-surface flex flex-col gap-1 rounded-xl p-2", className)} style={{ width, ...style }}>
      {filters.length > 0 && (
        <div className="flex flex-wrap gap-2 p-1" onClick={stop}>
          {filters.map((f, i) => (
            <FilterChip key={i} pressed={i === on} onPressedChange={() => setOn(i)}>
              {f}
            </FilterChip>
          ))}
        </div>
      )}
      {shown.map(({ r, i }) => {
        const income = incoming(r);
        return (
          <Tap key={i} data-tap={`tab:${i}`} data-slot="transaction-row" className="flex w-full items-center gap-3 rounded-lg p-2 text-left">
            <span data-slot="transaction-row-glyph" className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", income ? "bg-primary-container text-on-primary-container" : "bg-surface-container-high text-on-surface-variant")}>
              <WidgetIcon name={income ? "south_west" : "north_east"} className="size-5" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span data-slot="transaction-row-title" className="text-body-large truncate">{r[0] ?? ""}</span>
              {r[1] && <span data-slot="transaction-row-subtitle" className={`text-body-small truncate ${Soft}`}>{r[1]}</span>}
            </span>
            <span data-slot="transaction-row-value" className={cn("text-title-small shrink-0 tabular-nums", income && "text-primary")}>{r[2] ?? ""}</span>
          </Tap>
        );
      })}
    </div>
  );
}

/* ---------- getting somewhere ---------- */

/* Whether it is booked is the other side's (`booked`): the button only asks. A prototype's demo books it itself. */
export function RouteCard({ icon = "", from = "", fromTime = "", to = "", toTime = "", duration = "", note = "", price = "", action = "", done = "", booked: given = false, width = 380, demo, onValueChange, onEvent, wired, className, style }: { icon?: string; from?: string; fromTime?: string; to?: string; toTime?: string; duration?: string; note?: string; price?: string; action?: string; done?: string; booked?: boolean; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [mine, setMine] = useSeeded(given);
  const booked = host.demo ? mine : given;
  return (
    <div data-slot="route-card" data-booked={booked || undefined} className={cn("bg-surface-container-low text-on-surface flex flex-col gap-3 rounded-xl p-4", className)} style={{ width, ...style }}>
      <div className="flex items-stretch gap-3">
        <div className="flex w-12 shrink-0 flex-col justify-between">
          <span className="text-title-small tabular-nums">{fromTime}</span>
          <span className="text-title-small tabular-nums">{toTime}</span>
        </div>
        <div className="flex flex-col items-center py-1.5">
          <span className="border-primary size-2.5 rounded-full border-2" />
          <span className="bg-outline-variant my-1 min-h-8 w-0.5 flex-1" />
          <span className="bg-primary size-2.5 rounded-full" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
          <span className="text-body-large truncate">{from}</span>
          {duration && (
            <span className={`text-label-medium flex items-center gap-1 ${Soft}`}>
              {icon && <WidgetIcon name={icon} className="size-4" />}
              {duration}
            </span>
          )}
          <span className="text-body-large truncate">{to}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          {price && <div data-slot="route-card-price" className="text-title-medium text-primary tabular-nums">{price}</div>}
          {note && <div data-slot="route-card-meta" className={`text-body-small truncate ${Soft}`}>{note}</div>}
        </div>
        {action && (
          <Button variant={booked ? "tonal" : "filled"} size="sm" data-tap="action" className="shrink-0" onClick={() => host.demo && done && setMine((b) => !b)}>
            {booked ? done || action : action}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ---------- people ---------- */

/* Whether it is followed is the other side's (`following`): the button only asks. A prototype's demo flips it itself. */
export function ProfileHeader({ cover = "", showCover = true, avatar = "", name = "", bio = "", stats = [], action = "", done = "", following = false, width = 380, demo, onValueChange, onEvent, wired, className, style }: { cover?: string; showCover?: boolean; avatar?: string; name?: string; bio?: string; stats?: string[]; action?: string; done?: string; following?: boolean; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [mine, setMine] = useSeeded(following);
  const on = host.demo ? mine : following;
  return (
    <div data-slot="profile-header" data-following={on || undefined} className={cn("bg-surface-container-low text-on-surface flex flex-col overflow-hidden rounded-xl", className)} style={{ width, ...style }}>
      {showCover && (
        <span data-slot="profile-header-media" className="flex">
          <Picture src={cover} alt="" className="h-28 w-full" />
        </span>
      )}
      <div className="flex flex-col gap-3 p-4">
        <div className={cn("flex items-end justify-between gap-3", showCover && "-mt-11")}>
          <span className="ring-surface-container-low rounded-full ring-4">
            <Face name={name} image={avatar} size="lg" />
          </span>
          {action && (
            <Button variant={on ? "tonal" : "filled"} size="xs" data-tap="action" onClick={() => host.demo && setMine((f) => !f)}>
              {on ? done || action : action}
            </Button>
          )}
        </div>
        <div>
          <div data-slot="profile-header-title" className="text-title-large">{name}</div>
          {bio && <div data-slot="profile-header-subtitle" className={`text-body-medium ${Soft}`}>{bio}</div>}
        </div>
        {stats.length > 0 && (
          <div className="flex gap-1">
            {stats.map((s, i) => {
              const gap = s.indexOf(" ");
              return (
                <Tap key={i} data-tap={`tab:${i}`} data-slot="profile-header-stat" className="flex min-w-0 flex-1 flex-col items-center rounded-md py-1">
                  <span data-slot="profile-header-value" className="text-title-medium">{gap > 0 ? s.slice(0, gap) : s}</span>
                  {gap > 0 && <span className={`text-label-small w-full truncate ${Soft}`}>{s.slice(gap + 1)}</span>}
                </Tap>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** a count beside an icon, at the foot of a post or a comment */
function Tally({ icon, count, on, label, tap, onPress, onClick }: { icon: string; count?: number; on?: boolean; label: string; tap?: string; onPress?: () => void; onClick?: (e: MouseEvent) => void }) {
  return (
    <Tap
      data-tap={tap}
      aria-label={label}
      aria-pressed={on}
      className={cn("text-label-medium flex items-center gap-1 rounded-full px-2 py-1 tabular-nums", on && "text-error")}
      onClick={
        onClick ??
        ((e) => {
          if (!tap) stop(e);
          onPress?.();
        })
      }
    >
      <Glyph name={icon} filled={on} className="size-5" />
      {count !== undefined && count}
    </Tap>
  );
}

/* Whether it is liked or saved, and how many like it, are the other side's (`liked`, `saved`, `likes`): the heart and
 * the bookmark are places of their own (`like`, `save`) that only ask. A prototype's demo flips them itself and counts
 * its own like. */
export function PostCard({ author = "", time = "", text = "", image = "", showImage = true, likes = 0, comments = 0, shares = 0, liked = false, saved = false, width = 380, demo, onValueChange, onEvent, wired, className, style }: { author?: string; time?: string; text?: string; image?: string; showImage?: boolean; likes?: number; comments?: number; shares?: number; liked?: boolean; saved?: boolean; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [mine, setMine] = useSeeded({ from: [liked, saved, likes], liked, saved });
  const heart = host.demo ? mine.liked : liked;
  const kept = host.demo ? mine.saved : saved;
  /* the demo's own like counts once */
  const count = host.demo ? likes + (mine.liked ? 1 : 0) - (liked ? 1 : 0) : likes;
  return (
    <div data-slot="post-card" data-liked={heart || undefined} data-kept={kept || undefined} className={cn("bg-surface-container-low text-on-surface flex flex-col gap-3 rounded-xl p-4", className)} style={{ width, ...style }}>
      <Tap data-tap="author" data-slot="post-card-header" className="flex items-center gap-3 self-start rounded-md text-left">
        <Face name={author} />
        <span className="flex min-w-0 flex-col">
          <span data-slot="post-card-title" className="text-title-small truncate">{author}</span>
          {time && <span data-slot="post-card-meta" className={`text-body-small truncate ${Soft}`}>{time}</span>}
        </span>
      </Tap>
      {text && <div data-slot="post-card-description" className="text-body-medium whitespace-pre-wrap">{text}</div>}
      {showImage && (
        <span data-slot="post-card-media" className="flex">
          <Picture src={image} alt="" className="h-44 w-full rounded-lg" />
        </span>
      )}
      <div data-slot="post-card-actions" className="flex items-center gap-1">
        <Tally icon="favorite" label="Like" tap="like" count={Math.max(0, count)} on={heart} onClick={host.own("like", () => host.demo && setMine((m) => ({ ...m, liked: !m.liked })))} />
        <Tally icon="chat_bubble" label="Comment" count={comments} tap="comment" />
        <Tally icon="share" label="Share" count={shares} tap="share" />
        <Button variant="text" size="icon-sm" aria-label="Save" aria-pressed={kept} data-tap="save" className="ml-auto" onClick={host.own("save", () => host.demo && setMine((m) => ({ ...m, saved: !m.saved })))}>
          <Glyph name="bookmark" filled={kept} />
        </Button>
      </div>
    </div>
  );
}

/* The open conversation is `selected`, which whoever draws the list moves when a row is tapped, and how many are unread
 * is the data's: opening a row asks, and its count goes when the data says so. */
export function ConversationList({ rows = [], selected = -1, width = 380, className, style }: { rows?: string[][]; selected?: number; width?: number } & Look) {
  const on = selected;
  return (
    <div data-slot="conversation-list" data-selected={on} className={cn("bg-surface-container-low text-on-surface flex flex-col gap-0.5 rounded-xl p-2", className)} style={{ width, ...style }}>
      {rows.map((r, i) => {
        const unread = Math.max(0, Math.round(amountOf(r[3])));
        return (
          <Tap key={i} data-tap={`tab:${i}`} aria-current={i === on || undefined} data-slot="conversation-row" className={cn("flex w-full items-center gap-3 rounded-lg p-2 text-left", i === on && "bg-secondary-container text-on-secondary-container")}>
            <Face name={r[0] ?? ""} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span data-slot="conversation-row-title" className={cn("text-body-large truncate", unread > 0 && "font-medium")}>{r[0] ?? ""}</span>
              <span data-slot="conversation-row-subtitle" className={`text-body-small truncate ${Soft}`}>{r[1] ?? ""}</span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <span data-slot="conversation-row-meta" className={`text-label-small ${Soft}`}>{r[2] ?? ""}</span>
              {unread > 0 && <span data-slot="conversation-row-badge" className="bg-primary text-on-primary text-label-small flex h-4 min-w-4 items-center justify-center rounded-full px-1">{unread}</span>}
            </span>
          </Tap>
        );
      })}
    </div>
  );
}

export function ContactList({ rows = [], search = "", grouped = true, trailing = "follow", action = "", done = "", width = 380, className, style }: { rows?: string[][]; search?: string; grouped?: boolean; trailing?: string; action?: string; done?: string; width?: number } & Look) {
  const [query, setQuery] = useState("");
  const [followed, setFollowed] = useState<number[]>([]);
  const people = rows.map((r, i) => ({ name: r[0] ?? "", note: r[1] ?? "", i }));
  const shown = people.filter((c) => `${c.name} ${c.note}`.toLowerCase().includes(query.trim().toLowerCase()));
  const ordered = grouped ? shown.toSorted((a, b) => a.name.localeCompare(b.name)) : shown;
  const icon = trailing === "call" ? "call" : trailing === "message" ? "chat" : "";
  return (
    <div data-slot="contact-list" data-shown={shown.length} data-followed={followed.join(",")} className={cn("bg-surface-container-low text-on-surface flex flex-col gap-0.5 rounded-xl p-2", className)} style={{ width, ...style }}>
      {search && (
        <div className="p-1" onClick={stop}>
          <Input size="sm" type="search" value={query} placeholder={search} aria-label={search} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}
      {ordered.map((c, k) => {
        const letter = lettersOf(c.name).slice(0, 1);
        const on = followed.includes(c.i);
        return (
          <div key={c.i}>
            {grouped && (k === 0 || lettersOf(ordered[k - 1].name).slice(0, 1) !== letter) && <div data-slot="contact-list-header" className={`text-label-medium px-2 pt-2 pb-1 ${Soft}`}>{letter}</div>}
            <div data-slot="contact-row" className="flex items-center gap-1">
              <Tap data-tap={`tab:${c.i}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-2 text-left">
                <Face name={c.name} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span data-slot="contact-row-title" className="text-body-large truncate">{c.name}</span>
                  {c.note && <span data-slot="contact-row-subtitle" className={`text-body-small truncate ${Soft}`}>{c.note}</span>}
                </span>
              </Tap>
              {icon && (
                <Button variant="text" size="icon-sm" aria-label={icon} data-tap={`act:${c.i}`}>
                  <WidgetIcon name={icon} />
                </Button>
              )}
              {trailing === "follow" && action && (
                <Button
                  variant={on ? "tonal" : "filled"}
                  size="xs"
                  className="mr-1 shrink-0"
                  onClick={(e) => {
                    stop(e);
                    setFollowed((all) => (on ? all.filter((x) => x !== c.i) : [...all, c.i]));
                  }}
                >
                  {on ? done || action : action}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CommentList({ rows = [], you = "", now = "", reply = "", placeholder = "", width = 380, className, style }: { rows?: string[][]; you?: string; now?: string; reply?: string; placeholder?: string; width?: number } & Look) {
  const seed = rows.map((r, id) => ({ id, name: r[0] ?? "", time: r[1] ?? "", text: r[2] ?? "", likes: Math.round(amountOf(r[3])), liked: false }));
  const [all, setAll] = useSeeded(seed);
  const [draft, setDraft] = useState("");
  const [to, setTo] = useState("");
  const field = useRef<HTMLDivElement>(null);
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setAll((list) => [...list, { id: list.length ? Math.max(...list.map((c) => c.id)) + 1 : 0, name: you, time: now, text: to ? `@${to} ${text}` : text, likes: 0, liked: false }]);
    setDraft("");
    setTo("");
  };
  return (
    <div data-slot="comment-list" data-count={all.length} className={cn("bg-surface-container-low text-on-surface flex flex-col gap-3 rounded-xl p-4", className)} style={{ width, ...style }}>
      {all.map((c) => (
        <div key={c.id} data-comment={c.id} className="flex gap-3">
          <Face name={c.name} size="sm" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-baseline gap-2">
              <span className="text-title-small truncate">{c.name}</span>
              <span className={`text-label-small shrink-0 ${Soft}`}>{c.time}</span>
            </div>
            <div className="text-body-medium whitespace-pre-wrap">{c.text}</div>
            <div className="-ml-2 flex items-center gap-1">
              <Tally icon="favorite" label="Like" count={c.likes + (c.liked ? 1 : 0)} on={c.liked} onPress={() => setAll((list) => list.map((x) => (x.id === c.id ? { ...x, liked: !x.liked } : x)))} />
              {reply && (
                <Button
                  variant="text"
                  size="xs"
                  onClick={(e) => {
                    stop(e);
                    setTo(c.name);
                    field.current?.querySelector("input")?.focus();
                  }}
                >
                  {reply}
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
      <div ref={field} className="flex items-center gap-1" onClick={stop}>
        <Input
          size="sm"
          value={draft}
          placeholder={to ? `@${to}` : placeholder}
          aria-label={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            send();
          }}
        />
        <Button variant="text" size="icon-sm" aria-label="Send" disabled={!draft.trim()} onClick={send}>
          <WidgetIcon name="send" />
        </Button>
      </div>
    </div>
  );
}

/* Which stories are seen is the data's (a row's state, `seen`): opening one asks. A prototype's demo marks a story seen
 * itself, by the story's name, so a story keeps its ring when the row moves. */
export function StoryRow({ items = [], add = true, width = 380, demo, onValueChange, onEvent, wired, className, style }: { items?: (string | { label: string; seen?: boolean })[]; add?: boolean; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const rows = items.map((x) => (typeof x === "string" ? { label: x, seen: false } : { label: x.label, seen: !!x.seen }));
  const keys = keysOf(rows.map((r) => r.label));
  const [seen, setSeen] = usePicked(keys);
  return (
    <div data-slot="story-row" data-seen={rows.flatMap((r, i) => (r.seen || (host.demo && seen.includes(keys[i])) ? [i] : [])).join(",")} className={cn("text-on-surface flex gap-3 overflow-x-auto rounded-lg p-2", className)} style={{ width, scrollbarWidth: "none", ...style }}>
      {rows.map((r, i) => {
        const own = add && i === 0;
        const viewed = r.seen || (host.demo && seen.includes(keys[i]));
        return (
          <Tap key={keys[i]} data-tap={`tab:${i}`} className="text-label-small flex w-16 shrink-0 flex-col items-center gap-1.5 rounded-md p-1" onClick={() => host.demo && !own && !viewed && setSeen((all) => [...all, keys[i]])}>
            <span data-slot="story-row-ring" data-seen={viewed || undefined} data-own={own || undefined} className={cn("relative flex rounded-full p-0.5 ring-2", own ? "ring-transparent" : viewed ? "ring-outline-variant" : "ring-primary")}>
              <Face name={r.label} />
              {own && (
                <span className="bg-primary text-on-primary absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full">
                  <WidgetIcon name="add" className="size-3" />
                </span>
              )}
            </span>
            <span className="w-full truncate text-center">{r.label}</span>
          </Tap>
        );
      })}
    </div>
  );
}

/* ---------- things that arrive, and things that stay ---------- */

export function NotificationList({ title = "", rows = [], unread = 0, markAll = "", width = 380, className, style }: { title?: string; rows?: string[][]; unread?: number; markAll?: string; width?: number } & Look) {
  const seed = rows.map((_, i) => i).filter((i) => i < unread);
  const [waiting, setWaiting] = useSeeded(seed);
  return (
    <div data-slot="notification-list" data-unread={waiting.length} className={cn("bg-surface-container-low text-on-surface flex flex-col gap-1 rounded-xl p-2", className)} style={{ width, ...style }}>
      {(title || markAll) && (
        <div data-slot="notification-list-header" className="flex min-h-10 items-center gap-2 pl-2">
          <span data-slot="notification-list-title" className="text-title-medium truncate">{title}</span>
          {waiting.length > 0 && <span data-slot="notification-list-badge" className="bg-error text-on-error text-label-small flex h-4 min-w-4 items-center justify-center rounded-full px-1">{waiting.length}</span>}
          {markAll && (
            <Button
              variant="text"
              size="xs"
              className="ml-auto shrink-0"
              disabled={!waiting.length}
              onClick={(e) => {
                stop(e);
                setWaiting([]);
              }}
            >
              {markAll}
            </Button>
          )}
        </div>
      )}
      {rows.map((r, i) => {
        const fresh = waiting.includes(i);
        return (
          <Tap key={i} data-tap={`tab:${i}`} data-slot="notification-row" data-unread={fresh || undefined} className={cn("flex w-full items-start gap-3 rounded-lg p-2 text-left", fresh && "bg-surface-container-high")} onClick={() => setWaiting((all) => all.filter((x) => x !== i))}>
            <span data-slot="notification-row-glyph" className="bg-secondary-container text-on-secondary-container flex size-10 shrink-0 items-center justify-center rounded-full">
              <WidgetIcon name={r[3] || "notifications"} className="size-5" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-baseline gap-2">
                <span data-slot="notification-row-title" className={cn("text-body-large min-w-0 flex-1 truncate", fresh && "font-medium")}>{r[0] ?? ""}</span>
                <span data-slot="notification-row-meta" className={`text-label-small shrink-0 ${Soft}`}>{r[2] ?? ""}</span>
              </span>
              <span data-slot="notification-row-subtitle" className={`text-body-small line-clamp-2 ${Soft}`}>{r[1] ?? ""}</span>
            </span>
            {fresh && <span data-slot="notification-row-indicator" className="bg-primary mt-2 size-2 shrink-0 rounded-full" />}
          </Tap>
        );
      })}
    </div>
  );
}

const KIND_ICONS: Record<string, string> = { pdf: "picture_as_pdf", png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image", zip: "folder_zip", rar: "folder_zip", mp4: "movie", mov: "movie", mp3: "audio_file", wav: "audio_file", xls: "table_chart", xlsx: "table_chart", csv: "table_chart" };

/** the icon of a file, from its extension; a name without one is a folder */
const fileIcon = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? (KIND_ICONS[name.slice(dot + 1).toLowerCase()] ?? "description") : "folder";
};

/* The open file is `selected`, which whoever draws the list moves, and which files there are is the data's: a remove
 * button (one action for all of them, `slot.index` is the row) only asks, and the row goes when the data says so. A
 * prototype's demo hides a removed file itself, by its name, so it stays hidden when the rows move. */
export function FileList({ rows = [], selected = -1, removable = true, width = 380, demo, onValueChange, onEvent, wired, className, style }: { rows?: string[][]; selected?: number; removable?: boolean; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const on = selected;
  const keys = keysOf(rows.map((r) => r[0] ?? ""));
  const [gone, setGone] = usePicked(keys);
  const hidden = (i: number) => host.demo && gone.includes(keys[i]);
  return (
    <div data-slot="file-list" data-selected={on} data-count={rows.filter((_, i) => !hidden(i)).length} className={cn("bg-surface-container-low text-on-surface flex flex-col gap-0.5 rounded-xl p-2", className)} style={{ width, ...style }}>
      {rows.map((r, i) =>
        hidden(i) ? null : (
          <div key={keys[i]} data-slot="file-row" className={cn("flex items-center gap-1 rounded-lg", i === on && "bg-secondary-container text-on-secondary-container")}>
            <Tap data-tap={`tab:${i}`} aria-current={i === on || undefined} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-2 text-left">
              <span data-slot="file-row-glyph" className="flex shrink-0">
                <WidgetIcon name={fileIcon(r[0] ?? "")} className="size-6 shrink-0" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span data-slot="file-row-title" className="text-body-large truncate">{r[0] ?? ""}</span>
                <span data-slot="file-row-meta" className={`text-body-small truncate ${Soft}`}>{[r[1], r[2]].filter(Boolean).join(" · ")}</span>
              </span>
            </Tap>
            {removable && (
              <Button variant="text" size="icon-sm" aria-label="Remove" data-tap={`remove:${i}`} onClick={host.own(`remove:${i}`, () => host.demo && setGone((all) => [...all, keys[i]]))}>
                <WidgetIcon name="delete" />
              </Button>
            )}
          </div>
        ),
      )}
    </div>
  );
}

const SETTLED = new Set(["switch", "check"]);

export function SettingsGroup({ title = "", rows = [], width = 380, className, style }: { title?: string; rows?: string[][]; width?: number } & Look) {
  const seed = rows.map((r) => (SETTLED.has(r[2]) ? r[3] === "on" : false));
  const [states, setStates] = useSeeded(seed);
  const flip = (i: number) => setStates((all) => all.map((v, k) => (k === i ? !v : v)));
  return (
    <div data-slot="settings-group" data-on={states.flatMap((v, i) => (v ? [i] : [])).join(",")} className={cn("bg-surface-container-low text-on-surface flex flex-col rounded-xl p-2", className)} style={{ width, ...style }}>
      {title && <div data-slot="settings-group-title" className={`text-label-large px-2 py-1 ${Soft}`}>{title}</div>}
      {rows.map((r, i) => {
        const [icon, label, control, value] = [r[0] ?? "", r[1] ?? "", r[2] ?? "arrow", r[3] ?? ""];
        const head = (
          <>
            {icon && (
              <span data-slot="settings-row-glyph" className="flex shrink-0">
                <WidgetIcon name={icon} className="size-6 shrink-0" />
              </span>
            )}
            <span data-slot="settings-row-title" className="text-body-large min-w-0 flex-1 truncate text-left">{label}</span>
          </>
        );
        if (control === "switch")
          return (
            <div key={i} data-slot="settings-row" className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-1" onClick={stop}>
              {head}
              <Switch aria-label={label} checked={states[i] ?? false} onCheckedChange={() => flip(i)} />
            </div>
          );
        if (control === "check")
          return (
            <Tap key={i} role="checkbox" aria-checked={states[i] ?? false} data-slot="settings-row" className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 py-1" onClick={(e) => (stop(e), flip(i))}>
              {head}
              {states[i] && <WidgetIcon name="check" className="text-primary size-6" />}
            </Tap>
          );
        return (
          <Tap key={i} data-tap={`tab:${i}`} data-slot="settings-row" className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 py-1">
            {head}
            {value && <span data-slot="settings-row-value" className={`text-body-medium truncate ${Soft}`}>{value}</span>}
            {control !== "value" && (
              <span data-slot="settings-row-chevron" className="flex shrink-0">
                <WidgetIcon name="chevron_right" className={`size-5 shrink-0 ${Soft}`} />
              </span>
            )}
          </Tap>
        );
      })}
    </div>
  );
}

/* The current row is `selected` (whoever draws the list moves it) and whether it plays is the other side's
 * (`playing`): a press on a row sends `play` with the row and whether it should play now. A prototype's demo plays and
 * pauses by itself. */
export function Playlist({ title = "", rows = [], selected = 0, playing: given = false, width = 380, demo, onValueChange, onEvent, wired, className, style }: { title?: string; rows?: string[][]; selected?: number; playing?: boolean; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const on = selected;
  const [mine, setMine] = useSeeded(given);
  const playing = host.demo ? mine : given;
  const done = rows.filter((r) => r[3] === "done").length;
  return (
    <div data-slot="playlist" data-selected={on} data-playing={playing || undefined} className={cn("bg-surface-container-low text-on-surface flex flex-col gap-0.5 rounded-xl p-2", className)} style={{ width, ...style }}>
      {title && (
        <div data-slot="playlist-header" className="flex items-baseline justify-between gap-2 px-2 py-1">
          <span data-slot="playlist-title" className="text-title-medium truncate">{title}</span>
          {done > 0 && <span data-slot="playlist-meta" className={`text-label-medium shrink-0 ${Soft}`}>{done} / {rows.length}</span>}
        </div>
      )}
      {rows.map((r, i) => {
        const locked = r[3] === "locked";
        const current = i === on;
        return (
          <Tap
            key={i}
            data-tap={`tab:${i}`}
            disabled={locked}
            aria-current={current || undefined}
            className={cn("flex w-full items-center gap-3 rounded-lg p-2 text-left", current && "bg-secondary-container text-on-secondary-container", locked && "opacity-50")}
            onClick={() => {
              const next = current ? !playing : true;
              host.emit("play", { index: i, playing: next });
              if (host.demo) setMine(next);
            }}
          >
            <span className="text-label-large flex size-8 shrink-0 items-center justify-center tabular-nums">
              {locked ? <WidgetIcon name="lock" className="size-5" /> : current ? <WidgetIcon name={playing ? "pause" : "play_arrow"} className="size-6" /> : r[3] === "done" ? <WidgetIcon name="check" className="text-primary size-5" /> : i + 1}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span data-slot="playlist-row-title" className="text-body-large truncate">{r[0] ?? ""}</span>
              {r[1] && <span data-slot="playlist-row-subtitle" className={`text-body-small truncate ${Soft}`}>{r[1]}</span>}
            </span>
            <span data-slot="playlist-row-meta" className={`text-label-medium shrink-0 tabular-nums ${Soft}`}>{r[2] ?? ""}</span>
          </Tap>
        );
      })}
    </div>
  );
}

const PODIUM = ["bg-primary text-on-primary", "bg-secondary-container text-on-secondary-container", "bg-tertiary-container text-on-tertiary-container"];

/* The open row is `selected`, which whoever draws the board moves when a row is tapped (`selectKey`): a copy of its
 * own would keep showing a row the other side never opened. */
export function Leaderboard({ title = "", rows = [], faces = true, selected = -1, width = 380, className, style }: { title?: string; rows?: string[][]; faces?: boolean; selected?: number; width?: number } & Look) {
  const on = selected;
  return (
    <div data-slot="leaderboard" data-selected={on} className={cn("bg-surface-container-low text-on-surface flex flex-col gap-0.5 rounded-xl p-2", className)} style={{ width, ...style }}>
      {title && <div className="text-title-medium px-2 py-1">{title}</div>}
      {rows.map((r, i) => {
        const change = amountOf(r[2]);
        return (
          <Tap key={i} data-tap={`tab:${i}`} aria-current={i === on || undefined} className={cn("flex w-full items-center gap-3 rounded-lg p-2 text-left", i === on && "bg-secondary-container text-on-secondary-container")}>
            <span className={cn("text-label-large flex size-7 shrink-0 items-center justify-center rounded-full tabular-nums", PODIUM[i])}>{i + 1}</span>
            {faces && <Face name={r[0] ?? ""} size="sm" />}
            <span className="text-body-large min-w-0 flex-1 truncate">{r[0] ?? ""}</span>
            {change !== 0 && <WidgetIcon name={change > 0 ? "arrow_upward" : "arrow_downward"} className={cn("size-4 shrink-0", change > 0 ? "text-primary" : "text-error")} />}
            <span className="text-title-small shrink-0 tabular-nums">{r[1] ?? ""}</span>
          </Tap>
        );
      })}
    </div>
  );
}

/* ---------- small measures ---------- */

/* The open row is `selected` (whoever draws the list moves it). A row's share is the data's: its third column ("54%")
 * is what shows, and the bars stand in it; an older table with no shares draws the bars by their values. */
export function BarList({ title = "", rows = [], sorted = true, selected = -1, width = 360, className, style }: { title?: string; rows?: string[][]; sorted?: boolean; selected?: number; width?: number } & Look) {
  const on = selected;
  const shares = rows.every((r) => (r[2] ?? "").trim() !== "");
  const lines = rows.map((r, i) => ({ label: r[0] ?? "", shown: r[1] ?? "", share: r[2] ?? "", value: Math.max(0, amountOf(shares ? r[2] : r[1])), i }));
  const order = sorted ? lines.toSorted((a, b) => b.value - a.value) : lines;
  const top = Math.max(1, ...lines.map((l) => l.value));
  return (
    <div data-slot="bar-list" data-selected={on} className={cn("bg-surface-container-low text-on-surface flex flex-col gap-1 rounded-xl p-3", className)} style={{ width, ...style }}>
      {title && <div className="text-title-small pb-1">{title}</div>}
      {order.map((l) => (
        <Tap key={l.i} data-tap={`tab:${l.i}`} aria-current={l.i === on || undefined} className={cn("flex w-full flex-col gap-1 rounded-md px-1 py-1.5 text-left", l.i === on && "bg-surface-container-high")}>
          <span className="flex items-baseline gap-2">
            <span className="text-body-medium min-w-0 flex-1 truncate">{l.label}</span>
            <span className="text-label-large shrink-0 tabular-nums">{l.i === on && l.share ? l.share : l.shown}</span>
          </span>
          <span className="bg-surface-container-highest block h-1.5 overflow-hidden rounded-full">
            <span className="bg-primary block h-full rounded-full" style={{ width: `${(l.value / top) * 100}%` }} />
          </span>
        </Tap>
      ))}
    </div>
  );
}

const PAD = 4;

export function Sparkline({ title = "", value = "", trend = "", values = [], kind = "line", height = 48, width = 200, className, style }: { title?: string; value?: string; trend?: string; values?: number[]; kind?: string; height?: number; width?: number } & Look) {
  const [at, setAt] = useState(-1);
  /* the box's padding is p-3 either side: the plot is drawn at its real size, so a stroke stays 2px */
  const w = Math.max(24, width - 24);
  const lo = Math.min(...values, 0);
  const hi = Math.max(...values, lo + 1);
  const x = (i: number) => (values.length > 1 ? PAD + (i / (values.length - 1)) * (w - PAD * 2) : w / 2);
  const y = (v: number) => height - PAD - ((v - lo) / (hi - lo)) * (height - PAD * 2);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const bar = values.length ? Math.max(2, (w - PAD * 2) / values.length - 2) : 0;
  const shown = at >= 0 && at < values.length ? String(values[at]) : value;
  const last = at >= 0 ? at : values.length - 1;
  return (
    <div data-slot="sparkline" data-at={at} className={cn("bg-surface-container-low text-on-surface flex flex-col gap-1 rounded-lg p-3", className)} style={{ width, ...style }}>
      {title && <div className={`text-label-medium truncate ${Soft}`}>{title}</div>}
      {(shown || trend) && (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-title-large tabular-nums">{shown}</span>
          {trend && (
            <span className="text-label-medium flex items-center gap-0.5">
              <WidgetIcon name={trend.startsWith("-") ? "arrow_downward" : "arrow_upward"} className={cn("size-3.5", trend.startsWith("-") ? "text-error" : "text-primary")} />
              {trend}
            </span>
          )}
        </div>
      )}
      <svg
        role="img"
        aria-label={`${title} ${values.join(", ")}`.trim()}
        viewBox={`0 0 ${w} ${height}`}
        width={w}
        height={height}
        className="touch-none"
        onPointerMove={(e) => {
          if (!values.length) return;
          const box = e.currentTarget.getBoundingClientRect();
          const share = box.width ? (e.clientX - box.left) / box.width : 0;
          setAt(Math.min(values.length - 1, Math.max(0, Math.round(share * (values.length - 1)))));
        }}
        onPointerLeave={() => setAt(-1)}
      >
        {kind === "bar" ? (
          values.map((v, i) => <rect key={i} x={PAD + (i * (w - PAD * 2)) / values.length + 1} y={y(v)} width={bar} height={Math.max(1, height - PAD - y(v))} rx={2} className={cn("fill-primary", at >= 0 && at !== i && "opacity-40")} />)
        ) : (
          <>
            {kind === "area" && values.length > 1 && <path d={`${line} L${x(values.length - 1).toFixed(1)} ${height - PAD} L${x(0).toFixed(1)} ${height - PAD} Z`} className="fill-primary opacity-15" />}
            <path d={line} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="stroke-primary" />
            {at >= 0 && <line x1={x(at)} x2={x(at)} y1={0} y2={height} strokeWidth={1} className="stroke-outline-variant" />}
            {last >= 0 && <circle cx={x(last)} cy={y(values[last])} r={3} strokeWidth={2} className="fill-primary stroke-surface-container-low" />}
          </>
        )}
      </svg>
    </div>
  );
}

/* ---------- finding your way, and being told things ---------- */

/* An entry's mark (a dot, "New") is the data's, its row's state: opening it asks, and the mark goes when the data
 * says so. A prototype's demo clears the mark itself, by the entry's name. */
export function IconGrid({ items = [], columns = 4, badge = "", width = 380, demo, onValueChange, onEvent, wired, className, style }: { items?: { label: string; icon?: string; mark?: string }[]; columns?: number; badge?: string; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const keys = keysOf(items.map((it) => it.label));
  const [opened, setOpened] = usePicked(keys);
  return (
    <div data-slot="icon-grid" data-opened={items.flatMap((_, i) => (host.demo && opened.includes(keys[i]) ? [i] : [])).join(",")} className={cn("bg-surface-container-low text-on-surface grid gap-1 rounded-xl p-2", className)} style={{ width, gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))`, ...style }}>
      {items.map((it, i) => {
        const mark: ReactNode = host.demo && opened.includes(keys[i]) ? null : it.mark === "dot" ? <span data-slot="icon-grid-dot" className="bg-error absolute top-1 right-1 size-2 rounded-full" /> : it.mark === "new" && badge ? <span data-slot="icon-grid-badge" className="bg-error text-on-error text-label-small absolute -top-0.5 -right-1 rounded-full px-1">{badge}</span> : null;
        return (
          <Tap key={keys[i]} data-tap={`tab:${i}`} data-slot="icon-grid-cell" className="text-label-medium flex min-w-0 flex-col items-center gap-1 rounded-lg p-2" onClick={() => host.demo && setOpened((all) => (all.includes(keys[i]) ? all : [...all, keys[i]]))}>
            <span data-slot="icon-grid-glyph" className="bg-secondary-container text-on-secondary-container relative flex size-12 items-center justify-center rounded-lg">
              {it.icon && <WidgetIcon name={it.icon} className="size-6" />}
              {mark}
            </span>
            <span data-slot="icon-grid-label" className="w-full truncate text-center">{it.label}</span>
          </Tap>
        );
      })}
    </div>
  );
}

/* The close button is a place of its own (`close`): wired, it does what its action does (a hide effect on the banner,
 * which a show effect undoes); with nothing wired the banner closes by itself, as do its buttons with nothing wired to
 * them, and opens again once it is drawn afresh or its words change. */
export function Banner({ icon = "", text = "", action = "", secondary = "", closable = true, width = 412, demo, onValueChange, onEvent, wired, className, style }: { icon?: string; text?: string; action?: string; secondary?: string; closable?: boolean; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [shut, setShut] = useSeeded({ words: [text, action, secondary], closed: false });
  const closed = shut.closed;
  const setClosed = (on: boolean) => setShut((s) => ({ ...s, closed: on }));
  if (closed) return <div data-slot="banner" data-closed="true" style={{ width }} />;
  const close = (slot: string) => () => {
    if (!host.wired(slot)) setClosed(true);
  };
  return (
    <div data-slot="banner" role="status" className={cn("bg-surface-container-high text-on-surface flex flex-col gap-2 rounded-lg p-3", className)} style={{ width, ...style }}>
      <div className="flex items-start gap-3">
        {icon && (
          <span className="bg-primary-container text-on-primary-container flex size-10 shrink-0 items-center justify-center rounded-full">
            <WidgetIcon name={icon} className="size-5" />
          </span>
        )}
        <div className="text-body-medium min-w-0 flex-1 self-center">{text}</div>
        {closable && (
          <Button variant="text" size="icon-sm" aria-label="Close" data-tap="close" className="shrink-0" onClick={host.own("close", close("close"))}>
            <WidgetIcon name="close" />
          </Button>
        )}
      </div>
      {(action || secondary) && (
        <div className="flex justify-end gap-2">
          {secondary && (
            <Button variant="text" size="xs" data-tap="secondary" onClick={close("secondary")}>
              {secondary}
            </Button>
          )}
          {action && (
            <Button variant="tonal" size="xs" data-tap="action" onClick={close("action")}>
              {action}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/* The close button is a place of its own (`close`): wired, it does what its action does (a hide effect on the bar);
 * with nothing wired the bar closes by itself until it is drawn afresh or its notices change. It moves on through its
 * notices by itself, and holds still under the pointer. */
export function NoticeBar({ icon = "", items = [], seconds = 3, closable = true, width = 380, demo, onValueChange, onEvent, wired, className, style }: { icon?: string; items?: string[]; seconds?: number; closable?: boolean; width?: number } & HostProps & Look) {
  const host = useHost({ demo, onValueChange, onEvent, wired });
  const [at, setAt] = useState(0);
  const [shut, setShut] = useSeeded({ words: items, closed: false });
  const closed = shut.closed;
  const setClosed = (on: boolean) => setShut((s) => ({ ...s, closed: on }));
  const [held, setHeld] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    /* on the canvas it is a drawing. Asked for less motion it still changes notice, without the slide */
    if (closed || held || items.length < 2 || box.current?.closest("[inert]")) return;
    const id = setInterval(() => setAt((i) => (i + 1) % items.length), seconds * 1000);
    return () => clearInterval(id);
  }, [closed, held, items.length, seconds]);
  if (closed) return <div data-slot="notice-bar" data-closed="true" style={{ width }} />;
  return (
    <div ref={box} data-slot="notice-bar" data-at={at} className={cn("bg-tertiary-container text-on-tertiary-container flex h-10 items-center gap-2 overflow-hidden rounded-lg pr-1 pl-3", className)} style={{ width, ...style }} onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)}>
      {icon && <WidgetIcon name={icon} className="size-5 shrink-0" />}
      <div className="h-10 min-w-0 flex-1 overflow-hidden" aria-live="off">
        <div className="motion-safe:transition-transform motion-safe:duration-300" style={{ transform: `translateY(${-at * 40}px)` }}>
          {items.map((text, i) => (
            <Tap key={i} data-tap={`tab:${i}`} tabIndex={i === at ? 0 : -1} aria-hidden={i !== at || undefined} className="text-body-medium block h-10 w-full truncate text-left">
              {text}
            </Tap>
          ))}
        </div>
      </div>
      {closable && (
        <Button variant="text" size="icon-xs" aria-label="Close" data-tap="close" className="shrink-0 text-inherit" onClick={host.own("close", () => !host.wired("close") && setClosed(true))}>
          <WidgetIcon name="close" />
        </Button>
      )}
    </div>
  );
}
