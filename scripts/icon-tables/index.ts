/* The icon families a style can draw with, and for each one the table that says which of its glyphs
 * draws a Material Symbol. The tables are written by hand: `bun scripts/propose-icon-tables.ts <family>`
 * proposes entries for names a table lacks, by the words in scripts/icon-words.ts, and a person picks.
 * `bun run gen:icon-sets` turns them into the bundled subsets in components/m3e/icon-sets/data. */
import ant from "./ant";
import codicon from "./codicon";
import emoji from "./emoji";
import fluentui from "./fluentui";
import game from "./game";
import lucide from "./lucide";
import mingcute from "./mingcute";
import phosphor from "./phosphor";
import pixel from "./pixel";
import remix from "./remix";
import sf from "./sf";
import tabler from "./tabler";

/** a Material name (Iconify's spelling) to the family's stem, or to its outlined and filled names when they do not follow the family's rule */
export type IconTable = Record<string, string | readonly [string, string]>;

export type TableFamily = "sf" | "fluentui" | "codicon" | "phosphor" | "lucide" | "remix" | "ant" | "tabler" | "mingcute" | "game" | "emoji" | "pixel";

export type FamilySpec = {
  /** the Iconify prefix, and the @iconify-json package of the same name */
  prefix: string;
  /** a stem's outlined name, the first of these the set has */
  outline: (stem: string) => string[];
  /** its filled name, the first of these the set has; a stem without one is drawn outlined both ways */
  filled?: (stem: string) => string[];
  /** for NOTICE and the generated files */
  source: string;
  license: string;
};

export const FAMILIES: Record<TableFamily, FamilySpec> = {
  sf: { prefix: "f7", outline: (s) => [s], filled: (s) => [`${s}-fill`], source: "Framework7 Icons, Vladimir Kharlampidi", license: "MIT" },
  fluentui: { prefix: "fluent", outline: (s) => [`${s}-24-regular`], filled: (s) => [`${s}-24-filled`], source: "Fluent UI System Icons, Microsoft", license: "MIT" },
  codicon: { prefix: "codicon", outline: (s) => [s], filled: (s) => [`${s}-filled`], source: "Codicons, Microsoft", license: "CC BY 4.0" },
  phosphor: { prefix: "ph", outline: (s) => [s], filled: (s) => [`${s}-fill`], source: "Phosphor Icons, Helena Zhang and Tobias Fried", license: "MIT" },
  lucide: { prefix: "lucide", outline: (s) => [s], source: "Lucide, Lucide Contributors", license: "ISC" },
  remix: { prefix: "ri", outline: (s) => [`${s}-line`, s], filled: (s) => [`${s}-fill`], source: "Remix Icon, Remix Design", license: "Apache-2.0" },
  ant: { prefix: "ant-design", outline: (s) => [`${s}-outlined`], filled: (s) => [`${s}-filled`], source: "Ant Design Icons, Ant Group", license: "MIT" },
  tabler: { prefix: "tabler", outline: (s) => [s], filled: (s) => [`${s}-filled`], source: "Tabler Icons, Paweł Kuna", license: "MIT" },
  mingcute: { prefix: "mingcute", outline: (s) => [`${s}-line`], filled: (s) => [`${s}-fill`], source: "MingCute Icon, MingCute Design", license: "Apache-2.0" },
  game: { prefix: "game-icons", outline: (s) => [s], source: "Game Icons, Lorc, Delapouite and contributors, game-icons.net", license: "CC BY 3.0" },
  emoji: { prefix: "fluent-emoji-flat", outline: (s) => [s], source: "Fluent Emoji Flat, Microsoft", license: "MIT" },
  pixel: { prefix: "pixelarticons", outline: (s) => [s], source: "Pixelarticons, Gerrit Halfmann", license: "MIT" },
};

export const TABLES: Record<TableFamily, IconTable> = { sf, fluentui, codicon, phosphor, lucide, remix, ant, tabler, mingcute, game, emoji, pixel };

/** Material names bundled beyond the ones this codebase draws: the most used ones, so a sketch or the AI
 *  can name them and still draw offline, in every family */
export const COMMON = `account-balance arrow-back-ios arrow-back-ios-new arrow-circle-right arrow-drop-up arrow-forward-ios
arrow-right arrow-right-alt add-a-photo add-photo-alternate add-shopping-cart admin-panel-settings alarm album
alternate-email analytics apartment assignment attach-money autorenew badge battery-full beach-access bluetooth bomb
book bookmark-add bookmarks bug-report cake cancel casino castle check-box-outline-blank checkroom chess close-fullscreen
cloud cloud-download cloud-upload coffee computer construction contact-phone contact-support crown currency-exchange
data-object database date-range delete-forever devices diversity-3 do-not-disturb-on done done-all double-arrow drafts
drag-handle electric-bolt emoji-objects engineering exit-to-app expand-less expand-more face fact-check fastfood filter
fingerprint first-page fitness-center flash-on flight-takeoff forest fullscreen-exit grid-view group-add handshake
handyman headphones health-and-safety heart-plus hiking home-pin hotel hourglass house hub id-card inventory ios-share
joystick key keyboard-arrow-left keyboard-arrow-right keyboard-double-arrow-right last-page library-books library-music
light-mode lightbulb live-tv local-cafe local-fire-department local-florist local-mall local-police lock-open loyalty
manage-accounts mark-chat-unread mark-email-unread mic-off minimize monetization-on mood-bad move-to-inbox my-location
near-me nights-stay notifications-off pending person-pin-circle pets phone-in-talk photo pie-chart pin-drop podcasts
power-settings-new preview priority-high psychology public qr-code query-stats question-mark receipt remove-shopping-cart
repeat restart-alt savings security shopping-basket shopping-cart-checkout shuffle skip-next skip-previous skull sms
sort stars stop store summarize sunny supervisor-account sync-alt tag target task terminal thermostat thumb-down
thumb-up today toggle-off toll toys travel-explore trending-down trophy tv umbrella update verified videogame-asset
voicemail volume-off volume-up volunteer-activism water-drop wb-sunny whatshot wifi ac-unit directions directions-bus
sentiment-satisfied sentiment-dissatisfied sentiment-neutral settings-accessibility sports-soccer star-half`
  .split(/\s+/)
  .filter(Boolean);

/** names Material Symbols dropped or renamed, which old sketches and the AI still write: drawn as the name they became */
export const RENAMED: Record<string, string> = {
  "access-time": "schedule",
  "airplanemode-active": "flight",
  "camera-alt": "photo-camera",
  "card-giftcard": "redeem",
  email: "mail",
  "emoji-events": "trophy",
  "emoji-flags": "flag",
  "favorite-border": "favorite",
  "file-download": "download",
  "file-upload": "upload",
  "keyboard-voice": "mic",
  "local-offer": "sell",
  "navigate-before": "chevron-left",
  "navigate-next": "chevron-right",
  "new-releases": "verified",
  people: "group",
  phone: "call",
  place: "location-on",
  "push-pin": "keep",
  "restaurant-menu": "restaurant",
  smartphone: "mobile",
  "star-border": "star",
  "thumb-down-off": "thumb-down",
  "thumb-up-off": "thumb-up",
};
