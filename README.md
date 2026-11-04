# M3E Canvas Pro

在浏览器里用现成组件拖拽拼出可交互的 UI 原型。基于 [m3e-canvas](https://github.com/lnkiai/m3e-canvas) 和 [shadcn M3E](https://github.com/Crysta1221/shadcn-m3e)，用统一的组件包整合了各分支的扩展组件。这是一个重构后的独立项目，只打开自己保存的文件，不兼容其他分支的文件格式。

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
parts/         可拖拽的组件定义
parts/defs/    M3 组件的定义
parts/packs/   扩展组件包
public/        静态资源
scripts/       生成脚本
docs/          接入规范和进度
```

## 组件

面板按用途分成 12 类，共 136 个组件：操作、文本输入、选择、导航、弹出层、反馈、布局容器、列表与数据、媒体与图形、聊天、游戏、Ant Design（默认折叠）。

扩展组件的代码按来源放在 `parts/packs/`，和面板分类无关：

| 组件包 | 内容 |
| --- | --- |
| `layout` | 容器、层叠、网格、停靠面板、辅助面板 |
| `basic` | 表单、评分、颜色选择、链接 |
| `media` | 视频、网页、动画占位 |
| `dashboard` | 图表、散点图、热力图、仪表、表格、统计卡片、筛选栏、描述列表 |
| `desktop` | 标题栏、状态栏、树形列表、步骤条、复制行、微光文字 |
| `game` | 6 种抽奖、背包、物品格、任务条、奖励进度、每日签到、功能按钮、侧边标签、资源胶囊、摇杆、数量加减器 |
| `ios` | 页面圆点、照片网格、登录或支付按钮、操作表、订阅方案、滚轮选择器 |
| `antd` | Ant Design 按钮、输入框、下拉选择、表单、卡片、表格、标签页、菜单、面包屑、分页、弹窗、分割线 |

新增组件请看 [组件包接入规范](docs/组件包接入规范.md)，当前进度见 [组件接入进度](docs/组件接入进度.md)。

## 许可证

MIT，见 [LICENSE](LICENSE)。引用的项目及其许可证见 [NOTICE](NOTICE)。
