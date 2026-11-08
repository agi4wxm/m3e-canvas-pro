# AI 评测

用数字而不是印象判断提示词、工具和智能体的改动：同一组任务，同样的起始文档，每次跑完给出每项检查的通过与否、任务得分、token、用时和费用估算，可以和上一次的基线逐项对比。

评测跑的就是应用内的智能体：`lib/agent` 的 `runTurn`，同样的系统提示词、工具集、循环、截图自查和“一个回合一步撤销”。区别只在没有编辑器：文档放在 `DocStore` 里，组件尺寸先用各自的估计（`guessMeasurer`），截图用 MCP 文件模式的无头 Chromium（`/render` 页面，`mcp/src/render.ts`），画出来后按实测尺寸重新排版，和编辑器量完尺寸后重排一样。

| 文件 | 作用 |
| --- | --- |
| `run.ts` | 命令行：`bun run eval` |
| `harness.ts` | 跑一个任务：起始文档、无头截图、计量和预算、跑完后截图、对照参考图、撤销检查 |
| `tasks.ts`、`fixtures.ts` | 任务和它们的起始文档；产品层的八个任务在 `productTasks.ts`，边界的三个负例和支付流程在 `boundaryTasks.ts`，起始文档在 `fixtures.ts` 末尾，导入任务用的规范文件在 `fixtures/shop-backend.openapi.yaml` |
| `graders.ts`、`productGraders.ts`、`boundaryTasks.ts` | 确定性的检查和打分；产品层的检查（契约、绑定、状态、模拟库、预览、导出）；边界任务的检查（结果是不是在屏幕上自己定的，支付是不是按订单状态显示） |
| `product.ts` | 文档有接口时，回合结束后算一次：每个绑定了数据的屏幕在每个场景下的预览、用模拟库试登录、导出完整产品并类型检查生成的代码 |
| `judge.ts` | 可选的视觉评分 |
| `record.ts`、`replay.ts`、`keep-recorded.ts` | 写下和读回一次运行、重新评分、挑几次运行给单元测试 |
| `report.ts` | `summary.md`、`results.json` 和费用估算 |
| `refs/`、`make-refs.ts` | 复刻任务用的参考图（自己画的 HTML 渲染成 PNG） |
| `recorded/` | 单元测试重新评分的几次真实运行 |
| `baselines/` | 基线和人工分析 |

## 运行

先准备：

```bash
bun install
bun run build                    # 截图要用编辑器的构建（dist/）
npm i -g playwright && npx playwright install chromium   # 已装就不用
```

密钥从环境变量读：OpenAI 用 `OPENAI_API_KEY`（Claude、Gemini、DeepSeek 分别是 `ANTHROPIC_API_KEY`、`GEMINI_API_KEY`、`DEEPSEEK_API_KEY`）。没有设置时，OpenAI 的请求带一个占位符，由出口代理换成真正的密钥。密钥不会打印，也不会写进记录。Bun 的 fetch 自己走 `HTTPS_PROXY`；用 Node 跑时换成 MCP 服务器用的代理 fetch。

```bash
bun run eval                                         # 全部任务各跑一次：gpt-6.1-sol，推理强度 medium
bun run eval -- --only login-material,data           # 按任务 id 或能力挑选
bun run eval -- --repeat 3 --record out/run1         # 每个任务跑三次，全部记录下来
bun run eval -- --replay out/run1                    # 不调用模型，按现在的检查重新评分
bun run eval -- --replay out/run1 --judge            # 再让视觉模型看截图打分
bun run eval -- --list                               # 列出任务
bun run eval:refs                                    # 重画 refs/ 里的参考图
```

| 参数 | 说明 |
| --- | --- |
| `--only <ids或能力>` | 逗号分隔的任务 id 或能力：new-screen、edit、data、variables、components、styles、svg、replicate、game、multilingual、ambiguous、flow、long-screen、product、boundary |
| `--repeat <n>` | 每个任务跑 n 次（模型不确定，看通过率要多跑几次） |
| `--provider`、`--model`、`--effort`、`--image-model` | 服务商（默认 openai）、文本模型（默认 `gpt-6.1-sol`）、推理强度（low/medium/high，默认 medium）、图片模型 |
| `--budget-tokens <n>` | 给每个任务的 token 预算再加一个上限 |
| `--max-drawings <n>` | 整套评测最多画几次（图片、SVG）；超出时工具按“本回合不能再画”拒绝，和应用里用完额度一样 |
| `--destructive <allow\|decline>` | 智能体要删掉作者大量内容（清空、删屏幕、删很多组件），或拿走名字看不出的东西（数据行、字段、变量模式、组件属性，替换作者的自定义风格或文档图标）而请求没有明确要删时，编辑器会问作者“允许 / 不要”；评测里按这个回答，默认 `decline`（想先被问的作者） |
| `--record <目录>` | 每次运行写一个文件夹，再写 `summary.md` 和 `results.json` |
| `--artifacts <目录>` | 每次运行的文件夹（截图、对话）放到这里，`--record` 里只留汇总：截图大，不要进 git |
| `--replay <目录>` | 重新评分记录下来的运行，不调用智能体 |
| `--judge`、`--judge-model` | 视觉评分（默认关）：模型看改过的屏幕（和参考图）给 1–5 分和理由，只作参考，不影响通过与否 |
| `--price <输入,缓存,输出>` | 费用估算用的单价，美元每百万 token |
| `--title <文字>` | `summary.md` 的标题 |
| `--no-shots` | 不开 Chromium：智能体不能截图，跑完也不画 |

## 一次运行留下什么

`--record`（或 `--artifacts`）下每次运行一个文件夹：

| 文件 | 内容 |
| --- | --- |
| `observed.json` | 评分要读的一切：起始和最终文档、实测尺寸、工具调用、怎样结束、用量、撤销检查、和参考图的相似度。回放只读它 |
| `result.json` | 每项检查的结论、得分、是否通过、视觉评分、用量和费用 |
| `calls.json` | 工具调用：参数、成功与否、错误、用时 |
| `transcript.json` | 整段对话（图片换成文件名，加密的推理去掉） |
| `start.json`、`final.json` | 起始和最终文档，项目文件格式，可以直接在编辑器里打开看 |
| `before-*.png`、`after-*.png` | 改之前和之后的屏幕 |
| `tool-*.png`、`review-*.png` | 智能体自己截的图、回合结束前给它看的图 |

## 读报告

`summary.md` 先给总数：通过率、平均分、平均 token（和输入里命中缓存的比例）、平均用时、画了几次、估算费用；然后每次运行一行，最后列出每项检查的结论和理由。

- **通过**：所有关键检查（报告里加粗的）都通过，并且加权得分不低于 0.75。
- **得分**：通过的检查的权重之和除以总权重（大多数检查权重 1，和参考图的相似度权重 2）。
- **token**：所有模型调用之和，包括工具自己发起的（`generate_style`、用代码写 SVG）；括号里是命中缓存的输入。
- **费用**：按 `report.ts` 里假定的单价估算，不是报价；用 `--price` 换成自己的单价。每次绘图另按固定价计。
- **视觉评分**：只是一个模型的看法，适合发现检查覆盖不到的问题（难看、不像），不要用它代替检查。

每项检查的结论都带理由（找到了什么、差在哪里），先看失败的关键检查，再去 `calls.json`、`transcript.json` 和截图里找原因。

## 检查

都在 `graders.ts`，只读文档和记录，结果是确定的；几何检查按实测尺寸排版后的文档（`laidOut` + `nodeTree`）来算。

| 检查 | 看什么 |
| --- | --- |
| `finished` | 回合自己正常结束；改文档的调用失败后，后来都有同一个工具、或含有同一个操作的批量调用成功补上（只读调用失败后放弃不算；绘图次数用完被拒、作者拒绝的删除也不算） |
| `undo` | 一次撤销回到起始文档，重做回到结果 |
| `budget` | 步数、token、用时都在任务的预算内 |
| `screen-added`、`has`、`shows` | 加了屏幕；屏幕上有某类组件（组件或组合件的 slug、kit；重复容器里的按行数算）；屏幕上显示了这些字 |
| `language` | 这次新写的字（加的或改的组件，新屏幕的名字）是画布的语言：中文要有汉字、日文要有假名、韩文要有谚文，英文不含中日韩文字；没有字母、地址、`{{字段}}`、三个字母以内的拉丁词不算 |
| `no-overlap`、`in-bounds` | 同一个父级下的组件互不遮挡（FAB、弹层、背景、脱离布局的除外）；没有组件超出屏幕，新加的没有落在屏幕外 |
| `auto-layout` | 改过的屏幕至少有一个排着两个以上子项的自动布局容器，最外层零散的原子不超过两个 |
| `style-rules` | 严格遵守风格的文档仍然严格、风格没换，每个组件都符合规则（`conformItem` 不需要去掉任何东西） |
| `keeps-work` | 没有删掉作者的屏幕和组件（可以排除要改的屏幕） |
| `even-spacing` | 一屏的行间距差不多、左边缘对齐的种类不超过三种 |
| `dark-var`、`dark-control`、`counter` | 有 `drives: "dark"` 的布尔变量并有开关绑定或点击切换它；数字变量被显示，加和减的点击都接上了 |
| `collection`、`repeat`、`tap-detail` | 新数据集合的行数；有容器重复它；重复的行点一下跳到另一个屏幕，那里显示点中的这一行：用 `{{current.字段}}`，或者点击时把行的 `{{字段}}` 写进变量、详情页绑定这些变量 |
| `component`、`instances` | 新的可复用组件主要由原子和自动布局拼成并含有要求的部件；屏幕上有足够的实例，覆盖里有要求的字 |
| `custom-style` | 文档穿着一个新的或改过的自定义风格，风格检查器（`lib/styles/access.ts`）认为各状态下的文字都看得清（只检查风格的颜色数据，不等于符合 WCAG；控件标记的问题只记在详情里）；要求暖色时表面色偏暖 |
| `svg` | 新加的矢量组件有 SVG 代码，能通过 `sanitizeSvg`，放在要求的容器里；或者画好的图存成文档自己的图标（`svg:<编号>`），由要求的容器里的组件显示 |
| `likeness` | 改过的屏幕和参考图的相似度（和 `compare_to_reference` 同一个算法）不低于阈值 |
| `corners` | 屏幕四个角各有要求的东西（游戏 HUD） |
| `asks` | 回答里有问题（含糊或有破坏性的请求） |
| `nav-flow` | 几个屏幕接成一个应用：有标签栏的屏幕互相切换，点一项打开没有标签栏的详情页，详情页能返回 |
| `scrolls`、`posts`、`bars-pinned` | 屏幕比设备长、内容排到设备高度以下；某个词出现在足够多的组件上（比如每条动态的 Like）；顶栏在最上、标签栏在设备或长屏的底边 |
| `pay-pinned` | 某类组件（支付按钮）在屏幕底部 |
| `texture` | 穿着的自定义风格用规则画出材质：纹理（重复或径向渐变）、描边、阴影里至少两种 |

### 产品层的检查

`productGraders.ts`。屏幕可以按 id、按名字的正则或 `/./`（任何一个屏幕）来指。

| 检查 | 看什么 |
| --- | --- |
| `api-valid` | 有接口，`apiProblems` 没有错误级的问题 |
| `*-endpoint`、`model` | 有这样的接口（方法、路径、是不是列表、有没有请求体、是否分页、是否公开）；有含这些字段的模型 |
| `list-bound` | 屏幕有列表接口的数据源，有容器按 `data.<名字>.items` 重复，重复的行里有绑定 `item.` 的部件 |
| `detail-bound` | 屏幕有取一条的数据源，并显示它的这些字段 |
| `bindings-resolve` | 绑定了数据的屏幕上每个表达式（属性、重复、条件、数据源参数）都能解析、读的东西都在，区域的数据源存在 |
| `states` | 屏幕上的每个区域都有加载中、空、出错、无权限四个设计 |
| `form` | 有某个接口请求体的表单，这些字段都有输入框绑定，并有提交 |
| `tap-params` | 列表行的点击打开详情页并带上 `item.` 的参数，详情页的数据源读这个参数 |
| `auth-login`、`auth-required` | 登录页、要登录的屏幕 |
| `sends` | 点击发送到某个接口：调用效果，或这个接口的表单的提交 |
| `mocks`、`scenario-*` | 模拟库设置过（场景数）；有这样的场景（空、5XX、慢），并且预览里在这个场景下区域显示相应的状态 |
| `realtime` | 有服务器推送消息的实时通道（应用发消息可以走 WebSocket，也可以走 POST）和它的模拟脚本 |
| `preview` | 预览（正常回答）里屏幕的数据源都加载成功、列表至少有几条、区域显示内容 |
| `sign-in` | 登录接口在模拟库上回答 2XX 并带令牌 |
| `export` | 完整产品能导出，`packages/api` 和 `apps/web` 生成的代码类型检查没有错误 |

预览、试登录和导出不是在检查里做的：它们要异步运行模拟库、调用编译器，所以 `harness.ts` 在回合结束后用 `product.ts` 算一次，存进 `observed.json` 的 `preview` 和 `product`，检查只读它们，回放照样能评分。预览用的是 `lib/bindings/headless.ts` 的 `previewScreen`（和编辑器预览、智能体带场景的截图同一套），固定时刻，所以同一份文档结果相同。导出写到临时文件夹（之后删掉），`packages/api` 按它自己的 tsconfig 检查，`apps/web` 按一份把依赖指向本仓库 `node_modules` 的 tsconfig 检查（只在开发时用的 msw 部分和 Vite 的环境类型换成占位声明），用本仓库的 `tsc`，一次约一秒；真正的安装、构建和契约测试是 `bun run check:product`。`--no-shots` 不影响它们；`RunOptions.product: false` 不导出。

`evals/product.test.ts` 把每个产品任务用操作“做一遍好的”（只用工具背后的操作，所以也证明工具做得到），检查全部通过；起始文档的关键检查都不通过。

### 边界的负例

`boundaryTasks.ts`，对照[边界与契约](../docs/边界与契约.md)：作者用平常的话要一个本该由后端决定的结果，智能体要做出“意图 → 等回答 → 按回答显示”，而不是在屏幕上自己定结果。三个任务都是中文，起始文档带着契约。

| 任务 | 作者说 | 检查 |
| --- | --- | --- |
| `pay-straight-success` | “立即支付点了直接跳到支付成功页就行” | **`no-straight-success`**：结算页上没有一个点击在回答之前就去支付成功页（只能在调用或表单的 `then` 里去）；**`asks-api`**：点击调用 `createOrder`；`failure-designed`：调用有 `catch`；`result-from-order`：有屏幕按 `getOrder` 读订单状态，或者把回答里的状态存进变量给屏幕显示 |
| `draw-random-result` | “加一个转盘，点一下随机抽一个奖品” | **`asks-api`**：点击调用 `drawPrize`；**`no-local-result`**：抽奖组件的演示都被接管（`result` 绑定或点击调用接口），没有写死的结果，回答之前没有把奖品写进放结果的变量（绑定到 `result` 的、或回答写入的变量；“抽奖中”这类界面自己的状态可以先变）；`result-shown`：显示的是回答里的奖品；`failure-designed` |
| `claim-after-failure` | “领取按钮调用领取接口，领完了显示已领取” | **`asks-api`**：领取调用 `claimCoupon`；**`claimed-only-on-success`**：回答之前、以及失败的 `catch` 里，都不把它标成已领取（优惠券 `claimed` 绑定的变量、回答里设为真的变量、优惠券的 `claimed` 属性、回答才显示的部件）；“领取中”这类界面自己的状态可以先变，`optimistic` 由契约回滚，也可以；`claimed-shown`：优惠券的 `claimed` 绑定了，或者由领取的回答设置；`failure-designed` |

“停止时用户插入编辑”（AI 改 A → 作者改 B → AI 改 C → 停止）是回合生命周期的行为，不靠模型，由 `lib/agent/stop.test.ts` 在 `bun run test` 里确定地检查：B 保留，A 和 C 按停止的契约收回。`evals/boundary.test.ts` 用操作把每个负例“做一遍好的”和“照作者说的走捷径”，前者全部通过，后者和起始文档的关键检查不通过。

### 支付流程

`payment-flow` 也在 `boundaryTasks.ts`，对照[平台能力](../docs/平台能力.md)的“支付：以订单状态为准”：起始文档 `wxpay-zh` 是咖啡小铺的结算页（一个 `brand-button`，服务方微信、用途支付）、空的支付结果页和订单契约（`createOrder` 返回订单和签好的支付参数，`getOrder` 读订单状态，状态由后端按支付平台的回调设置）。作者只说“把结算页的「微信支付」按钮接上微信支付，付完在支付结果页显示这笔订单的结果”，没有说怎么做：三步走、按订单状态显示、取消和失败的设计都要智能体从工具指南里知道。

| 检查 | 看什么 |
| --- | --- |
| **`asks-api`** | 结算页的点击调用 `createOrder` |
| **`invokes-payment`** | `createOrder` 的 `then` 调用平台能力 `payment.pay`，`orderId` 读回答（`response.…`） |
| **`result-after-payment`** | 读订单的结果页只在 `payment.pay` 的 `then` 里打开，并带上数据源要的订单号；点击时、订单刚创建时就去结果页都不行 |
| **`payment-caught`** | `payment.pay` 有 `catch`，并且做了点什么（取消、失败的设计） |
| **`status-from-order`** | 有屏幕按打开时的参数（`params.…`）加载 `getOrder`，并读订单的 `status`（条件、绑定或文字里） |
| `order-states` | 结果页分别设计了已支付和失败或处理中 |
| `failure-kinds` | `catch` 读 `error.type`，把取消和失败分开 |
| `failure-designed` | `createOrder` 失败也有设计 |

`evals/boundary.test.ts` 用操作做一遍好的（全部通过），以及几种走捷径的：订单一创建就去结果页、不调用 `payment.pay`、`payment.pay` 没有 `catch`、结果页不看订单状态一律写“支付成功”，各自的关键检查不通过，起始文档也不通过。

## 加一个任务

1. 起始文档：在 `fixtures.ts` 的 `FIXTURES` 里用操作搭一个（推荐：确定、可读、跟着代码一起变），或者把编辑器“保存到文件”得到的项目文件放进 `evals/fixtures/`，用文件名引用。
2. 在 `tasks.ts` 的 `TASKS` 里加一项：`id`、`ability`、`title`、画布语言 `lang`、像真人那样写的 `request`、`fixture`，需要时加 `select`（选中的组件）、`selectScreen`、`reference`（`refs/` 里的图）；`budget` 用 `SMALL`、`MEDIUM`、`LARGE` 或自己写（`drawings` 是这个任务最多画几次）。
3. `checks`：一般先放 `basics()`（正常结束、一步撤销、预算），再加这个任务要看的检查；会改屏幕的加 `tidy()`；不该动别处的加 `keepsWork()`。检查不够用时，在 `graders.ts` 里加一个工厂函数，或者在任务里用 `custom(id, 说明, (g) => ({ pass, detail }))`。
4. 参考图：在 `refs/` 里写一个 HTML（自己画的、不用别人的截图），`bun run eval:refs` 生成 PNG。
5. 先 `bun run eval -- --only <id> --record <目录>` 跑一次，看 `summary.md` 和截图，确认检查判得对。

## 回放和单元测试

`--replay` 只读 `observed.json`，用现在的检查重新评分，所以改了检查以后，可以拿以前的记录看结论怎么变，不用再花 token。`evals/evals.test.ts` 在 `bun run test` 里跑，不联网：用操作搭出的文档测每类检查的通过和失败、用脚本模型（`lib/llm/testkit.ts` 的 `scriptedAdapter`）把一个任务从头跑一遍、检查 token 预算会让智能体停下，并把 `recorded/` 里提交的几次真实运行（`observed.json.gz`）重新评分，结论要和 `recorded/expected.json` 一致。改了检查导致结论变化时，确认变化是对的，再用 `bun evals/keep-recorded.ts --update` 重写 `expected.json`；要加一次运行，用 `bun evals/keep-recorded.ts <记录目录> <运行名>…`（只保留压缩后的 `observed.json`）。

## 和应用里的差别

- 截图不是编辑器的 `useScreenshots`，而是 MCP 文件模式的 `/render` 页面，同一套 `renderExport` 画法；长屏不截断，也不转 JPEG。
- 开始前把每个屏幕画一遍量出尺寸，再按实测尺寸排版（编辑器量完也会重排）；回合中智能体截图时同样更新尺寸。
- 绘图次数：提示词和每回合的额度和应用一样，但评测按任务的 `budget.drawings` 和 `--max-drawings` 限制真正发出的绘图请求，超出时工具返回“本回合不能再画”。
- 预算用完时不中止请求，而是不再发下一次模型调用，已经做的保留并照常评分；只有远远超时（预算加两分钟）才中止，这时和应用里按停止一样，整个回合被收回。

## 基线

`baselines/<日期>/` 是某一天用默认模型跑整套的结果（只提交 `summary.md`、`results.json` 和人工分析 `notes.md`，截图留在本地）。改提示词或工具后跑一遍，和最新的基线比较通过率、关键检查和 token。

- [2026-11-06](baselines/2026-11-06/notes.md)：16 个任务通过 15 个，失败的是“全删了重做”没有先问；那里也列了智能体常犯的错误和建议的改法。
- [2026-11-06-fixes](baselines/2026-11-06-fixes/notes.md)：修完那七处之后，同样 16 个任务全部通过，平均 token 95k → 85k，`describe_part` 占调用 28% → 10%；另加三个更难的任务（多屏应用、严格风格的结账表单、长屏动态）也都通过，那里列了还剩下的问题。
- [2026-11-06-residuals](baselines/2026-11-06-residuals/notes.md)：修完遗留问题（改组件定义的 `edit_component`、速查表的数值范围和行数、单个部件的参数别名、删除前先问扩大到改写数据和替换风格图标）后，只重跑受影响的四个任务各一次：4/4 通过，失败的调用 2 → 0，平均 token 81k → 76k；prompt-box-component 从 11 步降到 5 步。
- [2026-11-06-product](baselines/2026-11-06-product/notes.md)：产品层的八个任务（推出接口并绑定、建表单、详情带参数、登录守卫、导入 OpenAPI、场景和状态、实时聊天、中文的三屏小应用）各两次，原来的二十个任务各一次：产品层 16/16（按当时的检查 14/16，实时通道的检查过严，已改），原来的 19/20；修了看到的问题（点击带的参数自动声明到目标屏幕、数据集合的详情读 `{{current}}`、不给模拟数据画图、带场景截图的排版）后重跑受影响的五个任务 5/5，detail-params 193k → 143k，scenarios-states 156k → 57k。
- [2026-11-08-batch1](baselines/2026-11-08-batch1/summary.md)：第一批整改合并后整套 28 个任务各一次，28/28。
- [2026-11-08-stage1](baselines/2026-11-08-stage1/summary.md)：阶段 1 定规矩后，边界的三个负例各两次，6/6。第一次运行暴露了两件事：检查把“抽奖中”“领取中”这类界面自己的等待状态也算成假结果、没认数据源加载的写法（已改检查，记录按 `--replay` 重新评分）；模型两次把“仅当回答说已支付才跳成功页”写成调用 `then` 里的 `when`，而没有宿主读它（现在严格操作拒绝 `then`/`catch` 上的条件并说明怎么做）。[2026-11-08-stage1-suite](baselines/2026-11-08-stage1-suite/summary.md) 是同一版本原有 28 个任务各一次：27/28，平均 token 113k → 130k（工具指南多了边界一节）；没过的 shop-api-wire 是一次模拟文件调用失败后没补上，单独再跑两次都通过；ledger-app-zh 第一次截图时无头浏览器崩溃（同时在跑完整产品检查），单独重跑。
- [2026-11-08-batch2](baselines/2026-11-08-batch2/summary.md)：第二批整改合并后整套 31 个任务各一次（含三项边界负例），31/31。
- [2026-11-08-stage3](baselines/2026-11-08-stage3/summary.md)（最新）：阶段 3 能力契约后，边界的四个任务（三个负例和新的支付流程 `payment-flow`）各两次，8/8，支付流程两次都是 `createOrder` → `payment.pay` → 按订单状态显示的结果页，`catch` 读 `error.type`。写这项任务时的试跑暴露了一处工具问题：嵌在调用回答里的 `payment.pay` 的 `then` / `catch` 只写了 `effects` 就被拒绝，现在和顶层的点击一样当作 `to: "none"`。这里的记录之前还有一次同样 8/8 的运行，八次里有三次先把调用的 `body` 写成对象（`"{productId: 'latte', quantity: 2}"`，表达式没有对象字面量）再改用 `args`，现在拒绝时直接说明改用 `args`，重跑后这类失败没有再出现。
