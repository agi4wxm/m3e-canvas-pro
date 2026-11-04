import { h, ic } from "../node";
import type { PartDef } from "../types";

/* What a screen shows but the sketch does not make: a video, a web page, an animation, a camera, a map.
 * Given an address a video plays and a web page loads; otherwise each stands in for the real thing. */

/** only the web: a saved `javascript:` address must not run */
const webAddress = (url: string) => (/^https?:\/\//i.test(url) ? url : "");

const frame = "bg-surface-container-high flex flex-col items-center justify-center gap-1 overflow-hidden rounded-xl";

export const media: PartDef[] = [
  {
    slug: "video",
    appearance: { radius: 12 },
    name: "Video",
    labels: { ja: "動画", zh: "视频", ko: "동영상" },
    category: "Media",
    icon: "smart_display",
    w: 380,
    h: 214,
    props: [
      { key: "src", label: "Video address", labels: { ja: "動画のアドレス", zh: "视频地址", ko: "동영상 주소" }, kind: "text", default: "" },
      { key: "title", label: "Title", kind: "text", default: "Video title", defaults: { zh: "视频标题" } },
      { key: "time", label: "Time", labels: { ja: "時間", zh: "时间", ko: "시간" }, kind: "text", default: "01:24 / 03:45" },
      { key: "width", label: "Width", kind: "number", default: 380, min: 160, max: 1280, step: 4, unit: "px" },
    ],
    tree: (p) => {
      const width = Math.round(p.n("width"));
      const src = webAddress(p.s("src"));
      if (src) return h("video", { "data-slot": "video", src, controls: true, className: "rounded-xl bg-inverse-surface", style: { width, height: Math.round((width * 9) / 16) } });
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
    appearance: { radius: 12 },
    name: "Web page",
    labels: { ja: "Web ページ", zh: "网页", ko: "웹 페이지" },
    category: "Media",
    icon: "web",
    w: 380,
    h: 280,
    props: [
      { key: "address", label: "Address", labels: { ja: "アドレス", zh: "地址", ko: "주소" }, kind: "text", default: "https://example.com" },
      { key: "load", label: "Load the page", labels: { ja: "ページを読み込む", zh: "加载网页", ko: "페이지 불러오기" }, kind: "bool", default: false },
      { key: "width", label: "Width", kind: "number", default: 380, min: 160, max: 1280, step: 4, unit: "px" },
      { key: "height", label: "Height", kind: "number", default: 280, min: 96, max: 900, step: 4, unit: "px" },
    ],
    tree: (p) =>
      h(
        "div",
        { "data-slot": "web-placeholder", className: "border-outline-variant flex flex-col overflow-hidden rounded-xl border", style: { width: Math.round(p.n("width")), height: Math.round(p.n("height")) } },
        h("div", { className: "bg-surface-container text-label-medium text-on-surface-variant truncate px-3 py-2" }, p.s("address")),
        p.b("load") && webAddress(p.s("address")) ? h("iframe", { src: webAddress(p.s("address")), title: p.s("address"), sandbox: "allow-scripts allow-forms", className: "bg-surface min-h-0 w-full flex-1 border-0" }) : h("div", { className: "bg-surface flex flex-1 items-center justify-center" }, ic("language", { className: "text-outline size-10" })),
      ),
  },
  {
    slug: "animation",
    appearance: { radius: 12 },
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
  {
    slug: "camera",
    appearance: { radius: 12 },
    name: "Camera placeholder",
    labels: { ja: "カメラプレースホルダー", zh: "相机占位", ko: "카메라 자리표시자" },
    category: "Media",
    icon: "photo_camera",
    w: 360,
    h: 480,
    props: [
      { key: "width", label: "Width", kind: "number", default: 360, min: 120, max: 1280, step: 4, unit: "px" },
      { key: "height", label: "Height", kind: "number", default: 480, min: 120, max: 1280, step: 4, unit: "px" },
    ],
    tree: (p) =>
      h(
        "div",
        { "data-slot": "camera-placeholder", className: "bg-inverse-surface text-inverse-on-surface relative flex items-center justify-center overflow-hidden rounded-xl", style: { width: Math.round(p.n("width")), height: Math.round(p.n("height")) } },
        ic("photo_camera", { className: "size-12" }),
        h("span", { className: "border-inverse-on-surface absolute bottom-4 left-1/2 size-14 -translate-x-1/2 rounded-full border-4" }),
      ),
  },
  {
    slug: "map",
    appearance: { radius: 12 },
    name: "Map placeholder",
    labels: { ja: "地図プレースホルダー", zh: "地图占位", ko: "지도 자리표시자" },
    category: "Media",
    icon: "map",
    w: 380,
    h: 240,
    props: [
      { key: "label", label: "Place", labels: { ja: "場所", zh: "地点", ko: "장소" }, kind: "text", default: "Current location", defaults: { zh: "当前位置" } },
      { key: "width", label: "Width", kind: "number", default: 380, min: 120, max: 1280, step: 4, unit: "px" },
      { key: "height", label: "Height", kind: "number", default: 240, min: 96, max: 1280, step: 4, unit: "px" },
    ],
    tree: (p) =>
      h(
        "div",
        { "data-slot": "map-placeholder", className: "bg-surface-container-high relative flex flex-col items-center justify-center gap-1 overflow-hidden rounded-xl", style: { width: Math.round(p.n("width")), height: Math.round(p.n("height")) } },
        h("span", { className: "bg-surface-container absolute inset-x-0 top-1/3 h-3" }),
        h("span", { className: "bg-surface-container absolute inset-y-0 left-1/4 w-3" }),
        h("span", { className: "bg-surface-container absolute inset-y-0 right-1/5 w-2" }),
        ic("location_on", { className: "text-primary relative size-10" }),
        p.s("label") && h("span", { className: "text-label-medium text-on-surface relative" }, p.s("label")),
      ),
  },
];
