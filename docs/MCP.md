# MCP：让 Claude Desktop、Codex 操作画布

`m3e-canvas-mcp` 是 M3E Canvas Pro 的 MCP 服务器。Claude Desktop、Codex、Claude Code 以及其他支持 MCP 的客户端通过它读取和修改设计：屏幕、组件、组合件、风格、数据、变量和交互，并能截图检查效果。它提供的工具和应用内 AI 用的是同一个工具注册表（`lib/tools`），所有改动都经过文档核心（`lib/core`），所以校验、撤销和风格规则完全一样。

它有两种工作方式：

| 方式 | 改的是什么 | 什么时候用 |
| --- | --- | --- |
| **实时**（默认） | 浏览器里打开的编辑器标签页。改动立刻出现在画布上，每次调用是一步撤销 | 一边看一边让 AI 改，随时撤销 |
| **文件**（`--file`） | 磁盘上的项目文件或项目文件夹（编辑器“保存到文件”“保存到文件夹”得到的，见 [项目文件](项目文件.md)），不需要打开编辑器 | 批量生成、在没有界面的环境里改设计、放进版本库一起管理 |

两个都给（`--file <路径> --live`）时，有已配对的标签页就改标签页，没有就改文件。

## 安装和运行

需要 Node 22.12 以上。

发布到 npm 之后，客户端直接用 `npx -y m3e-canvas-mcp`（或 `bunx m3e-canvas-mcp`）启动它，不用另外安装。从本仓库构建：

```bash
bun install
bun run build       # 编辑器的构建，文件模式的截图要用
bun run mcp:build   # 打包成 mcp/dist/m3e-canvas-mcp.js，并把编辑器的构建复制到 mcp/dist/app
node mcp/dist/m3e-canvas-mcp.js --help
```

`mcp/dist/m3e-canvas-mcp.js` 是一个单独的 Node ESM 文件，除了 Node 不需要任何依赖；把整个 `mcp/dist` 拷到别处也能运行。开发时用 `bun run mcp:dev -- <参数>` 直接运行源码。

### Claude Desktop

编辑 `claude_desktop_config.json`（macOS 在 `~/Library/Application Support/Claude/`，Windows 在 `%APPDATA%\Claude\`），然后重启 Claude Desktop：

```json
{
  "mcpServers": {
    "m3e-canvas": {
      "command": "npx",
      "args": ["-y", "m3e-canvas-mcp"]
    }
  }
}
```

用本仓库的构建时，把命令换成 `"command": "node", "args": ["/绝对路径/m3e-canvas-pro/mcp/dist/m3e-canvas-mcp.js"]`。

文件模式和生成图形（可选）：

```json
{
  "mcpServers": {
    "m3e-canvas-file": {
      "command": "npx",
      "args": ["-y", "m3e-canvas-mcp", "--file", "/Users/me/Designs/m3e-canvas Shop.json"],
      "env": { "OPENAI_API_KEY": "sk-..." }
    }
  }
}
```

### Codex

在 `~/.codex/config.toml` 里加：

```toml
[mcp_servers.m3e-canvas]
command = "npx"
args = ["-y", "m3e-canvas-mcp"]
# 生成 SVG 和图片大约要 30 秒，默认的工具超时可能不够
tool_timeout_sec = 180
# 需要生成图形时：
# env = { OPENAI_API_KEY = "sk-..." }
```

文件模式在 `args` 里加 `"--file", "/path/to/m3e-canvas Shop.json"`。

### Claude Code 和其他客户端

```bash
claude mcp add m3e-canvas -- npx -y m3e-canvas-mcp
```

只能连接 URL 的客户端用 Streamable HTTP：

```bash
npx -y m3e-canvas-mcp --http            # http://127.0.0.1:47841/mcp
```

启动时在日志里打印地址和令牌（`Authorization: Bearer <令牌>`）。想让令牌固定，用 `--token <令牌>` 或环境变量 `M3E_MCP_TOKEN`。例如 Codex：

```toml
[mcp_servers.m3e-canvas]
url = "http://127.0.0.1:47841/mcp"
bearer_token_env_var = "M3E_MCP_TOKEN"
```

### 参数

| 参数 | 说明 |
| --- | --- |
| `--file <路径>` | 文件模式：一个项目文件（`m3e-canvas <名字>.json`），或一个项目文件夹（`m3e-project.json` 加 `m3e-assets/`）。不存在时第一次改动会创建它（路径以 `/` 结尾时创建文件夹） |
| `--live` | 和 `--file` 一起用：有配对的标签页时改标签页 |
| `--read-only` | 只读会话：只提供读取的工具（大纲、查找、描述、截图、目录） |
| `--http [端口]` | 改用 Streamable HTTP，只监听 127.0.0.1（默认端口 47841） |
| `--token <令牌>` | HTTP 的令牌（默认读 `M3E_MCP_TOKEN`，没有就随机生成并打印） |
| `--port <端口>` | 实时连接的第一个端口（默认 47831，占用时依次试后面三个） |
| `--origin <来源>` | 编辑器部署在别处时，允许它的来源，例如 `https://canvas.example.com`（可重复；也可用 `M3E_MCP_ORIGINS`，逗号分隔） |
| `--allow-destructive` | 文件模式：删除、清空等操作不再询问 |
| `--confirm-timeout <秒>` | 实时模式：破坏性调用等作者点“允许”的时间（默认 60） |
| `--lang <ja\|en\|zh\|ko>` | 文件模式里新文字（组合件的标签、新屏幕名）用的语言，默认跟系统 |
| `--app <目录或地址>` | 文件模式截图用的编辑器构建（`dist` 目录），或一个正在运行的编辑器地址 |
| `--log <文件>` | 日志另存一份 |
| `--quiet` / `--debug` | 只打印必须看到的（配对码、令牌）/ 打印每次调用 |

环境变量：`OPENAI_API_KEY`（打开 `generate_svg`、`generate_image`）、`OPENAI_BASE_URL`、`M3E_MCP_TEXT_MODEL`、`M3E_MCP_IMAGE_MODEL`、`HTTPS_PROXY` / `NO_PROXY`、`PLAYWRIGHT_PATH`。

## 实时模式：连接编辑器

1. 在客户端里启动服务器（客户端会自己启动它）。服务器在日志里打印：`Live bridge on ws://127.0.0.1:47831 … approve pairing code 733-659`。
2. 在编辑器左栏底部点插头图标，打开“连接 MCP”。编辑器会自动找到这台电脑上的服务器（端口 47831–47834）。
3. 画面上方弹出“Claude wants to work on this canvas”和配对码。确认它和服务器的配对码一致：看客户端里这个服务器的日志，或者直接问 AI（它会调用 `connection_status`，回答里有配对码）。
4. 点“允许编辑”或“只读”。之后 AI 的每次调用都在这个标签页里运行：
   - 改动立刻出现在画布上，每次调用是一步撤销，`apply_ops` 的一整批也是一步；
   - 截图由编辑器自己画，和“导出图片”完全一样；
   - 删除屏幕、删除组件、清空画布等破坏性调用会弹出确认卡片，60 秒内不点“允许”就拒绝，AI 收到拒绝的原因；
   - 面板里有连接状态、客户端名字、可编辑或只读、最近的调用记录和断开按钮。
5. 刷新标签页后会自动回到同一个服务器，不用再批准；服务器重启后要重新批准。客户端每次启动服务器（Claude Desktop 重启、Codex 开新会话）都是新的进程和新的配对码，所以要再批准一次。

一个服务器同时只连一个标签页。同一台电脑上的第二个客户端（比如 Claude Desktop 和 Codex 都开着）会用下一个端口，编辑器会分别询问。

## 文件模式

```bash
npx -y m3e-canvas-mcp --file "m3e-canvas Shop.json"
```

- 读写的格式和编辑器保存的完全相同，都经过 `lib/core/projectFile.ts`（格式见 [项目文件](项目文件.md)）：键排序、一个组件一行，同一份文档总是写出相同的字节，放进版本库时只有真正的改动。打开、校验和迁移经过 `openProject`。服务器只通过 `mcp/src/fileStore.ts` 的 `ProjectFormat` 接口接触格式。
- 单个文件时图片以 data URL 留在文件里；文件夹（`m3e-project.json`）时较大的图片放在旁边的 `m3e-assets/`，文档里写 `m3e-file:m3e-assets/<哈希>.<扩展名>`。服务器不删除 `m3e-assets/` 里不再用到的图片（编辑器保存文件夹时会清理）。
- 每次改动成功后立刻写回文件。写入是原子的：先写同目录下的临时文件，再改名覆盖；文件夹里先写图片，再写项目文件。
- 编辑器绑定了同一个文件时也不会互相覆盖：两边都会在写之前检查文件是否被对方改过。
- 每次调用前都检查文件：如果别的程序（或编辑器）在这期间保存过它，服务器重新读入，**这次写入被拒绝**并说明原因，不会覆盖别人的修改；AI 重新读大纲后再改。
- 没有编辑器时，组件的尺寸先用各组件自己的估计（`guessMeasurer`）。截图时会在浏览器里实际测量，之后的排版也用测量值。
- 破坏性调用：客户端支持 MCP 的 elicitation 时，会请客户端里的人确认；不支持时拒绝，除非用 `--allow-destructive` 启动。

### 截图

文件模式的截图用无头 Chromium：服务器在 127.0.0.1 上提供编辑器的构建，打开其中的 `/render` 页面（`src/editor/RenderPage.tsx`），按画布的方式测量组件、排版，再用和“导出图片”相同的代码（`src/editor/render.tsx` 的 `renderExport`）画出屏幕。

这需要 Playwright 和它的 Chromium，它们不打包在服务器里：

```bash
npm i -g playwright
npx playwright install chromium
```

服务器会在 `PLAYWRIGHT_PATH`、`NODE_PATH`、全局模块里找它。没装时，截图工具返回错误并说明怎样安装，其他工具不受影响。

## 安全

| 方面 | 做法 |
| --- | --- |
| 只在本机 | 实时连接、HTTP 和截图用的页面都只监听 127.0.0.1 |
| 只让编辑器连接 | WebSocket 只接受编辑器的来源（本机 3000–3010、4173–4183、5173–5183 端口，或 `--origin` 给的地址），并检查 Host 必须是 127.0.0.1 或 localhost，网页通过 DNS 重绑定也连不上 |
| 配对 | 服务器每次启动生成一个配对码，打印在日志里；编辑器显示同一个码和客户端名字，作者核对后批准，之前不会运行任何调用 |
| 只读和编辑 | `--read-only` 只提供读取的工具；作者批准时也可以只给只读。服务器和编辑器两边都检查 |
| 破坏性操作 | 实时模式在编辑器里点“允许”，超时即拒绝；文件模式经客户端确认或 `--allow-destructive` |
| 密钥 | 生成图形只用服务器自己环境里的 `OPENAI_API_KEY`。密钥不经过 MCP 消息，也不经过和编辑器的连接：实时模式下生成工具在标签页里运行，图由服务器画好后只把结果传回去，而且只为服务器正在等的生成调用作图。日志里不出现密钥 |
| HTTP | 每个请求都要带令牌（`Authorization: Bearer`），检查 Host 和 Origin |
| 没有代码执行 | 工具只有注册表里的类型化操作和读取，没有运行任意代码的工具 |

局限：配对码保证编辑器连的是你启动的服务器；本机上的其他程序可以伪造来源连接服务器，冒充编辑器（它们只能收到 AI 的调用，碰不到你的标签页）。本机程序本来就能读写你的文件，这不在防护范围内。

## 工具、资源和提示词

工具就是注册表的工具，带完整的 JSON Schema 输入、`outputSchema`（结果在 `structuredContent.result` 里，同时有文本），以及 `readOnlyHint`、`destructiveHint`、`idempotentHint`、`openWorldHint` 提示。错误以 `{code, message, hint}` 返回，模型能据此改正。截图以图片返回。长时间的调用（生成）会定时发进度通知。

- **说明**：服务器的 instructions 是工具指南（`toolGuide`）加上 MCP 的说明。
- **提示词**：`guide`（工具指南）、`design_screen`（按一段需求设计一个屏幕，先搭再截图检查）。
- **资源**：`m3e://document/outline`、`m3e://document/screens`、`m3e://document/components`、`m3e://document/data`、`m3e://document/styles`；目录 `m3e://catalog/parts`、`kits`、`templates`、`looks`、`icons`；模板 `m3e://screen/{id}/outline`、`m3e://screen/{id}/screenshot`、`m3e://node/{id}`、`m3e://part/{slug}`。文档资源可以订阅，改动后会收到通知。

<!-- tools:start (bun run mcp:docs) -->

共 106 个工具：服务器环境里没有 OPENAI_API_KEY 时不含“生成”组，只读会话只列出“只读”一栏为“是”的。说明取自工具给模型看的描述。

| 工具 | 组 | 只读 | 需作者确认 | 说明 |
| --- | --- | --- | --- | --- |
| `get_outline` | 读取 | 是 |  | The document as a compact outline: title and style, components, collections and variables, then each screen and the tree of its parts, one line each (id, part, name, position and … |
| `list_screens` | 读取 | 是 |  | Every screen: id, name, size, how far it scrolls, background, what it is for, which screen it is another size of, and how many parts stand on it. |
| `find_nodes` | 读取 | 是 |  | Finds parts that match everything given: on a screen, of a part slug, tier or category, with a name or shown words containing `name` / `text` (case-insensitive). |
| `describe_node` | 读取 | 是 |  | Everything about one part: what it is, its screen and bounds, its group's fields, its parent and children, its auto layout and how it sits in its parent's, its own fields (fill, l… |
| `get_selection` | 读取 | 是 |  | What the author has selected in the editor: the parts (the last one is the one the panel shows) and the selected screen. |
| `list_parts` | 读取 | 是 |  | The catalog of parts: atoms (box, text, icon, svg, image, button, input… compose them in boxes) and ready-made composites. |
| `describe_part` | 读取 | 是 |  | One part (or kit) of the catalog in full: its tier and category, default size, whether it holds parts, has an auto layout or splits into atoms, and each prop with its kind, defaul… |
| `list_kits` | 读取 | 是 |  | Kits: composites built from atoms in nested auto layouts (search bar, list row, prompt box, tab bar…), each composed the way the document's style composes it and re-composed when … |
| `list_templates` | 读取 | 是 |  | Screen and flow templates (sign-in, shop, social, content, tools, games, desktop) that add_template puts on the canvas. |
| `list_styles` | 读取 | 是 |  | The style the document wears (and whether it is held to that style's rules), the built-in style packs modeled on real products (key, name, products), and the document's own custom… |
| `get_style` | 读取 | 是 |  | One style in full (the document's own when no key is given): colors (light and dark roles), faces, shape, icon family, control recipes, how its screens are spaced and composed, an… |
| `look_reference` | 读取 | 是 |  | How to write a part's `look` (its effects: fills, strokes, shadows, glass, text effects, textures…), the look presets with the look each one writes, and the color roles fill, text… |
| `list_icons` | 读取 | 是 |  | Material Symbols names (snake_case) every icon family draws offline. |
| `list_components` | 读取 | 是 |  | The document's reusable components (id, name, size, the parts in their definition, how many instances there are), the set each variant belongs to with its values, and each compone… |
| `list_data` | 读取 | 是 |  | The document's data collections (id, name, fields, rows) and prototype variables (id, name, type, starting value). |
| `screenshot` | 读取 | 是 |  | A picture of a screen (or of one part, cut out of its screen) as the app draws it, to check your work by eye: alignment, spacing, overflow, contrast, anything missing. |
| `sample_colors` | 读取 | 是 |  | Measures the colors of a picture: an attached reference (ref1…) or a screen or part of the canvas. |
| `compare_to_reference` | 读取 | 是 |  | Holds a screen of the canvas against the reference picture it copies: draws the screen, hands back both pictures (the reference first), and lays them over each other in a grid, gi… |
| `apply_ops` | 搭建 |  | 含破坏性操作时 | Runs many operations as one change: all of them or none (if one fails, the document stays as it was and the error says which one), one undo step. |
| `set_title` | 搭建 |  |  | Sets the app's name. |
| `set_brief` | 搭建 |  |  | Sets the brief: what the app is for, in the author's words; it goes into the prompt. |
| `set_prompt` | 搭建 |  |  | Sets the prompt's fields: title, brief, promptEdit (the prompt as rewritten by hand; null for the generated one), promptOptions (the guidance lines; null for the default set). |
| `set_theme` | 风格 |  |  | Changes the theme: dark, contrast (standard, medium, high), shape (none, square, soft, rounded, full), font, displayFont, motion, icons, recipes, emphasized, bothModes. |
| `apply_style` | 风格 |  |  | Puts one of the style packs on the document ("" for Android's Material 3), or one of the document's own styles by its custom: key: its colors, shapes, faces, icons and control rec… |
| `set_custom_styles` | 风格 |  | 是 | Replaces the document's own styles (custom styles, each with a custom: key). |
| `add_custom_style` | 风格 |  |  | Adds a custom style to the document's own styles, or replaces the one with its key, validated like a style file: roles as #RRGGBB with contrast checked, faces, icon families, shap… |
| `set_style_rules` | 风格 |  |  | Holds the document to its style's rules (on), or lets its colors, shapes and looks be the author's (off). |
| `set_style_layout` | 风格 |  |  | Changes one of the style's layout settings, and lays the screens out by it. |
| `set_palette` | 风格 |  |  | Picks one of the editor's color schemes by key (purple, blue, green…), or "custom" for the document's own. |
| `set_custom_palette` | 风格 |  |  | Sets the document's own color scheme (hex colors for every role), or clears it. |
| `set_dynamic_color` | 风格 |  |  | Whether the app takes its colors from the user's wallpaper (Material You). |
| `set_canvas_mode` | 搭建 |  |  | Switches between screens (phone) and a blank canvas (blank). |
| `clear` | 搭建 |  | 是 | Clears the canvas: every screen and part (with a component open, everything in it). |
| `add_screen` | 搭建 |  |  | Adds a blank screen to the right of the others: the document's phone unless a preset (tablet, desktop) or a size is given. |
| `add_template` | 搭建 |  |  | Adds the screens of a screen or flow template (see the template catalog) to the right of the others. |
| `set_screen` | 搭建 |  |  | Sets a screen's fields: name, bg (a color role), note (what it is for), swipe ({left\|right\|up\|down: screen id}), deviceBars, backgroundImage, backgroundOpacity. |
| `resize_screen` | 搭建 |  |  | Changes a screen's size (w and h in dp, or a preset: phone, tablet, desktop); its parts follow and it is laid out again. |
| `set_phone_model` | 搭建 |  |  | Puts every phone screen of the document on a phone of this size (portrait w×h; screens on their side stay so). |
| `set_screen_length` | 搭建 |  |  | Makes a screen run longer than its device (it scrolls), or back; what stands at its foot goes with the foot. |
| `remove_screen` | 搭建 |  | 是 | Removes a screen with everything on it; taps that went to it go to another size of it, or nowhere. |
| `duplicate_screen` | 搭建 |  |  | Copies a screen with everything on it, to the right of the others. |
| `create_screen_variant` | 搭建 |  |  | Makes another size of a screen (tablet, desktop or phone) beside it; each size keeps a layout of its own and the preview switches between them by width. |
| `set_screen_place` | 搭建 |  |  | Sets where Tidy puts a screen's body between its bars (top, center, bottom, spread), and tidies it that way. |
| `move_screen` | 搭建 |  |  | Moves a screen, with everything on it, to x, y on the canvas. |
| `set_flow_start` | 搭建 |  |  | Makes a screen a starting point of a flow of the prototype, under a name (the preview offers each flow), or no longer (null). |
| `add_part` | 搭建 |  |  | Adds a part (an atom or a composite) to a screen: at a point, into a container's auto layout at a place in its run, or where there is room. |
| `add_instance` | 搭建 |  |  | Adds an instance of a reusable component: at a point on a screen, into a container's auto layout, or where there is room. |
| `add_kit` | 搭建 |  |  | Adds a kit: a composite made of atoms in nested auto layouts (search bar, list row, prompt box…), composed the way the style composes it; a bar goes to its edge of the screen. |
| `add_tree` | 搭建 |  |  | Adds a whole tree of parts in one step: a box with auto layout holding atoms (text, icon, svg, image, button, input…) and other boxes, each with its props, colors and look. |
| `remove_nodes` | 搭建 |  | 是 | Removes parts from the canvas (what a container holds stays where it is). |
| `duplicate_nodes` | 搭建 |  |  | Duplicates parts (a container with what it holds) a step aside and selects the copies. |
| `set_item` | 搭建 |  |  | Changes a part's own fields: props, fill, textColor, corners, look, note, action/actions, bind, and how it sits in an auto layout (flowSize, alignSelf, flowAbsolute, flowMin, flow… |
| `set_props` | 搭建 |  |  | Sets prop values of a part (checked against its PropDefs); null resets one to its default. |
| `set_group` | 搭建 |  |  | Sets a group's fields (by the group's or one of its parts' id): name, hidden (at the start of the preview), locked, showWhen (a condition), pane. |
| `toggle_lock` | 搭建 |  |  | Locks the groups of the given parts, or unlocks them when all already are. |
| `nudge` | 搭建 |  |  | Moves parts (or a screen with everything on it) by dx, dy. |
| `move_node` | 搭建 |  |  | Moves a part, with what it holds, so its top left is at x, y (from the screen's top left with `screen`); it leaves any auto layout it was in. |
| `move_into` | 搭建 |  |  | Puts a part (with what it holds) into a container's auto layout at a place in its run; index 0 is first, the end when left out. |
| `z_order` | 搭建 |  |  | Moves parts forward or backward in what is drawn over what, one step or all the way (front/back); in an auto layout this moves them along its run. |
| `reorder_items` | 搭建 |  |  | Puts the parts of one group in a new order. |
| `show_nodes` | 搭建 |  |  | Turns the docks that hold the given parts to the tab they are on. |
| `group_nodes` | 搭建 |  |  | Groups two or more parts into one hand-made group that keeps where they stand (not an auto layout: use wrap_in_auto_layout for that). |
| `ungroup` | 搭建 |  |  | Splits a hand-made group back into single parts where they stand. |
| `set_layout` | 搭建 |  |  | Sets a container's auto layout: layout (free = off, row, column, grid) and its props: gap, gapY, padX, padY, padTop, padRight, padBottom, padLeft, align (start, center, end, stret… |
| `tidy_screen` | 搭建 |  |  | Tidies a screen: bars pinned, the body read as rows, columns and grids, spaced on the style's spacing scale. |
| `tidy_up` | 搭建 |  |  | Arranges the given parts as an even row, column or grid read off where they stand, one gap each way; the top left stays. |
| `align` | 搭建 |  |  | Lines the given parts up against each other: left, centerH, right, top, centerV or bottom. |
| `align_to_parent` | 搭建 |  |  | Lines one part up against what it stands in: the box with no auto layout that holds it, else its screen (left, centerH, right, top, centerV, bottom). |
| `distribute` | 搭建 |  |  | Spreads the given parts out evenly along x or y; with gap, exactly that space between them. |
| `wrap_in_auto_layout` | 搭建 |  |  | Puts the given parts into nested auto layout boxes that keep them where they stand (rows, columns, grids read off their places); one container takes a layout itself. |
| `auto_layout_screen` | 搭建 |  |  | Turns a screen's body into nested auto layouts; bars, FABs, dialogs, rails, its picture and locked parts keep their places. |
| `split_into_atoms` | 搭建 |  |  | Replaces a composite part where it stands with the tree of atoms it is made of (boxes, text, icons…), composed the way the style composes it. |
| `place_in_screen` | 搭建 |  |  | Puts the given parts, as one block, at one of nine spots in their screen's body (between the bars, inside the margins), clear of what is there. |
| `combine_buttons` | 搭建 |  |  | Joins buttons that stand side by side on a screen into button groups. |
| `relayout` | 搭建 |  |  | Lays every screen out the way the document's style lays screens out. |
| `make_component` | 搭建 |  |  | Turns parts (with what they hold) into a reusable component; an instance of it takes their place. |
| `rename_component` | 搭建 |  |  | Renames a component; its instances are called by it. |
| `remove_component` | 搭建 |  | 是 | Removes a component; its instances, on the screens and in other components, become the plain parts they showed. |
| `detach_instance` | 搭建 |  |  | Turns an instance back into plain parts of its own. |
| `set_overrides` | 搭建 |  |  | Sets what an instance changes of its component: one override (key `itemId/propKey`, value; null resets it) or the whole map. |
| `add_variant` | 搭建 |  |  | Adds a variant to a component: a copy of it (same parts, so overrides carry over) that differs by the values of variant properties such as state=pressed or size=m. |
| `update_component_set` | 搭建 |  |  | Renames a set of variants, or gives it new variant properties: each {name, values}, with was (its old name) to rename one and renamed ({old value: new value}) to rename values. |
| `set_variant_values` | 搭建 |  |  | Sets the values a variant has for its set's variant properties (a value the set does not have yet is added). |
| `swap_instance` | 搭建 |  |  | Makes an instance an instance of another component (another variant of its set, or any component); what it overrides and its property values carry over where the parts and propert… |
| `set_component_prop` | 搭建 |  |  | Adds (or, by id or name, replaces) a property of a component that its instances set: type "text" (targets: override keys itemId/propKey of the words it sets), "bool" (targets: ids… |
| `remove_component_prop` | 搭建 |  |  | Removes a property of a component; its instances stop setting it. |
| `set_instance_props` | 搭建 |  |  | Sets the values an instance gives its component's properties, by property id or name: words for a text property, true/false for a bool one, a component id for a swap one; null goe… |
| `reset_overrides` | 搭建 |  |  | Takes back everything an instance changes of its component: its overrides and the values it gives its properties. |
| `add_collection` | 数据与交互 |  |  | Adds a data collection: named fields and rows of text (one cell per field). |
| `update_collection` | 数据与交互 |  |  | Changes a data collection's name, fields or rows. |
| `remove_collection` | 数据与交互 |  | 是 | Removes a data collection; layouts that repeated it stop repeating. |
| `set_repeat` | 数据与交互 |  |  | Makes a container with an auto layout draw its first child once per row of a collection (limit: at most that many rows), or stop (null). |
| `add_var` | 数据与交互 |  |  | Adds a variable: type text, number, bool or color (a role such as primary or a hex), with its value in the first mode of its collection (values: what it is in the other modes, by … |
| `update_var` | 数据与交互 |  |  | Changes a variable's name, type, value (in the first mode of its collection), its values in the other modes (values, by mode id or name), its collection, or whether it drives the … |
| `remove_var` | 数据与交互 |  | 是 | Removes a variable; props bound to it are unbound. |
| `add_var_collection` | 数据与交互 |  |  | Adds a collection of variables with the modes its variables have values in (names such as Light and Dark; one mode when left out). |
| `update_var_collection` | 数据与交互 |  |  | Renames a collection of variables, gives it its modes (each {id, name}; one without an id is new, one left out is removed with its values, and the first is the one whose values ar… |
| `remove_var_collection` | 数据与交互 |  | 是 | Removes a collection of variables and every variable in it; what was bound to them is unbound. |
| `set_var_mode` | 数据与交互 |  |  | Chooses the mode of a variable collection the document shows (or one screen shows, over the document's choice), by mode id or name; null goes back to the default (a screen follows… |
| `set_action` | 数据与交互 |  |  | Sets what a tap on a part does (or on one of its places: slot "tab:0", "icon"…): {to: screen id \| "back" \| "link" \| "none", transition, url, effects: [{do: show\|hide\|toggle\|… |
| `bind_prop` | 数据与交互 |  |  | Binds a prop of a part to a variable (the preview shows the variable's value), or a field of its design: "@fill", "@text" (the words' color) and "@stroke" take a color variable, "… |
| `reorder_panes` | 搭建 |  |  | Puts a dock's tabs in a new order; what each tab holds follows it. |
| `generate_svg` | 生成（需 OPENAI_API_KEY） |  |  | Draws a custom SVG and puts it on the canvas as a vector (svg) part: a new icon, a logo, an illustration, a decoration nothing in the catalog has. |
| `generate_image` | 生成（需 OPENAI_API_KEY） |  |  | Paints a picture with the image model (about 20–40 s): with `background` and `screen`, it becomes the picture behind that whole screen (its scene, filling the screen under every p… |
| `generate_style` | 生成（需 OPENAI_API_KEY） |  |  | Writes a custom style with the text model, from a description ("warm paper notebook: cream paper, ink-blue accents, serif headings") and/or an attached reference picture (ref1…), … |
| `connection_status` | 服务器自带 | 是 |  | Where this server's calls go, whether an editor tab is paired, and the pairing code when none is. |

<!-- tools:end -->

## 故障排除

| 现象 | 处理 |
| --- | --- |
| AI 说 “No editor tab is connected” | 在编辑器里打开“连接 MCP”，批准配对码。问 AI 调用 `connection_status` 可以看到配对码和状态 |
| 编辑器一直显示“正在查找” | 服务器没有启动，或端口被占用（看服务器日志）。用了 `--port` 时，编辑器只找 47831–47834 |
| 日志里有 “Refused a bridge connection from …” | 编辑器不在默认的本机端口上：用 `--origin <编辑器的地址>` 启动 |
| 部署在 https 上的编辑器连不上 | 用 `--origin https://你的地址` 启动服务器；浏览器可能会询问是否允许网页访问本机网络，选允许 |
| 显示 “Another tab is already connected” | 一个服务器只连一个标签页：先在原来的标签页里断开，或关掉它 |
| 截图报错 “need Playwright” | 按上面安装 Playwright 和 Chromium，然后重启服务器 |
| 截图报错 “cannot find the editor's build” | 先 `bun run build` 再 `bun run mcp:build`，或用 `--app` 指向 `dist` 或正在运行的编辑器 |
| 文件模式提示文件 “changed on disk” | 别的程序保存过这个文件。服务器已经重新读入，让 AI 重新读大纲后再改 |
| 生成图形超时 | 生成要 20–40 秒：调大客户端的工具超时（Codex 的 `tool_timeout_sec`） |
| 生成图形连不上 OpenAI | 需要代理时设置 `HTTPS_PROXY`，服务器会通过它访问 |
| 在哪里看日志 | Claude Desktop：macOS `~/Library/Logs/Claude/mcp-server-m3e-canvas.log`，Windows `%APPDATA%\Claude\logs\`。也可以用 `--log <文件>` |

## 代码在哪里

```text
mcp/src/cli.ts          命令行：参数、stdio 或 HTTP
mcp/src/setup.ts        按参数组合工具（注册表、有密钥时的生成工具、只读）和后端
mcp/src/server.ts       MCP 服务器：工具、提示词、资源、订阅
mcp/src/live.ts         实时后端：127.0.0.1 上的 WebSocket、配对、调用转发、代为作图
mcp/src/file.ts         文件后端：DocStore、写回、冲突、确认
mcp/src/fileStore.ts    磁盘上的项目文件和文件夹（ProjectFormat 接口接 lib/core/projectFile.ts、原子写入、改动检测）
mcp/src/render.ts       无头截图：Playwright、提供编辑器构建、/render 页面
mcp/src/http.ts         Streamable HTTP：令牌、Host 和 Origin 检查、每个会话一个 Server
mcp/src/generate.ts     服务器环境里的生成配置、走代理的 fetch
lib/mcp/protocol.ts     服务器和编辑器之间的消息
lib/mcp/editorBridge.ts 编辑器这一端：查找、配对、在 store 上运行调用、确认、活动记录
src/editor/useMcpBridge.ts、components/McpPanel.tsx、lib/i18n/mcp.ts   编辑器里的开关、卡片和面板
src/editor/RenderPage.tsx、src/editor/screenShot.tsx   截图：/render 页面和编辑器共用的离屏绘制
```

测试：`mcp/src/*.test.ts`（内存中的 MCP 客户端对文件后端；真实 WebSocket 上的实时连接；HTTP）随 `bun run test` 运行；`e2e/mcp.e2e.ts` 用真实的编辑器标签页配对、改画布、一步撤销，并在文件模式下用渲染页截图，随 `bun run test:e2e` 运行。`bun mcp/live-check.ts --mode file|live` 用真实模型（OpenAI Responses）当客户端的大脑，跑一遍完整流程（需要密钥，不在测试里）。
