# AI 评测

用数字而不是印象判断提示词、工具和智能体的改动：同一组任务，同样的起始文档，每次跑完给出每项检查的通过与否、任务得分、token、用时和费用估算，可以和上一次的基线逐项对比。

评测跑的就是应用内的智能体：`lib/agent` 的 `runTurn`，同样的系统提示词、工具集、循环、截图自查和“一个回合一步撤销”。区别只在没有编辑器：文档放在 `DocStore` 里，组件尺寸先用各自的估计（`guessMeasurer`），截图用 MCP 文件模式的无头 Chromium（`/render` 页面，`mcp/src/render.ts`），画出来后按实测尺寸重新排版，和编辑器量完尺寸后重排一样。

| 文件 | 作用 |
| --- | --- |
| `run.ts` | 命令行：`bun run eval` |
| `harness.ts` | 跑一个任务：起始文档、无头截图、计量和预算、跑完后截图、对照参考图、撤销检查 |
| `tasks.ts`、`fixtures.ts` | 任务和它们的起始文档 |
| `graders.ts` | 确定性的检查和打分 |
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
| `--only <ids或能力>` | 逗号分隔的任务 id 或能力：new-screen、edit、data、variables、components、styles、svg、replicate、game、multilingual、ambiguous |
| `--repeat <n>` | 每个任务跑 n 次（模型不确定，看通过率要多跑几次） |
| `--provider`、`--model`、`--effort`、`--image-model` | 服务商（默认 openai）、文本模型（默认 `gpt-6.1-sol`）、推理强度（low/medium/high，默认 medium）、图片模型 |
| `--budget-tokens <n>` | 给每个任务的 token 预算再加一个上限 |
| `--max-drawings <n>` | 整套评测最多画几次（图片、SVG）；超出时工具按“本回合不能再画”拒绝，和应用里用完额度一样 |
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
| `finished` | 回合自己正常结束；改文档的调用失败后，后来都有同一个工具、或含有同一个操作的批量调用成功补上（只读调用失败后放弃不算；绘图次数用完被拒也不算） |
| `undo` | 一次撤销回到起始文档，重做回到结果 |
| `budget` | 步数、token、用时都在任务的预算内 |
| `screen-added`、`has`、`shows` | 加了屏幕；屏幕上有某类组件（组件或组合件的 slug、kit）；屏幕上显示了这些字 |
| `language` | 这次新写的字（加的或改的组件，新屏幕的名字）是画布的语言：中文要有汉字、日文要有假名、韩文要有谚文，英文不含中日韩文字；没有字母、地址、`{{字段}}`、三个字母以内的拉丁词不算 |
| `no-overlap`、`in-bounds` | 同一个父级下的组件互不遮挡（FAB、弹层、背景、脱离布局的除外）；没有组件超出屏幕，新加的没有落在屏幕外 |
| `auto-layout` | 改过的屏幕至少有一个排着两个以上子项的自动布局容器，最外层零散的原子不超过两个 |
| `style-rules` | 严格遵守风格的文档仍然严格、风格没换，每个组件都符合规则（`conformItem` 不需要去掉任何东西） |
| `keeps-work` | 没有删掉作者的屏幕和组件（可以排除要改的屏幕） |
| `even-spacing` | 一屏的行间距差不多、左边缘对齐的种类不超过三种 |
| `dark-var`、`dark-control`、`counter` | 有 `drives: "dark"` 的布尔变量并有开关绑定或点击切换它；数字变量被显示，加和减的点击都接上了 |
| `collection`、`repeat`、`tap-detail` | 新数据集合的行数；有容器重复它；重复的行点一下跳到另一个屏幕，那里显示点中的这一行：用 `{{current.字段}}`，或者点击时把行的 `{{字段}}` 写进变量、详情页绑定这些变量 |
| `component`、`instances` | 新的可复用组件主要由原子和自动布局拼成并含有要求的部件；屏幕上有足够的实例，覆盖里有要求的字 |
| `custom-style` | 文档穿着一个新的或改过的自定义风格，没有对比度问题；要求暖色时表面色偏暖 |
| `svg` | 新加的矢量组件有 SVG 代码，能通过 `sanitizeSvg`，放在要求的容器里 |
| `likeness` | 改过的屏幕和参考图的相似度（和 `compare_to_reference` 同一个算法）不低于阈值 |
| `corners` | 屏幕四个角各有要求的东西（游戏 HUD） |
| `asks` | 回答里有问题（含糊或有破坏性的请求） |

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

`baselines/<日期>/` 是某一天用默认模型跑整套的结果（只提交 `summary.md`、`results.json` 和人工分析 `notes.md`，截图留在本地）。改提示词或工具后跑一遍，和最新的基线比较通过率、关键检查和 token。最新的是 [2026-11-06](baselines/2026-11-06/notes.md)：16 个任务通过 15 个，失败的是“全删了重做”没有先问；那里也列了智能体常犯的错误和建议的改法。
