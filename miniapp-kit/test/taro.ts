/* One stand-in for every name the kit and the printed pages take from @tarojs/taro. Bun keeps a mocked module's names
 * for the whole run: whichever test file mocks it first fixes the names, and a later file whose code imports a name the
 * first fake left out fails to load (which file runs first differs between machines). So every file's fake starts from
 * this full set and only replaces what it watches. */

const none = () => {};

export const TARO_DEFAULTS: Record<string, unknown> = {
  /* pages and the screen runtime */
  navigateTo: async () => {},
  redirectTo: async () => {},
  navigateBack: async () => {},
  reLaunch: async () => {},
  switchTab: async () => {},
  getCurrentPages: () => [],
  useRouter: () => ({ params: {} }),
  usePullDownRefresh: none,
  useReachBottom: none,
  useDidShow: none,
  useDidHide: none,
  stopPullDownRefresh: none,
  showToast: async () => {},
  showActionSheet: async () => ({ tapIndex: 0 }),
  /* the device */
  getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 375, screenHeight: 812, safeArea: { bottom: 778 } }),
  getMenuButtonBoundingClientRect: () => ({ top: 24, height: 32, left: 280 }),
  onThemeChange: none,
  offThemeChange: none,
  createSelectorQuery: () => {
    const q = { select: () => q, boundingClientRect: () => q, exec: none };
    return q;
  },
  setClipboardData: async () => {},
  chooseImage: async () => ({ tempFilePaths: [], tempFiles: [] }),
  chooseMessageFile: async () => ({ tempFiles: [] }),
  /* storage, the transport and files */
  getStorage: async () => Promise.reject(new Error("none")),
  getStorageSync: () => "",
  setStorage: async () => {},
  removeStorage: async () => {},
  request: async () => ({ statusCode: 404, data: "", header: {} }),
  connectSocket: async () => ({ onOpen: none, onMessage: none, onClose: none, onError: none, send: none, close: none }),
  uploadFile: () => Promise.resolve({ statusCode: 404, data: "", header: {} }),
  getFileSystemManager: () => ({ writeFile: none }),
  env: {},
};

/* What the fakes do now: the last file's. Bun keeps the module a file met first, so a module loaded by an earlier file
   (the kit's transport, its navigation) holds that file's fake; each name of every fake asks this for what to do, so
   whichever fake a module holds, it does what the file running now says. */
const current: Record<string, unknown> = { ...TARO_DEFAULTS };

/** the module a test file's `mock.module("@tarojs/taro", …)` returns: every name, with the file's own in their place */
export function fakeTaro(own: Record<string, unknown> = {}): Record<string, unknown> {
  for (const k of Object.keys(current)) delete current[k];
  Object.assign(current, TARO_DEFAULTS, own);
  const taro: Record<string, unknown> = {};
  for (const k of Object.keys(current))
    if (typeof current[k] === "function") taro[k] = (...args: unknown[]) => (current[k] as (...a: unknown[]) => unknown)(...args);
    else Object.defineProperty(taro, k, { enumerable: true, get: () => current[k] });
  return { default: taro, ...Object.fromEntries(Object.keys(taro).map((k) => [k, taro[k]])) };
}

/** every component the kit and the printed pages take from @tarojs/components, as the tag names the tiny renderer
 *  draws; the same rule as for Taro above: each file's fake starts from the full set */
export const COMPONENT_NAMES = ["View", "Text", "Image", "Input", "Textarea", "Slider", "Picker", "ScrollView"] as const;

export function fakeComponents(own: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...Object.fromEntries(COMPONENT_NAMES.map((n) => [n, n])), ...own };
}
