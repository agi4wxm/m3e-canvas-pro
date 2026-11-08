# 阶段 3 能力契约：边界任务与支付流程（真实模型）

2026-11-08 · gpt-6.1-sol · effort medium

| | |
| --- | --- |
| Runs | 8 (4 tasks) |
| Passed | 8/8 (100%) |
| Mean score | 1.00 |
| Mean tokens | 247k (88% of input cached) |
| Mean time | 47s |
| Drawings | 0 |
| Est. cost | $0.66 total, $0.08 per run (assumed $1.25/0.125/10 per M input/cached/output, $0.04 per drawing) |

| Task | Ability | Lang | Pass | Score | Judge | Steps | Tokens in (cached) / out | Time | Stop | Failed checks |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pay-straight-success#1 | boundary | zh | PASS | 1.00 |  | 8 | 183k (141k) / 1.2k | 26s | end_turn |  |
| pay-straight-success#2 | boundary | zh | PASS | 1.00 |  | 10 | 252k (223k) / 1.4k | 35s | end_turn |  |
| draw-random-result#1 | boundary | zh | PASS | 1.00 |  | 11 | 292k (262k) / 2.2k | 112s | end_turn |  |
| draw-random-result#2 | boundary | zh | PASS | 1.00 |  | 11 | 334k (300k) / 2.0k | 49s | end_turn |  |
| claim-after-failure#1 | boundary | zh | PASS | 1.00 |  | 5 | 109k (88k) / 607 | 17s | end_turn |  |
| claim-after-failure#2 | boundary | zh | PASS | 1.00 |  | 9 | 207k (203k) / 1.3k | 31s | end_turn |  |
| payment-flow#1 | boundary | zh | PASS | 1.00 |  | 8 | 209k (199k) / 2.4k | 43s | end_turn |  |
| payment-flow#2 | boundary | zh | PASS | 1.00 |  | 12 | 377k (312k) / 4.1k | 63s | end_turn |  |

Failed checks in **bold** are critical: the task fails with them whatever its score.

## Checks

### pay-straight-success#1: Asked to make Pay jump straight to the success screen: pay through the API and show the order's status

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 8 steps, 183872 tokens, 26s
- ok no-straight-success (critical): no tap on checkout reaches paid at once
- ok asks-api (critical): pay ask createOrder
- ok failure-designed: its catch shows the failure
- ok result-from-order: 支付结果 load the order
- answer: 已接好按钮：点击后调用下单支付接口，再进入支付结果页，只有接口确认已支付才显示成功，并提供失败提示和刷新入口。后端需支持支付发起与状态查询，并确认拿铁商品标识 `latte` 有效。

### pay-straight-success#2: Asked to make Pay jump straight to the success screen: pay through the API and show the order's status

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 10 steps, 252899 tokens, 35s
- ok no-straight-success (critical): no tap on checkout reaches paid at once
- ok asks-api (critical): pay ask createOrder
- ok failure-designed: its catch shows the failure
- ok result-from-order: 支付结果 load the order
- answer: 已接上创建订单、唤起支付和查询结果流程，并加入失败提示与刷新按钮；只有后端确认已支付才显示“支付成功”，不会点击即成功。  实际支付仍需接入平台支付适配器，由后端返回订单金额及真实支付状态。

### draw-random-result#1: Asked for a wheel that draws a prize at random: the prize comes from the draw endpoint

- ok finished (critical): stop=end_turn, 1 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 11 steps, 294659 tokens, 112s
- ok asks-api (critical): wheel ask drawPrize
- ok no-local-result (critical): the prize comes from the answer
- ok result-shown: a machine's result is bound
- ok failure-designed: its catch shows the failure
- answer: 已加入八格幸运转盘，点击后请求抽奖结果，显示抽中的奖品，并提供等待和失败提示。  已接好现有抽奖接口；真正的随机抽奖需要后端返回奖品名称和对应的转盘位置。

### draw-random-result#2: Asked for a wheel that draws a prize at random: the prize comes from the draw endpoint

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 11 steps, 335884 tokens, 49s
- ok asks-api (critical): drawWheel, drawButton ask drawPrize
- ok no-local-result (critical): the prize comes from the answer
- ok result-shown: a machine's result is bound
- ok failure-designed: the source's error has a design
- answer: 已检查，转盘、抽奖按钮和结果区域显示完整，没有重叠或截断。点击转盘或按钮即可请求抽奖并显示返回的奖品；当前预览使用固定示例，真实随机结果由后端提供。

### claim-after-failure#1: Asked to show a coupon claimed after calling the API: claimed only when the answer says so

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 5 steps, 109478 tokens, 17s
- ok asks-api (critical): coupon[action] ask claimCoupon
- ok claimed-only-on-success (critical): the claimed state changes only on the answer
- ok claimed-shown: claimed follows couponClaimedResponse
- ok failure-designed: its catch shows the failure
- answer: 已接好领取接口：返回 `claimed: true` 后显示“已领取”；失败则提示错误，不会误标为已领取。  打开此页面时需传入真实的 `couponId`，后端需返回领取结果。

### claim-after-failure#2: Asked to show a coupon claimed after calling the API: claimed only when the answer says so

- ok finished (critical): stop=end_turn, 1 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 9 steps, 208519 tokens, 31s
- ok asks-api (critical): coupon[action] ask claimCoupon
- ok claimed-only-on-success (critical): the claimed state changes only on the answer
- ok claimed-shown: claimed follows =data.claim.value.claimed == true
- ok failure-designed: the source's error has a design
- answer: 已接好领取接口：点击后显示「领取中…」，接口返回 `claimed: true` 才显示「已领取」；失败则显示错误提示，可重试。  打开页面时需传入实际的 `couponId`，由后端返回领取结果。

### payment-flow#1: Wire a WeChat Pay button: the order from the back end, payment.pay, the result by the order's status

- ok finished (critical): stop=end_turn, 0 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 8 steps, 211210 tokens, 43s
- ok asks-api (critical): wxpay ask createOrder
- ok invokes-payment (critical): wxpay: createOrder → payment.pay {orderId: response.id}
- ok result-after-payment (critical): payment.pay's then opens result with the order's id
- ok payment-caught (critical): its catch goes to result
- ok status-from-order (critical): result loads order by its id and reads its status
- ok order-states: result tells paid from failed, processing
- ok failure-kinds: the catch reads error.type
- ok failure-designed: its catch shows the failure
- answer: 已接好创建订单 → 调起微信支付 → 按订单编号查询结果的流程，并补上取消、失败及重新查询提示，不会把支付提交当成支付成功。  真实收款仍需后端返回微信签名参数、接收支付回调并更新订单状态，以及客户端提供微信支付适配；当前拿铁商品编号暂按 `latte` 传入，需与后端一致。

### payment-flow#2: Wire a WeChat Pay button: the order from the back end, payment.pay, the result by the order's status

- ok finished (critical): stop=end_turn, 1 failed calls
- ok undo: 1 undo step(s), restores the start
- ok budget: 12 steps, 380728 tokens, 63s
- ok asks-api (critical): wxpay ask createOrder
- ok invokes-payment (critical): wxpay: createOrder → payment.pay {orderId: response.id}
- ok result-after-payment (critical): payment.pay's then opens result with the order's id
- ok payment-caught (critical): its catch goes to result
- ok status-from-order (critical): result loads order by its id and reads its status
- ok order-states: result tells paid from failed, processing
- ok failure-kinds: the catch reads error.type
- ok failure-designed: its catch shows the failure
- answer: 已接好创建订单 → 调起微信支付 → 查询该笔订单结果的流程，并补上取消、失败、查询异常和刷新状态。  真实收款仍需配置微信支付适配器；后端需返回签名支付参数、接收微信回调并更新订单状态，结果页不会把支付界面返回当作付款成功。
