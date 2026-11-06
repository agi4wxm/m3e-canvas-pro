# After the fixes: gpt-6.1-sol, effort medium

2026-11-06 · gpt-6.1-sol · effort medium · with the vision judge

| | |
| --- | --- |
| Runs | 19 (19 tasks) |
| Passed | 19/19 (100%) |
| Mean score | 0.99 |
| Mean judge score (1–5) | 4.8 |
| Mean tokens | 91k (87% of input cached) |
| Mean time | 36s |
| Drawings | 1 |
| Est. cost | $0.83 total, $0.04 per run (assumed $1.25/0.125/10 per M input/cached/output, $0.04 per drawing) |

| Task | Ability | Lang | Pass | Score | Judge | Steps | Tokens in (cached) / out | Time | Stop | Failed checks |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| login-material | new-screen | zh | PASS | 1.00 | 5 | 5 | 55k (43k) / 688 | 18s | end_turn |  |
| profile-ios-strict | new-screen | en | PASS | 1.00 | 5 | 5 | 52k (50k) / 668 | 19s | end_turn |  |
| list-to-cards | edit | zh | PASS | 1.00 | 5 | 6 | 76k (59k) / 2.8k | 54s | end_turn |  |
| polish-spacing | edit | en | PASS | 0.86 | 5 | 3 | 32k (21k) / 387 | 9s | end_turn | even-spacing |
| contacts-data | data | en | PASS | 1.00 | 5 | 5 | 58k (45k) / 1.4k | 27s | end_turn |  |
| dark-mode-switch | variables | zh | PASS | 1.00 | 4 | 7 | 91k (77k) / 410 | 20s | end_turn |  |
| stepper-vars | variables | en | PASS | 1.00 | 5 | 5 | 60k (57k) / 927 | 16s | end_turn |  |
| prompt-box-component | components | en | PASS | 1.00 | 4 | 11 | 132k (107k) / 914 | 33s | end_turn |  |
| product-instances | components | zh | PASS | 1.00 | 5 | 9 | 98k (94k) / 584 | 24s | end_turn |  |
| paper-style | styles | zh | PASS | 1.00 | 4 | 3 | 42k (26k) / 2.7k | 43s | end_turn |  |
| svg-tab-icon | svg | en | PASS | 1.00 | 5 | 3 | 36k (34k) / 1.0k | 27s | end_turn |  |
| replicate-weather | replicate | en | PASS | 1.00 | 4 | 15 | 382k (323k) / 6.8k | 116s | end_turn |  |
| game-hud | game | en | PASS | 1.00 | 5 | 7 | 84k (79k) / 1.5k | 42s | end_turn |  |
| profile-ja | multilingual | ja | PASS | 1.00 | 5 | 4 | 45k (41k) / 979 | 19s | end_turn |  |
| cart-ko | multilingual | ko | PASS | 0.90 | 5 | 7 | 88k (82k) / 1.3k | 29s | end_turn | no-overlap |
| vague-wipe | ambiguous | zh | PASS | 1.00 | – | 1 | 10k (9.1k) / 118 | 5s | end_turn |  |
| travel-app-flow | flow | en | PASS | 1.00 | 5 | 10 | 158k (148k) / 5.2k | 81s | end_turn |  |
| checkout-strict | new-screen | en | PASS | 1.00 | 5 | 6 | 72k (68k) / 2.0k | 40s | end_turn |  |
| long-feed | long-screen | en | PASS | 1.00 | 5 | 9 | 130k (110k) / 1.7k | 52s | end_turn |  |

Failed checks in **bold** are critical: the task fails with them whatever its score.

## Checks

### login-material: New login screen in the current style (Material, free canvas)

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 5 steps, 55979 tokens, 18s
- ok screen-added (critical): "登录"
- ok fields (critical): 2 found (need 1): input "邮箱", input "密码" on login
- ok button (critical): 2 found (need 1): button "登录", button "忘记密码？" on login
- ok shows: 1/1
- ok language (critical): 6/6 in Chinese
- ok auto-layout: login: 3 layout containers, 80% of parts in a layout, 0 loose atoms
- ok no-overlap: none on login
- ok in-bounds: all inside
- ok keeps-work: all kept
- judge: 5 — 邮箱、密码输入框、登录按钮和忘记密码链接均已完整呈现。; 中文文案统一，布局清晰，无重叠或截断。; 淡紫背景与紫色主按钮、链接配色协调，整体简洁完整。
- answer: 已新增同风格的登录页，包含邮箱、密码、登录按钮和“忘记密码？”链接，原笔记页保持不变。登录按钮已连接到笔记页，忘记密码链接暂未设置跳转。

### profile-ios-strict: New profile screen on a strict iOS document

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 5 steps, 53154 tokens, 19s
- ok style-rules (critical): ios, 10 parts keep to it
- ok screen-added (critical): "Profile"
- ok avatar (critical): 1 found (need 1): avatar "AJ" on profile
- ok shows (critical): 3/3
- ok language (critical): 7/7 in English
- ok auto-layout: profile: 1 layout containers, 50% of parts in a layout, 0 loose atoms
- ok no-overlap: none on profile
- ok in-bounds: all inside
- ok keeps-work: all kept
- judge: 5 — Includes an avatar, name, short bio, and all three requested account rows.; Clean, consistent styling with matching blue icons, clear typography, and balanced spacing.; No visible overlaps, clipped text, or broken layout.
- answer: Added a Profile screen in the current iOS style, with an initials avatar, sample name and bio, and grouped rows for Orders, Addresses, and Payment methods. The back button returns to Settings.

### list-to-cards: Turn the selected list into cards

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 6 steps, 78654 tokens, 54s
- ok cards (critical): 4 found (need 4): card "番茄炒蛋", card "红烧排骨", card "清炒时蔬", card "酸辣汤" on recipes
- ok pictures: 4 found (need 4): card "番茄炒蛋", card "红烧排骨", card "清炒时蔬", card "酸辣汤" on recipes
- ok shows (critical): 4/4
- ok no-rows: no list rows left
- ok no-overlap: none on recipes
- ok in-bounds: all inside
- ok keeps-work: all kept
- judge: 5 — 列表已改为四张圆角卡片，每张都有图片、标题和一句简介。; 卡片尺寸、间距和图文排版统一，层次清晰。; 中文内容完整易读，无明显重叠、截断或布局问题。
- answer: 已将列表改为四张图文卡片，每张配有对应菜品插画、标题和一句简介，保留了原有内容与 Material 风格。

### polish-spacing: Polish the spacing of a messy screen

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 3 steps, 32688 tokens, 9s
- **FAIL** even-spacing: 8 rows, gaps 16/8/44/40/16/16 (spread 36), 2 left edges
- ok no-overlap: none on profile
- ok in-bounds: all inside
- ok shows (critical): 7/7
- judge: 5 — Consistent left alignment and page margins create a clean layout.; Buttons and project cards have even spacing and balanced internal padding.; Clear typography hierarchy with no overlaps or clipped text.
- answer: Aligned the content to consistent 24 dp side margins, put the buttons on one baseline, and matched the work cards’ widths and spacing. All content and Material styling are preserved.

### contacts-data: Contacts from a collection, repeated rows, tap to a detail screen

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 5 steps, 59242 tokens, 27s
- ok collection (critical): people "People": name, phone, city; 5 rows
- ok repeat (critical): peopleList repeats people
- ok tap-detail (critical): personRow→personDetail; the tap sets variables from the row and the detail shows them
- ok screen-added (critical): "Contact details"
- ok no-overlap: none on contacts, personDetail
- ok in-bounds: all inside
- ok keeps-work: all kept
- judge: 5 — The list shows five people, each with a name, phone number, and city in a consistent repeated row layout.; The detail screen displays Avery Johnson's name, phone, and city, matching the selected list entry.; Both screens look polished and consistent, with clear navigation and no visible clipping or overlap.
- answer: Added a People collection with five contacts and a repeated row for each person. Tapping a row opens their name, phone, and city on a detail screen, with a back button to return to the list.

### dark-mode-switch: A dark-mode switch wired to a variable that drives dark

- ok finished (critical): stop=end_turn, 1 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 7 steps, 91846 tokens, 20s
- ok dark-var (critical): darkMode "深色模式" bool
- ok dark-control (critical): nw6shdw7 switch bind {"checked":"darkMode"}
- ok no-overlap: none on f1
- ok in-bounds: all inside
- ok keeps-work: all kept
- judge: 4 — 已添加“深色模式”开关，中文标签和月亮图标清晰。; 开关与设置列表风格一致，布局整齐，无明显遮挡或截断。; 截图显示开关处于关闭状态，无法确认开启后是否实际切换为深色。
- answer: 已将“通用”里的开关设为“深色模式”，并连接到全局主题。在预览中打开即可切换深色，关闭则恢复浅色。

### stepper-vars: A quantity stepper: a number variable, a bound text, + and − taps

- ok finished (critical): stop=end_turn, 1 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 5 steps, 61130 tokens, 16s
- ok counter (critical): cart-quantity "Quantity": shown, + and − wired
- ok no-overlap: none on cart
- ok in-bounds: all inside
- ok keeps-work: all kept
- judge: 5 — The − button, quantity number, and + button are clearly placed next to the price.; The stepper is neatly aligned and matches the cart’s purple styling.; No visible clipping, overlap, or layout issues; button behavior cannot be verified from the screenshot.
- answer: Added a − / quantity / + stepper beside the price. The quantity starts at 1, updates with each tap, and cannot go below 1.

### prompt-box-component: Build a Codex-style prompt box from atoms, save it as a component, place an instance

- ok finished (critical): stop=end_turn, 1 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 11 steps, 133057 tokens, 33s
- ok component (critical): 3de3y72q "Prompt box": 7 parts, 100% atoms, auto layout
- ok instances (critical): 1 instances on chat
- ok no-overlap: none on chat
- ok in-bounds: all inside
- ok keeps-work: all kept
- judge: 4 — Rounded prompt panel sits at the bottom of the Chat screen with ample multiline input space.; Lower row includes an attach icon, GPT-5 Codex model chip, and clearly styled send button.; Layout looks polished and consistent, though the screenshot cannot verify atom-based construction or a reusable component named "Prompt box".
- answer: Created the reusable “Prompt box” component from atoms and placed an instance at the bottom of Chat, with a multi-line input, attach button, model chip, and send button.

### product-instances: Use an existing component: three instances with their own words

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 9 steps, 98484 tokens, 24s
- ok instances (critical): 3 instances on shop, overrides carry every word
- ok no-overlap: none on shop
- ok in-bounds: all inside
- ok keeps-work: all kept
- judge: 5 — 商店页使用统一的商品卡片展示了苹果、梨、李子三个商品。; 价格分别为 ¥3、¥4、¥5，与要求一致。; 卡片布局整齐，文字与加入购物车按钮显示完整，无重叠或截断。
- answer: 已用商品卡片组件添加苹果 ¥3、梨 ¥4、李子 ¥5，按两列排列，保留了组件原有样式。

### paper-style: Generate a warm paper-notebook style and wear it

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 3 steps, 44237 tokens, 43s
- ok custom-style (critical): custom:warm-paper-journal "暖纸手账", surface #FBF5E9
- ok texture: 9 rules; draws texture, stroke, shadow
- ok keeps-work (critical): all kept
- judge: 4 — 暖米色纸张背景、浅横线和棕色文字较好地呈现了暖色笔记本风格。; 列表页与新笔记页配色统一，图标和按钮也已应用相应主题。; 编辑页输入文字紧贴边框，保存按钮偏小，控件间距和内边距仍可打磨。
- answer: 已生成并穿上「暖纸手账」风格：奶油色纸张、淡横线、暖棕文字与陶土色按钮。两个页面均已检查，原有内容和功能保持不变。

### svg-tab-icon: Write a route icon as SVG code and put it in the tab bar

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 3 steps, 37366 tokens, 27s
- ok svg (critical): 0 SVG parts, 0 sanitize, 0 in place; document icon svg:winding-route shown by f84
- ok shows (critical): 4/4
- ok no-overlap: none on map
- ok in-bounds: all inside
- judge: 5 — Routes tab displays a custom icon with two map pins connected by a winding dotted path.; Icon fits neatly in the tab bar and matches the other icons’ size and color.; Tab labels and surrounding layout remain clean and intact.
- answer: Replaced the Routes tab’s icon with a custom SVG of a winding dotted path between two map pins, preserving its size and muted color.

### replicate-weather: Copy a weather screen from an attached screenshot

- ok finished (critical): stop=end_turn, 1 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 15 steps, 388481 tokens, 116s
- ok shows: 8/8
- ok likeness: weather: 97
- ok auto-layout: weather: 21 layout containers, 91% of parts in a layout, 1 loose atoms
- ok no-overlap: none on weather
- ok in-bounds: all inside
- judge: 4 — Closely matches the reference layout, blue gradient, forecast cards, and bottom navigation.; All weather labels, temperatures, and forecast values are reproduced correctly.; The large 21° temperature is noticeably heavier than the reference’s thin typography.; Minor differences remain in text sizing and navigation icon alignment.
- answer: Created a new “Lisbon Weather” screen matching the reference’s layout, blue gradient, forecast panels, text, and bottom navigation. Your original Home screen remains intact.

### game-hud: A battle HUD in the four corners of a landscape game screen

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 7 steps, 85709 tokens, 42s
- ok style-rules (critical): moba, 12 parts keep to it
- ok corners (critical): tl 2 bars: 2/2, tr a minimap: 2/1, bl a joystick: 1/1, br 4 skills: 4/4
- ok in-bounds: all inside
- ok keeps-work: all kept
- judge: 5 — All requested HUD elements are present in the correct corners.; HP and mana bars have clear labels, distinct colors, and readable numeric values.; Minimap, virtual joystick, and four labeled skill buttons are neatly arranged without overlap.; Consistent navy-and-gold styling makes the HUD look cohesive and finished.
- answer: Added HP and mana bars, a tactical minimap, a virtual joystick, and four skill buttons in the requested corners, matching the navy-and-gold MOBA style.

### profile-ja: A profile screen asked for in Japanese

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 4 steps, 45656 tokens, 19s
- ok screen-added (critical): "プロフィール"
- ok avatar (critical): 2 found (need 1): avatar "MC", avatar "葵" on home, profile
- ok button (critical): 5 found (need 1): icon-button "その他", button "いいね", button "コメント", button "共有" on home, profile
- ok language (critical): 8/9 in Japanese; not: "@aoi_sato"
- ok no-overlap: none on home, profile
- ok in-bounds: all inside
- ok keeps-work: all kept
- judge: 5 — プロフィール画面にアイコン、名前、自己紹介、フォローボタンがすべて揃っています。; 日本語の表記と配色が既存のホーム画面と統一されています。; 情報の階層と余白が整理され、文字の重なりや見切れもありません。
- answer: プロフィール画面を追加しました。アイコン、名前、自己紹介と、タップで「フォロー中」に切り替わるボタンを配置しています。  ホームの投稿者アイコンか名前から開けます。

### cart-ko: A cart screen asked for in Korean

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 7 steps, 89087 tokens, 29s
- ok screen-added (critical): "장바구니"
- ok shows (critical): 2/2
- ok button (critical): 5 found (need 1): icon-button "삭제", icon-button "삭제", icon-button "삭제", box/buy-bar "구매 바" on cart
- ok language (critical): 15/15 in Korean
- **FAIL** no-overlap: 1 overlapping pairs: 27hr56r5 "Box" × 527zmdhp "Box"
- ok in-bounds: all inside
- ok keeps-work: all kept
- judge: 5 — 요청한 상품 3개, 합계 금액, 결제하기 버튼이 모두 있습니다.; 상품 가격의 합계가 10,000원으로 정확하며 무료 배송도 명확히 표시됩니다.; 한국어 표기와 색상, 간격이 일관되고 겹침이나 잘림 없이 깔끔하게 구성되었습니다.
- answer: 장바구니 화면을 추가했습니다. 사과·배·바나나 세 상품과 합계 10,000원, 결제하기 버튼을 배치하고 배송비도 표시했습니다.

### vague-wipe: “Delete it all and redo it”: ask first, keep the author's work

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: the turn changed nothing
- ok budget: 1 steps, 10488 tokens, 5s
- ok keeps-work (critical): all kept
- ok asks: "你想把现有的登录、首页和个人主页这 3 个页面全部删除后重做，还是保留内容、只重新设计？新风格有偏好的颜色或感觉吗，比如清爽极简、温暖文艺？确认一下：要把这 3 个页面全部删除、从零重做吗？新风格想走清爽极简，还是温暖文艺？"
- judge: – (no screenshot to judge)
- answer: 你想把现有的登录、首页和个人主页这 3 个页面全部删除后重做，还是保留内容、只重新设计？新风格有偏好的颜色或感觉吗，比如清爽极简、温暖文艺？确认一下：要把这 3 个页面全部删除、从零重做吗？新风格想走清爽极简，还是温暖文艺？

### travel-app-flow: A three-screen app wired together: tab bar between two screens, a detail and back

- ok finished (critical): stop=end_turn, 1 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 10 steps, 163047 tokens, 81s
- ok nav-flow (critical): 3 screens; tab bars on home, saved, switching from home, saved; opens detail; back from detail
- ok screen-added (critical): "Trip detail", "Saved"
- ok language (critical): 38/38 in English
- ok auto-layout: home: 4 layout containers, 80% of parts in a layout, 0 loose atoms; detail: 4 layout containers, 88% of parts in a layout, 0 loose atoms; saved: 2 layout containers, 75% of parts in a layout, 0 loose atoms
- ok no-overlap: none on home, detail, saved
- ok in-bounds: all inside
- judge: 5 — All three requested screens are present: Trips, Trip detail, and Saved.; Trips and Saved use a consistent bottom navigation bar with the appropriate active tab.; The detail screen includes a clear back button in its top bar.; Layouts are polished and consistent, with readable text, coordinated colors, and no visible overlaps or clipping.
- answer: Built Trips, Trip detail, and Saved with matching Material styling. Bottom navigation switches between Trips and Saved; either trip opens its corresponding detail, with a working back button.

### checkout-strict: A checkout form on a strict iOS document: fields, a choice, a switch, a summary, a pinned pay button

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 6 steps, 74367 tokens, 40s
- ok style-rules (critical): ios, 41 parts keep to it
- ok screen-added (critical): "Checkout"
- ok fields (critical): 4 found (need 4): input "Full name", input "Street address", input "City", input "Postal code" on checkout
- ok switch (critical): 1 found (need 1): switch "Save this address" on checkout
- ok shows (critical): 4/4
- ok pay-pinned: button "Pay $80.00" ends 24 dp above the foot of checkout
- ok language (critical): 19/19 in English
- ok auto-layout: checkout: 13 layout containers, 92% of parts in a layout, 0 loose atoms
- ok no-overlap: none on checkout
- ok in-bounds: all inside
- ok keeps-work: all kept
- judge: 5 — Includes all four shipping fields, Standard and Express delivery choices, and a Save this address switch.; Order summary clearly shows three items and the correct $80.00 total.; Pay button is prominently pinned to the bottom.; Consistent styling, clean spacing, and no visible layout issues.
- answer: Added the Checkout screen in the existing iOS style, with shipping fields, delivery choices, a save-address switch, and a three-item order summary. The Pay button is pinned to the bottom, and choosing Express updates the total.

### long-feed: A long scrolling feed: stories, eight posts, bars pinned

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 9 steps, 131324 tokens, 52s
- ok scrolls (critical): length 1620 on a 892 device, content down to 1532
- ok posts (critical): 8 parts show /^like$/i (need 8)
- ok stories: 14 found (need 12) (7 in the document, the rest repeated rows): avatar "{{initials}}", avatar "YOU", avatar "AL", avatar "MR" on feed
- ok bars-pinned: top bar at 0, tab bar ends at 1620 (device 892, screen 1620)
- ok no-overlap: none on feed
- ok in-bounds: all inside
- judge: 5 — Six story avatars appear directly beneath the top bar.; All eight posts include an author avatar, name, time, two lines of text, and Like and Comment controls.; Layout is clean and consistent, with evenly spaced cards and no visible clipping or overlaps.; Top bar and bottom navigation are present; pinned scrolling behavior cannot be verified from the screenshot alone.
- answer: Added six story avatars and eight posts, each with an author, timestamp, two lines of text, and Like and Comment buttons. The feed scrolls while the top bar and bottom navigation stay pinned.
