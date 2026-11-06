# 2026-11-06 产品层：接口、绑定、模拟库

模型 `gpt-6.1-sol`，推理强度 medium，不开视觉评分。新加的八个产品层任务（`evals/productTasks.ts`）各跑两次，原来的二十个任务各跑一次（运行 A，36 个回合），修完看到的问题后重跑受影响的五个任务各一次（运行 B，5 个回合）。整套只画了 1 次图（`--max-drawings` 合计 3）。

- [summary.md](summary.md)、[results.json](results.json)：运行 A，用现在的检查重新评分（`--replay`）。
- [summary-rerun.md](summary-rerun.md)、[results-rerun.json](results-rerun.json)：运行 B。

```bash
bun run build
bun evals/run.ts --only product --repeat 2 --max-drawings 0 --record <目录> --artifacts <本地目录>
bun evals/run.ts --only <原来的任务> --max-drawings 3 --record <目录> --artifacts <本地目录>
bun evals/run.ts --replay <本地目录> --record evals/baselines/2026-11-06-product
```

（四个进程并行跑，每个进程一组任务；每次运行的完整记录没有提交，`evals/recorded/` 里留了两次产品层的真实运行给单元测试重新评分。）

## 产品层任务（运行 A，每个两次）

| 任务 | 通过 | token（两次平均） | 用时 | 步数 | 说明 |
| --- | --- | --- | --- | --- | --- |
| shop-api-wire | 2/2 | 196k | 57s | 7, 7 | 一个批量就推出 Product 模型、列表和详情接口，就地绑定设计好的行（删掉第二个示例行、`set_repeat`、5 个 `bind_expression`、`set_region`），`fill_mocks`，再把设计稿里的两件商品固定成模拟记录。两次都想给模拟商品画图（`generate_image` 被拒） |
| create-form | 2/2 | 160k | 22s | 7, 7 | `POST /products` 带 minLength/maxLength/minimum，`make_form`，`then` 回列表 |
| detail-params | 2/2 | 193k | 30s | 7, 8 | 两次第一个批量都失败：`set_action` 带 `productId` 时详情页还没声明这个参数，整批 9–10 个操作撤回，下一步先 `set_screen_params` 再发 |
| login-guard | 2/2 | 154k | 23s | 6, 8 | 登录接口、Bearer、登录页表单、订单页要登录；模拟库上登录返回令牌 |
| import-openapi | 2/2 | 165k | 47s | 6, 7 | 导入 13 KB 的规范（11 个操作全部进来），两屏 `wire_screen`，截图检查两屏 |
| scenarios-states | 2/2 | 156k | 28s | 11, 4 | 三个场景一个批量；第一次用带场景的截图检查空状态时，图标画偏到圆的右下角（截图的问题，不是文档的），模型花了 6 步“修”它又改回来 |
| chat-realtime | 0/2 → 2/2 | 225k | 42s | 8, 9 | 消息走 `GET/POST /messages`，WebSocket 通道只有服务器推送（`send`），应用发消息用 POST，模拟脚本在 `createMessage` 之后回一条。原来的检查要求通道两个方向都有，判为失败；请求说的是“点发送时 post 一条消息”，这个设计是对的，检查改成只要求服务器推送（重新评分后通过） |
| ledger-app-zh | 2/2 | 338k | 73s | 11, 11 | 三屏、账单模型带中文 `title`、列表/详情/新建、表单、点一条带 id、模拟数据；第一次的大批量因为详情页参数没声明失败一次 |

合计 16/16（按原来的检查 14/16），平均 198k token、40 秒。

## 原来的二十个任务（运行 A，各一次）

19/20 通过，平均 110k token（上一次整套 [2026-11-06-main](../2026-11-06-main/summary.md) 是 19/20、100k）。失败的是 **contacts-data**：模型用了新学到的“点一行带参数打开详情”（`params: {name: "row.name"}`、详情页 `params.name`），但这是数据集合不是接口，详情应该读 `{{current.字段}}`（原型导出也只认这种）。非关键检查的失败（polish-spacing 的间距、cart-ko 和 travel-app-flow 的遮挡）和以前一样是随机的。token 多出的部分主要是 contacts-data（+91k）；其余十九个平均多约 6%，系统提示词多了 1.6 KB（每次请求约 400 token，都在缓存里）。

## 看到的问题和修改

| 问题 | 出现 | 修改 |
| --- | --- | --- |
| 打开详情的点击带了详情页没声明的参数，整批撤回 | detail-params ×2、ledger ×1 | `set_action`、`add_tree` 里的点击把参数声明到它打开的屏幕上（`withTapParams`）；`add_data_source` 把写成 `params.名字` 的参数也声明到屏幕上。先连列表还是先连详情都行 |
| 数据集合的详情用了屏幕参数 | contacts-data | 工具指南和 `set_action` 的说明写明：参数是给接口数据（`item.id`）的，数据集合的行在详情上读 `{{current.字段}}` |
| 给模拟数据画图 | shop-api-wire ×2 | 指南：模拟库自己给图片字段画占位图，不用画 |
| 带场景的截图把空状态的图标画偏 | scenarios-states ×1 | 无头截图画另一版文档时按实测尺寸排两遍版（`mcp/src/render.ts`）；`previewScreen` 不再自己排版和拿掉别的状态页，空列表的行和重复留在内容页上，交给画布排 |
| 表单成功后刷新另一屏的数据源（被拒） | ledger ×1 | `make_form` 的说明：保存后打开的列表会自己重新加载，`refresh` 只能指本屏的数据源 |
| 检查要求实时通道双向 | chat-realtime ×2 | 检查改为服务器推送即可（见上） |

## 运行 B：修改后重跑受影响的任务（各一次）

| 任务 | 通过 | token | 用时 | 步数 | 失败的调用 |
| --- | --- | --- | --- | --- | --- |
| contacts-data | FAIL → **PASS** | 143k → 108k | 32s → 21s | 8 → 7 | 0 → 0 |
| shop-api-wire | PASS → PASS | 196k → 183k | 57s → 40s | 7 → 7 | 2 → **0**（不再画图） |
| detail-params | PASS → PASS | 193k → **143k** | 30s → 25s | 7.5 → 6 | 1 → **0** |
| scenarios-states | PASS → PASS | 156k → **57k** | 28s → 10s | 7.5 → 3 | 0 → 0 |
| ledger-app-zh | PASS → PASS | 338k → 401k | 73s → 95s | 11 → 13 | 1 → 1 |

5/5 通过。ledger 这次没有参数的问题，但一个批量里两次写错了属性名（文字的 `words`），并且三屏各截了三轮图（8 张），所以更贵；一次运行的随机性，比较时应当多跑几次。

## 还剩下的

- **大应用贵**：ledger 一次 34–40 万 token、11–13 步。主要花在截图核对三屏（每轮三张）和最后的视觉微调；可以考虑带场景的截图一次给多屏，或让回合末尾的复查只看一张。
- **一个导出的错误**（不在这次的范围，已经提了任务）：接口没有任何参数和请求体时，Web 应用的数据 hook 调用 `api.op(undefined, { signal })`，而客户端这时的签名只有 `(init?)`，`apps/web` 类型检查报 TS2554（`lib/printBindings.ts`）。评测的理想做法用了分页的接口绕开它。
- **已修的导出错误**：区域的几个状态设计叠在一起，按实测尺寸时前面的设计在几何上“装着”后面的，导出的代码把空状态写成 `state === "loading" && state === "empty"`（永远不显示，TS2367）。`heldBy` 现在不把别的布局排着的部件算作被装着（`lib/tokens.ts`），评测的类型检查最先发现了它。
- 检查只看文档和预览的回答，不看画面好不好；产品层任务的截图没有交给视觉评分。
