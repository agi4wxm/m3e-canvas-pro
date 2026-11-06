/* "Fill the mocks for this API": every field of every model given the hint the mocks would read from it (written down,
 * so the author sees and changes it), a count for each model whose records are listed, the realtime scripts the
 * channels would play anyway, and the scenarios a product is always looked at in: a new user with nothing yet, lots
 * of data, the network down, a slow network, signed out. What the author already set is kept. */

import { fieldRows, isRecord } from "../api/schema";
import type { ApiSpec, JsonSchema, JsonSchemaObject } from "../api/types";
import { DEFAULT_COUNT, modelShape } from "./shape";
import { inferHint } from "./hints";
import { defaultScripts } from "./realtime";
import { compileRoutes } from "./routes";
import type { MockHint, MockLocale, MockModelConfig, MockScenario, MockSpec } from "./types";

type Words = { name: string; description: string };

/** the scenarios every product is looked at in, by id, in each language */
const SCENARIO_WORDS: Record<string, Record<MockLocale, Words>> = {
  "new-user": {
    zh: { name: "新用户", description: "刚注册，还没有任何数据：列表都是空的" },
    en: { name: "New user", description: "Just signed up, nothing yet: every list is empty" },
    ja: { name: "新規ユーザー", description: "登録したばかりでデータがない：リストはすべて空" },
    ko: { name: "신규 사용자", description: "방금 가입해서 데이터가 없음: 목록이 모두 비어 있음" },
  },
  lots: {
    zh: { name: "大量数据", description: "每个列表都有几百条，看分页和长文字" },
    en: { name: "Lots of data", description: "Hundreds of records in every list, for paging and long text" },
    ja: { name: "大量のデータ", description: "どのリストも数百件：ページングと長い文字の確認に" },
    ko: { name: "대량 데이터", description: "모든 목록에 수백 건: 페이지와 긴 글 확인용" },
  },
  "network-error": {
    zh: { name: "网络错误", description: "网络连不上，每个请求都失败" },
    en: { name: "Network error", description: "The network is down: every call fails" },
    ja: { name: "ネットワークエラー", description: "ネットワークにつながらず、すべての通信が失敗" },
    ko: { name: "네트워크 오류", description: "네트워크가 끊겨 모든 요청이 실패" },
  },
  slow: {
    zh: { name: "慢网", description: "每个请求要两三秒，看加载状态" },
    en: { name: "Slow network", description: "Every call takes two to three seconds, for the loading states" },
    ja: { name: "遅いネットワーク", description: "通信に 2〜3 秒かかる：読み込み中の表示の確認に" },
    ko: { name: "느린 네트워크", description: "요청마다 2~3초 걸림: 로딩 상태 확인용" },
  },
  "signed-out": {
    zh: { name: "未登录", description: "没有登录：需要登录的接口都返回 401" },
    en: { name: "Signed out", description: "Not signed in: secured endpoints answer 401" },
    ja: { name: "未ログイン", description: "ログインしていない：認証が必要な API は 401" },
    ko: { name: "로그아웃 상태", description: "로그인하지 않음: 인증이 필요한 API는 401" },
  },
};

/** the scenarios every product is looked at in */
export function defaultScenarios(locale: MockLocale): MockScenario[] {
  const w = (id: string) => SCENARIO_WORDS[id][locale] ?? SCENARIO_WORDS[id].en;
  return [
    { id: "new-user", ...w("new-user"), all: { empty: true } },
    { id: "lots", ...w("lots"), counts: { "*": 240 } },
    { id: "network-error", ...w("network-error"), all: { network: true } },
    { id: "slow", ...w("slow"), latency: { min: 2000, max: 3200 } },
    { id: "signed-out", ...w("signed-out"), signedIn: false },
  ];
}

/** every field path of a model, its hint as the mocks read it: nested objects and lists of objects too, a few deep */
export function inferredHints(api: ApiSpec, model: string): Record<string, MockHint> {
  const out: Record<string, MockHint> = {};
  const walk = (schema: JsonSchema | undefined, prefix: string, depth: number) => {
    const s = isRecord(schema) ? (schema as JsonSchemaObject) : undefined;
    if (!s || depth > 3) return;
    for (const row of fieldRows(s)) {
      const path = prefix ? `${prefix}.${row.name}` : row.name;
      const field = (s.properties as Record<string, JsonSchema>)[row.name];
      if (row.type === "ref") continue;
      if (row.type === "object") walk(field, path, depth + 1);
      else if (row.type === "array") {
        const items = isRecord(field) ? ((field as JsonSchemaObject).items as JsonSchema | undefined) : undefined;
        if (isRecord(items) && ((items as JsonSchemaObject).properties || (items as JsonSchemaObject).type === "object")) walk(items, `${path}[]`, depth + 1);
        else if (!row.ref) {
          const h = inferHint(row.name, items, model);
          if (h.kind !== "word" && h.kind !== "auto") out[`${path}[]`] = h;
        }
      } else out[path] = inferHint(row.name, field, model);
    }
  };
  walk(modelShape(api, model), "", 0);
  return out;
}

/** The mock settings filled in for an API, over what is there: hints, counts, scenarios, realtime scripts. */
export function fillMocks(api: ApiSpec, current: MockSpec | undefined, o: { locale: MockLocale; counts?: number; scenarios?: boolean; hints?: boolean }): MockSpec {
  const spec: MockSpec = { ...current };
  spec.seed ??= 1;
  spec.locale ??= o.locale;
  const routes = compileRoutes(api, spec);
  const listed = new Set(routes.filter((r) => r.model && ["list", "get", "create"].includes(r.kind)).map((r) => r.model!));
  const models: MockModelConfig[] = [...(spec.models ?? [])];
  for (const m of api.models ?? []) {
    const shape = modelShape(api, m.name);
    if (!isRecord(shape?.properties)) continue;
    let config = models.find((x) => x.name === m.name);
    if (!config) {
      config = { name: m.name };
      models.push(config);
    }
    const i = models.indexOf(config);
    const hints = o.hints === false ? config.hints : { ...inferredHints(api, m.name), ...config.hints };
    models[i] = { ...config, ...(listed.has(m.name) && config.count === undefined ? { count: o.counts ?? DEFAULT_COUNT } : {}), ...(hints && Object.keys(hints).length ? { hints } : {}) };
  }
  if (models.length) spec.models = models;
  if (o.scenarios !== false) {
    const have = new Set((spec.scenarios ?? []).map((s) => s.id));
    const add = defaultScenarios(spec.locale ?? o.locale).filter((s) => !have.has(s.id));
    if (add.length) spec.scenarios = [...(spec.scenarios ?? []), ...add];
  }
  if (!spec.realtime && api.channels?.length) {
    const scripts = defaultScripts(api);
    if (scripts.length) spec.realtime = scripts;
  }
  return spec;
}
