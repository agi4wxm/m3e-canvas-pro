import type { TableColumn } from "./types";

/* The column structure each part reads its table by (docs/组件规范.md "表格"), by `<slug>.<prop>`: the key data names a
 * column by and the kind of value it holds, in the order the part's default table has them. The registry hands each to
 * its prop (`PropDef.columns`), so a table bound to data lays its records out by these keys, an author's table with a
 * structure of its own is lined up by them (`lineUp`), and the tools describe them. Kept apart from the definitions, which
 * say how a part draws: what a part reads is listed here in one place.
 *
 * An empty structure says every column is the data's own: a chart's series, a board's lanes, the days of a heat map,
 * each keyed by its header's words. A part whose columns start with fixed ones and go on with the data's own lists the
 * fixed ones. */

const text = (key: string): TableColumn => ({ key, type: "text" });
const num = (key: string): TableColumn => ({ key, type: "number" });

export const TABLE_COLUMNS: Record<string, TableColumn[]> = {
  /* the first column names a point, the rest are the data's series */
  "chart.data": [text("label")],
  "scatter-plot.data": [num("x"), num("y")],
  "heatmap.data": [],
  "description-list.data": [text("name"), text("value")],
  "reward-track.data": [num("at"), text("label"), text("icon")],
  "timeline.data": [text("time"), text("title"), text("detail")],
  "cart-list.data": [text("name"), text("variant"), num("price"), num("quantity")],
  /* the amount as the data writes it (its sign, its grouping); in or out where the data says */
  "transaction-list.data": [text("name"), text("detail"), text("amount"), text("direction")],
  "leaderboard.data": [text("name"), num("score"), num("change")],
  "conversation-list.data": [text("name"), text("lastMessage"), text("time"), num("unread")],
  "contact-list.data": [text("name"), text("note")],
  "comment-list.data": [text("name"), text("time"), text("comment"), num("likes")],
  "notification-list.data": [text("title"), text("body"), text("time"), text("icon")],
  "file-list.data": [text("name"), text("size"), text("date")],
  "settings-group.data": [text("icon"), text("label"), text("control"), text("value")],
  "playlist.data": [text("title"), text("detail"), text("length"), text("state")],
  "bar-list.data": [text("label"), text("value"), text("share")],
  "data-table.data": [text("order"), text("customer"), text("status"), text("total")],
  "kanban.data": [],
  "agenda.data": [{ key: "date", type: "date" }, text("time"), text("title")],
  "onboarding.data": [text("icon"), text("title"), text("text")],
  "scene.hotspots": [text("label"), num("x"), num("y"), num("w"), num("h")],
  /* the map capability view's markers, as the catalog names them (lib/capabilities/catalog.ts): data of places binds here */
  "map.markers": [text("id"), text("title"), num("lat"), num("lng")],
  /* a world view's entities, as lib/world names them: where each stands, 0 to 100 across and down the view */
  "world-view.entities": [text("id"), text("kind"), num("x"), num("y"), text("label")],
  "region-picker.data": [text("province"), text("city"), text("district")],
  "funnel-chart.data": [text("step"), num("value")],
  "gantt-chart.data": [text("task"), num("start"), num("length"), num("done")],
  "character-card.data": [text("stat"), num("value"), num("max")],
};
