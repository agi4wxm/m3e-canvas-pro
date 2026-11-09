/* The runtime shared by every exported front end (packages/app-runtime): React, but no DOM, React Native or Taro;
 * what is the platform's (where tokens are kept, the transport, where a 401 goes) is handed in. docs/导出.md describes
 * it. The pieces under it are the editor's own (lib/bindings: expressions, formats, the app's words, the rules of
 * forms, how a source pages and what a region shows), so the preview and every exported app behave alike. */

export { Runtime, callKey, createRuntime, type AnswerAt, type CallOptions, type InvokeOptions, type RuntimeOptions } from "./runtime";
export * from "./actions";
export type { CapabilityError, CapabilityHost, FailureKind, InvokeOutcome } from "../capabilities/types";
export { SessionStore, memoryStorage, sessionOf, sessionTransport, type AuthConfig, type AuthOperation, type Session, type SessionState, type TokenPlacement, type TokenStorage } from "./session";
export { SourceCache, sourceKey, type LoadInit, type PageValue, type SourceSpec } from "./sources";
export { ChannelHub, channelSpecFor, type ChannelDef, type ChannelSpec } from "./channels";
export { KEEP_DEFAULT, KEEP_MAX, addressOf, channelView, isoOf, keepOf, messageAction, type ChannelEntry, type ChannelEvent, type ChannelState, type ChannelStatus, type ChannelView } from "../bindings/channels";
export { FormController, type CallResult, type FormFields, type FormState, type SendInit } from "./forms";
export { Bindings, keyOf, type EvalContext, type Scope } from "./scope";
export { Store, type Listener } from "./store";
export {
  RuntimeProvider,
  useAuthScope,
  useBindings,
  useCall,
  useChannel,
  useSubscription,
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
export type { AbortSignalLike, ChannelConnection, ChannelMessage, HttpMethod, Transport, TransportFile, TransportRequest, TransportResponse } from "../api/transport";
/* how a transport of the platform's reads an answer (the mini-program's does; packages/api has the same file) */
export { readBody, textBody, utf8Bytes, type RawResponse, type ResponseFile } from "../api/body";
/* The interpreter every host runs the design's taps with (lib/actions, docs/交互规则.md): the exported phone app and
 * mini-program hand it a host made of their own state and this runtime, so a tap means the same on every one. */
export { run, startOf, chooseBranch, conditionHolds } from "../actions/run";
export { linkUrlOf, MAX_CALL_DEPTH } from "../actions/model";
export type { Host as ActionHost, Tap, Outcome, CallArgs, Change, FormRef, GoOptions as ActionGoOptions } from "../actions/host";
export type { Action, ActionBody, Effect, Condition } from "../actions/model";
/* The world views (lib/world, docs/边界与契约.md “实时玩法”): the channel each one's input actions come in on, its
 * contract with an engine, and M3E's example engine */
export { createWorlds, inputLog, inputWords, QUIET_CHANNEL, type Worlds } from "../world/channel";
export { connectWorld, createExampleWorld, type ExampleWorld, type ExampleWorldOptions } from "../world/example";
export { createScriptedWorld, type ScriptedWorld, type ScriptedWorldOptions } from "../world/scripted";
export { eventsBetween, playsOn, sceneAt, scriptLength, type WorldScene, type WorldScript, type WorldScriptEntity, type WorldScriptEvent, type WorldScriptFired, type WorldScriptStep } from "../world/script";
export { EXAMPLE_WORLD_CONTRACT, contractInputs, type WorldContract, type WorldSchema } from "../world/contract";
export { WORLD_HOST_CONTRACT, WORLD_LIFECYCLE, type InputPriority, type OverlayPolicy, type PausePolicy, type WorldHostContract, type WorldLifecycleStep } from "../world/hostContract";
export { WORLD_EVENTS, type Vec2, type World, type WorldChannel, type WorldClock, type WorldEntity, type WorldInputDecl, type WorldInputType, type WorldEventName, type WorldEvents, type WorldInput, type WorldListener, type WorldPointer, type WorldRect, type WorldSlotProps, type WorldState, type WorldStatus } from "../world/types";
