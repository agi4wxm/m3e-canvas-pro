//! Filled in for the product (lib/export/regions.ts, lib/export/copy.ts filledFile) into apps/mobile/src/generated/bind.ts of every product with a mobile app (lib/export/targets/mobile.ts):
//! the mobile app's own code, typechecked and linted with the kit (rn/types/app.d.ts stands in for the Expo packages
//! the kit does not install). Written in the product's style (Prettier, no semicolons); the lines starting with //!
//! are the editor's only.
import { useMemo } from "react"
import { screenParams, sourceKey, useBindings, useDataSource, useForm, useSubscription as useSharedSubscription, type Bindings, type CallResult, type ChannelDef, type ChannelEvent, type ChannelView, type FieldRule, type FormHandle, type ParamSpec, type SourceHandle } from "@m3e/app-runtime"
import { useApp, useOnShow, type ActionBody } from "../kit"
import { call } from "./api"
import { FORMS, OPERATIONS } from "./contract"
//#if copies
import { runtime } from "./runtime"
//#end

/* What a printed screen's bindings stand on (lib/export/rn/print.ts writes the screens): its params, the scope its
 * expressions read, its data sources and its forms, each made of packages/app-runtime's hooks. */

export { keyOf, regionOf, type ChannelDef, type ParamSpec } from "@m3e/app-runtime"
export { pickFile, fileName } from "./files"
//#if copies

/** Copies words through the app's capabilities (clipboard.write: the app's adapter in src/custom/capabilities.ts, else
 *  the platform's), and says whether they were. A phone has no clipboard the app reaches without a package the product
 *  adds, so with no adapter the kit's copy button says it did not copy, never that it did. */
export async function copyText(text: string): Promise<boolean> {
  const out = await runtime.invoke("clipboard.write", { text })
  return out.ok
}
//#end

/** a data source of a screen, as the design has it (Frame.data) */
export type SourceDef = { name: string; operationId: string; params?: Record<string, string>; body?: string; load?: "enter" | "demand"; pageSize?: number }

/** a form of a screen, as the design has it (Group.form): its operation, the fields its inputs fill, what it sends
 *  besides, where it goes after */
export type FormDef = {
  id: string
  operationId: string
  fields: string[]
  params?: Record<string, string>
  values?: Record<string, string>
  initial?: Record<string, unknown>
  then?: ActionBody
  catch?: ActionBody
  /** it signs in: once it has, the screen the app was sent from takes the place of where `then` goes */
  login?: boolean
}

/** A form as a screen holds it: the runtime's form, what the design says of it, and its sending, which the taps'
 *  interpreter (./effects) runs its `then` or `catch` after. */
export type FormFor = FormHandle & { def: FormDef; send: () => Promise<CallResult | { ok: false; invalid: true }> }

/** a screen's params: what it was opened with, each as its type has it, the example of each it was not given */
export function useParams(specs: ParamSpec[], given: Record<string, unknown> | undefined): Record<string, unknown> {
  /* the params as words: an equal object is the same params */
  const key = JSON.stringify(given ?? {})
  return useMemo(() => screenParams(specs, JSON.parse(key) as Record<string, unknown>), [specs, key])
}

/** what a screen's expressions read: its params, the variables, the session (`auth`) and the time (`now`) */
export function useScreenScope(params: Record<string, unknown>): Bindings {
  const app = useApp()
  return useBindings({ params, vars: app.varScope })
}

/** A data source: its operation called with its params (each an expression; a path parameter it does not give is the
 *  screen's param of that name), page after page as the contract pages it. */
export function useSource(def: SourceDef, $: Bindings): SourceHandle {
  const op = OPERATIONS[def.operationId]
  const args: Record<string, unknown> = {}
  for (const [name, at] of Object.entries(op?.params ?? {})) if (at === "path" && !def.params?.[name]) args[name] = $.arg(`params.${name}`)
  for (const [name, e] of Object.entries(def.params ?? {})) {
    const v = $.arg(e)
    if (v !== undefined) args[name] = v
  }
  const body = def.body ? $.ev(def.body) : undefined
  return useDataSource(
    {
      key: sourceKey(def.operationId, body === undefined ? args : { args, body }),
      operation: def.operationId,
      ...(op?.list ? { list: op.list } : {}),
      ...(op?.paging ? { paging: op.paging } : {}),
      ...(def.pageSize ? { pageSize: def.pageSize } : {}),
      args,
      load: ({ page, signal }) => call(def.operationId, { params: { ...args, ...page }, body }, signal ? { signal } : {}),
    },
    { load: def.load ?? "enter" },
  )
}

/** A form: its fields checked by the rules of its operation's body, sent with its params and values. What runs after
 *  the answer (its `then`, its `catch`) is the taps' interpreter's to run, as for a call. */
export function useFormFor(def: FormDef, $: Bindings): FormFor {
  const fields = useMemo(() => {
    const all = FORMS[def.operationId] ?? {}
    const out: Record<string, FieldRule> = {}
    for (const f of def.fields) if (all[f]) out[f] = all[f]
    return out
  }, [def])
  const send = (body: Record<string, unknown>, init: Parameters<typeof call>[2]) => {
    const params: Record<string, unknown> = {}
    for (const [k, e] of Object.entries(def.params ?? {})) params[k] = $.arg(e)
    return call(def.operationId, { params, body }, init)
  }
  const extra = () => Object.fromEntries(Object.entries(def.values ?? {}).map(([k, e]) => [k, $.ev(e)]))
  const form = useForm({
    /* kept by the runtime: what is typed stays while the app signs in and comes back */
    id: def.id,
    fields,
    initial: def.initial,
    status: OPERATIONS[def.operationId]?.status,
    send,
    extra,
  })
  return { ...form, def, send: () => form.controller.submit(send, extra()) }
}

/** A subscription of the screen to a realtime channel (packages/app-runtime `useSubscription`, docs/交互规则.md “订阅”):
 *  open while the screen is on show (the app's routes say: the stack keeps the screens under the top one drawn), its
 *  address read in the screen's scope, what runs on each message by key (`on:<message>`, else `on:message`). */
export function useSubscription(def: ChannelDef, $: Bindings, on?: Readonly<Record<string, (event: ChannelEvent) => void>>): ChannelView {
  const shown = useOnShow()
  return useSharedSubscription(def, $, on, { active: shown })
}
