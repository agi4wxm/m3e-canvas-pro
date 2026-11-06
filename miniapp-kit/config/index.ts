/* The kit's own Taro app (the gallery and the printed documents), built the way an exported mini-program is: React 18
 * on the webpack 5 runner, for WeChat (weapp), Douyin (tt) and the web (h5). Sizes stay in px (one px is one point of
 * the design on every device): the px-to-rpx transform is off, as in an exported app (docs/小程序.md). */
import path from "node:path";
import { defineConfig, type UserConfigExport } from "@tarojs/cli";

const here = (p: string) => path.resolve(__dirname, "..", p);

/* the editor's runtime the screens run on (lib/app and what it reads), compiled with the app's own sources */
const shared = [here("../lib")];

export default defineConfig<"webpack5">(async (merge) => {
  const base: UserConfigExport<"webpack5"> = {
    projectName: "m3e-canvas-miniapp",
    date: "2026-11-06",
    designWidth: 375,
    deviceRatio: { 375: 2, 750: 1 },
    sourceRoot: "src",
    outputRoot: `dist/${process.env.TARO_ENV}`,
    framework: "react",
    compiler: { type: "webpack5", prebundle: { enable: false } },
    cache: { enable: false },
    /* one React for the kit, the app and the editor's runtime it shares (lib/app imports "react" from the repo's root) */
    alias: {
      react: here("node_modules/react"),
      "react-dom": here("node_modules/react-dom"),
      "@m3e/app-runtime": here("../lib/app/index.ts"),
    },
    mini: {
      compile: { include: shared },
      postcss: { pxtransform: { enable: false }, cssModules: { enable: false } },
    },
    h5: {
      publicPath: "/",
      staticDirectory: "static",
      router: { mode: "hash" },
      compile: { include: shared },
      postcss: { pxtransform: { enable: false }, autoprefixer: { enable: true }, cssModules: { enable: false } },
    },
  };
  return merge({}, base, { mini: {}, h5: {} });
});
