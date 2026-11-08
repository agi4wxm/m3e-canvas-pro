/* The Office Open XML files (ECMA-376), as small as Excel, Word and PowerPoint open without a repair: a workbook of
 * the rows (a bold head row that stays in view, a filter, numbers as numbers), a document with the title, the
 * record's fields as a table and paragraphs, and a deck with a title slide and a slide a record. Strings are written
 * inline, so there is no shared-strings part to keep in step. */

import { hash53 } from "../rng";
import { fieldsOf, flatten, hslRgb, paragraphsOf, rowsOf, tableOf, textOf, titleOf, titleOfRecord, xmlText, type Cell, type FileContent } from "./content";
import { zip, type ArchiveEntry } from "./zip";

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";

/** the package's relationships part */
const rels = (list: [id: string, type: string, target: string][]) => `${XML}<Relationships xmlns="${PKG_REL}">${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type.startsWith("http") ? type : `${REL}/${type}`}" Target="${target}"/>`).join("")}</Relationships>`;

/** [Content_Types].xml: the defaults for rels and xml, an override for every other part */
const contentTypes = (overrides: [part: string, type: string][]) =>
  `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides.map(([p, t]) => `<Override PartName="${p}" ContentType="${t}"/>`).join("")}</Types>`;

/** docProps/core.xml: the title and who made it, no dates (the same content, the same bytes) */
const core = (title: string) =>
  `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlText(title)}</dc:title><dc:creator>M3E Canvas Pro mocks</dc:creator></cp:coreProperties>`;

const CORE_TYPE = "application/vnd.openxmlformats-package.core-properties+xml";
const CORE_REL = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties";

const pack = (entries: ArchiveEntry[]) => zip(entries);

/* ---------- XLSX ---------- */

/** a column's letters: 0 → A, 26 → AA */
export function columnName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** a sheet's name: at most 31 characters, none of : \ / ? * [ ] */
const sheetName = (s: string) => s.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Sheet1";

function cellXml(ref: string, v: Cell, style = 0): string {
  const s = style ? ` s="${style}"` : "";
  if (v === null || v === "") return "";
  if (typeof v === "number") return `<c r="${ref}"${s}><v>${v}</v></c>`;
  if (typeof v === "boolean") return `<c r="${ref}"${s} t="b"><v>${v ? 1 : 0}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlText(v.slice(0, 32767))}</t></is></c>`;
}

/** An Excel workbook of the rows (or the record's fields, or a sample table): one sheet, the head row bold and frozen. */
export function xlsxOf(c: FileContent): Uint8Array {
  const t = c.record && !c.rows?.length ? { columns: ["field", "value"], rows: fieldsOf(c).map(([k, v]) => [k, v] as Cell[]) } : tableOf(rowsOf(c), 10_000);
  const all: Cell[][] = [t.columns, ...t.rows];
  const widths = t.columns.map((_, i) => Math.min(60, Math.max(8, ...all.slice(0, 200).map((r) => [...textOf(r[i] ?? null)].length + 2))));
  const last = `${columnName(Math.max(0, t.columns.length - 1))}${all.length}`;
  const sheet = `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}"><dimension ref="A1:${last}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>${all.map((r, y) => `<row r="${y + 1}">${r.map((v, x) => cellXml(`${columnName(x)}${y + 1}`, v, y === 0 ? 1 : 0)).join("")}</row>`).join("")}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`;
  const name = sheetName(c.model ?? titleOf(c));
  const workbook = `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}"><bookViews><workbookView/></bookViews><sheets><sheet name="${xmlText(name)}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${xmlText(`'${name.replace(/'/g, "''")}'`)}!$A$1:$${columnName(Math.max(0, t.columns.length - 1))}$${all.length}</definedName></definedNames></workbook>`;
  const styles = `${XML}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return pack([
    { name: "[Content_Types].xml", data: contentTypes([["/xl/workbook.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"], ["/xl/worksheets/sheet1.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"], ["/xl/styles.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"], ["/docProps/core.xml", CORE_TYPE]]) },
    { name: "_rels/.rels", data: rels([["rId1", "officeDocument", "xl/workbook.xml"], ["rId2", CORE_REL, "docProps/core.xml"]]) },
    { name: "xl/workbook.xml", data: workbook },
    { name: "xl/_rels/workbook.xml.rels", data: rels([["rId1", "worksheet", "worksheets/sheet1.xml"], ["rId2", "styles", "styles.xml"]]) },
    { name: "xl/worksheets/sheet1.xml", data: sheet },
    { name: "xl/styles.xml", data: styles },
    { name: "docProps/core.xml", data: core(titleOf(c)) },
  ]);
}

/* ---------- DOCX ---------- */

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const run = (text: string, props = "") => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${xmlText(text)}</w:t></w:r>`;
const para = (text: string, style?: string, props = "") => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${run(text, props)}</w:p>`;
const tableXml = (rows: string[][], head: boolean) => {
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const width = Math.floor(9000 / cols);
  const cell = (s: string, bold: boolean) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${para(s, undefined, bold ? "<w:b/>" : "")}</w:tc>`;
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="CAC4D0"/>`).join("")}</w:tblBorders></w:tblPr><w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>${rows.map((r, i) => `<w:tr>${Array.from({ length: cols }, (_, k) => cell(r[k] ?? "", head && i === 0)).join("")}</w:tr>`).join("")}</w:tbl>`;
};

/** A Word document: the title, a line about it, the record's fields (or the rows) as a table, then paragraphs. */
export function docxOf(c: FileContent): Uint8Array {
  const title = titleOf(c);
  const table = c.record && !c.rows?.length ? tableXml(fieldsOf(c).slice(0, 200).map(([k, v]) => [k, v]), false) : (() => {
    const t = tableOf(rowsOf(c), 500);
    const cols = t.columns.slice(0, 8);
    return tableXml([cols, ...t.rows.map((r) => cols.map((_, i) => textOf(r[i])))], true);
  })();
  const paragraphs = paragraphsOf(c.seed, Math.max(1, Math.round(4 * Math.min(1, c.scale ?? 1))));
  const body = `${para(title, "Title")}${para("Mock document for the design preview", "Subtitle")}${table}${para("Notes", "Heading1")}${paragraphs.map((p) => para(p)).join("")}`;
  const document = `${XML}<w:document xmlns:w="${W_NS}" xmlns:r="${REL}"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const style = (id: string, name: string, rpr: string, ppr = "") => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}<w:rPr>${rpr}</w:rPr></w:style>`;
  const styles = `${XML}<w:styles xmlns:w="${W_NS}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="${c.locale === "zh" ? "zh-CN" : c.locale === "ja" ? "ja-JP" : c.locale === "ko" ? "ko-KR" : "en-US"}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${style("Title", "Title", '<w:b/><w:sz w:val="48"/><w:szCs w:val="48"/>', '<w:spacing w:after="60"/>')}${style("Subtitle", "Subtitle", '<w:color w:val="625B71"/>', '<w:spacing w:after="240"/>')}${style("Heading1", "heading 1", '<w:b/><w:sz w:val="30"/><w:szCs w:val="30"/>', '<w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/>')}<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
  return pack([
    { name: "[Content_Types].xml", data: contentTypes([["/word/document.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"], ["/word/styles.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"], ["/docProps/core.xml", CORE_TYPE]]) },
    { name: "_rels/.rels", data: rels([["rId1", "officeDocument", "word/document.xml"], ["rId2", CORE_REL, "docProps/core.xml"]]) },
    { name: "word/document.xml", data: document },
    { name: "word/_rels/document.xml.rels", data: rels([["rId1", "styles", "styles.xml"]]) },
    { name: "word/styles.xml", data: styles },
    { name: "docProps/core.xml", data: core(title) },
  ]);
}

/* ---------- PPTX ---------- */

const P_NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const EMU = 12700;
const SW = 12192000;
const SH = 6858000;
const hex = (rgb: number[]) => rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
const emptyTree = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

/** a shape: a filled rectangle, or a text box of paragraphs */
function shape(id: number, x: number, y: number, w: number, h: number, o: { fill?: string; paragraphs?: { text: string; size: number; bold?: boolean; color?: string; bullet?: boolean }[] }): string {
  const body = o.paragraphs
    ? `<p:txBody><a:bodyPr wrap="square" lIns="0" rIns="0" tIns="0" bIns="0"><a:normAutofit/></a:bodyPr><a:lstStyle/>${o.paragraphs.map((p) => `<a:p>${p.bullet ? '<a:pPr marL="285750" indent="-285750"><a:buFont typeface="Arial"/><a:buChar char="&#8226;"/></a:pPr>' : ""}<a:r><a:rPr lang="en-US" sz="${p.size * 100}"${p.bold ? ' b="1"' : ""} dirty="0"><a:solidFill><a:srgbClr val="${p.color ?? "1D1B20"}"/></a:solidFill></a:rPr><a:t>${xmlText(p.text)}</a:t></a:r></a:p>`).join("")}</p:txBody>`
    : "";
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr${o.paragraphs ? ' txBox="1"' : ""}/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${o.fill ? `<a:solidFill><a:srgbClr val="${o.fill}"/></a:solidFill>` : "<a:noFill/>"}</p:spPr>${body}</p:sp>`;
}

const slideXml = (shapes: string) => `${XML}<p:sld ${P_NS}><p:cSld><p:spTree>${emptyTree}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;

const THEME = `${XML}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Mocks"><a:themeElements><a:clrScheme name="Mocks"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1D1B20"/></a:dk2><a:lt2><a:srgbClr val="F3EDF7"/></a:lt2><a:accent1><a:srgbClr val="6750A4"/></a:accent1><a:accent2><a:srgbClr val="625B71"/></a:accent2><a:accent3><a:srgbClr val="7D5260"/></a:accent3><a:accent4><a:srgbClr val="386A20"/></a:accent4><a:accent5><a:srgbClr val="006A6A"/></a:accent5><a:accent6><a:srgbClr val="B3261E"/></a:accent6><a:hlink><a:srgbClr val="0B57D0"/></a:hlink><a:folHlink><a:srgbClr val="7E3FB4"/></a:folHlink></a:clrScheme><a:fontScheme name="Mocks"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Mocks"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;

/** A PowerPoint deck: a title slide in the seed's color, then a slide for each record (its fields as bullets), at most 20. */
export function pptxOf(c: FileContent): Uint8Array {
  const title = titleOf(c);
  const color = hex(hslRgb(hash53(c.seed) % 360, 0.55, 0.5));
  const records = c.rows?.length || c.record ? rowsOf(c) : rowsOf(c, 3);
  const slides: string[] = [
    slideXml(
      shape(2, 0, 0, SW, SH, { fill: color }) +
        shape(3, 60 * EMU, 200 * EMU, SW - 120 * EMU, 120 * EMU, { paragraphs: [{ text: title, size: 40, bold: true, color: "FFFFFF" }] }) +
        shape(4, 60 * EMU, 330 * EMU, SW - 120 * EMU, 60 * EMU, { paragraphs: [{ text: c.rows?.length ? `${c.rows.length} ${c.model ?? "records"}` : "Mock deck for the design preview", size: 20, color: "FFFFFF" }] }),
    ),
    ...records.slice(0, Math.max(1, Math.round(20 * Math.min(1, c.scale ?? 1)))).map((r, i) =>
      slideXml(
        shape(2, 0, 0, SW, 12 * EMU, { fill: color }) +
          shape(3, 60 * EMU, 40 * EMU, SW - 120 * EMU, 60 * EMU, { paragraphs: [{ text: titleOfRecord(r) ?? `${title} ${i + 1}`, size: 28, bold: true }] }) +
          shape(4, 60 * EMU, 120 * EMU, SW - 120 * EMU, SH - 160 * EMU, { paragraphs: Object.entries(flatten(r)).slice(0, 10).map(([k, v]) => ({ text: `${k}: ${textOf(v).slice(0, 120)}`, size: 16, bullet: true })) }),
      ),
    ),
  ];
  const n = slides.length;
  const master = `${XML}<p:sldMaster ${P_NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${emptyTree}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`;
  const layout = `${XML}<p:sldLayout ${P_NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${emptyTree}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  const presentation = `${XML}<p:presentation ${P_NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("")}</p:sldIdLst><p:sldSz cx="${SW}" cy="${SH}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:defaultTextStyle></p:presentation>`;
  const PML = "application/vnd.openxmlformats-officedocument.presentationml";
  return pack([
    {
      name: "[Content_Types].xml",
      data: contentTypes([
        ["/ppt/presentation.xml", `${PML}.presentation.main+xml`],
        ["/ppt/slideMasters/slideMaster1.xml", `${PML}.slideMaster+xml`],
        ["/ppt/slideLayouts/slideLayout1.xml", `${PML}.slideLayout+xml`],
        ["/ppt/theme/theme1.xml", "application/vnd.openxmlformats-officedocument.theme+xml"],
        ["/ppt/presProps.xml", `${PML}.presProps+xml`],
        ["/ppt/viewProps.xml", `${PML}.viewProps+xml`],
        ["/ppt/tableStyles.xml", `${PML}.tableStyles+xml`],
        ...slides.map((_, i) => [`/ppt/slides/slide${i + 1}.xml`, `${PML}.slide+xml`] as [string, string]),
        ["/docProps/core.xml", CORE_TYPE],
      ]),
    },
    { name: "_rels/.rels", data: rels([["rId1", "officeDocument", "ppt/presentation.xml"], ["rId2", CORE_REL, "docProps/core.xml"]]) },
    { name: "ppt/presentation.xml", data: presentation },
    { name: "ppt/_rels/presentation.xml.rels", data: rels([["rId1", "slideMaster", "slideMasters/slideMaster1.xml"], ...slides.map((_, i) => [`rId${i + 2}`, "slide", `slides/slide${i + 1}.xml`] as [string, string, string]), [`rId${n + 2}`, "theme", "theme/theme1.xml"], [`rId${n + 3}`, "presProps", "presProps.xml"], [`rId${n + 4}`, "viewProps", "viewProps.xml"], [`rId${n + 5}`, "tableStyles", "tableStyles.xml"]]) },
    { name: "ppt/slideMasters/slideMaster1.xml", data: master },
    { name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", data: rels([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"], ["rId2", "theme", "../theme/theme1.xml"]]) },
    { name: "ppt/slideLayouts/slideLayout1.xml", data: layout },
    { name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", data: rels([["rId1", "slideMaster", "../slideMasters/slideMaster1.xml"]]) },
    { name: "ppt/theme/theme1.xml", data: THEME },
    { name: "ppt/presProps.xml", data: `${XML}<p:presentationPr ${P_NS}/>` },
    { name: "ppt/viewProps.xml", data: `${XML}<p:viewPr ${P_NS}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>` },
    { name: "ppt/tableStyles.xml", data: `${XML}<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>` },
    ...slides.flatMap((s, i) => [
      { name: `ppt/slides/slide${i + 1}.xml`, data: s },
      { name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: rels([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"]]) },
    ]),
    { name: "docProps/core.xml", data: core(title) },
  ]);
}

