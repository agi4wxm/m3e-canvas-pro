/* What an endpoint starts with when nobody says otherwise: the words of a status, the error every endpoint can answer
 * with (RFC 9457 problem details, `application/problem+json`), the query parameters a paged list takes, the path
 * parameters its path names. */

import { pathParams } from "./schema";
import { modelRef, paginationOf, type ApiModel, type ApiPagination, type ApiParameter, type ApiRef, type ApiResponse, type HttpMethod } from "./types";

/** the reason phrase of the usual status codes */
export const STATUS_TEXT: Record<string, string> = {
  "200": "OK",
  "201": "Created",
  "202": "Accepted",
  "204": "No Content",
  "301": "Moved Permanently",
  "304": "Not Modified",
  "400": "Bad Request",
  "401": "Unauthorized",
  "403": "Forbidden",
  "404": "Not Found",
  "409": "Conflict",
  "413": "Content Too Large",
  "415": "Unsupported Media Type",
  "422": "Unprocessable Content",
  "429": "Too Many Requests",
  "500": "Internal Server Error",
  "503": "Service Unavailable",
  default: "Error",
};

export const statusText = (code: string) => STATUS_TEXT[code] ?? (code.startsWith("2") ? "Success" : code.startsWith("4") || code.startsWith("5") ? "Error" : "Response");

/** the model RFC 9457 problem details are written as */
export const PROBLEM_MODEL_NAME = "Problem";
export const PROBLEM_TYPE = "application/problem+json";

/** RFC 9457 problem details, with the `errors` extension member saying field by field what is wrong with a request */
export const problemModel = (): ApiModel => ({
  name: PROBLEM_MODEL_NAME,
  schema: {
    type: "object",
    description: "An error, as RFC 9457 problem details (application/problem+json).",
    properties: {
      type: { type: "string", format: "uri", description: "What kind of problem it is; about:blank when the status says it all.", default: "about:blank" },
      title: { type: "string", description: "A short summary of the kind of problem." },
      status: { type: "integer", minimum: 100, maximum: 599, description: "The HTTP status code." },
      detail: { type: "string", description: "What went wrong this time, for a person to read." },
      instance: { type: "string", format: "uri", description: "Which occurrence of the problem this is." },
      errors: {
        type: "array",
        description: "What is wrong with the request, field by field.",
        items: {
          type: "object",
          properties: { pointer: { type: "string", description: "A JSON Pointer to the field in the request body: #/email." }, detail: { type: "string", description: "What is wrong with it." } },
          required: ["detail"],
        },
      },
    },
    required: ["title", "status"],
  },
});

/** the error response every endpoint has by default: any status the others do not name, as problem details */
export const problemResponse = (): ApiResponse => ({ description: "Error", content: { [PROBLEM_TYPE]: { schema: { $ref: modelRef(PROBLEM_MODEL_NAME) } } } });

/** the status an endpoint answers with when it goes well */
export const successStatus = (method: HttpMethod, returns: boolean) => (method === "post" ? "201" : method === "delete" && !returns ? "204" : "200");

/** a path parameter for one of the path's braces */
export const pathParameter = (name: string): ApiParameter => ({ name, in: "path", required: true, schema: { type: "string" } });

/** The parameters with the path's: each {name} of the path has a path parameter (a new one is a required string, in
 *  the path's order, before the rest); a path parameter the path no longer names goes. */
export function syncPathParams(path: string, params: (ApiParameter | ApiRef)[] | undefined): (ApiParameter | ApiRef)[] {
  const names = pathParams(path);
  const list = params ?? [];
  const isPath = (p: ApiParameter | ApiRef): p is ApiParameter => !("$ref" in p && typeof p.$ref === "string") && (p as ApiParameter).in === "path";
  const kept = list.filter((p) => !isPath(p) || names.includes(p.name));
  const have = new Set(kept.filter(isPath).map((p) => p.name));
  const added = names.filter((n) => !have.has(n)).map(pathParameter);
  return [...added, ...kept];
}

/** the query parameters a paged list takes, those it lacks added */
export function withPageParams(p: ApiPagination, params: (ApiParameter | ApiRef)[] | undefined): (ApiParameter | ApiRef)[] {
  const full = paginationOf(p);
  const list = [...(params ?? [])];
  const has = (name: string) => list.some((x) => (x as ApiParameter).in === "query" && (x as ApiParameter).name === name);
  const add = (x: ApiParameter) => {
    if (!has(x.name)) list.push(x);
  };
  if (full.style === "cursor") add({ name: full.cursorParam, in: "query", required: false, description: "The cursor of the page to read (the last page's next cursor); left out, the first page.", schema: { type: "string" } });
  else add({ name: full.offsetParam, in: "query", required: false, description: "How many items to skip.", schema: { type: "integer", minimum: 0, default: 0 } });
  add({ name: full.limitParam, in: "query", required: false, description: "How many items a page holds.", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } });
  return list;
}
