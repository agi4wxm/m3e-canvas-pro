import { useEffect, useMemo, useRef, useState } from "react";
import type { Collection, Palette } from "@/lib/tokens";
import {
  FORMATS,
  HTTP_METHODS,
  PROBLEM_MODEL_NAME,
  apiProblems,
  fieldRows,
  modelRef,
  modelUses,
  pathParams,
  refModel,
  schemaToTs,
  tagOf,
  toAsyncApi,
  toOpenApi,
  typeText,
  withFieldRows,
  type ApiChannel,
  type ApiEndpoint,
  type ApiModel,
  type ApiParameter,
  type ApiRef,
  type ApiSecurityScheme,
  type ApiSpec,
  type FieldRow,
  type HttpMethod,
  type JsonSchema,
  type JsonType,
} from "@/lib/api";
import { ops, type Op } from "@/lib/core";
import { t, useLang, type UIKey } from "@/lib/i18n";
import { Icon } from "./Icon";
import { ConfirmDialog, DenseContext, Field, IconBtn, Section, Segmented, Select, type SelectOption } from "./ui";

/* The API tab: the contract between the app and its back end (lib/api, docs/接口.md). Data models with a table of
 * fields, endpoints grouped by tag with their method, path, parameters, body, responses, who may call them and how
 * they page, realtime channels with their messages, the servers and the sign-in, and importing and exporting the spec
 * files. Every change is an operation of the core (lib/core/ops/api.ts), one undo step each, so the panel writes
 * exactly what the in-app agent and MCP write; what the panel cannot show (a oneOf, a custom body) it leaves alone and
 * names, for the AI to edit. Dense like the design panel: the API is a lot of small fields. */

/** what running an operation said: done, or the words of the refusal */
export type ApiRun = <A>(o: Op<A, unknown>, args: A) => { ok: true; result: unknown } | { ok: false; message: string };

type Props = { p: Palette; api: ApiSpec | undefined; collections: Collection[]; title: string; run: ApiRun };

type Tab = "models" | "endpoints" | "realtime" | "settings";

const label = (p: Palette): React.CSSProperties => ({ fontSize: 11, fontWeight: 600, color: p.onSurfaceVariant, padding: "2px 2px 0", letterSpacing: 0.2 });
const hint = (p: Palette): React.CSSProperties => ({ fontSize: 12, lineHeight: 1.5, color: p.onSurfaceVariant, padding: "0 4px", textWrap: "pretty" });
const card = (p: Palette, open: boolean): React.CSSProperties => ({ display: "flex", flexDirection: "column", gap: 6, padding: open ? 8 : 0, borderRadius: 12, background: open ? p.surfaceContainerLow : "transparent" });
const chip = (p: Palette): React.CSSProperties => ({ height: 28, padding: "0 10px 0 6px", borderRadius: 14, border: `1px solid ${p.outlineVariant}`, background: "transparent", color: p.onSurface, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, flex: "0 0 auto" });
const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 4, minWidth: 0 };
const mono: React.CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 };

/** the colors of a method's badge, from the theme so it reads in light and dark */
const methodColor = (p: Palette, m: HttpMethod): { bg: string; fg: string } =>
  m === "get" ? { bg: p.primaryContainer, fg: p.onPrimaryContainer } : m === "post" ? { bg: p.tertiaryContainer, fg: p.onTertiaryContainer } : m === "delete" ? { bg: p.errorContainer, fg: p.onErrorContainer } : { bg: p.secondaryContainer, fg: p.onSecondaryContainer };

function MethodBadge({ m, p }: { m: HttpMethod; p: Palette }) {
  const c = methodColor(p, m);
  return <span style={{ ...mono, fontSize: 10, fontWeight: 700, minWidth: 44, height: 20, padding: "0 4px", borderRadius: 6, background: c.bg, color: c.fg, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>{m.toUpperCase()}</span>;
}

/** A cell of a table that writes when it is left (or on Enter), so what is being typed is not refused half way: the
 *  dense field of the design panel without a clear button, which a narrow cell has no room for. Esc puts it back. */
function Cell({ value, onCommit, label: l, p, grow, width, mono: isMono, data }: { value: string; onCommit: (v: string) => void; label: string; p: Palette; grow?: boolean; width?: number; mono?: boolean; data?: string }) {
  const [v, setV] = useState(value);
  const [focus, setFocus] = useState(false);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    if (v !== value) onCommit(v);
  };
  return (
    <input
      data-api-cell={data}
      value={v}
      placeholder={l}
      aria-label={l}
      title={v.length > 24 ? v : undefined}
      spellCheck={false}
      onChange={(e) => setV(e.target.value)}
      onFocus={() => setFocus(true)}
      onBlur={() => {
        setFocus(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setV(value);
      }}
      style={{
        flex: grow ? "1 1 0" : "0 0 auto",
        width: width ?? (grow ? undefined : "100%"),
        minWidth: 0,
        height: 28,
        padding: "0 8px",
        borderRadius: 6,
        border: "none",
        outline: focus ? `2px solid ${p.primary}` : "none",
        outlineOffset: -2,
        background: p.surfaceContainerHigh,
        color: p.onSurface,
        fontSize: 12,
        fontFamily: isMono ? mono.fontFamily : "inherit",
        boxSizing: "border-box",
      }}
    />
  );
}

/** a row's header that opens what it holds */
function Opener({ open, onToggle, children, p, data }: { open: boolean; onToggle: () => void; children: React.ReactNode; p: Palette; data?: string }) {
  return (
    <button data-api-open={data} aria-expanded={open} onClick={onToggle} className="m3-press" style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", minHeight: 32, padding: "0 6px", border: "none", borderRadius: 10, background: open ? "transparent" : p.surfaceContainerLow, color: p.onSurface, cursor: "pointer", textAlign: "left", fontSize: 12 }}>
      <Icon name={open ? "expand_more" : "chevron_right"} size={16} color={p.onSurfaceVariant} />
      {children}
    </button>
  );
}

function AddChip({ icon = "add", text, onClick, p, data }: { icon?: string; text: string; onClick: () => void; p: Palette; data?: string }) {
  return (
    <button data-api-add={data} onClick={onClick} className="m3-press" style={chip(p)}>
      <Icon name={icon} size={16} />
      {text}
    </button>
  );
}

/* ---------- what a schema is, as one choice ---------- */

/** a body's, response's or payload's schema as one of the choices a select offers: nothing, a model, a list of a
 *  model, the problem details, or something only the AI edits */
function schemaChoice(schema: JsonSchema | undefined): string {
  if (schema === undefined) return "";
  if (typeof schema === "object") {
    if (!schema.$ref && (schema.type === "object" || (!schema.type && schema.properties)) && !schema.allOf && !schema.oneOf && !schema.anyOf) return "object";
    const m = refModel(schema.$ref);
    if (m && Object.keys(schema).length === 1) return `ref:${m}`;
    const items = schema.items;
    if (schema.type === "array" && typeof items === "object" && refModel(items.$ref) && Object.keys(schema).length === 2) return `list:${refModel(items.$ref)}`;
  }
  return "custom";
}

function schemaFromChoice(choice: string): JsonSchema | undefined {
  if (choice === "object") return { type: "object", properties: {} };
  if (choice.startsWith("ref:")) return { $ref: modelRef(choice.slice(4)) };
  if (choice.startsWith("list:")) return { type: "array", items: { $ref: modelRef(choice.slice(5)) } };
  return undefined;
}

function schemaOptions(models: ApiModel[], current: string, lang: ReturnType<typeof useLang>, none: UIKey, inline = false): SelectOption[] {
  return [
    { key: "", label: t(none, lang), icon: "block" },
    ...(inline ? [{ key: "object", label: t("apiInlineFields", lang), icon: "list_alt" }] : []),
    ...models.map((m) => ({ key: `ref:${m.name}`, label: m.name, icon: "data_object" })),
    ...models.filter((m) => m.name !== PROBLEM_MODEL_NAME).map((m) => ({ key: `list:${m.name}`, label: t("apiListOf", lang).replace("{name}", m.name), icon: "list" })),
    ...(current === "custom" ? [{ key: "custom", label: t("apiCustomSchema", lang), icon: "auto_awesome" }] : []),
  ];
}

/* ---------- models ---------- */

const TYPE_KEYS: { key: JsonType; label: UIKey }[] = [
  { key: "string", label: "apiTypeString" },
  { key: "number", label: "apiTypeNumber" },
  { key: "integer", label: "apiTypeInteger" },
  { key: "boolean", label: "apiTypeBoolean" },
  { key: "object", label: "apiTypeObject" },
  { key: "array", label: "apiTypeArray" },
];

function typeOptions(models: ApiModel[], lang: ReturnType<typeof useLang>): SelectOption[] {
  return [...TYPE_KEYS.map((x) => ({ key: x.key, label: t(x.label, lang) })), ...models.map((m) => ({ key: `ref:${m.name}`, label: m.name, icon: "data_object" }))];
}

function FieldEditor({ row: r, models, onChange, onDelete, p }: { row: FieldRow; models: ApiModel[]; onChange: (next: FieldRow) => void; onDelete: () => void; p: Palette }) {
  const lang = useLang();
  const [more, setMore] = useState(false);
  const typeKey = r.type === "ref" ? `ref:${r.ref}` : r.type;
  const setType = (k: string) => (k.startsWith("ref:") ? onChange({ ...r, type: "ref", ref: k.slice(4), items: undefined, format: undefined, enum: undefined }) : onChange({ ...r, type: k as JsonType, ref: undefined, ...(k === "array" ? { items: "string" as const } : { items: undefined }) }));
  const itemsKey = r.ref && r.type === "array" ? `ref:${r.ref}` : (r.items ?? "string");
  return (
    <div data-api-field={r.name} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={row}>
        <Cell grow mono value={r.name} onCommit={(name) => name.trim() && onChange({ ...r, name: name.trim() })} label={t("apiFieldName", lang)} p={p} data="field-name" />
        <div style={{ width: 92, flex: "0 0 auto" }} data-api-field-type>
          <Select options={typeOptions(models, lang)} value={typeKey} onChange={setType} p={p} label={t("apiFieldType", lang)} height={28} />
        </div>
        <IconBtn icon={r.required ? "check_box" : "check_box_outline_blank"} on={r.required} p={p} size={26} onClick={() => onChange({ ...r, required: !r.required })} title={t("apiRequired", lang)} />
        <IconBtn icon="more_horiz" on={more} p={p} size={26} onClick={() => setMore((x) => !x)} title={t("apiMore", lang)} expanded={more} />
      </div>
      {more && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "2px 0 6px 12px", borderLeft: `2px solid ${p.outlineVariant}`, marginLeft: 6 }}>
          {r.type === "array" && (
            <>
              <div style={label(p)}>{t("apiItems", lang)}</div>
              <Select options={typeOptions(models, lang).filter((o) => o.key !== "array")} value={itemsKey} onChange={(k) => onChange(k.startsWith("ref:") ? { ...r, ref: k.slice(4), items: undefined } : { ...r, ref: undefined, items: k as JsonType })} p={p} label={t("apiItems", lang)} height={28} />
            </>
          )}
          {(r.type === "string" || r.type === "number" || r.type === "integer") && <div style={label(p)}>{t("apiFormat", lang)}</div>}
          {(r.type === "string" || r.type === "number" || r.type === "integer") && (
            <Select options={[{ key: "", label: t("apiFormatNone", lang) }, ...FORMATS.map((f) => ({ key: f, label: f })), ...(r.format && !(FORMATS as readonly string[]).includes(r.format) ? [{ key: r.format, label: r.format }] : [])]} value={r.format ?? ""} onChange={(f) => onChange({ ...r, format: f || undefined })} p={p} label={t("apiFormat", lang)} height={28} />
          )}
          <label style={{ ...row, fontSize: 12, color: p.onSurface, cursor: "pointer", gap: 6 }}>
            <input type="checkbox" checked={r.nullable} onChange={(e) => onChange({ ...r, nullable: e.target.checked })} />
            {t("apiNullable", lang)}
          </label>
          {r.type !== "ref" && r.type !== "object" && r.type !== "array" && r.type !== "boolean" && <Cell value={(r.enum ?? []).join(", ")} onCommit={(v) => onChange({ ...r, enum: v.split(",").map((x) => x.trim()).filter(Boolean) })} label={t("apiEnum", lang)} p={p} />}
          <Cell value={r.description ?? ""} onCommit={(v) => onChange({ ...r, description: v || undefined })} label={t("apiDescription", lang)} p={p} />
          <Cell value={r.example ?? ""} onCommit={(v) => onChange({ ...r, example: v || undefined })} label={t("apiExample", lang)} p={p} />
          <div style={{ ...row, justifyContent: "flex-end" }}>
            <button data-api-delete-field onClick={onDelete} className="m3-press" style={{ ...chip(p), height: 24, color: p.error, borderColor: "transparent" }}>
              <Icon name="delete" size={14} />
              {t("apiDeleteField", lang)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** the columns of a table of fields: name, type, required */
function FieldsHeader({ p }: { p: Palette }) {
  const lang = useLang();
  return (
    <div style={{ ...row, ...label(p) }}>
      <span style={{ flex: "1 1 0" }}>{t("apiFields", lang)}</span>
      <span style={{ width: 92 }}>{t("apiFieldType", lang)}</span>
      <span style={{ width: 56 }}>{t("apiRequired", lang)}</span>
    </div>
  );
}

/** an inline object schema's fields, edited as a model's are: a form's body, an upload's file and words */
function InlineFields({ schema, models, onChange, p }: { schema: JsonSchema; models: ApiModel[]; onChange: (next: JsonSchema) => void; p: Palette }) {
  const lang = useLang();
  const rows = fieldRows(schema);
  const write = (next: FieldRow[]) => onChange(withFieldRows(schema, next));
  return (
    <div data-api-inline-fields style={{ display: "flex", flexDirection: "column", gap: 4, padding: "2px 0 2px 10px", borderLeft: `2px solid ${p.outlineVariant}`, marginLeft: 4 }}>
      <FieldsHeader p={p} />
      {rows.map((r, i) => (
        <FieldEditor key={`${r.name}:${i}`} row={r} models={models} p={p} onChange={(next) => write(rows.map((x, j) => (j === i ? next : x)))} onDelete={() => write(rows.filter((_, j) => j !== i))} />
      ))}
      <div>
        <AddChip
          text={t("apiAddField", lang)}
          data="inline-field"
          p={p}
          onClick={() => {
            const taken = new Set(rows.map((r) => r.name));
            let n = rows.length + 1;
            while (taken.has(`field${n}`)) n++;
            write([...rows, { name: `field${n}`, type: "string", required: false, nullable: false }]);
          }}
        />
      </div>
    </div>
  );
}

function ModelCard({ m, api, collections, open, onToggle, onRenamed, run, p }: { m: ApiModel; api: ApiSpec; collections: Collection[]; open: boolean; onToggle: () => void; onRenamed: (name: string) => void; run: ApiRun; p: Palette }) {
  const lang = useLang();
  const models = api.models ?? [];
  const rows = fieldRows(m.schema);
  const isObject = typeof m.schema === "object" && (m.schema.type === "object" || (!m.schema.type && !!m.schema.properties) || (!m.schema.type && !m.schema.$ref && !m.schema.allOf && !m.schema.oneOf && !m.schema.anyOf && !m.schema.enum));
  const [asking, setAsking] = useState(false);
  const write = (next: FieldRow[]) => run(ops.updateModel, { name: m.name, schema: withFieldRows(m.schema, next) });
  const uses = [...modelUses(api, m.name), ...collections.filter((c) => c.model === m.name).map((c) => c.name || c.id)];
  const description = typeof m.schema === "object" && typeof m.schema.description === "string" ? m.schema.description : "";
  return (
    <div data-api-model={m.name} style={card(p, open)}>
      <Opener open={open} onToggle={onToggle} p={p} data={`model:${m.name}`}>
        <Icon name="data_object" size={16} color={p.primary} />
        <span style={{ fontWeight: 600, flex: "0 1 auto", minWidth: 24, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
        <span style={{ color: p.onSurfaceVariant, fontSize: 11, flex: "1 1 0", minWidth: 0, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rows.length ? rows.map((r) => r.name).join(", ") : typeText(m.schema)}</span>
      </Opener>
      {open && (
        <>
          <div style={row}>
            <Cell grow value={m.name} onCommit={(to) => to.trim() && run(ops.renameModel, { name: m.name, to: to.trim() }).ok && onRenamed(to.trim())} label={t("apiModelName", lang)} p={p} mono data="model-name" />
            <IconBtn icon="delete" p={p} size={28} danger onClick={() => (uses.length ? setAsking(true) : run(ops.removeModel, { name: m.name }))} title={t("apiDeleteModel", lang)} />
          </div>
          <Cell value={description} onCommit={(v) => run(ops.updateModel, { name: m.name, description: v || null })} label={t("apiModelDescription", lang)} p={p} />
          {isObject ? (
            <>
              <FieldsHeader p={p} />
              {rows.length ? rows.map((r, i) => <FieldEditor key={`${r.name}:${i}`} row={r} models={models} p={p} onChange={(next) => write(rows.map((x, j) => (j === i ? next : x)))} onDelete={() => write(rows.filter((_, j) => j !== i))} />) : <div style={hint(p)}>{t("apiNoFields", lang)}</div>}
              <div>
                <AddChip
                  text={t("apiAddField", lang)}
                  data="field"
                  p={p}
                  onClick={() => {
                    const taken = new Set(rows.map((r) => r.name));
                    let n = rows.length + 1;
                    while (taken.has(`field${n}`)) n++;
                    write([...rows, { name: `field${n}`, type: "string", required: false, nullable: false }]);
                  }}
                />
              </div>
            </>
          ) : (
            <div style={hint(p)}>{t("apiNotObject", lang).replace("{type}", typeText(m.schema))}</div>
          )}
          <ConfirmDialog
            open={asking}
            title={t("apiDeleteModel", lang)}
            body={t("apiModelUsed", lang).replace("{name}", m.name).replace("{uses}", uses.join(", "))}
            p={p}
            onCancel={() => setAsking(false)}
            onConfirm={() => {
              setAsking(false);
              run(ops.removeModel, { name: m.name, force: true });
            }}
          />
        </>
      )}
    </div>
  );
}

function ModelsTab({ api, collections, run, p }: { api: ApiSpec; collections: Collection[]; run: ApiRun; p: Palette }) {
  const lang = useLang();
  const [open, setOpen] = useState<string | null>(null);
  const models = api.models ?? [];
  return (
    <>
      {models.map((m) => (
        <ModelCard key={m.name} m={m} api={api} collections={collections} open={open === m.name} onToggle={() => setOpen((x) => (x === m.name ? null : m.name))} onRenamed={setOpen} run={run} p={p} />
      ))}
      <div>
        <AddChip
          text={t("apiAddModel", lang)}
          data="model"
          p={p}
          onClick={() => {
            const taken = new Set(models.map((m) => m.name));
            let n = models.length + 1;
            while (taken.has(t("apiModelNth", lang).replace("{n}", String(n)))) n++;
            const name = t("apiModelNth", lang).replace("{n}", String(n));
            if (run(ops.addModel, { name, schema: { type: "object", properties: { id: { type: "string", format: "uuid" } }, required: ["id"] } }).ok) setOpen(name);
          }}
        />
      </div>
    </>
  );
}

/* ---------- endpoints ---------- */

const CONTENT_TYPES = ["application/json", "multipart/form-data", "application/x-www-form-urlencoded", "application/octet-stream"];

const isRef = (v: unknown): v is ApiRef => !!v && typeof v === "object" && typeof (v as ApiRef).$ref === "string";

function ParamRow({ prm, onChange, onDelete, p }: { prm: ApiParameter; onChange: (next: ApiParameter) => void; onDelete?: () => void; p: Palette }) {
  const lang = useLang();
  const schema = typeof prm.schema === "object" ? prm.schema : {};
  const type = (Array.isArray(schema.type) ? schema.type[0] : schema.type) ?? "string";
  const typeSelect = (
    <div style={{ width: 84, flex: "0 0 auto" }}>
      <Select options={TYPE_KEYS.filter((x) => x.key !== "object").map((x) => ({ key: x.key, label: t(x.label, lang) }))} value={type} onChange={(k) => onChange({ ...prm, schema: { ...schema, type: k as JsonType } })} p={p} label={t("apiFieldType", lang)} height={28} />
    </div>
  );
  /* a path parameter is named by the path: one line; another has its name, where it goes and its type on two */
  if (prm.in === "path")
    return (
      <div data-api-param={`path:${prm.name}`} style={row}>
        <span title={prm.name} style={{ ...mono, flex: "1 1 0", minWidth: 0, padding: "0 6px", color: p.onSurface, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`{${prm.name}}`}</span>
        <span style={{ fontSize: 11, color: p.onSurfaceVariant, padding: "0 6px" }}>path</span>
        {typeSelect}
      </div>
    );
  return (
    <div data-api-param={`${prm.in}:${prm.name}`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={row}>
        <Cell grow value={prm.name} onCommit={(name) => name.trim() && onChange({ ...prm, name: name.trim() })} label={t("apiParamName", lang)} p={p} mono />
        <IconBtn icon={prm.required ? "check_box" : "check_box_outline_blank"} on={!!prm.required} p={p} size={28} onClick={() => onChange({ ...prm, required: !prm.required })} title={t("apiRequired", lang)} />
        {onDelete && <IconBtn icon="close" p={p} size={28} onClick={onDelete} title={t("apiDeleteParam", lang)} />}
      </div>
      <div style={{ ...row, paddingLeft: 12 }}>
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
          <Select options={["query", "header", "cookie"].map((k) => ({ key: k, label: k }))} value={prm.in} onChange={(k) => onChange({ ...prm, in: k as ApiParameter["in"] })} p={p} label={t("apiParamIn", lang)} height={28} />
        </div>
        {typeSelect}
      </div>
    </div>
  );
}

function EndpointEditor({ e, api, run, onRenamed, p }: { e: ApiEndpoint; api: ApiSpec; run: ApiRun; onRenamed: (id: string) => void; p: Palette }) {
  const lang = useLang();
  const models = api.models ?? [];
  const update = (patch: Record<string, unknown>) => run(ops.updateEndpoint, { operationId: e.operationId, ...patch });
  const params = e.parameters ?? [];
  const body = e.requestBody && !isRef(e.requestBody) ? e.requestBody : undefined;
  const [bodyType, bodyMedia] = body ? (Object.entries(body.content)[0] ?? []) : [];
  const bodyChoice = isRef(e.requestBody) ? "custom" : schemaChoice(bodyMedia?.schema);
  const schemes = Object.keys(api.auth?.schemes ?? {});
  const who = e.security === undefined ? "" : !e.security.length ? "public" : Object.keys(e.security[0] ?? {})[0] ?? "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={row}>
        <div style={{ width: 84, flex: "0 0 auto" }} data-api-method>
          <Select options={HTTP_METHODS.map((m) => ({ key: m, label: m.toUpperCase() }))} value={e.method} onChange={(m) => update({ method: m })} p={p} label={t("apiMethod", lang)} height={28} />
        </div>
        <Cell grow mono value={e.path} onCommit={(path) => update({ path: path.trim() })} label={t("apiPath", lang)} p={p} data="path" />
      </div>
      <Cell mono value={e.operationId} onCommit={(id) => id.trim() && update({ rename: id.trim() }).ok && onRenamed(id.trim())} label={t("apiOperationId", lang)} p={p} data="operationId" />
      <Cell value={e.summary ?? ""} onCommit={(v) => update({ summary: v || null })} label={t("apiSummary", lang)} p={p} data="summary" />
      <Cell value={(e.tags ?? []).join(", ")} onCommit={(v) => update({ tags: v.split(",").map((x) => x.trim()).filter(Boolean) })} label={t("apiTags", lang)} p={p} data="tags" />
      <div style={row}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={label(p)}>{t("apiWho", lang)}</div>
          <Select
            options={[{ key: "", label: t("apiWhoDefault", lang), icon: "shield" }, { key: "public", label: t("apiWhoPublic", lang), icon: "public" }, ...schemes.map((s) => ({ key: s, label: s, icon: "key" }))]}
            value={who}
            onChange={(k) => update({ security: k === "" ? null : k === "public" ? [] : [{ [k]: [] }] })}
            p={p}
            label={t("apiWho", lang)}
            height={28}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={label(p)}>{t("apiPaging", lang)}</div>
          <Select
            options={[{ key: "", label: t("apiPagingNone", lang) }, { key: "cursor", label: t("apiPagingCursor", lang) }, { key: "offset", label: t("apiPagingOffset", lang) }]}
            value={e.pagination?.style ?? ""}
            onChange={(k) => update({ pagination: k ? { style: k, items: e.pagination?.items ?? "items" } : null })}
            p={p}
            label={t("apiPaging", lang)}
            height={28}
          />
        </div>
      </div>
      {e.pagination && <Cell mono value={e.pagination.items} onCommit={(items) => items.trim() && update({ pagination: { ...e.pagination!, items: items.trim() } })} label={t("apiItemsField", lang)} p={p} />}
      <div style={label(p)}>{t("apiParams", lang)}</div>
      {params.map((x, i) =>
        isRef(x) ? (
          <div key={i} style={{ ...mono, color: p.onSurfaceVariant, padding: "0 6px" }}>
            {x.$ref}
          </div>
        ) : (
          <ParamRow
            key={`${x.in}:${x.name}:${i}`}
            prm={x}
            p={p}
            onChange={(next) => update({ parameters: params.map((y, j) => (j === i ? next : y)) })}
            onDelete={x.in === "path" ? undefined : () => update({ parameters: params.filter((_, j) => j !== i) })}
          />
        ),
      )}
      <div>
        <AddChip
          text={t("apiAddParam", lang)}
          data="param"
          p={p}
          onClick={() => {
            const taken = new Set(params.map((x) => (isRef(x) ? "" : x.name)));
            let n = 1;
            while (taken.has(`q${n}`)) n++;
            update({ parameters: [...params, { name: `q${n}`, in: "query", schema: { type: "string" } }] });
          }}
        />
      </div>
      <div style={label(p)}>{t("apiBody", lang)}</div>
      <div style={row}>
        <div style={{ flex: 1, minWidth: 0 }} data-api-body>
          <Select options={schemaOptions(models, bodyChoice, lang, "apiBodyNone", true)} value={bodyChoice} onChange={(k) => (k === "custom" ? undefined : k ? update({ body: schemaFromChoice(k), contentType: bodyType ?? "application/json" }) : update({ body: null }))} p={p} label={t("apiBody", lang)} height={28} />
        </div>
        {body && (
          <div style={{ width: 128, flex: "0 0 auto" }}>
            <Select options={[...new Set([...CONTENT_TYPES, bodyType ?? ""])].filter(Boolean).map((k) => ({ key: k, label: k.replace("application/", "").replace("multipart/", "") }))} value={bodyType ?? "application/json"} onChange={(k) => update({ contentType: k })} p={p} label={t("apiContentType", lang)} height={28} />
          </div>
        )}
      </div>
      {bodyChoice === "object" && bodyMedia?.schema !== undefined && <InlineFields schema={bodyMedia.schema} models={models} p={p} onChange={(schema) => update({ body: schema, contentType: bodyType ?? "application/json" })} />}
      {bodyChoice === "custom" && <div style={{ ...hint(p), ...mono }}>{isRef(e.requestBody) ? e.requestBody.$ref : typeText(bodyMedia?.schema)}</div>}
      {bodyType === "multipart/form-data" && <div style={hint(p)}>{t("apiUploadHint", lang)}</div>}
      <div style={label(p)}>{t("apiResponses", lang)}</div>
      {Object.entries(e.responses).map(([code, r]) => {
        const media = !isRef(r) && r.content ? Object.entries(r.content)[0] : undefined;
        const choice = isRef(r) ? "custom" : media?.[0] === "application/problem+json" && schemaChoice(media[1].schema) === `ref:${PROBLEM_MODEL_NAME}` ? `ref:${PROBLEM_MODEL_NAME}` : schemaChoice(media?.[1].schema);
        return (
          <div key={code} data-api-response={code} style={row}>
            <span style={{ ...mono, width: 52, flex: "0 0 auto", fontWeight: 600, color: code.startsWith("2") ? p.primary : code === "default" || code.startsWith("4") || code.startsWith("5") ? p.error : p.onSurface }}>{code}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Select
                options={schemaOptions(models, choice, lang, "apiNoContent", true)}
                value={choice}
                onChange={(k) => {
                  if (k === "custom") return;
                  const schema = schemaFromChoice(k);
                  const base = isRef(r) ? { description: code } : { ...r };
                  const type = k === `ref:${PROBLEM_MODEL_NAME}` ? "application/problem+json" : "application/json";
                  const { content: _was, ...rest } = base as { content?: unknown; description: string };
                  update({ responses: { [code]: schema ? { ...rest, content: { [type]: { schema } } } : rest } });
                }}
                p={p}
                label={`${t("apiResponses", lang)} ${code}`}
                height={28}
              />
            </div>
            <IconBtn icon="close" p={p} size={28} onClick={() => update({ responses: { [code]: null } })} title={t("apiDeleteResponse", lang)} />
          </div>
        );
      })}
      {Object.entries(e.responses).map(([code, r]) => {
        const media = !isRef(r) && r.content ? Object.entries(r.content)[0] : undefined;
        const c = isRef(r) ? "custom" : schemaChoice(media?.[1].schema);
        return c === "custom" || c === "object" ? (
          <div key={`custom:${code}`} style={{ ...hint(p), ...mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={isRef(r) ? r.$ref : typeText(media?.[1].schema)}>
            {code}: {isRef(r) ? r.$ref : typeText(media?.[1].schema)}
          </div>
        ) : null;
      })}
      <div>
        <AddChip
          text={t("apiAddResponse", lang)}
          data="response"
          p={p}
          onClick={() => {
            const next = ["400", "401", "403", "404", "409", "422", "500"].find((c) => !(c in e.responses)) ?? "418";
            update({ responses: { [next]: { description: "", content: { "application/problem+json": { schema: { $ref: modelRef(PROBLEM_MODEL_NAME) } } } } } });
          }}
        />
      </div>
    </div>
  );
}

function EndpointsTab({ api, run, p }: { api: ApiSpec; run: ApiRun; p: Palette }) {
  const lang = useLang();
  const [open, setOpen] = useState<string | null>(null);
  const endpoints = api.endpoints ?? [];
  const tags = [...new Set(endpoints.map(tagOf))];
  return (
    <>
      {tags.map((tag) => (
        <div key={tag || "-"} data-api-tag={tag} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {(tags.length > 1 || tag) && <div style={{ ...label(p), padding: "6px 4px 0", textTransform: "uppercase" }}>{tag || t("apiUntagged", lang)}</div>}
          {endpoints
            .filter((e) => tagOf(e) === tag)
            .map((e) => (
              <div key={e.operationId} data-api-endpoint={e.operationId} style={card(p, open === e.operationId)}>
                <Opener open={open === e.operationId} onToggle={() => setOpen((x) => (x === e.operationId ? null : e.operationId))} p={p} data={`endpoint:${e.operationId}`}>
                  <MethodBadge m={e.method} p={p} />
                  <span style={{ ...mono, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${e.operationId}${e.summary ? ` — ${e.summary}` : ""}`}>
                    {e.path}
                  </span>
                  {e.security?.length === 0 && <Icon name="public" size={14} color={p.onSurfaceVariant} />}
                  {e.pagination && <Icon name="view_list" size={14} color={p.onSurfaceVariant} />}
                </Opener>
                {open === e.operationId && (
                  <>
                    <EndpointEditor e={e} api={api} run={run} onRenamed={setOpen} p={p} />
                    <div style={{ ...row, justifyContent: "flex-end" }}>
                      <IconBtn icon="delete" p={p} size={28} danger onClick={() => run(ops.removeEndpoint, { operationId: e.operationId })} title={t("apiDeleteEndpoint", lang)} />
                    </div>
                  </>
                )}
              </div>
            ))}
        </div>
      ))}
      <div>
        <AddChip
          text={t("apiAddEndpoint", lang)}
          data="endpoint"
          p={p}
          onClick={() => {
            const ids = new Set(endpoints.map((e) => e.operationId));
            let n = endpoints.length + 1;
            while (ids.has(`endpoint${n}`) || endpoints.some((e) => e.path === `/endpoint${n}`)) n++;
            const id = `endpoint${n}`;
            if (run(ops.addEndpoint, { operationId: id, method: "get", path: `/endpoint${n}` }).ok) setOpen(id);
          }}
        />
      </div>
    </>
  );
}

/* ---------- channels ---------- */

function ChannelEditor({ c, api, run, onRenamed, p }: { c: ApiChannel; api: ApiSpec; run: ApiRun; onRenamed: (id: string) => void; p: Palette }) {
  const lang = useLang();
  const models = api.models ?? [];
  const update = (patch: Record<string, unknown>) => run(ops.updateChannel, { id: c.id, ...patch });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={row}>
        <Cell grow mono value={c.id} onCommit={(id) => id.trim() && update({ rename: id.trim() }).ok && onRenamed(id.trim())} label={t("apiChannelId", lang)} p={p} />
        <div style={{ width: 140, flex: "0 0 auto" }}>
          <Select options={[{ key: "websocket", label: t("apiWebSocket", lang) }, { key: "sse", label: t("apiSse", lang) }]} value={c.transport ?? "websocket"} onChange={(k) => update({ transport: k })} p={p} label={t("apiTransport", lang)} height={28} />
        </div>
      </div>
      <Cell mono value={c.address} onCommit={(address) => update({ address: address.trim() })} label={t("apiAddress", lang)} p={p} data="address" />
      {pathParams(c.address).length > 0 && <div style={{ ...hint(p), ...mono }}>{pathParams(c.address).map((x) => `{${x}}`).join(" ")}</div>}
      <div style={label(p)}>{t("apiMessages", lang)}</div>
      {c.messages.map((m, i) => (
        <div key={`${m.name}:${i}`} data-api-message={m.name} style={row}>
          <Cell grow mono value={m.name} onCommit={(name) => name.trim() && update({ messages: c.messages.map((x, j) => (j === i ? { ...x, name: name.trim() } : x)), operations: c.operations.map((o) => (o.messages ? { ...o, messages: o.messages.map((n) => (n === m.name ? name.trim() : n)) } : o)) })} label={t("apiMessageName", lang)} p={p} />
          <div style={{ width: 112, flex: "0 0 auto" }}>
            <Select options={schemaOptions(models, schemaChoice(m.payload), lang, "apiNoContent", true)} value={schemaChoice(m.payload)} onChange={(k) => k !== "custom" && update({ messages: c.messages.map((x, j) => (j === i ? { ...x, payload: schemaFromChoice(k) } : x)) })} p={p} label={t("apiPayload", lang)} height={28} />
          </div>
          <IconBtn icon="close" p={p} size={28} onClick={() => update({ messages: c.messages.filter((_, j) => j !== i), operations: c.operations.map((o) => (o.messages ? { ...o, messages: o.messages.filter((n) => n !== m.name) } : o)) })} title={t("apiDeleteMessage", lang)} />
        </div>
      ))}
      <div>
        <AddChip
          text={t("apiAddMessage", lang)}
          data="message"
          p={p}
          onClick={() => {
            const taken = new Set(c.messages.map((m) => m.name));
            let n = c.messages.length + 1;
            while (taken.has(`message${n}`)) n++;
            update({ messages: [...c.messages, { name: `message${n}`, payload: { type: "object" } }] });
          }}
        />
      </div>
      <div style={label(p)}>{t("apiOperations", lang)}</div>
      {c.operations.map((o, i) => (
        <div key={`${o.id}:${i}`} data-api-operation={o.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "4px 0", borderTop: i ? `1px solid ${p.outlineVariant}` : undefined }}>
          <div style={row}>
            <Cell grow mono value={o.id} onCommit={(id) => id.trim() && update({ operations: c.operations.map((x, j) => (j === i ? { ...x, id: id.trim() } : x)) })} label="id" p={p} />
            <IconBtn icon="close" p={p} size={28} onClick={() => update({ operations: c.operations.filter((_, j) => j !== i) })} title={t("apiDeleteOperation", lang)} />
          </div>
          <div style={row}>
            <div style={{ flex: "1 1 0", minWidth: 0 }}>
              <Select options={[{ key: "send", label: t("apiServerSends", lang), icon: "south_west" }, { key: "receive", label: t("apiServerReceives", lang), icon: "north_east" }]} value={o.action} onChange={(k) => update({ operations: c.operations.map((x, j) => (j === i ? { ...x, action: k } : x)) })} p={p} label={t("apiOperations", lang)} height={28} />
            </div>
            <div style={{ flex: "1 1 0", minWidth: 0 }}>
              <Select
                options={[{ key: "", label: t("apiAllMessages", lang) }, ...c.messages.map((m) => ({ key: m.name, label: m.name }))]}
                value={o.messages?.length === 1 ? o.messages[0] : ""}
                onChange={(k) => update({ operations: c.operations.map((x, j) => (j === i ? (k ? { ...x, messages: [k] } : (({ messages: _all, ...rest }) => rest)(x)) : x)) })}
                p={p}
                label={t("apiMessages", lang)}
                height={28}
              />
            </div>
          </div>
        </div>
      ))}
      <div>
        <AddChip
          text={t("apiAddOperation", lang)}
          data="operation"
          p={p}
          onClick={() => {
            const taken = new Set((api.channels ?? []).flatMap((x) => x.operations.map((o) => o.id)));
            let n = 1;
            while (taken.has(`${c.id}Op${n}`)) n++;
            update({ operations: [...c.operations, { id: `${c.id}Op${n}`, action: "send" }] });
          }}
        />
      </div>
    </div>
  );
}

function RealtimeTab({ api, run, p }: { api: ApiSpec; run: ApiRun; p: Palette }) {
  const lang = useLang();
  const [open, setOpen] = useState<string | null>(null);
  const channels = api.channels ?? [];
  return (
    <>
      <div style={hint(p)}>{t("apiRealtimeHint", lang)}</div>
      {channels.map((c) => (
        <div key={c.id} data-api-channel={c.id} style={card(p, open === c.id)}>
          <Opener open={open === c.id} onToggle={() => setOpen((x) => (x === c.id ? null : c.id))} p={p} data={`channel:${c.id}`}>
            <Icon name={c.transport === "sse" ? "podcasts" : "sync_alt"} size={16} color={p.primary} />
            <span style={{ fontWeight: 600 }}>{c.id}</span>
            <span style={{ ...mono, flex: 1, minWidth: 0, color: p.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.address}</span>
          </Opener>
          {open === c.id && (
            <>
              <ChannelEditor c={c} api={api} run={run} onRenamed={setOpen} p={p} />
              <div style={{ ...row, justifyContent: "flex-end" }}>
                <IconBtn icon="delete" p={p} size={28} danger onClick={() => run(ops.removeChannel, { id: c.id })} title={t("apiDeleteChannel", lang)} />
              </div>
            </>
          )}
        </div>
      ))}
      <div>
        <AddChip
          text={t("apiAddChannel", lang)}
          data="channel"
          p={p}
          onClick={() => {
            const taken = new Set(channels.map((c) => c.id));
            let n = channels.length + 1;
            while (taken.has(`channel${n}`)) n++;
            const id = `channel${n}`;
            if (run(ops.addChannel, { id, address: `/${id}`, messages: [{ name: "message", payload: { type: "object" } }], operations: [{ id: `${id}Message`, action: "send" }] }).ok) setOpen(id);
          }}
        />
      </div>
    </>
  );
}

/* ---------- settings: info, servers, sign-in, import and export ---------- */

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Report = { models: number; endpoints: number; channels: number; converted: string[]; kept: string[]; dropped: string[]; problems: string[] };

function ImportBox({ run, p }: { run: ApiRun; p: Palette }) {
  const lang = useLang();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement | null>(null);
  const importText = (src: string) => {
    if (!src.trim()) return;
    const async = /^\s*["']?asyncapi["']?\s*:/m.test(src);
    const out = run(async ? ops.importAsyncApi : ops.importOpenApi, { text: src, mode });
    if (out.ok) {
      setReport(out.result as Report);
      setError("");
      setText("");
    } else {
      setReport(null);
      setError(out.message);
    }
  };
  const lines = (key: UIKey, xs: string[]) =>
    xs.length ? (
      <div style={hint(p)}>
        <b>{t(key, lang)}:</b> {xs.slice(0, 8).join("; ")}
        {xs.length > 8 ? "…" : ""}
      </div>
    ) : null;
  return (
    <div data-api-import style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={hint(p)}>{t("apiImportHint", lang)}</div>
      <Segmented options={[{ key: "merge", label: t("apiMerge", lang) }, { key: "replace", label: t("apiReplace", lang) }]} value={mode} onChange={setMode} p={p} height={30} label={t("apiImport", lang)} />
      <Field value={text} onChange={setText} placeholder={t("apiPaste", lang)} label={t("apiPaste", lang)} p={p} multiline rows={5} />
      <div style={{ ...row, flexWrap: "wrap", gap: 6 }}>
        <AddChip icon="upload" text={t("apiImportNow", lang)} data="import" p={p} onClick={() => importText(text)} />
        <AddChip icon="folder_open" text={t("apiOpenFile", lang)} data="open-file" p={p} onClick={() => file.current?.click()} />
        <input
          ref={file}
          type="file"
          accept=".yaml,.yml,.json,application/json,application/yaml,text/yaml"
          data-api-file
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void f.text().then(importText);
          }}
        />
      </div>
      {error && (
        <div role="alert" style={{ ...hint(p), color: p.error }}>
          {error}
        </div>
      )}
      {report && (
        <div data-api-report style={{ display: "flex", flexDirection: "column", gap: 4, padding: 8, borderRadius: 10, background: p.surfaceContainer }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: p.onSurface }}>
            {t("apiImported", lang).replace("{models}", String(report.models)).replace("{endpoints}", String(report.endpoints)).replace("{channels}", String(report.channels))}
          </div>
          {lines("apiConverted", report.converted)}
          {lines("apiKept", report.kept)}
          {lines("apiDropped", report.dropped)}
        </div>
      )}
    </div>
  );
}

function SettingsTab({ api, title, run, p }: { api: ApiSpec; title: string; run: ApiRun; p: Palette }) {
  const lang = useLang();
  const servers = api.servers ?? [];
  const setServers = (next: typeof servers) => run(ops.setServers, { servers: next.map(({ env, url, description, realtime }) => ({ env, url, ...(description ? { description } : {}), ...(realtime ? { realtime } : {}) })) });
  const schemes = api.auth?.schemes ?? {};
  const endpointOptions = [{ key: "", label: t("apiNoEndpoint", lang) }, ...(api.endpoints ?? []).map((e) => ({ key: e.operationId, label: `${e.method.toUpperCase()} ${e.path}` }))];
  const addScheme = (name: string, scheme: ApiSecurityScheme) => run(ops.setAuth, { schemes: { [name]: scheme }, ...(api.auth?.security?.length ? {} : { security: [{ [name]: [] }] }) });
  const doc = { api, title };
  return (
    <>
      <Section id="api-info" icon="info" title={t("apiInfo", lang)} p={p}>
        <div style={row}>
          <Cell grow value={api.info?.title ?? ""} onCommit={(v) => run(ops.setApiInfo, { title: v || null })} label={t("apiTitle", lang)} p={p} data="api-title" />
          <Cell width={84} value={api.info?.version ?? ""} onCommit={(v) => run(ops.setApiInfo, { version: v || null })} label={t("apiVersion", lang)} p={p} />
        </div>
      </Section>
      <Section id="api-servers" icon="dns" title={t("apiServers", lang)} p={p}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {servers.map((s, i) => (
            <div key={`${s.env}:${i}`} data-api-server={s.env} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={row}>
                <Cell width={72} mono value={s.env} onCommit={(env) => env.trim() && setServers(servers.map((x, j) => (j === i ? { ...x, env: env.trim() } : x)))} label={t("apiEnv", lang)} p={p} />
                <Cell grow mono value={s.url} onCommit={(url) => setServers(servers.map((x, j) => (j === i ? { ...x, url: url.trim() } : x)))} label={t("apiBaseUrl", lang)} p={p} />
                <IconBtn icon="close" p={p} size={28} onClick={() => setServers(servers.filter((_, j) => j !== i))} title={t("apiDeleteServer", lang)} />
              </div>
              <div style={{ paddingLeft: 76 }}>
                <Cell mono value={s.realtime ?? ""} onCommit={(realtime) => setServers(servers.map((x, j) => (j === i ? { ...x, realtime: realtime.trim() || undefined } : x)))} label={t("apiRealtimeUrl", lang)} p={p} />
              </div>
            </div>
          ))}
          <div style={{ ...row, flexWrap: "wrap", gap: 6 }}>
            {!servers.length && (
              <AddChip
                text={t("apiAddStandardServers", lang)}
                data="standard-servers"
                p={p}
                onClick={() =>
                  setServers([
                    { env: "dev", url: "http://localhost:3000" },
                    { env: "staging", url: "https://staging.example.com" },
                    { env: "prod", url: "https://api.example.com" },
                  ])
                }
              />
            )}
            <AddChip
              text={t("apiAddServer", lang)}
              data="server"
              p={p}
              onClick={() => {
                const taken = new Set(servers.map((s) => s.env));
                let n = servers.length + 1;
                while (taken.has(`env${n}`)) n++;
                setServers([...servers, { env: `env${n}`, url: "/" }]);
              }}
            />
          </div>
        </div>
      </Section>
      <Section id="api-auth" icon="key" title={t("apiAuth", lang)} p={p}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {Object.entries(schemes).map(([name, s]) => (
            <div key={name} data-api-scheme={name} style={row}>
              <Icon name="key" size={16} color={p.onSurfaceVariant} />
              <span style={{ ...mono, fontWeight: 600, color: p.onSurface }}>{name}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: p.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[s.type, s.scheme, s.bearerFormat, s.in && `${s.in} ${s.name}`].filter(Boolean).join(" · ")}</span>
              <IconBtn
                icon="close"
                p={p}
                size={28}
                onClick={() => run(ops.setAuth, { schemes: { [name]: null }, ...(api.auth?.security?.some((r) => name in r) ? { security: api.auth.security.filter((r) => !(name in r)) } : {}) })}
                title={t("apiDeleteScheme", lang)}
              />
            </div>
          ))}
          <div style={{ ...row, flexWrap: "wrap", gap: 6 }}>
            {!schemes.bearerAuth && <AddChip text={t("apiAddBearer", lang)} data="bearer" p={p} onClick={() => addScheme("bearerAuth", { type: "http", scheme: "bearer", bearerFormat: "JWT" })} />}
            {!schemes.apiKey && <AddChip text={t("apiAddApiKey", lang)} data="apikey" p={p} onClick={() => addScheme("apiKey", { type: "apiKey", in: "header", name: "X-API-Key" })} />}
            {!schemes.oauth2 && (
              <AddChip text={t("apiAddOAuth", lang)} data="oauth" p={p} onClick={() => addScheme("oauth2", { type: "oauth2", flows: { authorizationCode: { authorizationUrl: "https://auth.example.com/authorize", tokenUrl: "https://auth.example.com/token", refreshUrl: "https://auth.example.com/token", scopes: {} } } })} />
            )}
          </div>
          {Object.keys(schemes).length > 0 && (
            <>
              <div style={label(p)}>{t("apiDefaultSecurity", lang)}</div>
              <Select options={[{ key: "", label: t("apiNothing", lang), icon: "public" }, ...Object.keys(schemes).map((s) => ({ key: s, label: s, icon: "key" }))]} value={Object.keys(api.auth?.security?.[0] ?? {})[0] ?? ""} onChange={(k) => run(ops.setAuth, { security: k ? [{ [k]: [] }] : null })} p={p} label={t("apiDefaultSecurity", lang)} height={28} />
            </>
          )}
          {(api.endpoints?.length ?? 0) > 0 &&
            (["login", "refresh", "logout"] as const).map((k) => (
              <div key={k} data-api-auth-endpoint={k}>
                <div style={label(p)}>{t(k === "login" ? "apiLogin" : k === "refresh" ? "apiRefresh" : "apiLogout", lang)}</div>
                <Select options={endpointOptions} value={api.auth?.[k] ?? ""} onChange={(v) => run(ops.setAuth, { [k]: v || null })} p={p} label={t(k === "login" ? "apiLogin" : k === "refresh" ? "apiRefresh" : "apiLogout", lang)} height={28} />
              </div>
            ))}
        </div>
      </Section>
      <Section id="api-import" icon="upload_file" title={t("apiImport", lang)} p={p}>
        <ImportBox run={run} p={p} />
      </Section>
      <Section id="api-export" icon="ios_share" title={t("apiExport", lang)} p={p}>
        <div style={{ ...row, flexWrap: "wrap", gap: 6 }}>
          <AddChip icon="description" text="openapi.yaml" data="export-openapi" p={p} onClick={() => download("openapi.yaml", toOpenApi(doc), "application/yaml")} />
          <AddChip icon="description" text="asyncapi.yaml" data="export-asyncapi" p={p} onClick={() => download("asyncapi.yaml", toAsyncApi(doc), "application/yaml")} />
          <AddChip icon="code" text="api-types.ts" data="export-types" p={p} onClick={() => download("api-types.ts", schemaToTs(api), "text/typescript")} />
        </div>
      </Section>
    </>
  );
}

/* ---------- the tab ---------- */

const TAB_KEY = "m3e:api:tab";

export function ApiPanel({ p, api: given, collections, title, run }: Props) {
  const lang = useLang();
  const api = given ?? {};
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const v = localStorage.getItem(TAB_KEY);
      return v === "endpoints" || v === "realtime" || v === "settings" ? v : "models";
    } catch {
      return "models";
    }
  });
  const pick = (k: Tab) => {
    setTab(k);
    try {
      localStorage.setItem(TAB_KEY, k);
    } catch {
      /* the choice is only a convenience */
    }
  };
  const problems = useMemo(() => apiProblems(given, { collections }), [given, collections]);
  const [showProblems, setShowProblems] = useState(false);
  const errors = problems.filter((x) => x.level === "error").length;
  const counts = { models: api.models?.length ?? 0, endpoints: api.endpoints?.length ?? 0, realtime: api.channels?.length ?? 0 };
  return (
    <DenseContext.Provider value>
      <div data-api-panel className="no-scrollbar" style={{ height: "100%", overflowY: "auto", padding: "10px 12px 16px", display: "flex", flexDirection: "column", gap: 8, boxSizing: "border-box" }}>
        <Segmented
          options={[
            { key: "models", icon: "data_object", title: t("apiModels", lang), label: counts.models ? String(counts.models) : undefined },
            { key: "endpoints", icon: "api", title: t("apiEndpoints", lang), label: counts.endpoints ? String(counts.endpoints) : undefined },
            { key: "realtime", icon: "sync_alt", title: t("apiRealtime", lang), label: counts.realtime ? String(counts.realtime) : undefined },
            { key: "settings", icon: "settings", title: t("apiSettings", lang) },
          ]}
          value={tab}
          onChange={pick}
          p={p}
          height={32}
          label={t("apiTab", lang)}
        />
        <div style={{ ...row, justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: p.onSurface }}>{t(tab === "models" ? "apiModels" : tab === "endpoints" ? "apiEndpoints" : tab === "realtime" ? "apiRealtime" : "apiSettings", lang)}</span>
          {problems.length > 0 && (
            <button data-api-problems={errors} onClick={() => setShowProblems((x) => !x)} className="m3-press" style={{ ...chip(p), height: 24, borderColor: errors ? p.error : p.outlineVariant, color: errors ? p.error : p.onSurfaceVariant }}>
              <Icon name={errors ? "error" : "warning"} size={14} />
              {t("apiProblems", lang).replace("{n}", String(problems.length))}
            </button>
          )}
        </div>
        {showProblems && problems.length > 0 && (
          <div data-api-problem-list style={{ display: "flex", flexDirection: "column", gap: 2, padding: 8, borderRadius: 10, background: p.surfaceContainer, maxHeight: 200, overflowY: "auto" }}>
            <div style={{ ...hint(p), fontWeight: 600 }}>{t("apiErrorsWarnings", lang).replace("{errors}", String(errors)).replace("{warnings}", String(problems.length - errors))}</div>
            {problems.slice(0, 50).map((x, i) => (
              <div key={i} style={{ fontSize: 11, lineHeight: 1.4, color: x.level === "error" ? p.error : p.onSurfaceVariant }}>
                <span style={mono}>{x.at}</span> {x.message}
              </div>
            ))}
          </div>
        )}
        {!counts.models && !counts.endpoints && !counts.realtime && tab !== "settings" && <div style={hint(p)}>{t("apiHint", lang)}</div>}
        {tab === "models" ? <ModelsTab api={api} collections={collections} run={run} p={p} /> : tab === "endpoints" ? <EndpointsTab api={api} run={run} p={p} /> : tab === "realtime" ? <RealtimeTab api={api} run={run} p={p} /> : <SettingsTab api={api} title={title} run={run} p={p} />}
      </div>
    </DenseContext.Provider>
  );
}
