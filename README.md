# M3E Canvas Pro

在浏览器里用现成组件拖拽拼出可交互的 UI 原型。基于 [m3e-canvas](https://github.com/lnkiai/m3e-canvas) 和 [shadcn M3E](https://github.com/Crysta1221/shadcn-m3e)，把各分支和组件库的组件全部按同一种方式重新实现。这是一个重构后的独立项目，只打开自己保存的文件，不兼容其他分支的文件格式。

## 启动

需要 [Node](https://nodejs.org/) 22 以上和 [bun](https://bun.sh/) 1.4。

```bash
bun install
```

```bash
bun run dev
```

然后打开 http://localhost:3000。

| 命令 | 作用 |
| --- | --- |
| `bun run build` | 生产构建，输出到 `dist/` |
| `bun run preview` | 预览生产构建 |
| `bun run typecheck` | 类型检查 |
| `bun run test` | 运行测试 |
| `bun run gen:parts` | 重新生成组件索引 |
| `bun run gen:agent` | 把组件清单写进 `public/agent.md` |

在 Windows 上，项目路径要尽量短。依赖目录层级很深，放在超长路径下安装可能失败。

## 目录

```text
src/           应用入口和编辑器
components/    编辑器界面
components/m3e/  Material 3 Expressive 组件库
lib/           文档模型、提示词和代码生成
lib/m3e/       组件库的工具代码
hooks/         组件库的 Hook
styles/        组件库的样式和设计令牌
parts/         组件注册表和绘制
parts/defs/    组件定义
parts/widgets/ 自带组件
public/        静态资源
scripts/       生成脚本
docs/          组件规范、清单和盘点
```

## 组件

面板按用途分成 11 类，共 156 个组件：

| 分类 | 数量 |
| --- | --- |
| 操作 | 12 |
| 文本输入 | 12 |
| 选择 | 18 |
| 导航 | 24 |
| 弹出层 | 9 |
| 反馈 | 14 |
| 布局容器 | 14 |
| 列表与数据 | 18 |
| 媒体与图形 | 16 |
| 聊天 | 6 |
| 游戏 | 13 |

- [组件清单](docs/组件清单.md)：现有的全部组件和实测情况
- [组件规范](docs/组件规范.md)：怎样新增组件，以及必须遵守的约定
- [组件盘点](docs/组件盘点.md)：每个来源的组件现在由谁承担

## 许可证

MIT，见 [LICENSE](LICENSE)。引用的项目及其许可证见 [NOTICE](NOTICE)。
