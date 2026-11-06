import { PRINTED_PAGES } from "./printed/pages";

export default defineAppConfig({
  pages: ["pages/gallery/index", ...PRINTED_PAGES],
  window: {
    navigationStyle: "custom",
    backgroundTextStyle: "dark",
    backgroundColor: "#FEF7FF",
  },
});
