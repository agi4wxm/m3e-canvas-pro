/* Editor words for keeping the author's work and privacy: what the agent's pause before a removal names besides
 * screens and parts (rows, modes, a style or an icon replaced…), and the banner of a project from elsewhere whose
 * outside pictures are not loaded until the author allows them. Kept on their own, with their own lookup; every
 * language has exactly the same keys (lib/i18n/safety.test.ts). */

import type { Lang } from "../i18n";

type Words = {
  askRows: string;
  askFields: string;
  askVariables: string;
  askVarCollection: string;
  askModes: string;
  askStyle: string;
  askStyleReplaced: string;
  askIcon: string;
  askIconReplaced: string;
  askComponent: string;
  askCollection: string;
  askProps: string;
  outsideTitle: string;
  outsideBody: string;
  outsideLoad: string;
  outsideLater: string;
  outsideBlocked: string;
};

export const SAFETY_TEXT: Record<Lang, Words> = {
  en: {
    askRows: "{n} of the {total} rows of “{of}”",
    askFields: "the fields {names} of “{of}”",
    askVariables: "the variables {names}",
    askVarCollection: "the variable collection “{name}”",
    askModes: "the modes {names} of “{of}” and their values",
    askStyle: "your style “{name}”",
    askStyleReplaced: "your style “{name}” as it is now (it is replaced)",
    askIcon: "the icon “{name}”",
    askIconReplaced: "the drawing of the icon “{name}” (it is replaced)",
    askComponent: "the component “{name}”",
    askCollection: "the data collection “{name}”",
    askProps: "the properties {names} of “{of}”",
    outsideTitle: "Pictures from other sites are not loaded",
    outsideBody: "This project came from a file or a link. Loading its pictures, videos and pages from other sites would tell those sites that you opened it.",
    outsideLoad: "Load external images",
    outsideLater: "Not now",
    outsideBlocked: "Not loaded",
  },
  zh: {
    askRows: "“{of}”的 {total} 行中的 {n} 行",
    askFields: "“{of}”的字段 {names}",
    askVariables: "变量 {names}",
    askVarCollection: "变量集合“{name}”",
    askModes: "“{of}”的模式 {names} 及其中的值",
    askStyle: "你的风格“{name}”",
    askStyleReplaced: "你的风格“{name}”现在的样子（会被替换）",
    askIcon: "图标“{name}”",
    askIconReplaced: "图标“{name}”现在的图形（会被替换）",
    askComponent: "组件“{name}”",
    askCollection: "数据集合“{name}”",
    askProps: "“{of}”的属性 {names}",
    outsideTitle: "没有加载来自其他网站的图片",
    outsideBody: "这个项目来自文件或链接。加载其中来自其他网站的图片、视频和网页，会让这些网站知道你打开了它。",
    outsideLoad: "加载外部图片",
    outsideLater: "暂不",
    outsideBlocked: "未加载",
  },
  ja: {
    askRows: "「{of}」の {total} 行のうち {n} 行",
    askFields: "「{of}」のフィールド {names}",
    askVariables: "変数 {names}",
    askVarCollection: "変数コレクション「{name}」",
    askModes: "「{of}」のモード {names} とその値",
    askStyle: "あなたのスタイル「{name}」",
    askStyleReplaced: "あなたのスタイル「{name}」の今の内容（置き換わります）",
    askIcon: "アイコン「{name}」",
    askIconReplaced: "アイコン「{name}」の今の図形（置き換わります）",
    askComponent: "コンポーネント「{name}」",
    askCollection: "データ「{name}」",
    askProps: "「{of}」のプロパティ {names}",
    outsideTitle: "ほかのサイトの画像は読み込んでいません",
    outsideBody: "このプロジェクトはファイルかリンクから開かれました。ほかのサイトにある画像・動画・ページを読み込むと、あなたが開いたことがそのサイトに伝わります。",
    outsideLoad: "外部の画像を読み込む",
    outsideLater: "あとで",
    outsideBlocked: "未読み込み",
  },
  ko: {
    askRows: "“{of}”의 {total}행 중 {n}행",
    askFields: "“{of}”의 필드 {names}",
    askVariables: "변수 {names}",
    askVarCollection: "변수 컬렉션 “{name}”",
    askModes: "“{of}”의 모드 {names}와 그 값",
    askStyle: "내 스타일 “{name}”",
    askStyleReplaced: "내 스타일 “{name}”의 지금 모습(바뀝니다)",
    askIcon: "아이콘 “{name}”",
    askIconReplaced: "아이콘 “{name}”의 지금 그림(바뀝니다)",
    askComponent: "컴포넌트 “{name}”",
    askCollection: "데이터 컬렉션 “{name}”",
    askProps: "“{of}”의 속성 {names}",
    outsideTitle: "다른 사이트의 이미지를 불러오지 않았습니다",
    outsideBody: "이 프로젝트는 파일이나 링크에서 왔습니다. 다른 사이트의 이미지, 동영상, 웹 페이지를 불러오면 그 사이트에 이 프로젝트를 열었다는 사실이 전해집니다.",
    outsideLoad: "외부 이미지 불러오기",
    outsideLater: "나중에",
    outsideBlocked: "불러오지 않음",
  },
};

export type SafetyKey = keyof Words;

/** a word in the editor's language, with {placeholders} filled in */
export function safetyText(key: SafetyKey, lang: Lang, vars: Record<string, string | number> = {}): string {
  return (SAFETY_TEXT[lang] ?? SAFETY_TEXT.en)[key].replace(/\{(\w+)\}/g, (all, k: string) => (vars[k] !== undefined ? String(vars[k]) : all));
}
