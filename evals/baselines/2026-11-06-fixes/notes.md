# 2026-11-06 修复后：人工分析

和 [2026-11-06 基线](../2026-11-06/notes.md) 同一个模型（`gpt-6.1-sol`，推理强度 medium，视觉评分开），跑的是修完基线建议的七处之后的代码：原来的 16 个任务各一次，再加三个更难的新任务。结果见 [summary.md](summary.md)、[results.json](results.json)；每次运行的完整记录没有提交，其中 5 次（`vague-wipe-asks`、`travel-app-flow`、`long-feed`、`svg-tab-icon`、`checkout-strict`）的 `observed.json` 放进了 `evals/recorded/`，单元测试离线重新评分。

## 怎样得到的

```bash
bun run eval -- --record evals/baselines/2026-11-06-fixes --artifacts <本地目录> --max-drawings 3 --judge
bun run eval -- --replay <本地目录> --record evals/baselines/2026-11-06-fixes --title "After the fixes: gpt-6.1-sol, effort medium"
```

- 19 个智能体回合、1 次绘图（svg-tab-icon 用代码写 SVG），删除前先问按默认的 `--destructive decline`。另有一次跑了 3 个任务后中止的运行（发现速查表的开头还不够明确，改了一句再整套重跑），不计入结果。
- 跑完后修了两处评分（不是智能体的问题），再用 `--replay` 重新评分：
  - `svg`：智能体用 `generate_svg {icon, replace}` 把画好的图存成文档自己的图标 `svg:winding-route`，直接换掉标签栏里图标原子的名字（这是文档图标功能加进来后更好的做法，视觉评分 5），原来的检查只认新加的矢量组件。现在也认“新的文档图标由要求的容器里的组件显示”。原始结论：svg-tab-icon 不通过。
  - `has`、`posts`：长屏动态用一个数据集合加 `set_repeat` 画出 8 条动态（截图里确实是 8 条），原来只数文档里的组件，重复的行只算一次。现在重复容器的第一个子项按行数计。原始结论：long-feed 不通过（posts 1/8，头像 7/12）。

## 前后对比（同样的 16 个任务）

| | 基线 | 修复后 |
| --- | --- | --- |
| 通过 | 15/16 | **16/16** |
| 平均 token | 95k（83% 命中缓存） | **85k**（86%） |
| 平均用时 | 33 s | 31 s |
| 平均步数 | 6.8 | 6.0 |
| 工具调用 | 148 | **92** |
| `describe_part` | 41（占调用 28%） | **9（10%）** |
| 失败的 `apply_ops` 批量 | 5 | 4 |
| 失败的调用 | 9 | 4 |
| 估算费用 | $0.80 | $0.66 |
| 视觉评分 | 4.8 | 4.7（vague-wipe 什么都没改，没有图可评，不计） |

加上三个新任务，19 个任务全部通过，平均 91k token、36 秒，`describe_part` 11/120（9%），失败的批量 5 次，费用 $0.83。

| 任务 | 通过 | 得分 | token | 用时 | 步数 | describe_part | 失败批量 | 视觉评分 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| login-material | PASS → PASS | 1.00 → 1.00 | 76k → 56k | 19s → 18s | 6 → 5 | 3 → 0 | 0 → 0 | 5 → 5 |
| profile-ios-strict | PASS → PASS | 1.00 → 1.00 | 71k → 53k | 18s → 19s | 6 → 5 | 4 → 1 | 0 → 0 | 5 → 5 |
| list-to-cards | PASS → PASS | 1.00 → 1.00 | 192k → 79k | 81s → 54s | 11 → 6 | 4 → 1 | 0 → 0 | 5 → 5 |
| polish-spacing | PASS → PASS | 1.00 → 0.86 | 68k → 33k | 18s → 9s | 6 → 3 | 0 → 0 | 0 → 0 | 5 → 5 |
| contacts-data | PASS → PASS | 1.00 → 1.00 | 86k → 59k | 27s → 27s | 7 → 5 | 3 → 0 | 0 → 0 | 5 → 5 |
| dark-mode-switch | PASS → PASS | 1.00 → 1.00 | 92k → 92k | 19s → 20s | 8 → 7 | 0 → 0 | 1 → 1 | 4 → 4 |
| stepper-vars | PASS → PASS | 1.00 → 1.00 | 42k → 61k | 13s → 16s | 4 → 5 | 2 → 0 | 0 → 1 | 5 → 5 |
| prompt-box-component | PASS → PASS | 1.00 → 1.00 | 77k → 133k | 17s → 33s | 5 → 11 | 4 → 0 | 0 → 1 | 5 → 4 |
| product-instances | PASS → PASS | 1.00 → 1.00 | 88k → 98k | 24s → 24s | 10 → 9 | 0 → 0 | 0 → 0 | 4 → 5 |
| paper-style | PASS → PASS | 1.00 → 1.00 | 37k → 44k | 33s → 43s | 3 → 3 | 0 → 0 | 0 → 0 | 4 → 4 |
| svg-tab-icon | PASS → PASS | 1.00 → 1.00 | 31k → 37k | 19s → 27s | 3 → 3 | 0 → 0 | 0 → 0 | 5 → 5 |
| replicate-weather | PASS → PASS | 1.00 → 1.00 | 205k → 388k | 78s → 116s | 9 → 15 | 2 → 0 | 0 → 1 | 5 → 4 |
| game-hud | PASS → PASS | 1.00 → 1.00 | 70k → 86k | 23s → 42s | 6 → 7 | 6 → 4 | 0 → 0 | 5 → 5 |
| profile-ja | PASS → PASS | 1.00 → 1.00 | 65k → 46k | 20s → 19s | 5 → 4 | 4 → 0 | 1 → 0 | 5 → 5 |
| cart-ko | PASS → PASS | 1.00 → 0.90 | 122k → 89k | 40s → 29s | 9 → 7 | 4 → 3 | 2 → 0 | 5 → 5 |
| vague-wipe | **FAIL → PASS** | 0.60 → 1.00 | 200k → 10k | 77s → 5s | 10 → 1 | 5 → 0 | 1 → 0 | 5 → – |
| travel-app-flow（新） | PASS | 1.00 | 163k | 81s | 10 | 0 | 1 | 5 |
| checkout-strict（新） | PASS | 1.00 | 74k | 40s | 6 | 2 | 0 | 5 |
| long-feed（新） | PASS | 1.00 | 131k | 52s | 9 | 0 | 0 | 5 |

（`describe_part`、失败批量按每次运行的 `calls.json` 数，基线的数字来自基线的运行记录。）

## 七处修复在这次运行里的表现

1. **删除前先问**：vague-wipe（“都不好看，全删了重做”）第一步就问“全部删除重做，还是保留内容只重新设计？偏好什么风格？”，没有动画布，1 步、10k token。规则放到第一条并带例子就够了，这次没有走到暂停确认那一步；暂停本身（试跑算出会删什么、对话面板的“允许 / 不要”、拒绝后模型收到 `declined`）由 `lib/agent/guard.test.ts` 和 e2e 的“the agent asks before wiping”验证。
2. **常用组件速查**：`describe_part` 从 41 次（28%）降到 9 次（10%）；剩下的查的几乎都是速查表之外的组合件和 kit（`settings-group`、`cart-row`、`buy-bar`、`stat-bar`、`joystick`、`skill-button`、`map`）。速查表约 4.9 KB（1.2k token），系统提示词从约 9.3 KB 到约 14.8 KB，随系统提示词缓存；同样 16 个任务的平均 token 从 95k 降到 85k，命中缓存的比例从 83% 到 86%。
3. **便宜的参数错误**：基线里猜错的点击位置（应用栏 `actions.leading`，两次）和枚举报错的重复列表都没再出现。仍有 4 次失败的批量（见下），每次都一轮修好；报错一次列出全部失败的操作，后面因前面失败而找不到 id 的操作标了“可能只是跟着前面失败”。
4. **图片**：list-to-cards 不再用外链，四张卡片的图都是写进文档的 SVG data URL（经过 SVG 清理），截图没有再失败（基线两次 “[object Event]”）；用真实的无头渲染器验证过：外链图片画成灰块，结果里列出 `skipped`。
5. **读组件定义**：product-instances 没有再对定义里的部件 `describe_node` 报 not_found（基线第 3 步），`list_components` 直接给出覆盖键。
6. **风格的质感**：paper-style 的风格有 9 条规则，画出了纹理（横线）、描边和阴影（新加的非关键检查 `texture` 通过）；视觉评分的理由从基线的“更像普通浅色主题”变成“浅横线较好地呈现了暖色笔记本风格”，扣分点是编辑页的间距。
7. **栏落在边上**：没给位置的导航栏、FAB 落到边上（`lib/core/edges.test.ts`）。这次运行里 travel-app-flow、long-feed、cart-ko 的底部栏都在底边，`in-bounds`、`bars-pinned` 通过，没有再出现基线 vague-wipe 那样“看截图后把导航栏挪到底部”的一步。

## 还剩下的问题

- **数值和行数的范围**（3 次失败批量）：`text.width` 写 24（下限 40）两次（stepper-vars、replicate-weather），只有两个标签的导航栏（`items` 至少 3 行，travel-app-flow）。速查表只列了属性名，没列数值下限和列表的行数范围；下一步把 `width ≥40`、`items 3–5 行` 这类写进速查表。
- **`split_into_atoms` 漏了 `id`**（dark-mode-switch，基线里也是同一个错误）。
- **改组件定义里的部件**（prompt-box-component）：`make_component` 后对已经进了定义的部件 `set_props`，报 not_found，只能拆开重做，步数从 5 到 11。工具里还没有改定义的操作（另一个代理在加组件的操作，可以在那之后补上）。
- **随机性**：replicate-weather 多对照了两轮（15 步、388k token），polish-spacing 这次只做了一轮就结束，节间距 44/40 超出 `even-spacing` 的容差（非关键检查）；cart-ko 有一对容器被判重叠（截图上看不出，非关键检查）。每个任务只跑了一次，比较改动时仍应 `--repeat 3`。
- **区分度**：19/19 通过，新加的三个任务也都过了。下一步可以加：带照片的复刻（要用到 `generate_image`）、给已有组件统一加一个部件（等有了改定义的操作）、严格风格下的长表单校验与报错状态。
