import type { StylePack } from "../types";
import anime from "./anime";
import antd from "./antd";
import blocks from "./blocks";
import casual from "./casual";
import chatgpt from "./chatgpt";
import claude from "./claude";
import codex from "./codex";
import cyber from "./cyber";
import discord from "./discord";
import fluent from "./fluent";
import fps from "./fps";
import ios from "./ios";
import moba from "./moba";
import notion from "./notion";
import rivals from "./rivals";
import shop from "./shop";
import shortvideo from "./shortvideo";
import social from "./social";
import souls from "./souls";
import spotify from "./spotify";
import stardew from "./stardew";
import steam from "./steam";
import survival from "./survival";
import vscode from "./vscode";
import wechat from "./wechat";
import whatsapp from "./whatsapp";
import wukong from "./wukong";

/* Every style, one file each, in the order the style panel shows them: phone apps, desktop software, phone games, PC
 * games. To add one, write its file beside these and put it in this list. */
export const PACKS: StylePack[] = [
  /* phone apps */
  ios,
  shortvideo,
  spotify,
  wechat,
  shop,
  social,
  whatsapp,
  chatgpt,
  claude,
  codex,
  /* desktop software */
  fluent,
  vscode,
  discord,
  steam,
  notion,
  antd,
  /* phone games */
  casual,
  blocks,
  survival,
  anime,
  moba,
  /* PC games */
  souls,
  wukong,
  cyber,
  rivals,
  fps,
  stardew,
];
