import { col, deskScreen, go, grid, panel, part, row, say, screen, txt, type Anchor, type Node, type Say, type ScreenSeed, type Template } from "./kit";
import { atomsOf } from "./atoms";

/* The screens games have in common, whatever the game. Nothing here belongs to one title: the names are the genre's own
 * words, and the picture behind a screen is a scene whose prompt the author replaces. The interface is real parts standing
 * on it, each by the edge of the screen it belongs to, so it holds on any phone and in any style. A page reached from
 * somewhere has a back arrow and no navigation bar; only the lobby, which is where they lead from, has the bar. */

type Link = ReturnType<typeof go>;
type WithBack = { back?: Link };
type Props = Record<string, unknown>;

const backdrop = (prompt: Say, scrim = "none"): Node => part("scene", { prompt, scrim });
const FANTASY = say("A wide fantasy landscape at dusk, castle on a distant hill, no text", "黄昏的奇幻大地，远处山丘上有一座城堡，画面中不要有文字", "夕暮れの幻想的な大地、遠くの丘に城、文字なし", "해질녘의 환상적인 대지, 먼 언덕 위의 성, 글자 없음");
const CAMP = say("A cosy camp in a forest clearing, warm light, no text", "林间空地上温暖的营地，暖色灯光，画面中不要有文字", "森の空き地の暖かなキャンプ、柔らかな光、文字なし", "숲속 공터의 아늑한 캠프, 따뜻한 빛, 글자 없음");
const ARENA = say("An open battleground seen from behind the hero, wide view, no text", "从角色身后看到的开阔战场，广角视野，画面中不要有文字", "主人公の背後から見た広い戦場、広角、文字なし", "주인공 뒤에서 본 넓은 전장, 넓은 시야, 글자 없음");
const SHRINE = say("A glowing summoning altar in a dark hall, light rays, no text", "昏暗大厅中发光的召唤祭坛，光束，画面中不要有文字", "暗い広間で光る召喚の祭壇、光の筋、文字なし", "어두운 홀에서 빛나는 소환 제단, 빛줄기, 글자 없음");
const TALK = say("Two characters talking in a quiet place, upper body, soft light, no text", "两名角色在安静的地方交谈，半身像，柔和光线，画面中不要有文字", "静かな場所で話す二人のキャラクター、上半身、柔らかな光、文字なし", "조용한 곳에서 대화하는 두 캐릭터, 상반신, 부드러운 빛, 글자 없음");
const ATLAS = say("An illustrated world map seen from above, several distinct regions joined by a path, no text", "俯瞰的手绘世界地图，几个不同的区域由道路相连，画面中不要有文字", "上から見たイラストの世界地図、道でつながった異なる地域、文字なし", "위에서 본 일러스트 세계 지도, 길로 이어진 서로 다른 지역들, 글자 없음");

/* a layout as big as the screen, over its picture: what it holds stands by what it really measures, so it stays centered,
 * or pinned to the edges, whatever a style makes of its sizes */
const stage = (props: Props, kids: Node[]): Node => col({ hugHeight: false, ...props }, kids, { at: { l: 0, r: 0, t: 0, b: 0 } });
/** what takes the height a screen has left, so that what comes after it stands at the foot */
const grow = (props: Props, kids: Node[]): Node => col({ hugHeight: false, ...props }, kids, { fill: true });

const COINS = part("asset-pill", { value: "12,800", icon: "paid" });
const GEMS = part("asset-pill", { value: "320", icon: "diamond" });
const ENERGY = part("asset-pill", { value: "48/60", icon: "bolt" });
/* wide enough for what the pills are guessed at before they are drawn; they stand at its right end */
const PURSE_W = 346;
const purse = (props: Props = {}, at?: Anchor): Node => row({ justify: "end", gap: 8, ...props }, [COINS, GEMS, ENERGY], at ? { at } : {});

const title = (words: Say, link?: Link): Node => part("app-bar", { title: words, leading: "arrow_back", trailing: "" }, { actions: { icon: link } });
const tabsOf = (...names: Say[]): Node => part("tabs", { items: names.map((label) => ({ label })), selected: 0 });
const cell = (icon: string, name: Say | string, count: string, rarity: Say | string = "", size = 72, badge = ""): Node => part("item-cell", { icon, name, count, rarity, rarityColor: "", badge, size });
const skill = (icon: string, label: Say, size = 64, cooldown = 0): Node => part("skill-button", { icon, label, size, cooldown });
/** in the heat of a fight a skill is its icon: no words standing on the picture */
const hudSkill = (icon: string, name: Say, size = 64, cooldown = 0): Node => part("skill-button", { icon, label: "", size, cooldown }, { name });
const task = (words: Say, action: Say): Node => atomsOf("task-row", { title: words, action, done: say("Done", "已完成", "完了", "완료") });
const shortcut = (icon: string, label: Say, size = 40, timer = 0): Node => part("function-button", { icon, label, size, timer, unit: "hour" });
const heading = (words: Say): Node => part("section-header", { title: words, action: "" });
const both = (a: Say, b: Say): Say => say(`${a.en} · ${b.en}`, `${a.zh} · ${b.zh}`, `${a.ja} · ${b.ja}`, `${a.ko} · ${b.ko}`);
const initial = (name: Say): Say => say(name.en[0], name.zh[0], name.ja[0], name.ko[0]);
const daysAgo = (n: number): Say => say(`${n} d`, `${n} 天`, `${n} 日`, `${n}일`);

const CLAIM = say("Claim", "领取", "受け取る", "받기");
const GO = say("Go", "前往", "行く", "이동");
const LEVEL = say("Level 7", "第 7 关", "ステージ 7", "7 스테이지");
const VERSION = (at?: Anchor): Node => part("badge", { kind: "label", label: "v1.0.0", variant: "secondary" }, at ? { at } : {});
const ONLINE = say("Online", "在线", "オンライン", "접속 중");
const HOURS_AGO = say("2 h ago", "2 小时前", "2 時間前", "2시간 전");
const YESTERDAY = say("Yesterday", "昨天", "昨日", "어제");
const YOU = say("You", "我", "自分", "나");

/** what players call themselves: no one's real name, and none from any one game */
const PLAYERS = {
  nova: say("Nova", "星辰", "ノヴァ", "노바"),
  ember: say("Ember", "余烬", "エンバー", "엠버"),
  frost: say("Frost", "霜降", "フロスト", "프로스트"),
  kite: say("Kite", "风筝", "カイト", "카이트"),
  sage: say("Sage", "青松", "セージ", "세이지"),
  pixel: say("Pixel", "像素", "ピクセル", "픽셀"),
  comet: say("Comet", "彗星", "コメット", "코멧"),
  willow: say("Willow", "垂柳", "ウィロー", "윌로우"),
  orion: say("Orion", "猎户", "オリオン", "오리온"),
  luna: say("Luna", "月光", "ルナ", "루나"),
  rook: say("Rook", "白鸦", "ルーク", "루크"),
};

/** the main places of a game, its lobby in the middle */
const gameNav = (selected: number): Node =>
  part("navigation-bar", {
    selected,
    items: [
      { label: say("Shop", "商城", "ショップ", "상점"), icon: "storefront" },
      { label: say("Heroes", "角色", "キャラ", "캐릭터"), icon: "swords" },
      { label: say("Home", "大厅", "ホーム", "홈"), icon: "home" },
      { label: say("Guild", "公会", "ギルド", "길드"), icon: "groups" },
      { label: say("Events", "活动", "イベント", "이벤트"), icon: "celebration" },
    ],
  });

/** who is playing, at the head of a lobby */
const playerChip = (width: number, at?: Anchor): Node =>
  panel({ padX: 8, padY: 4, gap: 0, width }, [row({ gap: 8 }, [part("avatar", { initials: say("P", "玩", "P", "P"), size: "sm" }), col({ gap: 0 }, [txt(say("Player", "玩家", "プレイヤー", "플레이어"), "label"), txt(say("Lv. 24", "24 级", "Lv. 24", "Lv. 24"), "caption", { color: "muted" })], { fill: true })])], at ? { at } : {});

export const titleScreen = (links: { start?: Link } = {}): ScreenSeed =>
  screen({
    id: "title",
    name: say("Title screen", "标题画面", "タイトル画面", "타이틀 화면"),
    scene: backdrop(FANTASY),
    spots: [
      panel({ padX: 24, padY: 16 }, [txt(say("Game title", "游戏名称", "ゲームタイトル", "게임 이름"), "display", { align: "center" })], { at: { l: 16, r: 16, t: 120 } }),
      col({ gap: 12, height: 232, hugHeight: false, justify: "end" }, [part("button", { label: say("Start", "开始游戏", "はじめる", "시작하기"), size: "lg", icon: "play_arrow" }, { action: links.start }), part("button", { label: say("Continue", "继续游戏", "つづきから", "이어하기"), size: "md", variant: "tonal" }), part("button", { label: say("Settings", "设置", "設定", "설정"), size: "md", variant: "tonal" })], { at: { l: 56, r: 56, b: 72 } }),
      VERSION({ b: 16 }),
    ],
  });

export const lobbyScreen = (links: { play?: Link } = {}): ScreenSeed =>
  screen({
    id: "lobby",
    name: say("Lobby", "游戏大厅", "ロビー", "로비"),
    scene: backdrop(CAMP),
    bottom: [gameNav(2)],
    spots: [
      row({ justify: "between" }, [playerChip(144), row({ gap: 8, width: 228, justify: "end" }, [COINS, GEMS])], { at: { l: 16, r: 16, t: 16 } }),
      panel({ padX: 4, padY: 8, gap: 4, width: 72 }, [shortcut("sell", say("Deals", "特惠", "セール", "특가"), 40, 2), shortcut("redeem", say("Gifts", "礼包", "ギフト", "선물"))], { at: { l: 16, t: 72 } }),
      panel({ padX: 4, padY: 8, gap: 4, width: 72 }, [shortcut("calendar_month", say("Check in", "签到", "ログボ", "출석")), shortcut("task_alt", say("Quests", "任务", "クエスト", "퀘스트")), shortcut("mail", say("Mail", "邮件", "メール", "우편")), shortcut("leaderboard", say("Ranks", "排行", "ランキング", "랭킹"))], { at: { r: 16, t: 72 } }),
      part("button", { label: say("Play", "开始游戏", "プレイ", "플레이"), size: "lg", icon: "play_arrow", width: 280 }, { at: { b: 96 }, action: links.play }),
    ],
  });

export const levelSelectScreen = (links: { start?: Link } & WithBack = {}): ScreenSeed =>
  screen({
    id: "levels",
    name: say("Level select", "关卡选择", "ステージ選択", "스테이지 선택"),
    top: [title(say("World 1", "第一章", "ワールド 1", "1장"), links.back)],
    body: [
      purse(),
      grow({ justify: "center" }, [part("level-map", { levels: 24, current: 7, perRow: 4, stars: "3,3,2,3,1,2" })]),
      part("button", { label: say("Play level 7", "开始第 7 关", "ステージ 7 を開始", "7 스테이지 시작"), size: "md", icon: "play_arrow" }, { action: links.start }),
    ],
  });

const levelStartScreen = (): ScreenSeed =>
  screen({
    id: "level-start",
    name: say("Level start", "关卡开始", "ステージ開始", "스테이지 시작"),
    scene: backdrop(FANTASY, "full"),
    spots: [
      stage({ justify: "center", padX: 24 }, [
        panel({ gap: 16, padY: 20 }, [
          row({ justify: "between" }, [txt(LEVEL, "headline"), part("icon-button", { icon: "close", label: say("Close", "关闭", "閉じる", "닫기"), variant: "text" })]),
          row({ justify: "center" }, [part("rating", { value: 2, count: 3, readOnly: true })]),
          txt(say("Goal", "通关目标", "目標", "목표"), "label", { color: "muted" }),
          row({ justify: "center", gap: 12 }, [cell("star", say("Stars", "星星", "スター", "별"), "×30"), cell("timer", say("Time", "时间", "時間", "시간"), "60s")]),
          txt(say("Boosts", "携带道具", "アイテム", "아이템"), "label", { color: "muted" }),
          row({ justify: "center", gap: 12 }, [cell("bolt", say("Boost", "加速", "ブースト", "부스트"), "×2"), cell("shield", say("Shield", "护盾", "シールド", "방패"), "×1"), cell("favorite", say("Life", "生命", "ライフ", "생명"), "×3")]),
          part("button", { label: say("Start", "开始", "開始", "시작"), size: "md", icon: "play_arrow" }),
        ]),
      ]),
    ],
  });

export const battleHudScreen = (links: { end?: Link } = {}): ScreenSeed =>
  screen({
    id: "battle",
    name: say("Battle", "战斗界面", "バトル", "전투"),
    frame: "landscape",
    scene: backdrop(ARENA),
    spots: [
      stage({ justify: "between", padX: 16, padY: 16 }, [
        row({ justify: "between", align: "start" }, [
          panel({ gap: 6, padX: 12, padY: 8, width: 240 }, [part("stat-bar", { icon: "favorite", label: say("HP", "生命", "HP", "HP"), value: 72, max: 100, color: "error", numbers: true }), part("stat-bar", { icon: "bolt", label: say("MP", "能量", "MP", "MP"), value: 40, max: 100, color: "primary", numbers: true })]),
          part("asset-pill", { value: "02:45", icon: "timer" }),
          row({ gap: 8, width: 240, justify: "end", align: "start" }, [part("map", { label: "", width: 120, height: 96 }), part("icon-button", { icon: "pause", label: say("Pause", "暂停", "一時停止", "일시정지"), variant: "tonal" }, { action: links.end })]),
        ]),
        row({ justify: "between", align: "end" }, [
          part("joystick", { size: 120 }),
          row({ gap: 12, width: 320, justify: "end", align: "end" }, [hudSkill("shield", say("Dodge", "闪避", "回避", "회피")), hudSkill("flash_on", say("Skill 1", "技能一", "スキル 1", "스킬 1"), 64, 3), hudSkill("local_fire_department", say("Skill 2", "技能二", "スキル 2", "스킬 2")), hudSkill("swords", say("Attack", "攻击", "攻撃", "공격"), 96)]),
        ]),
      ]),
    ],
  });

/* a board full of pieces, the way a level opens */
const PIECES = "●■▲◆★●■▲●★■◆▲★◆★■●▲■◆■▲◆★●◆▲★●▲■◆★●◆■●▲★■▲▲★◆●■◆●●◆★▲●▲■";

const puzzleScreen = (): ScreenSeed =>
  screen({
    id: "puzzle",
    name: say("Puzzle board", "棋盘关卡", "パズル盤面", "퍼즐 보드"),
    top: [part("app-bar", { title: LEVEL, leading: "pause", trailing: "" })],
    body: [
      grid(3, { gap: 8 }, [
        panel({ gap: 2, padX: 12, padY: 8 }, [txt(say("Moves", "剩余步数", "残り手数", "남은 횟수"), "caption", { color: "muted", align: "center" }), txt("24", "headline", { align: "center" })]),
        panel({ gap: 2, padX: 12, padY: 8 }, [txt(say("Goal", "目标", "目標", "목표"), "caption", { color: "muted", align: "center" }), txt("18/30", "headline", { align: "center" })]),
        panel({ gap: 2, padX: 12, padY: 8 }, [txt(say("Score", "得分", "スコア", "점수"), "caption", { color: "muted", align: "center" }), txt("1,280", "headline", { align: "center" })]),
      ]),
      grow({ justify: "center" }, [part("game-board", { mode: "select", rows: 8, columns: 7, cells: [...PIECES].join(","), marks: "", need: 3, turnText: "", winText: "", drawText: "", reset: "" })]),
      row({ justify: "center", gap: 24 }, [skill("hardware", say("Hammer", "锤子", "ハンマー", "망치")), skill("shuffle", say("Shuffle", "洗牌", "シャッフル", "섞기")), skill("add", say("+5 moves", "加 5 步", "5 手追加", "5회 추가"))]),
    ],
  });

const pauseScreen = (): ScreenSeed =>
  screen({
    id: "pause",
    name: say("Paused", "暂停菜单", "ポーズ", "일시정지"),
    scene: backdrop(ARENA, "full"),
    spots: [
      stage({ justify: "center", padX: 48 }, [
        panel({ gap: 12, padY: 24 }, [
          txt(say("Paused", "已暂停", "一時停止中", "일시정지"), "headline", { align: "center" }),
          part("button", { label: say("Resume", "继续", "再開", "계속하기"), size: "md", icon: "play_arrow" }),
          part("button", { label: say("Restart", "重新开始", "やり直す", "다시 시작"), size: "md", variant: "tonal", icon: "replay" }),
          part("button", { label: say("Settings", "设置", "設定", "설정"), size: "md", variant: "tonal", icon: "settings" }),
          part("button", { label: say("Quit", "退出", "終了", "나가기"), size: "md", variant: "text" }),
        ]),
      ]),
    ],
  });

export const victoryScreen = (links: { next?: Link } = {}): ScreenSeed =>
  screen({
    id: "victory",
    name: say("Victory", "胜利结算", "勝利", "승리"),
    scene: backdrop(FANTASY, "full"),
    spots: [
      stage({ justify: "center", padX: 24 }, [
        part(
          "game-result",
          {
            title: say("Victory!", "挑战成功！", "勝利！", "승리!"),
            stars: 2,
            scoreLabel: say("Score", "得分", "スコア", "점수"),
            score: "12,800",
            rewards: [{ label: "×120", icon: "paid" }, { label: "×3", icon: "diamond" }, { label: "×1", icon: "redeem" }],
            retry: say("Play again", "再来一局", "もう一度", "다시 하기"),
            next: say("Next level", "下一关", "次へ", "다음"),
          },
          { actions: { next: links.next } },
        ),
      ]),
    ],
  });

const defeatScreen = (): ScreenSeed =>
  screen({
    id: "defeat",
    name: say("Defeat", "失败结算", "敗北", "패배"),
    scene: backdrop(ARENA, "full"),
    spots: [
      stage({ justify: "center", padX: 32 }, [
        panel({ gap: 12, padY: 24 }, [
          row({ justify: "center" }, [part("icon", { name: "heart_broken", size: 64, color: "error" })]),
          txt(say("Level failed", "挑战失败", "失敗", "실패"), "headline", { align: "center" }),
          txt(say("You were so close. Keep going?", "就差一点了，要继续吗？", "あと少しでした。続けますか？", "거의 다 왔어요. 계속할까요?"), "body", { align: "center", color: "muted" }),
          part("button", { label: say("Continue for 50 gems", "50 钻石继续", "50 ジェムで続ける", "50 보석으로 계속"), size: "md", icon: "diamond" }),
          part("button", { label: say("Try again", "再试一次", "もう一度", "다시 도전"), size: "md", variant: "tonal", icon: "replay" }),
          part("button", { label: say("Back to lobby", "返回大厅", "ロビーへ", "로비로"), size: "md", variant: "text" }),
        ]),
      ]),
    ],
  });

const IRON_SWORD = say("Iron sword", "铁剑", "鉄の剣", "철검");

/** the item picked in a bag: what it is, and what can be done with it */
const itemDetail = (): Node =>
  panel({ gap: 12 }, [
    row({ gap: 12, align: "start" }, [cell("swords", "", "×1", say("Rare", "稀有", "レア", "희귀")), col({ gap: 4 }, [txt(IRON_SWORD, "title"), txt(say("A sturdy blade. Attack +25.", "结实的长剑，攻击 +25。", "頑丈な剣。攻撃 +25。", "튼튼한 검. 공격 +25."), "body", { color: "muted" })], { fill: true })]),
    row({ gap: 8, justify: "end" }, [part("button", { label: say("Sell", "出售", "売却", "판매"), variant: "tonal", size: "sm" }), part("button", { label: say("Equip", "装备", "装備", "장착"), size: "sm" })]),
  ]);

const inventoryScreen = (): ScreenSeed =>
  screen({
    id: "inventory",
    name: say("Inventory", "背包", "持ち物", "가방"),
    top: [title(say("Inventory", "背包", "持ち物", "가방"))],
    body: [
      tabsOf(say("All", "全部", "すべて", "전체"), say("Gear", "装备", "装備", "장비"), say("Materials", "材料", "素材", "재료"), say("Items", "道具", "道具", "도구")),
      grow({}, [atomsOf("inventory", { columns: 5, rows: 7, filled: 23 })]),
      itemDetail(),
    ],
  });

const STATS = { columns: ["Stat", "Value", "Max"], rows: [[say("HP", "生命", "HP", "HP"), "980", "1200"], [say("Attack", "攻击", "攻撃", "공격"), "860", "1200"], [say("Defense", "防御", "防御", "방어"), "540", "1200"], [say("Speed", "速度", "速さ", "속도"), "320", "600"]] };
const HERO = (action: Say | string): Node => part("character-card", { icon: "person", name: say("Hero name", "角色名称", "キャラ名", "캐릭터 이름"), role: say("Warrior", "战士", "戦士", "전사"), level: say("Lv. 24", "24 级", "Lv. 24", "Lv. 24"), rarity: say("Epic", "史诗", "エピック", "에픽"), data: STATS, action });

const characterScreen = (): ScreenSeed =>
  screen({
    id: "character",
    name: say("Character", "角色详情", "キャラ詳細", "캐릭터 상세"),
    place: "spread",
    top: [title(say("Character", "角色详情", "キャラ詳細", "캐릭터 상세"))],
    body: [
      HERO(say("Level up", "升级", "レベルアップ", "레벨 업")),
      col({ gap: 8 }, [heading(say("Skills", "技能", "スキル", "스킬")), row({ justify: "between" }, [skill("flash_on", say("Strike", "突袭", "突撃", "돌격")), skill("shield", say("Guard", "格挡", "防御", "방어")), skill("local_fire_department", say("Burst", "爆发", "爆発", "폭발")), skill("healing", say("Mend", "治疗", "回復", "회복"))])]),
      col({ gap: 8 }, [heading(say("Gear", "装备", "装備", "장비")), row({ justify: "between" }, [cell("swords", say("Weapon", "武器", "武器", "무기"), "+3"), cell("shield", say("Armor", "防具", "防具", "방어구"), "+2"), cell("diamond", say("Charm", "饰品", "装飾品", "장신구"), ""), cell("add", say("Empty", "空位", "空き", "빈칸"), "")])]),
    ],
  });

const characterSelectScreen = (): ScreenSeed =>
  screen({
    id: "character-select",
    name: say("Choose a hero", "角色选择", "キャラ選択", "캐릭터 선택"),
    place: "spread",
    top: [title(say("Choose a hero", "选择角色", "キャラを選ぶ", "캐릭터 선택"))],
    body: [
      grid(4, { gap: 8, align: "center" }, [cell("swords", say("Warrior", "战士", "戦士", "전사"), "", "", 80, "✓"), cell("auto_awesome", say("Mage", "法师", "魔法使い", "마법사"), "", "", 80), cell("target", say("Archer", "射手", "弓使い", "궁수"), "", "", 80), cell("healing", say("Healer", "治疗", "ヒーラー", "치유사"), "", "", 80), cell("shield", say("Guard", "坦克", "盾役", "탱커"), "", "", 80), cell("visibility_off", say("Rogue", "刺客", "暗殺者", "암살자"), "", "", 80), cell("pets", say("Tamer", "驯兽", "テイマー", "조련사"), "", "", 80), cell("lock", say("Locked", "未解锁", "未解放", "잠김"), "", "", 80)]),
      HERO(say("Choose", "选择", "選択", "선택")),
    ],
  });

const offer = (icon: string, name: Say, count: string, price: string): Node => col({ gap: 8, align: "center" }, [cell(icon, name, count, "", 96), part("button", { label: price, size: "sm", variant: "tonal", width: 104 })]);

const COIN_WORD = say("Coins", "金币", "コイン", "코인");
const GEM_WORD = say("Gems", "钻石", "ジェム", "보석");
const ENERGY_WORD = say("Energy", "体力", "スタミナ", "에너지");

const shopScreen = (): ScreenSeed =>
  screen({
    id: "game-shop",
    name: say("Game shop", "游戏商城", "ショップ", "상점"),
    top: [title(say("Shop", "商城", "ショップ", "상점"))],
    body: [
      purse(),
      tabsOf(say("Featured", "推荐", "おすすめ", "추천"), GEM_WORD, say("Packs", "礼包", "パック", "패키지")),
      panel({ gap: 8, fill: "primary-container" }, [
        row({ gap: 12 }, [cell("redeem", "", "×1"), col({ gap: 4 }, [txt(say("Starter pack", "新手礼包", "初心者パック", "초보자 패키지"), "title"), part("price-tag", { currency: "$", amount: "4.99", original: "$19.99", discount: "-75%", size: "sm" })], { fill: true }), part("button", { label: say("Buy", "购买", "購入", "구매"), size: "sm" })]),
      ]),
      grid(3, { gap: 8 }, [offer("paid", COIN_WORD, "×1,000", "$0.99"), offer("paid", COIN_WORD, "×6,000", "$4.99"), offer("paid", COIN_WORD, "×20,000", "$14.99"), offer("diamond", GEM_WORD, "×60", "$0.99"), offer("diamond", GEM_WORD, "×330", "$4.99"), offer("diamond", GEM_WORD, "×1,090", "$14.99"), offer("bolt", ENERGY_WORD, "×60", "$0.99"), offer("bolt", ENERGY_WORD, "×180", "$1.99"), offer("workspace_premium", say("Monthly pass", "月卡", "マンスリー", "월정액"), "30d", "$4.99")]),
    ],
  });

const gachaScreen = (): ScreenSeed =>
  screen({
    id: "gacha-pull",
    name: say("Summon", "抽卡召唤", "ガチャ", "소환"),
    scene: backdrop(SHRINE),
    spots: [
      stage({ justify: "between", padX: 16, padY: 16 }, [
        col({ gap: 16 }, [
          row({ justify: "between" }, [part("icon-button", { icon: "arrow_back", label: say("Back", "返回", "戻る", "뒤로"), variant: "tonal" }), row({ gap: 8, width: 228, justify: "end" }, [GEMS, part("asset-pill", { value: "12", icon: "confirmation_number" })])]),
          panel({ gap: 4, padY: 12 }, [txt(say("Limited summon", "限定召唤", "限定ガチャ", "한정 소환"), "headline", { align: "center" }), txt(say("Ends in 3 days", "还剩 3 天", "残り 3 日", "3일 남음"), "caption", { align: "center", color: "muted" })]),
        ]),
        panel({ gap: 12 }, [
          row({ justify: "between" }, [txt(say("Featured", "本期奖励", "ピックアップ", "픽업"), "label", {}, { fill: true }), part("link", { label: say("Odds", "概率说明", "提供割合", "확률 안내"), href: "#" })]),
          row({ justify: "between" }, [cell("person", say("Hero", "角色", "キャラ", "캐릭터"), "", say("Epic", "史诗", "エピック", "에픽")), cell("swords", say("Gear", "装备", "装備", "장비"), ""), cell("diamond", GEM_WORD, "×50"), cell("paid", COIN_WORD, "×500")]),
          part("progress", { value: 47, label: say("A rare hero within 48 pulls", "48 抽内必得稀有角色", "あと 48 回でレア確定", "48회 내 희귀 캐릭터 확정"), showValue: false }),
          row({ gap: 12 }, [part("button", { label: say("1 pull · 150", "单抽 · 150", "1 回 · 150", "1회 · 150"), size: "md", variant: "tonal" }, { fill: true }), part("button", { label: say("10 pulls · 1,500", "十连 · 1500", "10 回 · 1500", "10회 · 1500"), size: "md" }, { fill: true })]),
        ]),
      ]),
    ],
  });

const checkInScreen = (): ScreenSeed =>
  screen({
    id: "check-in",
    name: say("Daily check-in", "每日签到", "ログインボーナス", "출석 체크"),
    place: "spread",
    top: [title(say("Daily check-in", "每日签到", "ログインボーナス", "출석 체크"))],
    body: [
      panel({}, [row({ gap: 12 }, [cell("diamond", "", "×50"), col({ gap: 4 }, [txt(say("Today's reward", "今日奖励", "本日の報酬", "오늘의 보상"), "title"), txt(say("Gems ×50", "钻石 ×50", "ジェム ×50", "보석 ×50"), "body", { color: "muted" })], { fill: true })])]),
      part("check-in", { title: say("11 days this month", "本月已签到 11 天", "今月 11 日目", "이번 달 11일째"), days: 30, signed: 11 }),
      col({ gap: 8 }, [
        heading(say("Total days", "累计签到", "累計日数", "누적 출석")),
        part("reward-track", {
          value: 11,
          max: 28,
          action: "",
          data: { columns: ["At", "Label", "Icon"], rows: [["7", COIN_WORD, "paid"], ["14", GEM_WORD, "diamond"], ["21", ENERGY_WORD, "bolt"], ["28", say("Gift", "大礼包", "ギフト", "선물"), "redeem"]] },
        }),
      ]),
      part("button", { label: say("Check in today", "今日签到", "今日のボーナスを受け取る", "오늘 출석하기"), size: "md" }),
    ],
  });

const questsScreen = (): ScreenSeed =>
  screen({
    id: "quests",
    name: say("Quests", "任务", "クエスト", "퀘스트"),
    top: [title(say("Quests", "任务", "クエスト", "퀘스트"))],
    body: [
      tabsOf(say("Daily", "每日", "デイリー", "일일"), say("Weekly", "每周", "ウィークリー", "주간"), say("Story", "主线", "メイン", "메인")),
      part("reward-track", {
        value: 60,
        max: 100,
        action: "",
        data: { columns: ["At", "Label", "Icon"], rows: [["25", "×50", "paid"], ["50", "×10", "diamond"], ["75", "×100", "paid"], ["100", "×1", "redeem"]] },
      }),
      task(say("Log in (1/1)", "登录游戏 (1/1)", "ログインする (1/1)", "로그인하기 (1/1)"), CLAIM),
      task(say("Win 3 battles (1/3)", "赢得 3 场战斗 (1/3)", "3 回勝利する (1/3)", "전투 3회 승리 (1/3)"), GO),
      task(say("Finish 5 levels (2/5)", "通关 5 个关卡 (2/5)", "ステージを 5 回クリア (2/5)", "스테이지 5회 클리어 (2/5)"), GO),
      task(say("Upgrade a hero (0/1)", "升级一名角色 (0/1)", "キャラを強化する (0/1)", "캐릭터 강화하기 (0/1)"), GO),
      task(say("Spend 100 energy (40/100)", "消耗 100 体力 (40/100)", "スタミナを 100 使う (40/100)", "에너지 100 사용 (40/100)"), GO),
      task(say("Buy from the shop (0/1)", "在商城购买一次 (0/1)", "ショップで購入する (0/1)", "상점에서 구매하기 (0/1)"), GO),
      task(say("Send gifts to friends (0/3)", "给好友送礼 (0/3)", "フレンドに贈り物 (0/3)", "친구에게 선물하기 (0/3)"), GO),
      task(say("Join a guild event (0/1)", "参加公会活动 (0/1)", "ギルドイベントに参加 (0/1)", "길드 이벤트 참여 (0/1)"), GO),
    ],
  });

const passScreen = (): ScreenSeed =>
  screen({
    id: "battle-pass",
    name: say("Season pass", "赛季通行证", "シーズンパス", "시즌 패스"),
    top: [title(say("Season pass", "赛季通行证", "シーズンパス", "시즌 패스"))],
    body: [
      panel({ gap: 8, fill: "primary-container" }, [
        txt(say("Season 3 · Level 12 · 18 days left", "第 3 赛季 · 12 级 · 还剩 18 天", "シーズン 3 · レベル 12 · 残り 18 日", "시즌 3 · 레벨 12 · 18일 남음"), "title"),
        part("button", { label: say("Unlock premium · $9.99", "解锁高级通行证 · $9.99", "プレミアムを解放 · $9.99", "프리미엄 해제 · $9.99"), size: "md" }),
      ]),
      col({ gap: 4 }, [
        heading(say("Free", "免费奖励", "無料", "무료")),
        part("reward-track", {
          value: 1200,
          max: 2000,
          action: CLAIM,
          data: { columns: ["At", "Label", "Icon"], rows: [["400", "×100", "paid"], ["800", "×10", "diamond"], ["1200", "×200", "paid"], ["1600", "×20", "diamond"], ["2000", "×1", "redeem"]] },
        }),
      ]),
      col({ gap: 4 }, [
        heading(say("Premium", "高级奖励", "プレミアム", "프리미엄")),
        part("reward-track", {
          value: 0,
          max: 2000,
          action: "",
          data: { columns: ["At", "Label", "Icon"], rows: [["400", "×500", "paid"], ["800", "×50", "diamond"], ["1200", say("Skin", "皮肤", "スキン", "스킨"), "checkroom"], ["1600", "×100", "diamond"], ["2000", say("Hero", "角色", "キャラ", "캐릭터"), "person"]] },
        }),
      ]),
      heading(say("This week", "本周任务", "今週のミッション", "이번 주 미션")),
      task(say("Play 10 matches", "完成 10 场对局", "10 回プレイする", "10판 플레이하기"), GO),
      task(say("Use 3 different heroes", "使用 3 名不同角色", "3 種類のキャラを使う", "서로 다른 캐릭터 3명 사용"), GO),
      task(say("Earn 500 season points", "获得 500 赛季积分", "シーズンポイントを 500 獲得", "시즌 포인트 500 획득"), GO),
    ],
  });

const leaderboardScreen = (): ScreenSeed =>
  screen({
    id: "game-leaderboard",
    name: say("Leaderboard", "排行榜", "ランキング", "랭킹"),
    top: [title(say("Leaderboard", "排行榜", "ランキング", "랭킹"))],
    body: [
      tabsOf(say("Friends", "好友", "フレンド", "친구"), say("Global", "全服", "全体", "전체"), say("Guild", "公会", "ギルド", "길드")),
      grow({}, [
        part("leaderboard", {
          title: say("This season", "本赛季", "今シーズン", "이번 시즌"),
          faces: true,
          selected: 7,
          data: { columns: ["Name", "Score", "Change"], rows: [[PLAYERS.nova, "9,820", "+2"], [PLAYERS.ember, "9,410", "-1"], [PLAYERS.frost, "8,960", "0"], [PLAYERS.kite, "8,740", "+1"], [PLAYERS.sage, "8,650", "-2"], [PLAYERS.pixel, "8,620", "0"], [PLAYERS.comet, "8,580", "+3"], [YOU, "8,500", "+4"], [PLAYERS.willow, "8,120", "-2"], [PLAYERS.orion, "7,980", "-1"], [PLAYERS.luna, "7,780", "+1"]] },
        }),
      ]),
      part("button", { label: say("Invite friends", "邀请好友", "フレンドを招待", "친구 초대"), size: "md", variant: "tonal", icon: "person_add" }),
    ],
  });

const LEADER = say("Leader", "会长", "リーダー", "길드장");
const OFFICER = say("Officer", "干部", "幹部", "간부");
const MEMBER = say("Member", "成员", "メンバー", "멤버");

const guildScreen = (): ScreenSeed =>
  screen({
    id: "guild",
    name: say("Guild", "公会", "ギルド", "길드"),
    top: [title(say("Guild", "公会", "ギルド", "길드"))],
    body: [
      panel({ gap: 8 }, [
        row({ gap: 12 }, [part("avatar", { initials: say("G", "公", "G", "G"), size: "lg" }), col({ gap: 2 }, [txt(say("Guild name", "公会名称", "ギルド名", "길드 이름"), "title"), txt(say("Lv. 8 · 28/30 members", "8 级 · 28/30 人", "Lv. 8 · 28/30 人", "Lv. 8 · 28/30명"), "caption", { color: "muted" })], { fill: true }), part("button", { label: say("Donate", "捐献", "寄付", "기부"), size: "sm", variant: "tonal" })]),
        part("progress", { value: 64, label: say("Guild experience", "公会经验", "ギルド経験値", "길드 경험치"), showValue: true }),
      ]),
      tabsOf(say("Members", "成员", "メンバー", "멤버"), say("Chat", "聊天", "チャット", "채팅"), say("Events", "活动", "イベント", "이벤트")),
      atomsOf("contact-list", {
        search: "",
        grouped: false,
        trailing: "none",
        action: "",
        done: "",
        data: { columns: ["Name", "Note"], rows: [[PLAYERS.nova, both(LEADER, ONLINE)], [PLAYERS.ember, both(OFFICER, ONLINE)], [PLAYERS.frost, both(OFFICER, HOURS_AGO)], [PLAYERS.kite, both(MEMBER, ONLINE)], [PLAYERS.sage, both(MEMBER, ONLINE)], [PLAYERS.pixel, both(MEMBER, HOURS_AGO)], [PLAYERS.comet, both(MEMBER, HOURS_AGO)], [PLAYERS.willow, both(MEMBER, YESTERDAY)], [PLAYERS.orion, both(MEMBER, YESTERDAY)]] },
      }),
    ],
  });

const friendNote = (level: number, when: Say): Say => both(say(`Lv. ${level}`, `${level} 级`, `Lv. ${level}`, `Lv. ${level}`), when);

const friendsScreen = (): ScreenSeed =>
  screen({
    id: "game-friends",
    name: say("Friends", "好友列表", "フレンド", "친구"),
    top: [title(say("Friends", "好友", "フレンド", "친구"))],
    body: [
      tabsOf(say("Friends 8/50", "好友 8/50", "フレンド 8/50", "친구 8/50"), say("Requests", "申请", "申請", "신청"), say("Recent", "最近", "最近", "최근")),
      grow({}, [
        atomsOf("contact-list", {
          search: say("Search by name or ID", "搜索名称或 ID", "名前か ID で検索", "이름 또는 ID 검색"),
          grouped: false,
          trailing: "follow",
          action: say("Invite", "邀请", "招待", "초대"),
          done: say("Invited", "已邀请", "招待済み", "초대함"),
          data: { columns: ["Name", "Note"], rows: [[PLAYERS.nova, friendNote(32, ONLINE)], [PLAYERS.frost, friendNote(28, ONLINE)], [PLAYERS.sage, friendNote(41, ONLINE)], [PLAYERS.comet, friendNote(19, HOURS_AGO)], [PLAYERS.willow, friendNote(24, HOURS_AGO)], [PLAYERS.orion, friendNote(36, YESTERDAY)], [PLAYERS.luna, friendNote(15, YESTERDAY)], [PLAYERS.rook, friendNote(27, YESTERDAY)]] },
        }),
      ]),
      row({ gap: 12 }, [part("button", { label: say("Send gifts", "一键送礼", "一括で贈る", "모두 선물"), size: "md", variant: "tonal", icon: "redeem" }, { fill: true }), part("button", { label: say("Add friend", "添加好友", "フレンド追加", "친구 추가"), size: "md", icon: "person_add" }, { fill: true })]),
    ],
  });

const mail = (head: Say, body: Say, when: Say, icon: string): (Say | string)[] => [head, body, when, icon];

const mailScreen = (): ScreenSeed =>
  screen({
    id: "game-mail",
    name: say("Mail", "邮件", "メール", "우편함"),
    top: [title(say("Mail", "邮件", "メール", "우편함"))],
    body: [
      grow({}, [
        atomsOf("notification-list", {
          title: say("Inbox", "收件箱", "受信箱", "받은 편지함"),
          unread: 2,
          markAll: say("Read all", "全部已读", "すべて既読", "모두 읽음"),
          data: {
            columns: ["Title", "Body", "Time", "Icon"],
            rows: [
              mail(say("Maintenance gift", "维护补偿", "メンテナンスのお詫び", "점검 보상"), say("Gems ×100 attached.", "附件：钻石 ×100。", "ジェム ×100 添付。", "보석 ×100 첨부."), say("1 h", "1 小时", "1 時間", "1시간"), "redeem"),
              mail(say("Season reward", "赛季奖励", "シーズン報酬", "시즌 보상"), say("You finished in the top 10%.", "你的排名进入前 10%。", "上位 10% に入りました。", "상위 10%에 들었습니다."), daysAgo(1), "trophy"),
              mail(say("Friend gift", "好友礼物", "フレンドの贈り物", "친구 선물"), say("A friend sent you energy.", "好友送来了体力。", "フレンドからスタミナが届きました。", "친구가 에너지를 보냈습니다."), daysAgo(2), "favorite"),
              mail(say("Notice", "系统公告", "お知らせ", "공지"), say("A new event starts this week.", "本周开启新活动。", "今週新しいイベントが始まります。", "이번 주 새 이벤트가 시작됩니다."), daysAgo(3), "campaign"),
              mail(say("Level reward", "等级奖励", "レベル報酬", "레벨 보상"), say("A gift for reaching level 20.", "达到 20 级的奖励。", "レベル 20 到達の報酬です。", "20레벨 달성 보상입니다."), daysAgo(4), "military_tech"),
              mail(say("Guild news", "公会消息", "ギルドのお知らせ", "길드 소식"), say("Your guild reached level 8.", "你的公会升到了 8 级。", "ギルドがレベル 8 になりました。", "길드가 8레벨이 되었습니다."), daysAgo(5), "groups"),
              mail(say("Daily gift", "每日礼物", "デイリーギフト", "일일 선물"), say("Today's free coins are here.", "今日免费金币已送达。", "本日の無料コインが届きました。", "오늘의 무료 코인이 도착했습니다."), daysAgo(6), "paid"),
              mail(say("Purchase", "购买凭证", "ご購入", "구매 내역"), say("Thanks for your purchase.", "感谢你的购买。", "ご購入ありがとうございます。", "구매해 주셔서 감사합니다."), daysAgo(7), "receipt_long"),
              mail(say("Welcome", "欢迎", "ようこそ", "환영합니다"), say("Thanks for playing. Have fun!", "感谢游玩，祝你玩得开心！", "遊んでくれてありがとう！", "플레이해 주셔서 감사합니다!"), daysAgo(8), "waving_hand"),
            ],
          },
        }),
      ]),
      row({ gap: 12 }, [part("button", { label: say("Delete read", "删除已读", "既読を削除", "읽은 메일 삭제"), size: "md", variant: "tonal" }, { fill: true }), part("button", { label: say("Claim all", "一键领取", "一括受け取り", "모두 받기"), size: "md" }, { fill: true })]),
    ],
  });

const storyScreen = (): ScreenSeed =>
  screen({
    id: "story",
    name: say("Story", "剧情对话", "ストーリー", "스토리"),
    scene: backdrop(TALK),
    bottom: [
      part("dialogue-box", {
        speaker: say("Character name", "角色名称", "キャラ名", "캐릭터 이름"),
        icon: "person",
        lines: [{ label: say("What this character says goes here, one line at a time.", "这里是角色的台词，一次显示一句。", "キャラクターのセリフを一度に一行ずつ表示します。", "캐릭터의 대사를 한 번에 한 줄씩 보여 줍니다.") }, { label: say("What will you do?", "你要怎么做？", "どうする？", "어떻게 할까요?") }],
        choices: [{ label: say("First choice", "选项一", "選択肢 1", "선택지 1") }, { label: say("Second choice", "选项二", "選択肢 2", "선택지 2") }],
        next: say("Tap to continue", "点击继续", "タップで続ける", "눌러서 계속"),
        width: 380,
      }),
    ],
    spots: [row({ gap: 8, width: 272, justify: "end" }, [part("button", { label: say("Auto", "自动", "オート", "자동"), size: "sm", variant: "tonal", width: 80 }), part("button", { label: say("Log", "回顾", "ログ", "기록"), size: "sm", variant: "tonal", width: 80 }), part("button", { label: say("Skip", "跳过", "スキップ", "건너뛰기"), size: "sm", variant: "tonal", width: 96 })], { at: { r: 16, t: 16 } })],
  });

const gameSettingsScreen = (): ScreenSeed =>
  screen({
    id: "game-settings",
    name: say("Game settings", "游戏设置", "ゲーム設定", "게임 설정"),
    top: [title(say("Settings", "设置", "設定", "설정"))],
    body: [
      panel({ gap: 12 }, [txt(say("Sound", "声音", "サウンド", "소리"), "label", { color: "muted" }), part("slider", { label: say("Music", "音乐", "音楽", "음악"), value: 70 }), part("slider", { label: say("Effects", "音效", "効果音", "효과음"), value: 85 })]),
      atomsOf("settings-group", {
        title: say("Game", "游戏", "ゲーム", "게임"),
        data: {
          columns: ["Icon", "Label", "Control", "Value"],
          rows: [
            ["high_quality", say("Graphics", "画质", "画質", "그래픽"), "value", say("High", "高", "高", "높음")],
            ["speed", say("Frame rate", "帧率", "フレームレート", "프레임"), "value", "60"],
            ["vibration", say("Vibration", "振动", "振動", "진동"), "switch", "on"],
            ["notifications", say("Notifications", "通知", "通知", "알림"), "switch", "on"],
            ["language", say("Language", "语言", "言語", "언어"), "arrow", say("English", "简体中文", "日本語", "한국어")],
          ],
        },
      }),
      atomsOf("settings-group", {
        title: say("Account", "账号", "アカウント", "계정"),
        data: {
          columns: ["Icon", "Label", "Control", "Value"],
          rows: [
            ["link", say("Linked accounts", "账号绑定", "アカウント連携", "계정 연동"), "arrow", ""],
            ["redeem", say("Redeem a code", "兑换码", "コード入力", "쿠폰 입력"), "arrow", ""],
            ["support_agent", say("Support", "客服", "サポート", "고객 지원"), "arrow", ""],
            ["logout", say("Log out", "退出登录", "ログアウト", "로그아웃"), "arrow", ""],
          ],
        },
      }),
    ],
  });

const wheelScreen = (): ScreenSeed =>
  screen({
    id: "event-wheel",
    name: say("Lucky wheel", "活动转盘", "ルーレット", "룰렛"),
    top: [title(say("Lucky wheel", "幸运转盘", "ルーレット", "행운의 룰렛"))],
    body: [
      purse(),
      txt(say("3 free spins today", "今日剩余 3 次免费机会", "本日の無料回数：残り 3 回", "오늘 무료 3회 남음"), "title", { align: "center" }),
      grow({ justify: "center", align: "center" }, [
        part("prize-wheel", {
          label: say("Spin", "开始", "回す", "돌리기"),
          size: 340,
          result: -1,
          prizes: [{ label: "×100", icon: "paid" }, { label: "×10", icon: "diamond" }, { label: "×5", icon: "bolt" }, { label: say("Thanks", "谢谢参与", "はずれ", "꽝"), icon: "sentiment_neutral" }, { label: "×500", icon: "paid" }, { label: "×50", icon: "diamond" }],
        }),
      ]),
      part("button", { label: say("Spin 10 times · 100", "十连转 · 100", "10 回まわす · 100", "10회 돌리기 · 100"), size: "md", variant: "tonal", icon: "diamond" }),
      part("accordion", { openFirst: false, items: [{ label: say("Rules", "活动规则", "ルール", "규칙") }, { label: say("My prizes", "我的奖品", "獲得した賞品", "내 상품") }], content: say("Spins reset every day at midnight.", "每天零点重置抽奖次数。", "回数は毎日 0 時にリセットされます。", "횟수는 매일 자정에 초기화됩니다.") }),
    ],
  });

const landscapeLobbyScreen = (): ScreenSeed =>
  screen({
    id: "lobby-wide",
    name: say("Lobby, landscape", "横屏大厅", "横向きロビー", "가로 로비"),
    frame: "landscape",
    scene: backdrop(CAMP),
    spots: [
      stage({ justify: "between", padX: 16, padY: 12 }, [
        row({ justify: "between" }, [playerChip(160), purse({ width: PURSE_W })]),
        row({ justify: "between", align: "end" }, [
          panel({ padX: 8, padY: 8, width: 348 }, [row({ gap: 4, justify: "between" }, [shortcut("swords", say("Heroes", "角色", "キャラ", "캐릭터")), shortcut("backpack", say("Bag", "背包", "持ち物", "가방")), shortcut("storefront", say("Shop", "商城", "ショップ", "상점")), shortcut("task_alt", say("Quests", "任务", "クエスト", "퀘스트")), shortcut("groups", say("Guild", "公会", "ギルド", "길드"))])]),
          col({ gap: 8, width: 200 }, [part("button", { label: say("Play", "开始游戏", "プレイ", "플레이"), size: "lg", icon: "play_arrow" }), part("button", { label: say("Ranked", "排位赛", "ランク戦", "랭크전"), size: "md", variant: "tonal" })]),
        ]),
      ]),
    ],
  });

const loadingScreen = (): ScreenSeed =>
  screen({
    id: "game-loading",
    name: say("Loading screen", "加载画面", "ロード画面", "로딩 화면"),
    scene: backdrop(FANTASY),
    spots: [
      stage({ justify: "end", padX: 16, padY: 16 }, [
        panel({ gap: 12 }, [
          txt(say("Tip: upgrade your gear before a hard level.", "提示：挑战难关前先强化装备。", "ヒント：難しいステージの前に装備を強化しよう。", "팁: 어려운 스테이지 전에 장비를 강화하세요."), "body", { color: "muted" }),
          part("progress", { value: 64, label: say("Loading", "加载中", "読み込み中", "불러오는 중"), showValue: true }),
        ]),
        row({ justify: "center" }, [VERSION()]),
      ]),
    ],
  });

const pin = (icon: string, name: Say, at: Anchor, state: "done" | "here" | "locked"): Node => part("button", { label: name, icon: state === "locked" ? "lock" : icon, size: "sm", variant: state === "here" ? "filled" : "tonal", width: 128, disabled: state === "locked" }, { at });

const worldMapScreen = (): ScreenSeed =>
  screen({
    id: "world-map",
    name: say("World map", "世界地图", "ワールドマップ", "월드맵"),
    scene: backdrop(ATLAS),
    top: [title(say("World map", "世界地图", "ワールドマップ", "월드맵"))],
    spots: [
      purse({ width: PURSE_W }, { r: 16, t: 80 }),
      pin("volcano", say("Volcano", "火山", "火山", "화산"), { r: 56, t: 176 }, "locked"),
      pin("ac_unit", say("Snowfield", "雪原", "雪原", "설원"), { l: 56, t: 288 }, "locked"),
      pin("wb_sunny", say("Desert", "沙漠", "砂漠", "사막"), { r: 72, t: 400 }, "here"),
      pin("forest", say("Forest", "森林", "森", "숲"), { l: 72, t: 512 }, "done"),
      panel({ gap: 12 }, [
        row({ justify: "between" }, [txt(say("Desert", "沙漠", "砂漠", "사막"), "title", {}, { fill: true }), part("asset-pill", { value: "18/30", icon: "star" })]),
        part("progress", { value: 60, label: say("Levels cleared", "已通关", "クリア済み", "클리어"), showValue: true }),
        part("button", { label: say("Enter", "进入", "入る", "입장"), size: "md", icon: "play_arrow" }),
      ], { at: { l: 16, r: 16, b: 16 } }),
    ],
  });

const team = (...names: Say[]): Node => row({ gap: 4, hugWidth: true }, names.map((name) => part("avatar", { initials: initial(name) })));

const matchFoundScreen = (): ScreenSeed =>
  screen({
    id: "match-found",
    name: say("Match found", "匹配成功", "マッチング成立", "매치 성사"),
    frame: "landscape",
    scene: backdrop(ARENA, "full"),
    spots: [
      stage({ justify: "center", align: "center" }, [
        panel({ gap: 12, padX: 24, width: 600 }, [
          col({ gap: 2 }, [txt(say("Match found", "匹配成功", "マッチング成立", "매치 성사"), "headline", { align: "center" }), txt(say("Ranked · 5 vs 5", "排位赛 · 5 对 5", "ランク戦 · 5 対 5", "랭크전 · 5 대 5"), "caption", { color: "muted", align: "center" })]),
          row({ justify: "center", gap: 16 }, [team(PLAYERS.nova, PLAYERS.ember, PLAYERS.frost, PLAYERS.kite, PLAYERS.sage), txt("VS", "title", { width: 40, align: "center" }), team(PLAYERS.pixel, PLAYERS.comet, PLAYERS.willow, PLAYERS.orion, PLAYERS.luna)]),
          part("progress", { value: 70, label: say("Accept within 12 s", "请在 12 秒内接受", "12 秒以内に承諾", "12초 안에 수락"), showValue: false }),
          row({ gap: 12 }, [part("button", { label: say("Decline", "拒绝", "辞退", "거절"), size: "md", variant: "tonal" }, { fill: true }), part("button", { label: say("Accept", "接受", "承諾", "수락"), size: "md" }, { fill: true })]),
        ]),
      ]),
    ],
  });

const STEP = (name: Say, icon: string, now: string, then: string): (Say | string)[] => [icon, name, "value", `${now} → ${then}`];

const upgradeScreen = (): ScreenSeed =>
  screen({
    id: "character-upgrade",
    name: say("Character upgrade", "角色升级", "キャラ強化", "캐릭터 강화"),
    place: "spread",
    top: [title(say("Upgrade", "升级", "強化", "강화"))],
    body: [
      tabsOf(say("Level", "等级", "レベル", "레벨"), say("Stars", "星级", "星", "별"), say("Skills", "技能", "スキル", "스킬")),
      panel({ gap: 12 }, [
        row({ gap: 12 }, [cell("person", "", "", say("Epic", "史诗", "エピック", "에픽"), 96), col({ gap: 4 }, [txt(say("Hero name", "角色名称", "キャラ名", "캐릭터 이름"), "title"), txt(say("Warrior", "战士", "戦士", "전사"), "caption", { color: "muted" }), txt(say("Lv. 24 → Lv. 25", "24 级 → 25 级", "Lv. 24 → Lv. 25", "Lv. 24 → Lv. 25"), "label")], { fill: true })]),
        part("stat-bar", { icon: "trending_up", label: say("EXP", "经验", "EXP", "EXP"), value: 640, max: 1000, color: "primary", numbers: true }),
      ]),
      atomsOf("settings-group", {
        title: say("Next level", "下一级", "次のレベル", "다음 레벨"),
        data: { columns: ["Icon", "Label", "Control", "Value"], rows: [STEP(say("HP", "生命", "HP", "HP"), "favorite", "980", "1,020"), STEP(say("Attack", "攻击", "攻撃", "공격"), "swords", "860", "900"), STEP(say("Defense", "防御", "防御", "방어"), "shield", "540", "565")] },
      }),
      col({ gap: 8 }, [
        heading(say("Materials", "所需材料", "必要な素材", "필요 재료")),
        row({ justify: "between" }, [cell("science", say("EXP potion", "经验药水", "経験薬", "경험 물약"), "12/20"), cell("auto_awesome", say("Crystal", "水晶", "クリスタル", "수정"), "3/5"), cell("hardware", say("Ore", "矿石", "鉱石", "광석"), "8/10"), cell("paid", COIN_WORD, "2,400")]),
      ]),
      row({ gap: 12 }, [part("button", { label: say("Max", "最大", "最大", "최대"), size: "md", variant: "tonal" }, { fill: true }), part("button", { label: say("Level up", "升级", "レベルアップ", "레벨 업"), size: "md" }, { fill: true })]),
    ],
  });

const pcMenuScreen = (): ScreenSeed =>
  screen({
    id: "pc-menu",
    name: say("Main menu", "主菜单", "メインメニュー", "메인 메뉴"),
    frame: "desktop",
    scene: backdrop(FANTASY),
    spots: [
      /* before the layout: a part let go on one, later in the order, is taken in by it */
      VERSION({ r: 24, b: 24 }),
      stage({ justify: "center", align: "start", padX: 64 }, [
        panel({ gap: 8, padY: 24, padX: 24, width: 320 }, [
          txt(say("Game title", "游戏名称", "ゲームタイトル", "게임 이름"), "headline"),
          part("button", { label: say("New game", "新游戏", "はじめから", "새 게임"), size: "md" }),
          part("button", { label: say("Continue", "继续", "つづきから", "이어하기"), size: "md", variant: "tonal" }),
          part("button", { label: say("Options", "选项", "オプション", "옵션"), size: "md", variant: "tonal" }),
          part("button", { label: say("Quit", "退出", "終了", "종료"), size: "md", variant: "text" }),
        ]),
      ]),
    ],
  });

const pcHudScreen = (): ScreenSeed =>
  screen({
    id: "pc-hud",
    name: say("In game", "游戏内界面", "ゲーム画面", "게임 화면"),
    frame: "desktop",
    scene: backdrop(ARENA),
    spots: [
      panel({ gap: 6, padX: 12, padY: 8, width: 300 }, [part("stat-bar", { icon: "favorite", label: say("HP", "生命", "HP", "HP"), value: 720, max: 1000, color: "error", numbers: true }), part("stat-bar", { icon: "bolt", label: say("Stamina", "体力", "スタミナ", "기력"), value: 460, max: 1000, color: "primary", numbers: true })], { at: { l: 16, t: 16 } }),
      part("map", { label: "", width: 200, height: 160 }, { at: { r: 16, t: 16 } }),
      panel({ gap: 4, padX: 12, padY: 8, width: 240 }, [txt(say("Quest", "当前任务", "クエスト", "퀘스트"), "label", { color: "muted" }), txt(say("Reach the next checkpoint", "前往下一个检查点", "次のチェックポイントへ", "다음 체크포인트로 이동"), "body")], { at: { l: 16 } }),
      panel({ padX: 12, padY: 8, width: 392 }, [row({ gap: 6, justify: "center" }, [cell("swords", "1", "", "", 56), cell("shield", "2", "", "", 56), cell("local_fire_department", "3", "", "", 56), cell("healing", "4", "×3", "", 56), cell("science", "5", "×5", "", 56), cell("explore", "6", "", "", 56)])], { at: { b: 16 } }),
    ],
  });

const pcInventoryScreen = (): ScreenSeed =>
  deskScreen({
    id: "pc-inventory",
    name: say("Character and bag", "角色与背包", "キャラと持ち物", "캐릭터와 가방"),
    side: part("side-tabs", { selected: 1, width: 160, items: [{ label: say("Character", "角色", "キャラ", "캐릭터") }, { label: say("Bag", "背包", "持ち物", "가방") }, { label: say("Skills", "技能", "スキル", "스킬") }, { label: say("Quests", "任务", "クエスト", "퀘스트") }, { label: say("Map", "地图", "地図", "지도") }, { label: say("System", "系统", "システム", "시스템") }] }),
    body: [
      row({ justify: "between" }, [txt(say("Bag", "背包", "持ち物", "가방"), "headline"), part("icon-button", { icon: "close", label: say("Close", "关闭", "閉じる", "닫기"), variant: "text" })]),
      row({ gap: 24, align: "start" }, [
        col({ gap: 12 }, [tabsOf(say("All", "全部", "すべて", "전체"), say("Weapons", "武器", "武器", "무기"), say("Armor", "防具", "防具", "방어구"), say("Items", "道具", "道具", "도구")), atomsOf("inventory", { columns: 8, rows: 6, filled: 21, width: 728 })], { fill: true }),
        col({ gap: 12, width: 320 }, [HERO(""), itemDetail()]),
      ]),
    ],
  });

const game = (slug: string, name: string, ja: string, zh: string, ko: string, frame: Template["frame"], icon: string, seed: () => ScreenSeed): Template => ({ slug, name, labels: { ja, zh, ko }, category: "game", frame, icon, build: () => [seed()] });

export const games: Template[] = [
  game("game-title", "Title screen", "タイトル画面", "标题画面", "타이틀 화면", "phone", "videogame_asset", titleScreen),
  game("game-loading", "Loading screen", "ロード画面", "加载画面", "로딩 화면", "phone", "hourglass_top", loadingScreen),
  game("game-lobby", "Lobby", "ロビー", "游戏大厅", "로비", "phone", "home", lobbyScreen),
  game("game-lobby-landscape", "Lobby, landscape", "横向きロビー", "横屏大厅", "가로 로비", "landscape", "screen_rotation", landscapeLobbyScreen),
  game("world-map", "World map", "ワールドマップ", "世界地图", "월드맵", "phone", "public", worldMapScreen),
  game("level-select", "Level select", "ステージ選択", "关卡选择", "스테이지 선택", "phone", "map", levelSelectScreen),
  game("level-start", "Level start", "ステージ開始", "关卡开始", "스테이지 시작", "phone", "flag", levelStartScreen),
  game("match-found", "Match found", "マッチング成立", "匹配成功", "매치 성사", "landscape", "group_add", matchFoundScreen),
  game("battle-hud", "Battle", "バトル", "战斗界面", "전투", "landscape", "swords", battleHudScreen),
  game("puzzle-board", "Puzzle board", "パズル盤面", "棋盘关卡", "퍼즐 보드", "phone", "grid_on", puzzleScreen),
  game("pause-menu", "Pause menu", "ポーズメニュー", "暂停菜单", "일시정지 메뉴", "phone", "pause_circle", pauseScreen),
  game("victory", "Victory", "勝利", "胜利结算", "승리", "phone", "trophy", victoryScreen),
  game("defeat", "Defeat", "敗北", "失败结算", "패배", "phone", "heart_broken", defeatScreen),
  game("story-dialogue", "Story dialogue", "ストーリー会話", "剧情对话", "스토리 대화", "phone", "forum", storyScreen),
  game("game-inventory", "Inventory", "持ち物", "背包", "가방", "phone", "backpack", inventoryScreen),
  game("game-character", "Character", "キャラ詳細", "角色详情", "캐릭터 상세", "phone", "person", characterScreen),
  game("character-upgrade", "Character upgrade", "キャラ強化", "角色升级", "캐릭터 강화", "phone", "upgrade", upgradeScreen),
  game("character-select", "Choose a hero", "キャラ選択", "角色选择", "캐릭터 선택", "phone", "group", characterSelectScreen),
  game("game-shop", "Game shop", "ショップ", "游戏商城", "상점", "phone", "storefront", shopScreen),
  game("gacha-pull", "Summon", "ガチャ", "抽卡召唤", "소환", "phone", "casino", gachaScreen),
  game("event-wheel", "Lucky wheel", "ルーレット", "活动转盘", "룰렛", "phone", "cyclone", wheelScreen),
  game("daily-check-in", "Daily check-in", "ログインボーナス", "每日签到", "출석 체크", "phone", "calendar_month", checkInScreen),
  game("game-quests", "Quests", "クエスト", "任务", "퀘스트", "phone", "task_alt", questsScreen),
  game("battle-pass", "Season pass", "シーズンパス", "赛季通行证", "시즌 패스", "phone", "workspace_premium", passScreen),
  game("game-leaderboard", "Leaderboard", "ランキング", "排行榜", "랭킹", "phone", "leaderboard", leaderboardScreen),
  game("game-friends", "Friends", "フレンド", "好友列表", "친구", "phone", "contacts", friendsScreen),
  game("game-guild", "Guild", "ギルド", "公会", "길드", "phone", "groups", guildScreen),
  game("game-mail", "Mail", "メール", "邮件", "우편함", "phone", "mail", mailScreen),
  game("game-settings", "Game settings", "ゲーム設定", "游戏设置", "게임 설정", "phone", "settings", gameSettingsScreen),
  game("pc-main-menu", "PC main menu", "PC メインメニュー", "电脑主菜单", "PC 메인 메뉴", "desktop", "desktop_windows", pcMenuScreen),
  game("pc-hud", "PC in game", "PC ゲーム画面", "电脑游戏内界面", "PC 게임 화면", "desktop", "stadia_controller", pcHudScreen),
  game("pc-inventory", "PC character and bag", "PC キャラと持ち物", "电脑角色与背包", "PC 캐릭터와 가방", "desktop", "inventory_2", pcInventoryScreen),
];
