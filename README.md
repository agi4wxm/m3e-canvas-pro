# M3E Canvas Pro

在浏览器里用现成组件拖拽拼出可交互的 UI 原型。基于 [m3e-canvas](https://github.com/lnkiai/m3e-canvas) 和 [shadcn M3E](https://github.com/Crysta1221/shadcn-m3e)，用统一的组件包整合了各分支的扩展组件。

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
fixtures/      测试用的真实存档样本
docs/          接入规范和进度
```

## 组件包

扩展组件都放在 `parts/packs/`：

| 组件包 | 内容 |
| --- | --- |
| `basic` | 表单、评分、颜色选择、链接、图形 |
| `media` | 视频、网页、动画占位 |
| `dashboard` | 图表、散点图、热力图、仪表、数据表格、统计卡片、筛选栏、描述列表 |
| `desktop` | 标题栏、状态栏、树形列表、步骤条、复制行、滚动条 |
| `game` | 摇杆、数量加减器 |
| `antd` | Ant Design 按钮和下拉选择 |

新增组件请看 [组件包接入规范](docs/组件包接入规范.md)，当前进度见 [组件接入进度](docs/组件接入进度.md)。

## 打开其他分支的文件

项目文件和分享链接可以打开 m3e-canvas 各分支保存的内容，包括 GPUI 和 Miuix 画布的格式。能识别的组件会转成对应组件，暂时没有对应的会显示占位，原始数据都保留在文件里。

## 许可证

MIT，见 [LICENSE](LICENSE)。引用的项目及其许可证见 [NOTICE](NOTICE)。
