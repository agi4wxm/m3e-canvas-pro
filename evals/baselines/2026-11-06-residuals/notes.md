# 2026-11-06 遗留问题修复后：受影响的四个任务

和 [2026-11-06 修复后](../2026-11-06-fixes/notes.md) 同一个模型（`gpt-6.1-sol`，推理强度 medium，视觉评分开），只重跑这次改动影响到的四个任务，各一次：`prompt-box-component`（改组件定义里的部件）、`dark-mode-switch`（`split_into_atoms` 漏了 `id`）、`cart-ko`（速查表的数值范围和行数）、`vague-wipe`（删除前先问扩大到改写数据、替换风格和图标）。结果见 [summary.md](summary.md)、[results.json](results.json)。

```bash
bun run build
bun run eval -- --only prompt-box-component,cart-ko,dark-mode-switch,vague-wipe --repeat 1 --max-drawings 0 --judge \
  --record evals/baselines/2026-11-06-residuals --artifacts <本地目录> --title "Residuals: gpt-6.1-sol, effort medium"
```

4 个智能体回合，没有绘图（`--max-drawings 0`），每次运行的完整记录没有提交。

## 前后对比

| 任务 | 通过 | 得分 | token | 用时 | 步数 | describe_part | 失败的调用 | 视觉评分 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dark-mode-switch | PASS → PASS | 1.00 → 1.00 | 92k → 87k | 20s → 17s | 7 → 6 | 0 → 0 | 1 → **0** | 4 → 4 |
| prompt-box-component | PASS → PASS | 1.00 → 1.00 | 133k → **68k** | 33s → 18s | 11 → **5** | 0 → 0 | 1 → **0** | 4 → 4 |
| cart-ko | PASS → PASS | 0.90 → **1.00** | 89k → 137k | 29s → 52s | 7 → 11 | 3 → 1 | 0 → 0 | 5 → 5 |
| vague-wipe | PASS → PASS | 1.00 → 1.00 | 10k → 11k | 5s → 3s | 1 → 1 | 0 → 0 | 0 → 0 | – → – |
| 合计 / 平均 | 4/4 → 4/4 | 0.98 → 1.00 | 81k → 76k | 22s → 23s | 6.5 → 5.75 | 3 → 1 | 2 → **0** | 4.3 → 4.3 |

估算费用 $0.12 → $0.11（四个任务合计）。

## 看到了什么

- **dark-mode-switch**：上次第 2 步的批量 `split_into_atoms {ids: ["f11"]}` 因为没有 `id` 整批失败；这次模型直接写了 `{id: "f11"}`（操作的参数说明现在写明是“要拆的那一个组合件的 id”），一次成功。即使再写成 `ids`，现在也按 `id` 读（`lib/tools/errors.test.ts` 用上次那一批原样验证）。
- **prompt-box-component**：上次在 `make_component` 之后对定义里的部件 `set_props`，报 not_found，只能拆开重做（11 步、133k）。这次模型先把位置调好再 `make_component`，没有走到改定义那一步，5 步、68k。这一步现在有 `edit_component`，对定义里的部件调用 `set_props` 的报错会直接说该怎样用它（`lib/tools/components.test.ts`）；这次运行没有用到，所以它在真实模型下的效果还没有被这次评测覆盖。
- **cart-ko**：没有失败的批量，`describe_part` 从 3 次降到 1 次（只查了速查表之外的组合件）；上次的非关键检查 `no-overlap` 这次通过，得分 0.90 → 1.00。代价是多看了两轮截图（11 步、137k、52 秒），是模型自查的随机性，不是这次改动引起的失败。
- **vague-wipe**：第一步就问“全部删除重做，还是保留内容只重新设计”，没有动画布，和上次一样。

## 还剩下的

- 每个任务只跑了一次，cart-ko 的步数、prompt-box-component 是否用到 `edit_component` 都有随机性；比较改动时仍应 `--repeat 3`。
- 下一步可以加一个必须改组件定义的任务（例如“给已有的商品卡片组件加一个收藏按钮”），专门覆盖 `edit_component`。
