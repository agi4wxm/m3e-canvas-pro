# 第五批基线

全量 32 项：`summary.md` 里 27 项一次跑完全部通过；其余 5 项（ledger-app-zh 与四个边界任务）在那次运行中因 OpenAI 密钥失效（401 token_invalidated）没有调用模型，换上新密钥后在同一提交（456032c）上补跑，见 `rerun/`，5/5 通过。合计 32/32。
