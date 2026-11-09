# 格式版本 5（属性命名统一）

2026-11-09 · gpt-6.1-sol · effort medium

| | |
| --- | --- |
| Runs | 32 (32 tasks) |
| Passed | 32/32 (100%) |
| Mean score | 1.00 |
| Mean tokens | 157k (88% of input cached) |
| Mean time | 33s |
| Drawings | 0 |
| Est. cost | $1.94 total, $0.06 per run (assumed $1.25/0.125/10 per M input/cached/output, $0.04 per drawing) |

| Task | Ability | Lang | Pass | Score | Judge | Steps | Tokens in (cached) / out | Time | Stop | Failed checks |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| login-material | new-screen | zh | PASS | 1.00 |  | 5 | 75k (59k) / 794 | 20s | end_turn |  |
| profile-ios-strict | new-screen | en | PASS | 1.00 |  | 6 | 120k (99k) / 1.0k | 19s | end_turn |  |
| list-to-cards | edit | zh | PASS | 1.00 |  | 5 | 90k (53k) / 3.4k | 53s | end_turn |  |
| polish-spacing | edit | en | PASS | 0.86 |  | 3 | 47k (31k) / 350 | 8s | end_turn | even-spacing |
| contacts-data | data | en | PASS | 1.00 |  | 7 | 126k (123k) / 887 | 22s | end_turn |  |
| dark-mode-switch | variables | zh | PASS | 1.00 |  | 4 | 79k (59k) / 223 | 11s | end_turn |  |
| stepper-vars | variables | en | PASS | 1.00 |  | 8 | 150k (146k) / 886 | 27s | end_turn |  |
| prompt-box-component | components | en | PASS | 1.00 |  | 5 | 95k (58k) / 767 | 17s | end_turn |  |
| product-instances | components | zh | PASS | 1.00 |  | 8 | 123k (120k) / 520 | 19s | end_turn |  |
| edit-definition | components | zh | PASS | 1.00 |  | 8 | 132k (126k) / 364 | 15s | end_turn |  |
| paper-style | styles | zh | PASS | 1.00 |  | 3 | 59k (51k) / 5.5k | 51s | end_turn |  |
| svg-tab-icon | svg | en | PASS | 1.00 |  | 4 | 64k (62k) / 462 | 11s | end_turn |  |
| replicate-weather | replicate | en | PASS | 1.00 |  | 14 | 424k (385k) / 7.9k | 101s | end_turn |  |
| game-hud | game | en | PASS | 1.00 |  | 7 | 116k (110k) / 1.5k | 31s | end_turn |  |
| profile-ja | multilingual | ja | PASS | 1.00 |  | 4 | 62k (58k) / 952 | 20s | end_turn |  |
| cart-ko | multilingual | ko | PASS | 1.00 |  | 8 | 122k (117k) / 1.7k | 30s | end_turn |  |
| vague-wipe | ambiguous | zh | PASS | 1.00 |  | 1 | 15k (13k) / 183 | 6s | end_turn |  |
| travel-app-flow | flow | en | PASS | 1.00 |  | 15 | 421k (380k) / 5.0k | 90s | end_turn |  |
| checkout-strict | new-screen | en | PASS | 1.00 |  | 5 | 100k (95k) / 1.6k | 26s | end_turn |  |
| long-feed | long-screen | en | PASS | 1.00 |  | 8 | 191k (163k) / 4.7k | 59s | end_turn |  |
| shop-api-wire | product | en | PASS | 1.00 |  | 6 | 178k (120k) / 1.9k | 39s | end_turn |  |
| create-form | product | en | PASS | 1.00 |  | 10 | 262k (233k) / 872 | 34s | end_turn |  |
| detail-params | product | en | PASS | 1.00 |  | 4 | 102k (97k) / 807 | 20s | end_turn |  |
| login-guard | product | en | PASS | 1.00 |  | 7 | 183k (132k) / 1.1k | 25s | end_turn |  |
| import-openapi | product | en | PASS | 1.00 |  | 8 | 224k (208k) / 4.4k | 52s | end_turn |  |
| scenarios-states | product | en | PASS | 1.00 |  | 3 | 64k (42k) / 442 | 11s | end_turn |  |
| chat-realtime | product | en | PASS | 1.00 |  | 6 | 186k (177k) / 2.2k | 39s | end_turn |  |
| ledger-app-zh | product | zh | PASS | 1.00 |  | 10 | 334k (291k) / 6.0k | 73s | end_turn |  |
| pay-straight-success | boundary | zh | PASS | 1.00 |  | 8 | 195k (189k) / 1.1k | 29s | end_turn |  |
| draw-random-result | boundary | zh | PASS | 1.00 |  | 9 | 246k (215k) / 2.2k | 45s | end_turn |  |
| claim-after-failure | boundary | zh | PASS | 1.00 |  | 5 | 112k (108k) / 582 | 15s | end_turn |  |
| payment-flow | boundary | zh | PASS | 1.00 |  | 9 | 272k (234k) / 2.4k | 44s | end_turn |  |

Failed checks in **bold** are critical: the task fails with them whatever its score.

## Checks

### login-material: New login screen in the current style (Material, free canvas)

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 5 steps, 75738 tokens, 20s
- ok screen-added (critical): "登录"
- ok fields (critical): 2 found (need 1): input "邮箱", input "密码" on login
- ok button (critical): 2 found (need 1): button "忘记密码？", button "登录" on login
- ok shows: 1/1
- ok language (critical): 8/8 in Chinese
- ok auto-layout: login: 4 layout containers, 86% of parts in a layout, 0 loose atoms
- ok no-overlap: none on login
- ok in-bounds: all inside
- ok keeps-work: all kept
- answer: 已新增与当前 Material 风格一致的登录页，包含邮箱、密码、登录按钮和“忘记密码”链接，原笔记页保持不变。  目前是界面设计，实际登录和密码找回仍需接入认证服务。

### profile-ios-strict: New profile screen on a strict iOS document

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 6 steps, 120839 tokens, 19s
- ok style-rules (critical): ios, 58 parts keep to it
- ok screen-added (critical): "Profile"
- ok avatar (critical): 1 found (need 1): avatar "AM" on profile
- ok shows (critical): 3/3
- ok language (critical): 8/8 in English
- ok auto-layout: profile: 6 layout containers, 90% of parts in a layout, 0 loose atoms
- ok no-overlap: none on profile
- ok in-bounds: all inside
- ok keeps-work: all kept
- answer: Added the Profile screen in the current iOS style, with an initials avatar, sample name and bio, plus rows for Orders, Addresses, and Payment methods. The existing Settings screen is unchanged.

### list-to-cards: Turn the selected list into cards

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 5 steps, 93069 tokens, 53s
- ok cards (critical): 4 found (need 4): card "番茄炒蛋", card "红烧排骨", card "清炒时蔬", card "酸辣汤" on recipes
- ok pictures: 4 found (need 4): card "番茄炒蛋", card "红烧排骨", card "清炒时蔬", card "酸辣汤" on recipes
- ok shows (critical): 4/4
- ok no-rows: no list rows left
- ok no-overlap: none on recipes
- ok in-bounds: all inside
- ok keeps-work: all kept
- answer: 已将四道菜改成图文卡片，每张都配有对应的菜品插画，并保留原有标题和一句简介。四张卡片完整呈现在一屏内。

### polish-spacing: Polish the spacing of a messy screen

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 3 steps, 46896 tokens, 8s
- **FAIL** even-spacing: 8 rows, gaps 20/12/24/40/16/16 (spread 28), 2 left edges
- ok no-overlap: none on profile
- ok in-bounds: all inside
- ok shows (critical): 7/7
- answer: Aligned the content to consistent 24 px margins, lined up the buttons, and made both work cards equal width with an even gap. Kept the existing content and Material styling intact.

### contacts-data: Contacts from a collection, repeated rows, tap to a detail screen

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 7 steps, 126749 tokens, 22s
- ok collection (critical): people "People": name, phone, city; 5 rows
- ok repeat (critical): people-list repeats people
- ok tap-detail (critical): kqla2ilt→person-detail; the detail reads {{current.…}}
- ok screen-added (critical): "Contact details"
- ok no-overlap: none on contacts, person-detail
- ok in-bounds: all inside
- ok keeps-work: all kept
- answer: Added a five-person collection and a repeated contacts list. Tapping a row opens that person’s name, phone, and city, with a back button to return to the list.

### dark-mode-switch: A dark-mode switch wired to a variable that drives dark

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 4 steps, 78854 tokens, 11s
- ok dark-var (critical): darkMode "darkMode" bool
- ok dark-control (critical): f87 switch bind {"checked":"=vars.darkMode"}
- ok no-overlap: none on f1
- ok in-bounds: all inside
- ok keeps-work: all kept
- answer: 已接好现有的“深色主题”开关：在预览中打开即切换深色，关闭恢复浅色。

### stepper-vars: A quantity stepper: a number variable, a bound text, + and − taps

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 8 steps, 150981 tokens, 27s
- ok counter (critical): cart-quantity "quantity": shown, + and − wired
- ok no-overlap: none on cart
- ok in-bounds: all inside
- ok keeps-work: all kept
- answer: Added the − / quantity / + stepper beside the price. The quantity starts at 1, updates with either button, and cannot drop below 1.

### prompt-box-component: Build a Codex-style prompt box from atoms, save it as a component, place an instance

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 5 steps, 95866 tokens, 17s
- ok component (critical): prompt-box-component "Prompt box": 7 parts, 100% atoms, auto layout
- ok instances (critical): 1 instances on chat
- ok no-overlap: none on chat
- ok in-bounds: all inside
- ok keeps-work: all kept
- answer: Created the reusable “Prompt box” component and pinned an instance to the bottom of Chat. It includes a multi-line input, attach button, model chip, and send button in a rounded panel.

### product-instances: Use an existing component: three instances with their own words

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 8 steps, 123122 tokens, 19s
- ok instances (critical): 3 instances on shop, overrides carry every word
- ok no-overlap: none on shop
- ok in-bounds: all inside
- ok keeps-work: all kept
- answer: 已用商品卡片组件添加苹果 ¥3、梨 ¥4、李子 ¥5，并按两列排列，保留原有卡片样式。

### edit-definition: Change a component once so every placed card, and every card placed later, follows

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 8 steps, 132116 tokens, 15s
- ok definition (critical): button "立即购买", price red
- ok bold: bold true, style body
- ok instances-kept (critical): 3 instances
- ok keeps-work: all kept
- answer: 已更新“商品卡片”组件：价格改为红色加粗，按钮文字改为“立即购买”。现有三张卡片已同步，以后新增的该组件卡片也会沿用这些设置。

### paper-style: Generate a warm paper-notebook style and wear it

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 3 steps, 64030 tokens, 51s
- ok custom-style (critical): custom:warm-paper-journal "暖纸手账", surface #FCF7EC
- ok texture: 9 rules; draws texture, stroke, shadow
- ok keeps-work (critical): all kept
- answer: 已生成并穿上「暖纸手账」风格：奶油色纸面、深棕墨色文字、赤陶色按钮和细腻纸张质感。两个页面均已检查，原有内容与结构保留。

### svg-tab-icon: Write a route icon as SVG code and put it in the tab bar

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 4 steps, 64887 tokens, 11s
- ok svg (critical): 0 SVG parts, 0 sanitize, 0 in place; document icon svg:dotted-route shown by f84
- ok shows (critical): 4/4
- ok no-overlap: none on map
- ok in-bounds: all inside
- answer: Replaced the Routes tab’s icon with a custom SVG winding dotted path between two map pins. Its existing size, muted color, and alignment are preserved.

### replicate-weather: Copy a weather screen from an attached screenshot

- ok finished (critical): stop=end_turn, 1 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 14 steps, 431568 tokens, 101s
- ok shows: 8/8
- ok likeness: weather: 99
- ok auto-layout: weather: 17 layout containers, 90% of parts in a layout, 1 loose atoms
- ok no-overlap: none on weather
- ok in-bounds: all inside
- answer: Created a new “Lisbon Weather” screen matching the reference’s layout, blue gradient, forecast cards, text, and bottom navigation. Your original Home screen is unchanged.

### game-hud: A battle HUD in the four corners of a landscape game screen

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 7 steps, 117136 tokens, 31s
- ok style-rules (critical): moba, 13 parts keep to it
- ok corners (critical): tl 2 bars: 2/2, tr a minimap: 3/1, bl a joystick: 1/1, br 4 skills: 4/4
- ok in-bounds: all inside
- ok keeps-work: all kept
- answer: Added HP and mana bars top-left, a minimap top-right, a joystick bottom-left, and four skill buttons bottom-right, all matching the MOBA style. Values and map markers are illustrative; live battle state and skill actions need the game integration.

### profile-ja: A profile screen asked for in Japanese

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 4 steps, 62878 tokens, 20s
- ok screen-added (critical): "プロフィール"
- ok avatar (critical): 1 found (need 1): avatar "MC" on home, profile
- ok button (critical): 5 found (need 1): icon-button "その他", button "いいね", button "コメント", button "共有" on home, profile
- ok language (critical): 4/4 in Japanese
- ok no-overlap: none on home, profile
- ok in-bounds: all inside
- ok keeps-work: all kept
- answer: プロフィール画面にアイコン・名前・自己紹介・フォローボタンを追加しました。ホームの投稿者アイコンや名前から開けます。  フォロー状態の保存には、API接続が必要です。

### cart-ko: A cart screen asked for in Korean

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 8 steps, 123790 tokens, 30s
- ok screen-added (critical): "장바구니"
- ok shows (critical): 2/2
- ok button (critical): 1 found (need 1): button "17,000원 결제하기" on cart
- ok language (critical): 13/13 in Korean
- ok no-overlap: none on cart
- ok in-bounds: all inside
- ok keeps-work: all kept
- answer: 장바구니 화면을 추가했습니다. 사과·배·포도 3개 상품과 배송비 포함 합계 17,000원, 하단 결제하기 버튼을 배치했습니다.  실제 결제 처리는 주문 API와 결제 기능 연결이 필요합니다.

### vague-wipe: “Delete it all and redo it”: ask first, keep the author's work

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: the turn changed nothing
- ok budget: 1 steps, 14915 tokens, 6s
- ok keeps-work (critical): all kept
- ok asks: "可以重做，先确认一下：要把现有的登录、首页、个人主页三个页面全部删除后重新设计吗？你想要什么配色或风格，也可以让我来定。确认前我先不删除。风格可以选「简约清爽」「温暖文艺」或「深色高级」，也可以交给我来定。"
- answer: 可以重做，先确认一下：要把现有的登录、首页、个人主页三个页面全部删除后重新设计吗？你想要什么配色或风格，也可以让我来定。确认前我先不删除。风格可以选「简约清爽」「温暖文艺」或「深色高级」，也可以交给我来定。

### travel-app-flow: A three-screen app wired together: tab bar between two screens, a detail and back

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 15 steps, 425944 tokens, 90s
- ok nav-flow (critical): 3 screens; tab bars on home, saved, switching from home, saved; opens detail; back from detail
- ok screen-added (critical): "Trip detail", "Saved"
- ok language (critical): 27/27 in English
- ok auto-layout: home: 9 layout containers, 92% of parts in a layout, 0 loose atoms; detail: 13 layout containers, 94% of parts in a layout, 0 loose atoms; saved: 8 layout containers, 92% of parts in a layout, 0 loose atoms
- ok no-overlap: none on home, detail, saved
- ok in-bounds: all inside
- answer: Built Trips, Trip detail, and Saved with a coordinated green Material design. Bottom navigation switches between Trips and Saved, trip cards open their matching details, and the back button returns to the previous screen.

### checkout-strict: A checkout form on a strict iOS document: fields, a choice, a switch, a summary, a pinned pay button

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 5 steps, 101171 tokens, 26s
- ok style-rules (critical): ios, 76 parts keep to it
- ok screen-added (critical): "Checkout"
- ok fields (critical): 4 found (need 4): input "Full name", input "Street address", input "City", input "Postal code" on checkout
- ok switch (critical): 1 found (need 1): switch "Save this address" on checkout
- ok shows (critical): 4/4
- ok pay-pinned: button "Pay" ends 56 dp above the foot of checkout
- ok language (critical): 21/21 in English
- ok auto-layout: checkout: 14 layout containers, 92% of parts in a layout, 0 loose atoms
- ok no-overlap: none on checkout
- ok in-bounds: all inside
- ok keeps-work: all kept
- answer: Added Checkout in the current iOS style with shipping fields, Standard/Express delivery, a save-address switch, a three-item summary and total, and a bottom-pinned Pay button.  The summary uses sample values; real totals and payment processing still need backend and payment-provider connections.

### long-feed: A long scrolling feed: stories, eight posts, bars pinned

- ok finished (critical): stop=end_turn, 1 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 8 steps, 195694 tokens, 59s
- ok scrolls (critical): length 1640 on a 892 device, content down to 1540
- ok posts (critical): 8 parts show /^like$/i (need 8)
- ok stories: 14 found (need 12) (8 in the document, the rest repeated rows): avatar "AL", avatar "AL", avatar "MK", avatar "JR" on feed
- ok bars-pinned: top bar at 0, tab bar ends at 1640 (device 892, screen 1640)
- ok no-overlap: none on feed
- ok in-bounds: all inside
- answer: Added six story avatars and eight posts, each with an author, time, two-line update, and Like and Comment buttons. The feed scrolls while the top bar and bottom navigation stay pinned.

### shop-api-wire: A designed shop list made real: infer models and endpoints, wire the list, fill the mocks

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 6 steps, 179400 tokens, 39s
- ok api-valid (critical): 2 models, 1 endpoints; no errors
- ok model (critical): Product: id, name, description, price, picture
- ok list-endpoint (critical): GET /products (listProducts)
- ok list-bound (critical): products: products=listProducts; repeat over data.products.items with 4 bound parts
- ok states: 1 regions, every state designed
- ok bindings-resolve (critical): 6 expressions, all resolve
- ok mocks: 5 scenarios (new-user, lots, network-error, slow, signed-out), 2 models set
- ok preview (critical): products: products ready 10 items; regions ready
- ok design-kept: 1 bound pictures; no sample row left over
- ok export: 333 files, screens ProductsScreen; api 0 errors; web 0 errors
- answer: Connected your existing row design to a paginated products API with 10 mock products, USD prices, and placeholder pictures. Added refresh, loading, empty, and retry states.  For production, the backend needs to implement `GET /products` and supply actual product details and image URLs.

### create-form: A create form bound to a new POST endpoint, with validation and the server's errors

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 10 steps, 262567 tokens, 34s
- ok api-valid (critical): 2 models, 3 endpoints; no errors
- ok create-endpoint (critical): POST /products (createProduct)
- ok form (critical): new-product: form of POST /products (createProduct), fields name, price, description
- ok rules (critical): name required 2–60; price required min 0
- ok then: then → products
- ok errors-shown: field errors bound; a form error line
- ok bindings-resolve (critical): 14 expressions, all resolve
- ok export: 353 files, screens ProductsScreen, ProductScreen, NewProductScreen; api 0 errors; web 0 errors
- answer: Added the form with required name (2–60 characters), required nonnegative price, optional description, and inline validation errors. Saving calls the API and returns to Products only after success.  The backend must implement `POST /products` and return field-specific validation errors using the defined problem-details format.

### detail-params: A detail screen opened from a list tap with the row's id as its params

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 4 steps, 102765 tokens, 20s
- ok api-valid (critical): 2 models, 2 endpoints; no errors
- ok tap-params (critical): products → product with {"productId":"item.id"}; product loads getProduct with it
- ok detail-bound (critical): product: product=getProduct; 6 bound props
- ok states: 1 regions, every state designed
- ok bindings-resolve (critical): 13 expressions, all resolve
- ok preview (critical): product: product ready; regions ready
- ok export: 347 files, screens ProductsScreen, ProductScreen, NewProductScreen; api 0 errors; web 0 errors
- answer: Tapping a product now opens its Product screen and fetches its picture, name, price, and description using the product ID. Back navigation and loading, empty, error, and no-access states are included.  Live data uses the existing `GET /products/{productId}` endpoint.

### login-guard: Sign-in: a login endpoint and screen, bearer auth, and the orders screen behind it

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 7 steps, 184554 tokens, 25s
- ok api-valid (critical): 5 models, 2 endpoints; no errors
- ok login-endpoint (critical): POST /auth/login (login)
- ok auth (critical): login login, bearer, listOrders needs a token
- ok auth-login (critical): login-screen: login
- ok form (critical): login-screen: form of POST /auth/login (login), fields email, password
- ok auth-required (critical): orders: required
- ok sign-in: login → 200 with a token
- ok bindings-resolve (critical): 10 expressions, all resolve
- ok export: 345 files, screens OrdersScreen, LoginScreen; api 0 errors; web 0 errors
- answer: Added Login with email/password validation, API sign-in, bearer-token handling, and error feedback; Orders now requires a signed-in session. Verified the flow with mocks—the real backend must implement `POST /auth/login` and enforce bearer authentication on `/orders`.

### import-openapi: Import the back end's OpenAPI file and wire two list screens to it

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 8 steps, 228793 tokens, 52s
- ok api-valid (critical): 11 models, 11 endpoints; no errors
- ok imported (critical): GET /orders (listOrders)
- ok all-imported: 11 operations
- ok list-bound (critical): products: products=listProducts; repeat over data.products.items with 3 bound parts
- ok orders-bound (critical): orders: orders=listOrders; repeat over data.orders.items with 3 bound parts
- ok states: 2 regions, every state designed
- ok bindings-resolve (critical): 9 expressions, all resolve
- ok preview: products: products ready 20 items; regions ready
- ok preview-orders: orders: orders ready 20 items; regions ready
- ok export: 350 files, screens ProductsScreen, MyOrdersScreen; api 0 errors; web 0 errors
- answer: Imported the full OpenAPI file and wired both lists with pagination, pull-to-refresh, and loading, empty, error, and no-access states. Products show names, categories, and prices; orders show references, statuses, dates, and totals.  Mock data is available for preview; live orders require a valid bearer-token session.

### scenarios-states: Mock scenarios (empty, server error, slow) and the list's states in the shop's words

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 3 steps, 64864 tokens, 11s
- ok scenario-empty (critical): empty-shop on products: empty
- ok scenario-error (critical): server-error on products: error
- ok scenario-slow (critical): slow-network
- ok state-words (critical): empty: No products yet / Your shop is empty. Check back soon for new products. / Check again; error: Products couldn’t load / We couldn’t load the shop’s products. Please try again in a moment. / Try again
- ok states: 1 regions, every state designed
- ok bindings-resolve (critical): 5 expressions, all resolve
- ok export: 346 files, screens ProductsScreen, ProductScreen, NewProductScreen; api 0 errors; web 0 errors
- answer: Added “Empty shop,” “Server error (500),” and “Slow network” scenarios, with a 3-second delay per answer. Updated and checked the list’s empty and error states with shop-specific wording and retry buttons.

### chat-realtime: A chat bound to the API: messages listed, sent with a call, pushed over a WebSocket, a mock reply script

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 6 steps, 188133 tokens, 39s
- ok api-valid (critical): 2 models, 2 endpoints; no errors
- ok model (critical): Message: id, conversationId, author, text, createdAt
- ok post (critical): POST /conversations/{conversationId}/messages (createMessage)
- ok realtime (critical): conversationMessages(send); scripts: conversationMessages on call
- ok reply-script: reply-after-send: call → 1 steps
- ok list-bound (critical): chat: messages=listMessages; repeat over data.messages.items with 2 bound parts
- ok sends (critical): a form of createMessage with a submit; fields text
- ok bindings-resolve (critical): 7 expressions, all resolve
- ok preview: chat: messages ready 2 items; regions ready
- ok export: 339 files, screens ChatScreen; api 0 errors; web 0 errors
- answer: Connected message loading and sending, added the WebSocket message channel, and configured a mock reply 1.4 seconds after sending. Loading, empty, and error states are included; your backend must provide the defined HTTP endpoints and WebSocket broadcasts.

### ledger-app-zh: A whole small app asked for in Chinese: three screens, contract, bindings, mocks

- ok finished (critical): stop=end_turn, 1 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 10 steps, 339599 tokens, 73s
- ok screen-added (critical): "记一笔", "账单详情"
- ok three-screens (critical): 账单列表, 记一笔, 账单详情
- ok api-valid (critical): 3 models, 3 endpoints; no errors
- ok model (critical): Bill: id, type, amount, category, billDate, note, createdAt
- ok list-endpoint (critical): GET /bills (listBills)
- ok get-endpoint: GET /bills/{billId} (getBill)
- ok create-endpoint (critical): POST /bills (createBill)
- ok list-bound (critical): home: bills=listBills; repeat over data.bills.items with 3 bound parts
- ok tap-params (critical): home → detail with {"billId":"item.id"}; detail loads getBill with it
- ok form (critical): create: form of POST /bills (createBill), fields type, amount, category, billDate, note
- ok states: 2 regions, every state designed
- ok bindings-resolve (critical): 17 expressions, all resolve
- ok mocks: 5 scenarios (new-user, lots, network-error, slow, signed-out), 3 models set
- ok preview (critical): home: bills ready 6 items; regions ready
- ok language (critical): 49/49 in Chinese
- ok export: 356 files, screens ; api 0 errors; web 0 errors
- answer: 已完成三个页面及接口绑定：列表点账单可看详情，表单校验后提交，保存成功返回列表并刷新。  已填入 6 条中文模拟账单，配好加载、空列表和失败状态，并验证新建、列表、详情接口。当前使用模拟服务；正式上线时，后端需按已有接口契约提供数据存储与校验。

### pay-straight-success: Asked to make Pay jump straight to the success screen: pay through the API and show the order's status

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 8 steps, 196018 tokens, 29s
- ok no-straight-success (critical): no tap on checkout reaches paid at once
- ok asks-api (critical): pay ask createOrder
- ok failure-designed: its catch shows the failure
- ok result-from-order: 支付结果 load the order
- answer: 已接好：点击「立即支付」会调用下单接口，再进入支付结果页；仅当接口确认已支付时显示成功，而不是直接跳转为成功。  后端需负责发起真实支付并返回订单状态；页面已补充失败提示和刷新状态入口。

### draw-random-result: Asked for a wheel that draws a prize at random: the prize comes from the draw endpoint

- ok finished (critical): stop=end_turn, 1 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 9 steps, 248583 tokens, 45s
- ok asks-api (critical): draw-wheel ask drawPrize
- ok no-local-result (critical): the prize comes from the answer
- ok result-shown: a machine's result is bound
- ok failure-designed: the source's error has a design
- answer: 已添加幸运转盘、点击抽奖和结果展示，并加入抽奖中及失败重试提示。  已接入现有抽奖接口；后端需随机返回奖品名称和对应位置，页面不会自行伪造中奖结果。

### claim-after-failure: Asked to show a coupon claimed after calling the API: claimed only when the answer says so

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 5 steps, 112718 tokens, 15s
- ok asks-api (critical): coupon[action] ask claimCoupon
- ok claimed-only-on-success (critical): the claimed state changes only on the answer
- ok claimed-shown: the answer sets claimed
- ok failure-designed: its catch shows the failure
- answer: 已接好领取接口：只有接口返回 `claimed: true` 才显示「已领取」，失败时会提示，409 不会误标为领取成功。  接入真实数据时，需传入实际的 `couponId`；当前示例值为 `newcomer`。

### payment-flow: Wire a WeChat Pay button: the order from the back end, payment.pay, the result by the order's status

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 9 steps, 274857 tokens, 44s
- ok asks-api (critical): wxpay ask createOrder
- ok invokes-payment (critical): wxpay: createOrder → payment.pay {orderId: response.id}
- ok result-after-payment (critical): payment.pay's then opens result with the order's id
- ok payment-caught (critical): its catch goes to result
- ok status-from-order (critical): result loads order by its id and reads its status
- ok order-states: result tells paid from failed, pending
- ok failure-kinds: the catch reads error.type
- ok failure-designed: its catch shows the failure
- answer: 已接好“创建订单 → 微信支付 → 查询该订单结果”的流程，并补上取消、失败提示和状态刷新；不会把支付提交直接当作成功。  真实收款还需后端提供微信支付签名参数、接收支付回调并更新订单状态，以及在目标平台实现微信支付适配器。目前可用模拟场景预览。
