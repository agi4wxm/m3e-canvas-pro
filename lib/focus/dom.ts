/* The focus of lib/focus/model.ts run over a page: the editor's preview and the exported web app both hand it the layers
 * on show (a screen, a screen laid over it) and it does the rest: it finds the parts that take the focus in the top layer
 * (and in a menu or a dialog open in it, which then holds the focus), moves over them with the arrow keys and a gamepad,
 * confirms with Enter, Space or A (the focused part's tap: a click on it, as a pointer's), cancels with Escape,
 * Backspace or B, and draws a focus ring over what it is on while a keyboard or a gamepad is in use. A pointer or a
 * finger hides the ring and leaves every key as it was, until a direction is pressed.
 *
 * What a page marks (both hosts mark their parts the same way):
 *   data-focus="<item id>"   a part that takes the focus as a whole ("" when the page has no id for it, "off" never)
 *   data-focus-slots         a part whose places (`data-tap`, a tab of a bar) each take it
 * A text field, a switch or a slider standing on its own takes it as it is. No React; imports the model and the
 * gamepad reader only, so it is copied into an exported app as it is. */

import { FocusNav, cancelOf, inputScope, readingOrder, uiActionOfKey, type Box, type FocusDir, type FocusLayer, type FocusTarget, type FrameFocus, type InputDevice, type ItemFocus, type PadKind, type UiAction } from "./model";
import { PadReader, type PadState } from "./gamepad";

/** A layer the host has on show: its root element (a screen, a screen laid over one) and its screen's focus. */
export type DomLayer = { key: string; root: Element; screen?: FrameFocus };

export type DomFocusHost = {
  /** the layers on show, bottom first; the menus and dialogs open in the top one are found here */
  layers(): DomLayer[];
  /** the keys of the layers not drawn now that will come back (the screens under the one on show): where the focus
   *  was on each is kept for when the visitor goes back to it */
  history?(): string[];
  /** Cancel with nothing of the screen's own to run: closes what is open on top (the open popup is `popup`) or goes
   *  back. False when there was nothing to close or go back from. */
  dismiss(layer: DomLayer, popup: Element | undefined, via: "keyboard" | "gamepad" | "escape"): boolean;
  /** a part's own focus, by its item id */
  part?(id: string): ItemFocus | undefined;
  /** the color of the ring: the style's (M3 draws it in the secondary color) */
  ringColor(): string;
  /** the keys that, while a pointer is in use, show the focus instead of passing through (all four arrows unless said) */
  reveal?: readonly string[];
  /** the device in use changed: the hints follow it */
  onDevice?(device: InputDevice, pad: PadKind): void;
};

/** what stands in a layer's way: a menu, a dialog, a list a select opened */
const POPUPS = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';
/** what takes the focus inside a popup: its places, its entries, its buttons */
const IN_POPUP = '[data-tap]:not([data-tap="self"]), [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], button:not([disabled]), a[href], [data-focus]:not([data-focus="off"])';
/** a control that takes the focus where it stands on its own */
const CONTROLS = 'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [role="switch"], [role="checkbox"], [role="slider"], [role="combobox"], [role="radio"]';
/** what keeps the keys typed into it: a text field, a select, a slider */
const TYPING = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], [role="combobox"], [role="slider"], [role="spinbutton"]';
/** a widget that moves inside itself with the arrow keys and answers Enter and Space (a divider, a row of tabs, a
 *  list, a menu): while it has the page's own focus the keys are its own, as the preview's back keys leave them */
const OWNS_ARROWS = '[role="separator"], [role="tablist"], [role="radiogroup"], [role="listbox"], [role="menu"], [role="menubar"], [role="grid"], [role="tree"], [role="treegrid"], [role="toolbar"], [role="slider"], [role="spinbutton"]';
/** a field of one line, which up and down leave */
const ONE_LINE = 'input:not([type="range"])';

/** the ring stands this far off what it is on, and is this wide (M3's focus indicator: 2dp off, 3dp wide) */
const RING_OFF = 2;
const RING_W = 3;

const visible = (b: Box) => b.w > 0 && b.h > 0;

/** where an element is drawn; one that draws no box of its own (`display: contents`) is where its children are */
function boxOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  if (r.width > 0 || r.height > 0) return { x: r.left, y: r.top, w: r.width, h: r.height };
  let l = Infinity;
  let t = Infinity;
  let rr = -Infinity;
  let b = -Infinity;
  for (const c of Array.from(el.children)) {
    const k = boxOf(c);
    if (!visible(k)) continue;
    l = Math.min(l, k.x);
    t = Math.min(t, k.y);
    rr = Math.max(rr, k.x + k.w);
    b = Math.max(b, k.y + k.h);
  }
  return l === Infinity ? { x: 0, y: 0, w: 0, h: 0 } : { x: l, y: t, w: rr - l, h: b - t };
}

/** the element a ring is drawn round: one that draws no box of its own stands for its first child */
const shapeOf = (el: Element): Element => {
  const r = el.getBoundingClientRect();
  return r.width === 0 && r.height === 0 && el.firstElementChild ? shapeOf(el.firstElementChild) : el;
};

/** an element under an inert screen (one leaving, one under an overlay) takes nothing */
const takes = (el: Element) => !el.closest("[inert]");

type Found = { targets: FocusTarget[]; elements: Map<string, Element> };

/** the targets in a layer's root, in the page's order: the parts, their places, the controls that stand alone */
function targetsIn(root: Element, popup: boolean): Found {
  const targets: FocusTarget[] = [];
  const elements = new Map<string, Element>();
  const add = (key: string, el: Element, part?: string) => {
    if (elements.has(key) || !takes(el)) return;
    const box = boxOf(el);
    if (!visible(box)) return;
    elements.set(key, el);
    targets.push({ key, ...(part ? { part } : {}), box });
  };
  if (popup) {
    root.querySelectorAll(IN_POPUP).forEach((el, i) => {
      const id = el.getAttribute("data-focus");
      add(id ? `part:${id}` : `pop:${i}`, el, id || undefined);
    });
    return { targets, elements };
  }
  let n = 0;
  root.querySelectorAll("[data-focus], [data-focus-slots]").forEach((el) => {
    const id = el.getAttribute("data-focus");
    if (id === "off") return;
    const key = id ? `part:${id}` : `el:${n++}`;
    if (el.hasAttribute("data-focus-slots")) {
      el.querySelectorAll('[data-tap]:not([data-tap="self"])').forEach((slot) => add(`${key}|${slot.getAttribute("data-tap")}`, slot, id || undefined));
      /* a part whose places take the focus is not one target as well, unless it has no place on show */
      if (id !== null && ![...elements.keys()].some((k) => k.startsWith(`${key}|`))) add(key, el, id || undefined);
      return;
    }
    if (id !== null) add(key, el, id || undefined);
  });
  root.querySelectorAll(CONTROLS).forEach((el, i) => {
    if (el.closest("[data-focus], [data-focus-slots]")) return;
    add(`ctl:${i}`, el);
  });
  return { targets, elements };
}

/** The ring's corners: those of what draws the part's shape (the part's box, or the button inside it that fills it),
 *  as far off as the ring stands. */
function radiusOf(el: Element, scale: number): string {
  const view = el.ownerDocument.defaultView ?? window;
  const whole = boxOf(el);
  const queue: Element[] = [shapeOf(el)];
  let r = 0;
  for (let seen = 0; queue.length && seen < 24; seen++) {
    const at = queue.shift()!;
    const b = at.getBoundingClientRect();
    /* only what is about as big as the part draws its outline */
    if (b.width >= whole.w * 0.8 && b.height >= whole.h * 0.8) {
      r = parseFloat(view.getComputedStyle(at).borderTopLeftRadius) || 0;
      if (r) break;
      queue.push(...Array.from(at.children));
    }
  }
  return `${Math.round(Math.min(r * scale, whole.h / 2) + RING_OFF + RING_W)}px`;
}

export type FocusDriver = {
  /** stops listening and takes the ring away */
  stop(): void;
  /** the device in use */
  device(): InputDevice;
  /** what the focus is on: its key on the top layer, and its element */
  focused(): { key: string; element: Element } | null;
  /** does a UI action as a key or a button would (the keyboard's own way in) */
  press(action: UiAction): void;
};

type Win = Window & typeof globalThis;

/** Starts the focus over a page. Keys are taken first (in the capture phase), and only the ones it acts on. */
export function startFocus(host: DomFocusHost, win: Win = window): FocusDriver {
  const doc = win.document;
  const nav = new FocusNav();
  const pads = new PadReader();
  let device: InputDevice = "touch";
  let pad: PadKind = "generic";
  let found = new Map<string, Found>();
  let popups: Element[] = [];
  let synthetic = false;

  /* the ring is made the first time it is drawn: a page a keyboard never reaches has none */
  let ringEl: HTMLDivElement | null = null;
  const ring = (): HTMLDivElement => {
    if (ringEl) return ringEl;
    ringEl = doc.createElement("div");
    ringEl.setAttribute("data-focus-ring", "");
    ringEl.setAttribute("aria-hidden", "true");
    Object.assign(ringEl.style, { position: "fixed", pointerEvents: "none", zIndex: "2147483000", boxSizing: "border-box", display: "none", transition: "left 90ms, top 90ms, width 90ms, height 90ms" });
    doc.body.appendChild(ringEl);
    return ringEl;
  };

  const setDevice = (d: InputDevice, p: PadKind = pad) => {
    if (d === device && p === pad) return;
    device = d;
    pad = p;
    host.onDevice?.(d, p);
    if (d !== "touch") loop();
    else draw();
  };

  /** the layers on show as the model reads them: the host's, and over the top one each popup open in it */
  const read = (): { layers: FocusLayer[]; doms: DomLayer[] } => {
    const doms = host.layers().filter((l) => l.root.isConnected);
    const top = doms[doms.length - 1];
    popups = top ? [...top.root.querySelectorAll(POPUPS)].filter((p) => p !== top.root && visible(boxOf(p)) && targetsIn(p, true).targets.length > 0) : [];
    found = new Map();
    const part = host.part ? (id: string) => host.part!(id) : undefined;
    const layers: FocusLayer[] = doms.map((l) => {
      const f = targetsIn(l.root, false);
      found.set(l.key, f);
      return { key: l.key, targets: f.targets, screen: l.screen, part };
    });
    popups.forEach((p, i) => {
      const key = `${top!.key}>popup:${p.closest("[data-part]")?.getAttribute("data-part") ?? i}`;
      const f = targetsIn(p, true);
      found.set(key, f);
      layers.push({ key, targets: f.targets, part });
    });
    return { layers, doms };
  };

  const elementOf = (key: string | null | undefined): Element | null => {
    const at = nav.current;
    if (!key || !at) return null;
    return found.get(at.layer)?.elements.get(key) ?? null;
  };

  /** the element marked focused (`data-focused`), for a page's own styles and its tests */
  let marked: Element | null = null;
  const mark = (el: Element | null) => {
    if (el === marked) return;
    marked?.removeAttribute("data-focused");
    marked = el;
    el?.setAttribute("data-focused", "");
  };

  const draw = () => {
    const el = device === "touch" ? null : elementOf(nav.current?.key);
    mark(el && el.isConnected ? el : null);
    if (!el || !el.isConnected) {
      if (ringEl) ringEl.style.display = "none";
      return;
    }
    const shape = shapeOf(el);
    const b = boxOf(el);
    const scale = shape instanceof HTMLElement && shape.offsetWidth ? shape.getBoundingClientRect().width / shape.offsetWidth : 1;
    const out = RING_OFF + RING_W;
    Object.assign(ring().style, {
      display: "block",
      left: `${b.x - out}px`,
      top: `${b.y - out}px`,
      width: `${b.w + out * 2}px`,
      height: `${b.h + out * 2}px`,
      border: `${RING_W}px solid ${host.ringColor()}`,
      borderRadius: radiusOf(el, scale),
    });
  };

  const kept = () => host.history?.() ?? [];
  const sync = () => {
    const { layers } = read();
    nav.sync(layers, kept());
    return layers;
  };

  const show = (key: string | null) => {
    const el = elementOf(key);
    if (el && "scrollIntoView" in el) (el as HTMLElement).scrollIntoView?.({ block: "nearest", inline: "nearest" });
    draw();
  };

  /** a press on the focused part: what a pointer's click on it would do; a field takes the keys, a switch flips */
  const activate = (el: Element) => {
    const own = el.getAttribute("role") === "button" || el.hasAttribute("data-tap") || el.matches(IN_POPUP);
    const control = own ? null : el.matches(CONTROLS) ? el : el.querySelector(CONTROLS);
    const target = control ?? el;
    if (control && control.matches(TYPING)) {
      (control as HTMLElement).focus({ preventScroll: true });
      return;
    }
    (target as HTMLElement).click?.();
  };

  const act = (action: UiAction, via: "keyboard" | "gamepad" | "escape" = "keyboard") => {
    const layers = sync();
    const top = layers[layers.length - 1];
    if (!top) return;
    if (action === "confirm") {
      const el = elementOf(nav.current?.key);
      if (el) activate(el);
    } else if (action === "cancel") {
      const step = cancelOf(top);
      const popup = popups[popups.length - 1];
      const tapped = "tap" in step ? found.get(top.key)?.elements.get(step.tap) : undefined;
      if (tapped) activate(tapped);
      else {
        const doms = host.layers();
        const handled = host.dismiss(doms[doms.length - 1], popup && top.key.includes(">popup:") ? popup : undefined, via);
        /* a popup the host keeps no state for (a menu its own trigger opened) closes as it does on Escape */
        if (!handled && popup && top.key.includes(">popup:")) {
          synthetic = true;
          popup.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
          synthetic = false;
        }
      }
    } else {
      show(nav.move(layers, action as FocusDir, kept()));
      return;
    }
    /* what the press opened or closed is read on the next frame */
    win.requestAnimationFrame?.(() => {
      sync();
      show(nav.current?.key ?? null);
    });
  };

  const typingIn = (t: EventTarget | null): Element | null => {
    const el = t as Element | null;
    return el && typeof el.closest === "function" ? el.closest(TYPING) : null;
  };

  const onKey = (e: KeyboardEvent) => {
    if (synthetic || e.isComposing || e.keyCode === 229 || e.altKey || e.ctrlKey || e.metaKey) return;
    const action = uiActionOfKey(e.key);
    if (!action) return;
    const dir = action !== "confirm" && action !== "cancel";
    /* a key meant for something beside the screens (the preview's own bar, a menu of the page's) is not the focus's */
    const at = e.target as Element | null;
    if (at && typeof at.closest === "function" && at !== doc.body && at !== doc.documentElement && !host.layers().some((l) => l.root.contains(at))) return;
    const typing = typingIn(e.target);
    if (!typing && e.key !== "Escape" && at && typeof at.closest === "function" && at.closest(OWNS_ARROWS)) return;
    if (device === "touch") {
      /* a pointer leaves every key as it was, but a direction shows the focus where it is */
      const reveals = (host.reveal ?? ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]).includes(e.key);
      if (!dir || !reveals || typing) return;
      setDevice("keyboard");
      e.preventDefault();
      e.stopPropagation();
      sync();
      show(nav.current?.key ?? null);
      return;
    }
    if (device === "gamepad") setDevice("keyboard");
    if (typing) {
      /* Escape gives the keys back to the focus; up and down leave a field of one line; the rest are the field's */
      if (e.key === "Escape" || ((action === "up" || action === "down") && typing.matches(ONE_LINE))) {
        (typing as HTMLElement).blur?.();
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          draw();
          return;
        }
      } else return;
    }
    e.preventDefault();
    e.stopPropagation();
    act(action, e.key === "Escape" ? "escape" : "keyboard");
  };

  /** a pointer in use: the ring goes, and the focus goes where it pressed, for the keys after it */
  const onPointer = (e: PointerEvent) => {
    if (device !== "touch") setDevice("touch");
    const el = e.target as Element | null;
    if (!el || typeof el.closest !== "function") return;
    const layers = sync();
    const top = layers[layers.length - 1];
    const f = top && found.get(top.key);
    if (!f) return;
    for (const [key, at] of f.elements) if (at === el || at.contains(el)) nav.focus(top, key);
  };

  let raf = 0;
  let lastRead = 0;
  const tick = (now: number) => {
    raf = 0;
    const list = win.navigator?.getGamepads?.() ?? [];
    const got = pads.poll([...list] as (PadState | null)[], now);
    if (got.actions.length) {
      const first = device === "touch";
      setDevice("gamepad", got.pad ?? pad);
      if (first) {
        sync();
        show(nav.current?.key ?? null);
      } else for (const a of got.actions) act(a, "gamepad");
    }
    if (device !== "touch" && now - lastRead > 150) {
      lastRead = now;
      const was = nav.current;
      sync();
      if (nav.current?.key !== was?.key || nav.current?.layer !== was?.layer) show(nav.current?.key ?? null);
    }
    draw();
    loop();
  };
  const padsOn = () => [...(win.navigator?.getGamepads?.() ?? [])].some((p) => !!p);
  function loop() {
    if (raf || stopped) return;
    if (device === "touch" && !padsOn()) return;
    raf = win.requestAnimationFrame?.(tick) ?? 0;
  }
  let stopped = false;
  const onPad = () => loop();

  win.addEventListener("keydown", onKey, true);
  win.addEventListener("pointerdown", onPointer, true);
  win.addEventListener("gamepadconnected", onPad);
  loop();

  return {
    stop() {
      stopped = true;
      win.removeEventListener("keydown", onKey, true);
      win.removeEventListener("pointerdown", onPointer, true);
      win.removeEventListener("gamepadconnected", onPad);
      if (raf) win.cancelAnimationFrame?.(raf);
      mark(null);
      ringEl?.remove();
    },
    device: () => device,
    focused() {
      const key = nav.current?.key;
      const element = elementOf(key);
      return key && element ? { key, element } : null;
    },
    press(action) {
      /* from a pointer, the first press only shows where the focus is */
      if (device === "touch") {
        setDevice("keyboard");
        if (action !== "cancel") {
          sync();
          show(nav.current?.key ?? null);
          return;
        }
      }
      act(action);
    },
  };
}

/** the targets of a page's layer as the model reads them, for a test or a tool that looks without moving anything */
export function layerTargets(root: Element): FocusTarget[] {
  return readingOrder(targetsIn(root, false).targets);
}

export { inputScope };
