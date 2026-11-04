import { h, ic } from "../node";
import type { PartDef } from "../types";

/* Stand-ins for what a prototype shows but does not play: a video, a web page, an animation. They
 * look like the real thing and do nothing, and say so in their names. The forks that asked for them
 * draw the same way; playing real media is a later pack's job. */

const frame = "bg-surface-container-high flex flex-col items-center justify-center gap-1 overflow-hidden rounded-xl";

export const media: PartDef[] = [
  {
    slug: "video",
    name: "Video placeholder",
    labels: { ja: "動画プレースホルダー", zh: "视频占位", ko: "동영상 자리표시자" },
    category: "Media",
    icon: "smart_display",
    w: 380,
    h: 214,
    props: [
      { key: "title", label: "Title", kind: "text", default: "Video title", defaults: { zh: "视频标题" } },
      { key: "time", label: "Time", labels: { ja: "時間", zh: "时间", ko: "시간" }, kind: "text", default: "01:24 / 03:45" },
      { key: "width", label: "Width", kind: "number", default: 380, min: 160, max: 1280, step: 4, unit: "px" },
    ],
    tree: (p) => {
      const width = Math.round(p.n("width"));
      return h(
        "div",
        { "data-slot": "video-placeholder", className: frame, style: { width, height: Math.round((width * 9) / 16) } },
        ic("play_circle", { className: "text-on-surface-variant size-12" }),
        p.s("title") && h("div", { className: "text-title-small text-on-surface" }, p.s("title")),
        p.s("time") && h("div", { className: "text-label-small text-on-surface-variant" }, p.s("time")),
      );
    },
  },
  {
    slug: "web-view",
    name: "Web page placeholder",
    labels: { ja: "Web ページプレースホルダー", zh: "网页占位", ko: "웹 페이지 자리표시자" },
    category: "Media",
    icon: "web",
    w: 380,
    h: 280,
    props: [
      { key: "address", label: "Address", labels: { ja: "アドレス", zh: "地址", ko: "주소" }, kind: "text", default: "https://example.com" },
      { key: "width", label: "Width", kind: "number", default: 380, min: 160, max: 1280, step: 4, unit: "px" },
      { key: "height", label: "Height", kind: "number", default: 280, min: 96, max: 900, step: 4, unit: "px" },
    ],
    tree: (p) =>
      h(
        "div",
        { "data-slot": "web-placeholder", className: "border-outline-variant flex flex-col overflow-hidden rounded-xl border", style: { width: Math.round(p.n("width")), height: Math.round(p.n("height")) } },
        h("div", { className: "bg-surface-container text-label-medium text-on-surface-variant truncate px-3 py-2" }, p.s("address")),
        h("div", { className: "bg-surface flex flex-1 items-center justify-center" }, ic("language", { className: "text-outline size-10" })),
      ),
  },
  {
    slug: "animation",
    name: "Animation placeholder",
    labels: { ja: "アニメーションプレースホルダー", zh: "动画占位", ko: "애니메이션 자리표시자" },
    category: "Media",
    icon: "animation",
    w: 180,
    h: 180,
    props: [
      { key: "file", label: "File", labels: { ja: "ファイル", zh: "文件", ko: "파일" }, kind: "text", default: "animation.json" },
      { key: "size", label: "Size", labels: { zh: "尺寸" }, kind: "number", default: 180, min: 48, max: 640, step: 4, unit: "px" },
    ],
    tree: (p) => {
      const size = Math.round(p.n("size"));
      return h("div", { "data-slot": "animation-placeholder", className: frame, style: { width: size, height: size } }, ic("animation", { className: "text-on-surface-variant size-10" }), h("div", { className: "text-label-small text-on-surface-variant" }, p.s("file")));
    },
  },
];
