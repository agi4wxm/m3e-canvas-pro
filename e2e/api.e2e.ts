/* The API tab, through the editor's own controls: a model with fields, an endpoint that returns it, a small OpenAPI
 * file opened from disk, and all of it still there after a reload; one undo takes back one change. */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { check, equal, leftTab, reload, savedDoc, settle, undo, type E2ETest, type Page } from "./lib";

type Api = {
  models?: { name: string; schema: { properties?: Record<string, { type?: unknown; format?: string; $ref?: string }>; required?: string[] } }[];
  endpoints?: { operationId: string; method: string; path: string; parameters?: { name: string; in: string }[]; responses: Record<string, { content?: Record<string, { schema?: unknown }> }> }[];
  servers?: { env: string; url: string; description?: string }[];
};
const apiOf = async (page: Page) => ((await savedDoc(page)) as unknown as { api?: Api }).api ?? {};

/** a cell of the API tab, typed into and left, as a person does */
async function typeCell(page: Page, selector: string, text: string) {
  const cell = page.locator(selector).first();
  await cell.click();
  await cell.fill(text);
  await cell.press("Enter");
  await settle(page, 400);
}

/** one of the API tab's selects, by its label and the words of the option, inside a part of the panel */
async function pickIn(page: Page, scope: string, label: string, option: string) {
  await page.locator(`${scope} button[aria-haspopup="listbox"][aria-label="${label}"]`).first().click();
  await settle(page, 250);
  await page.locator('[role="listbox"] [role="option"]').filter({ hasText: option }).first().click();
  await settle(page, 400);
}

/** the API tab's own tabs: Models, Endpoints, Realtime, Settings */
const section = (page: Page, i: number) => page.locator('[data-api-panel] [role="radio"]').nth(i).click();

const SPEC = `openapi: 3.1.0
info:
  title: Notes
  version: "1.0"
servers:
  - url: https://notes.example/api
    description: Production
paths:
  /notes:
    get:
      operationId: listNotes
      responses:
        '200':
          description: The notes
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Note'
components:
  schemas:
    Note:
      type: object
      properties:
        id: {type: string, format: uuid}
        text: {type: string}
      required: [id]
`;

export const tests: E2ETest[] = [
  {
    name: "api: a model with fields, an endpoint that returns it, an OpenAPI file opened, all kept across a reload",
    async run({ page, out }) {
      await leftTab(page, "API");
      await page.waitForSelector("[data-api-panel]");

      /* a model, renamed, with a field of its own */
      await page.locator('[data-api-add="model"]').click();
      await settle(page, 500);
      let api = await apiOf(page);
      equal(api.models?.map((m) => m.name), ["Model1"], "a model is added with an id field");
      await typeCell(page, '[data-api-model="Model1"] [data-api-cell="model-name"]', "Product");
      await page.locator('[data-api-model="Product"] [data-api-add="field"]').click();
      await settle(page, 400);
      await typeCell(page, '[data-api-model="Product"] [data-api-field="field2"] [data-api-cell="field-name"]', "price");
      await pickIn(page, '[data-api-field="price"]', "Type", "Number");
      await page.locator('[data-api-field="price"] button[title="Required"]').first().click();
      await settle(page, 400);
      api = await apiOf(page);
      equal(api.models?.[0].name, "Product", "the model is renamed");
      equal(api.models?.[0].schema.properties?.price, { type: "number" }, "the new field is a number");
      equal(api.models?.[0].schema.required, ["id", "price"], "and required");

      /* one undo takes back one change */
      await undo(page);
      equal((await apiOf(page)).models?.[0].schema.required, ["id"], "undo takes back the required box alone");

      /* a type that is text of a format reads as its own: a date and time, a file */
      await page.locator('[data-api-model="Product"] [data-api-add="field"]').click();
      await settle(page, 400);
      await pickIn(page, '[data-api-field="field3"]', "Type", "Date & time");
      equal((await apiOf(page)).models?.[0].schema.properties?.field3, { type: "string", format: "date-time" }, "a date and time is text of that format");
      check((await page.locator('[data-api-field="field3"] [data-api-field-type] button').first().textContent())?.includes("Date & time"), "and the table names it so");
      await pickIn(page, '[data-api-field="field3"]', "Type", "File");
      equal((await apiOf(page)).models?.[0].schema.properties?.field3, { type: "string", format: "binary" }, "a file is binary text");
      await page.locator('[data-api-model="Product"]').first().screenshot({ path: join(out, "api-field-types.png") });

      /* an endpoint that returns the model */
      await section(page, 1);
      await settle(page, 300);
      await page.locator('[data-api-add="endpoint"]').click();
      await settle(page, 500);
      await typeCell(page, '[data-api-endpoint="endpoint1"] [data-api-cell="path"]', "/products/{productId}");
      await typeCell(page, '[data-api-endpoint="endpoint1"] [data-api-cell="operationId"]', "getProduct");
      await pickIn(page, '[data-api-response="200"]', "Responses 200", "Product");
      api = await apiOf(page);
      const ep = api.endpoints?.find((e) => e.operationId === "getProduct");
      check(ep, "the endpoint is renamed getProduct");
      equal(ep.path, "/products/{productId}", "its path");
      equal(ep.parameters?.map((x) => `${x.in}:${x.name}`), ["path:productId"], "the path parameter follows the path");
      equal(ep.responses["200"].content?.["application/json"].schema, { $ref: "#/components/schemas/Product" }, "it returns the model");
      check(ep.responses.default, "and the problem+json error");
      check(api.models?.some((m) => m.name === "Problem"), "the Problem model is made for it");

      /* a small OpenAPI file, opened from disk beside what is there */
      await section(page, 3);
      await settle(page, 300);
      const file = join(out, "notes.openapi.yaml");
      writeFileSync(file, SPEC);
      const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator('[data-api-add="open-file"]').first().click()]);
      await chooser.setFiles(file);
      await page.waitForSelector("[data-api-report]");
      await settle(page, 500);
      api = await apiOf(page);
      equal(api.endpoints?.map((e) => e.operationId), ["getProduct", "listNotes"], "the file's endpoint is added beside the one there");
      check(api.models?.some((m) => m.name === "Note"), "and its model");
      equal(api.servers, [{ env: "prod", url: "https://notes.example/api", description: "Production" }], "and its server");

      /* after a reload, all of it is there, and the panel shows it */
      await reload(page);
      api = await apiOf(page);
      equal(api.models?.map((m) => m.name), ["Product", "Problem", "Note"], "the models are kept");
      equal(api.endpoints?.map((e) => e.operationId), ["getProduct", "listNotes"], "the endpoints are kept");
      await leftTab(page, "API");
      await section(page, 1);
      await settle(page, 300);
      check(await page.locator('[data-api-endpoint="listNotes"]').first().isVisible(), "the panel lists the imported endpoint");
      await section(page, 0);
      await settle(page, 300);
      check(await page.locator('[data-api-model="Note"]').first().isVisible(), "and the imported model");

      /* the spec comes out as a file */
      await section(page, 3);
      await settle(page, 300);
      const [download] = await Promise.all([page.waitForEvent("download"), page.locator('[data-api-add="export-openapi"]').first().click()]);
      equal(download.suggestedFilename(), "openapi.yaml", "the download is openapi.yaml");
      await leftTab(page, "Parts");
    },
  },
];
