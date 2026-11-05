import { atom, box, button, entry, hbox, icon, iconButton, para, round, text, vbox } from "../atoms";
import { say, type Node, type Say } from "../templates/kit";
import { T, W, isDense, isIosLike, isWeui, kit, lines, muted, rule, variant } from "./shared";
import type { KitDef, KitLook } from "./types";

/* Pieces of forms as atoms. A field is a field box around a bare entry, so the style dresses it as its own fields;
 * where the label goes is the composition: over the field (the web, games), beside it in one row (an iPhone's form,
 * a desktop dialog), or inside an outlined field (Material). Buttons under a form run full width and stack on an
 * iPhone, sit at the end in Material and on the desktop, and split the row in half in WeChat. */

/** a field box around a bare entry, with what leads and trails it */
const field = (kids: Node[], more: Record<string, unknown> = {}): Node => hbox({ surface: "field", width: W, hugWidth: false, padX: 12, padY: 4, gap: 8, ...more }, kids);
/** a fixed column for a label in a row, so the entries after it line up */
const labelCell = (words: Say, width = 96, align: "start" | "end" = "start"): Node => hbox({ gap: 0, hugWidth: false, width, justify: align }, [text(words, "body")]);

const SAVE = say("Save", "保存", "保存", "저장");
const EMAIL = say("Email", "邮箱", "メールアドレス", "이메일");
const EMAIL_HINT = say("name@example.com", "name@example.com", "name@example.com", "name@example.com");
const HELP = say("We'll never share your email.", "我们不会公开你的邮箱。", "メールアドレスが公開されることはありません。", "이메일은 공개되지 않습니다.");

const labeled = kit(
  "labeled-field",
  "Labeled field",
  ["带标签的输入框", "ラベル付き入力欄", "라벨이 있는 입력란"],
  "Forms",
  "text_fields",
  "a column: Material's outlined input with a helper line under it; or a bold label over a field box (a bare entry inside) over a muted helper; or one row with the label in a fixed column and the entry taking the rest",
  [
    variant("outlined", "Outlined, with a helper", ["描边加说明", "枠線・ヘルパー付き", "윤곽선·도움말"], () =>
      vbox({ width: W, hugWidth: false, gap: 4 }, [atom("input", { placeholder: EMAIL, variant: "outlined", type: "email" }), hbox({ padX: 16 }, [muted(HELP, "caption")])]),
    ),
    variant(
      "inline",
      "Label beside the entry",
      ["标签在左", "ラベルが左", "왼쪽 라벨"],
      () => hbox({ surface: "field", width: W, hugWidth: false, padX: 16, padY: 12, gap: 12 }, [labelCell(EMAIL), entry(EMAIL_HINT, { type: "email" })]),
      { suits: isIosLike },
    ),
    variant(
      "stacked",
      "Label over the field",
      ["标签在上", "ラベルが上", "위쪽 라벨"],
      () => vbox({ width: W, hugWidth: false, gap: 6 }, [text(EMAIL, "label", { bold: true }), field([entry(EMAIL_HINT, { type: "email" })], { padY: 8 }), muted(HELP, "caption")]),
      { suits: (l) => l.field !== "m3" },
    ),
  ],
);

const PASSWORD = say("Password", "密码", "パスワード", "비밀번호");
const SHOW = say("Show password", "显示密码", "パスワードを表示", "비밀번호 표시");

const password = kit(
  "password-field",
  "Password field",
  ["密码输入框", "パスワード入力欄", "비밀번호 입력란"],
  "Forms",
  "password",
  "a field box: a key glyph, a bare password entry taking the rest and an eye button to show it; with a strength line and a hint under it; or an iPhone form row with the label in its own column",
  [
    variant("field", "Field with an eye", ["带显示按钮", "表示ボタン付き", "표시 버튼"], () =>
      field([icon("key", { size: 20, color: "muted" }), entry(PASSWORD, { type: "password", value: "hunter2hunter" }), iconButton("visibility", SHOW, { size: "xs" })]),
    ),
    variant("strength", "With its strength", ["带强度提示", "強度付き", "강도 표시"], () =>
      vbox({ width: W, hugWidth: false, gap: 8 }, [
        field([icon("key", { size: 20, color: "muted" }), entry(PASSWORD, { type: "password", value: "hunter2hunter" }), iconButton("visibility_off", SHOW, { size: "xs" })]),
        hbox({ gap: 10 }, [atom("progress", { value: 66, thickness: 4 }, { grow: true }), text(say("Strong", "强", "強い", "강함"), "caption", { bold: true, color: "primary" })]),
        para(say("Use 8 or more characters with letters, numbers and symbols.", "至少 8 位，包含字母、数字和符号。", "8 文字以上で、英字・数字・記号を含めてください。", "문자, 숫자, 기호를 섞어 8자 이상 입력하세요."), "caption", { color: "muted" }),
      ]),
    ),
    variant(
      "row",
      "In a form row",
      ["表单行内", "フォームの行", "양식 행"],
      () => hbox({ surface: "field", width: W, hugWidth: false, padX: 16, padY: 10, gap: 12 }, [labelCell(PASSWORD), entry(say("Required", "必填", "必須", "필수"), { type: "password" }), iconButton("visibility", SHOW, { size: "xs" })]),
      { suits: isIosLike },
    ),
  ],
);

/** one box of a code: a digit, or empty and waiting */
const digitBox = (d: string, on = false): Node =>
  box({ surface: "field", layout: "row", align: "center", justify: "center", padX: 0, padY: 0, width: 48, height: 56, hugWidth: false, hugHeight: false }, [text(d, "headline", { bold: true })], on ? { look: { stroke: { width: 2, color: "primary" } } } : {});
/** one place of a code on a line: the digit over a short bar */
const digitLine = (d: string, on = false): Node => vbox({ gap: 6, align: "center", hugWidth: false, width: 40 }, [text(d || " ", "headline", { bold: true, align: "center" }), box({ layout: "row", padX: 0, padY: 0, width: 36, height: on || d ? 2 : 1, hugWidth: false, hugHeight: false }, [], { fill: on || d ? "primary" : "surfaceContainerHighest" })]);
const CODE = ["4", "8", "2", "", "", ""];

const otp = kit(
  "code-boxes",
  "Code boxes",
  ["验证码格子", "確認コード欄", "인증 코드 칸"],
  "Forms",
  "pin",
  "a centered row of six field boxes, one digit each, the next one to fill outlined in the primary color; the same in two groups of three with a dash between; or digits standing on short lines with no boxes",
  [
    variant("boxes", "Six boxes", ["六个格子", "六つの枠", "여섯 칸"], () => hbox({ gap: 8, justify: "center", width: W, hugWidth: false }, CODE.map((d, i) => digitBox(d, i === 3)))),
    variant("split", "Three and three", ["三加三", "3 桁ずつ", "3자리씩"], () =>
      hbox({ gap: 8, justify: "center", width: W, hugWidth: false }, [...CODE.slice(0, 3).map((d) => digitBox(d)), text("–", "headline", { color: "muted" }), ...CODE.slice(3).map((d, i) => digitBox(d, i === 0))]),
    ),
    variant(
      "lines",
      "On lines",
      ["下划线", "下線", "밑줄"],
      () => hbox({ gap: 12, justify: "center", width: W, hugWidth: false, align: "end" }, CODE.map((d, i) => digitLine(d, i === 3))),
      { suits: (l) => l.field === "line" || l.field === "glow" },
    ),
  ],
);

const TERMS = say("Terms of Service", "用户协议", "利用規約", "이용약관");
const PRIVACY = say("Privacy Policy", "隐私政策", "プライバシーポリシー", "개인정보 처리방침");

const terms = kit(
  "terms-row",
  "Terms checkbox row",
  ["同意条款行", "規約の同意行", "약관 동의 행"],
  "Forms",
  "check_box",
  "a row: an unticked checkbox and the agreement with links to the terms and the privacy policy, wrapping; the same as one paragraph; or a line with a switch at its end for updates",
  [
    variant("links", "With links", ["带链接", "リンク付き", "링크 포함"], () =>
      hbox({ width: W, hugWidth: false, gap: 4, wrap: true, align: "center" }, [
        atom("checkbox", { label: "", checked: false }),
        text(say("I agree to the", "我已阅读并同意", "", ""), "body"),
        atom("link", { label: TERMS, href: "https://example.com/terms" }),
        text(say("and", "和", "と", "및"), "body"),
        atom("link", { label: PRIVACY, href: "https://example.com/privacy" }),
        text(say("", "", "に同意します", "에 동의합니다"), "body"),
      ]),
    ),
    variant("paragraph", "One paragraph", ["一段文字", "一つの段落", "한 단락"], () =>
      hbox({ width: W, hugWidth: false, gap: 10, align: "start" }, [atom("checkbox", { label: "", checked: true }), para(say("I agree to the Terms of Service and the Privacy Policy, and I am 16 or older.", "我已阅读并同意《用户协议》和《隐私政策》，并已年满 16 岁。", "利用規約とプライバシーポリシーに同意し、16 歳以上です。", "이용약관과 개인정보 처리방침에 동의하며 만 16세 이상입니다."), "body", {}, { grow: true })]),
    ),
    variant("switch", "Switch for updates", ["订阅开关", "お知らせのスイッチ", "소식 스위치"], () =>
      hbox({ width: W, hugWidth: false, gap: 12 }, [lines(say("Product updates", "产品动态", "製品のお知らせ", "제품 소식"), say("About once a month, never spam", "大约每月一次，绝不打扰", "月に一度ほど、迷惑メールは送りません", "한 달에 한 번 정도, 스팸 없음"), "body"), atom("switch", { label: "", checked: true })]),
    ),
  ],
);

const ADDRESS: [Say, Say][] = [
  [say("Name", "收货人", "氏名", "이름"), say("Alex Kim", "金小明", "金 アレックス", "김알렉스")],
  [say("Street", "地址", "住所", "주소"), say("12 Harbor Road", "海港路 12 号", "港通り 12", "항구로 12")],
  [say("City", "城市", "市区町村", "도시"), say("Lisbon", "上海", "横浜", "부산")],
];
const SHIPPING = say("Shipping address", "收货地址", "お届け先", "배송지");

const section = kit(
  "form-section",
  "Form section",
  ["表单分组", "フォームのセクション", "양식 섹션"],
  "Forms",
  "dynamic_form",
  "a group of fields: Material's title and muted line over outlined inputs (city and postcode sharing a row); an iPhone's capitalized heading over a rounded card of label-and-entry rows parted by hairlines, with a footnote; or a desktop form with labels right-aligned in a column beside small inputs",
  [
    variant("material", "Title and outlined inputs", ["标题和描边输入框", "タイトルと枠線入力", "제목과 윤곽선 입력"], () =>
      vbox({ width: W, hugWidth: false, gap: 12 }, [
        vbox({ gap: 2 }, [text(SHIPPING, "title"), para(say("Where should we send your order?", "订单要寄到哪里？", "ご注文の配送先を入力してください。", "주문을 어디로 보낼까요?"), "body", { color: "muted" })]),
        atom("input", { placeholder: ADDRESS[0][0], variant: "outlined" }),
        atom("input", { placeholder: ADDRESS[1][0], variant: "outlined" }),
        hbox({ gap: 12 }, [atom("input", { placeholder: ADDRESS[2][0], variant: "outlined" }, { grow: true }), atom("input", { placeholder: say("Postcode", "邮编", "郵便番号", "우편번호"), variant: "outlined", width: 140 })]),
      ]),
    ),
    variant(
      "inset",
      "Rows on a rounded card",
      ["圆角卡片上的行", "角丸カードの行", "둥근 카드의 행"],
      () =>
        vbox({ width: W, hugWidth: false, gap: 6 }, [
          hbox({ padX: 16 }, [muted(SHIPPING, "caption", {}, { look: { text: { case: "upper", letterSpacing: 0.4 } } })]),
          vbox({ surface: "card", padX: 0, padY: 0, gap: 0 }, ADDRESS.flatMap(([label, hint], i) => [...(i ? [rule()] : []), hbox({ padX: 16, padY: 12, gap: 12 }, [labelCell(label, 80), entry(hint)])]), { corners: round(12) }),
          hbox({ padX: 16 }, [para(say("We only use this to deliver your order.", "仅用于配送你的订单。", "配送のためだけに使用します。", "배송에만 사용합니다."), "caption", { color: "muted" }, { grow: true })]),
        ]),
      { suits: (l) => isIosLike(l) || l.list === "inset" },
    ),
    variant(
      "desk",
      "Desktop, labels at the side",
      ["桌面，标签在侧", "デスクトップ・ラベル横", "데스크톱·옆 라벨"],
      () =>
        vbox({ width: 520, hugWidth: false, gap: 10 }, [
          text(SHIPPING, "heading", { bold: true }),
          ...ADDRESS.map(([label, hint]) => hbox({ gap: 16 }, [labelCell(label, 120, "end"), atom("input", { placeholder: hint, variant: "outlined", size: "sm" }, { grow: true })])),
          hbox({ justify: "end", gap: 8 }, [button(T.cancel, { variant: "outlined", size: "xs" }), button(SAVE, { variant: "filled", size: "xs" })]),
        ]),
      { suits: isDense },
    ),
  ],
);

const GUESTS = say("Guests", "人数", "人数", "인원");
const QTY = say("Quantity", "数量", "数量", "수량");
const MINUS = say("Fewer", "减少", "減らす", "줄이기");
const PLUS = say("More", "增加", "増やす", "늘리기");

const stepper = kit(
  "stepper-row",
  "Stepper row",
  ["步进器行", "ステッパーの行", "스테퍼 행"],
  "Forms",
  "exposure",
  "a row: a name over a muted line taking the rest, then outlined round minus and plus buttons around the number; an iPhone's grey minus | plus control after the value; or a compact field box holding minus, the number and plus",
  [
    variant("round", "Round buttons", ["圆形按钮", "丸いボタン", "둥근 버튼"], () =>
      hbox({ width: W, hugWidth: false, gap: 12 }, [lines(GUESTS, say("Ages 13 or above", "13 岁及以上", "13 歳以上", "13세 이상")), iconButton("remove", MINUS, { variant: "outlined", size: "xs", iconFill: true }), text("2", "heading", { bold: true }), iconButton("add", PLUS, { variant: "outlined", size: "xs" })]),
    ),
    variant(
      "ios",
      "Minus | plus control",
      ["减 | 加控件", "マイナス｜プラス", "빼기 | 더하기"],
      () =>
        hbox({ width: W, hugWidth: false, gap: 12 }, [para(QTY, "body", { maxLines: 1 }, { grow: true }), muted("2"), hbox({ padX: 0, padY: 0, gap: 0 }, [iconButton("remove", MINUS, { size: "xs", iconFill: true }), rule(18, true), iconButton("add", PLUS, { size: "xs" })], { fill: "surfaceContainerHigh", corners: round(8) })]),
      { suits: isIosLike },
    ),
    variant(
      "compact",
      "Compact field",
      ["紧凑输入框", "コンパクト", "컴팩트"],
      () => hbox({ surface: "field", padX: 2, padY: 2, gap: 0 }, [iconButton("remove", MINUS, { size: "xs", iconFill: true }), hbox({ justify: "center", hugWidth: false, width: 40 }, [text("2", "label", { bold: true })]), iconButton("add", PLUS, { size: "xs" })]),
      { suits: (l) => isDense(l) || l.list === "tile" },
    ),
  ],
);

const CONTINUE = say("Continue", "继续", "続ける", "계속");
const LATER = say("Not now", "暂不", "後で", "나중에");

const buttons = kit(
  "button-stack",
  "Button stack",
  ["按钮组合", "ボタンの並び", "버튼 묶음"],
  "Forms",
  "smart_button",
  "the buttons that end a form: Material's text and filled buttons at the end of a row; an iPhone's full-width filled button over a plain one; two equal halves (WeChat, games); or small outlined and filled buttons at the end (desktop)",
  [
    variant("end", "At the end", ["靠右", "右寄せ", "오른쪽"], () => hbox({ width: W, hugWidth: false, gap: 8, justify: "end" }, [button(T.cancel, { variant: "text" }), button(SAVE, { variant: "filled" })])),
    variant(
      "stacked",
      "Full width, stacked",
      ["通栏堆叠", "全幅で縦に", "전체 너비 세로"],
      () => vbox({ width: W, hugWidth: false, gap: 8 }, [button(CONTINUE, { variant: "filled", size: "md" }), button(LATER, { variant: "text", size: "md" })]),
      { suits: (l: KitLook) => isIosLike(l) && !isWeui(l) },
    ),
    variant(
      "halves",
      "Two halves",
      ["左右两半", "左右半分", "좌우 반반"],
      () => hbox({ width: W, hugWidth: false, gap: 12 }, [button(T.cancel, { variant: "tonal", size: "md" }, { grow: true }), button(T.ok, { variant: "filled", size: "md" }, { grow: true })]),
      { suits: (l) => isWeui(l) || l.group === "mobileGame" },
    ),
    variant(
      "desk",
      "Small, at the end",
      ["小号靠右", "小さく右寄せ", "작게 오른쪽"],
      () => hbox({ width: 520, hugWidth: false, gap: 8, justify: "end" }, [button(T.cancel, { variant: "outlined", size: "xs" }), button(say("Save changes", "保存更改", "変更を保存", "변경 사항 저장"), { variant: "filled", size: "xs" })]),
      { suits: isDense },
    ),
  ],
);

export const fieldKits: KitDef[] = [labeled, password, otp, terms, section, stepper, buttons];
