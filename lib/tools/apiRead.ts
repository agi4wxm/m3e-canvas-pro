/* The tools that read the API section (lib/api): the whole of it in a few lines, one endpoint or one model in full, and
 * the spec files it is written as. None of them changes anything. */

import { apiOutline, describeEndpoint, describeModel, schemaToTs, toAsyncApi, toOpenApi } from "../api";
import { tool, ToolFailure, type Tool } from "./types";

const getApi = tool<{ problems?: number }>({
  name: "get_api",
  group: "read",
  description:
    "The API section in a few lines: title and servers, auth (schemes, default security, the login and refresh endpoints), every model with its fields (name? type(format)), the endpoints by tag (METHOD path operationId ?query body → status type, paging, auth), the realtime channels with their messages and who sends them, and its problems.",
  input: { type: "object", properties: { problems: { type: "integer", minimum: 0, description: "how many problems to list (5 by default)" } }, required: [], additionalProperties: false },
  output: "the outline as text",
  readOnly: true,
  destructive: false,
  run(a, env) {
    return { result: apiOutline(env.store.get().doc.api, { problems: a.problems }) };
  },
});

const describeEndpointTool = tool<{ operationId: string }>({
  name: "describe_endpoint",
  group: "read",
  description: "One endpoint in full: the OpenAPI operation as stored (parameters, requestBody, responses, security, pagination), its parameters with references followed, the security that applies, the pagination with its default names, the schemas of the models it uses, and its problems.",
  input: { type: "object", properties: { operationId: { type: "string" } }, required: ["operationId"], additionalProperties: false },
  readOnly: true,
  destructive: false,
  run(a, env) {
    const api = env.store.get().doc.api;
    const e = api?.endpoints?.find((x) => x.operationId === a.operationId);
    if (!api || !e) throw new ToolFailure("not_found", `There is no endpoint ${JSON.stringify(a.operationId)}.`, "get_api lists the endpoints by operationId.");
    return { result: describeEndpoint(api, e) };
  },
});

const describeModelTool = tool<{ name: string }>({
  name: "describe_model",
  group: "read",
  description: "One model in full: its JSON Schema, its fields as rows (name, type, required, format, enum, description, example), the TypeScript type it becomes, where it is used (models, endpoints, channels, data collections), and its problems.",
  input: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false },
  readOnly: true,
  destructive: false,
  run(a, env) {
    const s = env.store.get();
    const out = s.doc.api ? describeModel(s.doc.api, a.name, s.doc.collections) : undefined;
    if (!out) throw new ToolFailure("not_found", `There is no model ${JSON.stringify(a.name)}.`, "get_api lists the models.");
    return { result: out };
  },
});

const getSpec = tool<{ kind: "openapi" | "asyncapi" | "typescript" }>({
  name: "get_spec",
  group: "read",
  description: "The API written as a standard file: openapi (OpenAPI 3.1 YAML, the HTTP endpoints), asyncapi (AsyncAPI 3.0 YAML, the realtime channels) or typescript (the models as TypeScript types). What the export writes.",
  input: { type: "object", properties: { kind: { type: "string", enum: ["openapi", "asyncapi", "typescript"] } }, required: ["kind"], additionalProperties: false },
  output: "the file's text",
  readOnly: true,
  destructive: false,
  run(a, env) {
    const doc = env.store.document();
    return { result: a.kind === "openapi" ? toOpenApi(doc) : a.kind === "asyncapi" ? toAsyncApi(doc) : schemaToTs(doc.api) };
  },
});

export const API_READ_TOOLS: Tool<never>[] = [getApi, describeEndpointTool, describeModelTool, getSpec] as unknown as Tool<never>[];
