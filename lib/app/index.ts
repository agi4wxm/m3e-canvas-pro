/* The runtime shared by every exported front end (packages/app-runtime): React, but no DOM, React Native or Taro;
 * what is the platform's (where tokens are kept, the transport, where a 401 goes) is handed in. docs/导出.md describes
 * it. The pieces under it are the editor's own (lib/bindings: expressions, formats, the app's words, the rules of
 * forms, how a source pages and what a region shows), so the preview and every exported app behave alike. */

export { Runtime, createRuntime, type CallOptions, type InvokeOptions, type RuntimeOptions } from "./runtime";
export type { CapabilityError, CapabilityHost, FailureKind, InvokeOutcome } from "../capabilities/types";
export { SessionStore, memoryStorage, sessionOf, sessionTransport, type AuthConfig, type AuthOperation, type Session, type SessionState, type TokenPlacement, type TokenStorage } from "./session";
export { SourceCache, sourceKey, type LoadInit, type PageValue, type SourceSpec } from "./sources";
export { FormController, type CallResult, type FormFields, type FormState, type SendInit } from "./forms";
export { Bindings, keyOf, type EvalContext, type Scope } from "./scope";
export { Store, type Listener } from "./store";
export {
  RuntimeProvider,
  useAuthScope,
  useBindings,
  useCall,
  useDataSource,
  useInvoke,
  useEpoch,
  useForm,
  useLang,
  useRegion,
  useRequireAuth,
  useRuntime,
  useSession,
  type FormHandle,
  type FormOptions,
  type SessionHandle,
  type SourceHandle,
} from "./react";

export { display, evaluate, fillTemplate, holds, parseExpr, truthy, HELPERS } from "../bindings/expr";
export { formatDate, formatNumber, type FormatContext } from "../bindings/format";
export { appMessage, APP_MESSAGES, type AppLang, type MessageKey } from "../bindings/messages";
export { fieldError, isBlank, pointerField, problemFieldErrors, problemMessage, problemOf, statusMessage, typedValue, type FieldKind, type FieldRule, type Problem } from "../bindings/rules";
export { MAX_ITEMS, regionOf, screenParams, sourceView, typedParam, type ListAt, type Paging, type ParamSpec, type RegionShows, type SourceState, type SourceStatus, type SourceView } from "../bindings/sources";
export { formViewOf, readFields, setPath, type FormRun, type FormView } from "../bindings/form";
export type { AbortSignalLike, HttpMethod, Transport, TransportFile, TransportRequest, TransportResponse } from "../api/transport";
/* how a transport of the platform's reads an answer (the mini-program's does; packages/api has the same file) */
export { readBody, textBody, utf8Bytes, type RawResponse, type ResponseFile } from "../api/body";
