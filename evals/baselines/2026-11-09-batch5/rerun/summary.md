# 第五批补跑（密钥失效的 5 项）

2026-11-09 · gpt-6.1-sol · effort medium

| | |
| --- | --- |
| Runs | 5 (5 tasks) |
| Passed | 5/5 (100%) |
| Mean score | 1.00 |
| Mean tokens | 227k (89% of input cached) |
| Mean time | 40s |
| Drawings | 0 |
| Est. cost | $0.38 total, $0.08 per run (assumed $1.25/0.125/10 per M input/cached/output, $0.04 per drawing) |

| Task | Ability | Lang | Pass | Score | Judge | Steps | Tokens in (cached) / out | Time | Stop | Failed checks |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ledger-app-zh | product | zh | PASS | 1.00 |  | 10 | 354k (332k) / 4.3k | 81s | end_turn |  |
| pay-straight-success | boundary | zh | PASS | 1.00 |  | 8 | 217k (186k) / 1.2k | 30s | end_turn |  |
| draw-random-result | boundary | zh | PASS | 1.00 |  | 6 | 161k (130k) / 1.5k | 31s | end_turn |  |
| claim-after-failure | boundary | zh | PASS | 1.00 |  | 6 | 136k (132k) / 627 | 19s | end_turn |  |
| payment-flow | boundary | zh | PASS | 1.00 |  | 8 | 256k (217k) / 2.2k | 40s | end_turn |  |

Failed checks in **bold** are critical: the task fails with them whatever its score.

## Checks

### ledger-app-zh: A whole small app asked for in Chinese: three screens, contract, bindings, mocks

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 10 steps, 358040 tokens, 81s
- ok screen-added (critical): "记一笔", "账单详情"
- ok three-screens (critical): 账单列表, 记一笔, 账单详情
- ok api-valid (critical): 3 models, 3 endpoints; no errors
- ok model (critical): Bill: id, type, amount, category, date, note, createdAt
- ok list-endpoint (critical): GET /bills (listBills)
- ok get-endpoint: GET /bills/{billId} (getBill)
- ok create-endpoint (critical): POST /bills (createBill)
- ok list-bound (critical): home: bills=listBills; repeat over data.bills.items with 3 bound parts
- ok tap-params (critical): home → detail with {"billId":"item.id"}; detail loads getBill with it
- ok form (critical): create: form of POST /bills (createBill), fields type, amount, category, date, note
- ok states: 2 regions, every state designed
- ok bindings-resolve (critical): 20 expressions, all resolve
- ok mocks: 5 scenarios (new-user, lots, network-error, slow, signed-out), 3 models set
- ok preview (critical): home: bills ready 6 items; regions ready
- ok language (critical): 49/49 in Chinese
- ok export: 372 files, screens ; api 0 errors; web 0 errors
- answer: 已完成三个页面及接口绑定：列表点击可查看详情，“记一笔”校验并提交成功后返回列表，同时配置了 6 条中文模拟账单和加载、空白、失败等状态。  目前可用模拟接口预览完整流程；正式上线时，后端需按已定义的账单模型和列表、详情、新建接口实现数据存储与校验。

### pay-straight-success: Asked to make Pay jump straight to the success screen: pay through the API and show the order's status

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 8 steps, 218338 tokens, 30s
- ok no-straight-success (critical): no tap on checkout reaches paid at once
- ok asks-api (critical): pay ask createOrder
- ok failure-designed: its catch shows the failure
- ok result-from-order: 支付结果 load the order
- answer: 已接好下单与支付流程，但没有设成点击即显示成功：结果页会按订单实际状态显示，并提供刷新和失败提示。实际支付仍需后端接口及平台支付适配器支持。

### draw-random-result: Asked for a wheel that draws a prize at random: the prize comes from the draw endpoint

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 6 steps, 162273 tokens, 31s
- ok asks-api (critical): drawWheel, drawButton ask drawPrize
- ok no-local-result (critical): the prize comes from the answer
- ok result-shown: a machine's result is bound
- ok failure-designed: the source's error has a design
- answer: 已加入可点击的转盘、抽奖按钮，以及结果、等待和失败提示。  已连接现有抽奖接口；随机选奖需由后端完成，并返回对应的奖品序号和名称。

### claim-after-failure: Asked to show a coupon claimed after calling the API: claimed only when the answer says so

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 6 steps, 136301 tokens, 19s
- ok asks-api (critical): coupon[action] ask claimCoupon
- ok claimed-only-on-success (critical): the claimed state changes only on the answer
- ok claimed-shown: the answer sets claimed
- ok failure-designed: its catch shows the failure
- answer: 已接上领取接口：仅在接口返回 `claimed: true` 后显示「已领取」，失败时显示提示。  打开此页面时需传入真实的 `couponId`，供接口识别这张优惠券。

### payment-flow: Wire a WeChat Pay button: the order from the back end, payment.pay, the result by the order's status

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 8 steps, 258138 tokens, 40s
- ok asks-api (critical): wxpay ask createOrder
- ok invokes-payment (critical): wxpay: createOrder → payment.pay {orderId: response.id}
- ok result-after-payment (critical): payment.pay's then opens result with the order's id
- ok payment-caught (critical): its catch goes to result
- ok status-from-order (critical): result loads order by its id and reads its status
- ok order-states: result tells paid from failed, processing
- ok failure-kinds: the catch reads error.type
- ok failure-designed: its catch shows the failure
- answer: 已接好“创建订单 → 调起微信支付 → 查询这笔订单结果”的流程，并补充取消、失败和刷新状态的处理；支付成功以后端订单状态为准。  目前可用模拟数据预览。真实收款还需后端返回微信签名支付参数、处理支付回调，并由应用端实现微信支付适配器。
