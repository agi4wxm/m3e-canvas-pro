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
| `--forget-editors` | 忘记所有“记住这个客户端”的配对（之后都要重新批准），然后照常启动 |
| `--confirm-timeout <秒>` | 实时模式：破坏性调用等作者点“允许”的时间（默认 60） |
| `--lang <ja\|en\|zh\|ko>` | 文件模式里新文字（组合件的标签、新屏幕名）用的语言，默认跟系统 |
| `--app <目录或地址>` | 文件模式截图用的编辑器构建（`dist` 目录），或一个正在运行的编辑器地址 |
| `--allow-outside <来源>` | 文件模式截图允许加载这个来源的图片和网页，例如 `https://cdn.example.com`（可重复；`*` 表示任意网址）。默认只加载编辑器构建自己的资源和项目里的图片，见下面的“截图” |
| `--log <文件>` | 日志另存一份（只有你能读，0600；里面有配对码） |
| `--quiet` / `--debug` | 只打印必须看到的（配对码、令牌）/ 打印每次调用 |

环境变量：`OPENAI_API_KEY`（打开 `generate_svg`、`generate_image`）、`OPENAI_BASE_URL`、`M3E_MCP_TEXT_MODEL`、`M3E_MCP_IMAGE_MODEL`、`HTTPS_PROXY` / `NO_PROXY`、`PLAYWRIGHT_PATH`、`M3E_MCP_CONFIG_DIR`（记住的配对放在哪个文件夹，默认是用户配置目录下的 `m3e-canvas-mcp/`）。

## 实时模式：连接编辑器

1. 在客户端里启动服务器（客户端会自己启动它）。服务器在日志里打印：`Live bridge on ws://127.0.0.1:47831 … type pairing code 733-659`。
2. 在编辑器左栏底部点插头图标，打开“连接 MCP”。编辑器会自动找到这台电脑上的服务器（端口 47831–47834）。
3. 画面上方弹出“Claude wants to work on this canvas”和一个输入框。**编辑器不显示配对码**，要你输入客户端给你的那个：直接问 AI 要（它会调用 `connection_status`；AI 第一次调用工具发现没有连上时，一般也会主动告诉你配对码），或者看客户端里这个服务器的日志。`733-659`、`733 659`、`733659` 都可以。
4. 输好后点“允许编辑”或“只读”。输错了会提示还能试几次；同一个服务器一共输错 8 次后不再接受任何配对码，要重启服务器（重启客户端，或在客户端里重新加载 MCP 服务器）后用新的码。**配对码 10 分钟内有效，并且只能配对一个标签页**：过期后服务器换一个新码（写进日志），配对成功后这个码立即作废，下一个标签页要用新码。`connection_status` 返回当前的码和剩余秒数（`pairingCodeExpiresInSeconds`），AI 转告时会说明还剩多久；输错的次数按服务器的整个运行累计，换码不会多给尝试机会。之后 AI 的每次调用都在这个标签页里运行：
   - 改动立刻出现在画布上，每次调用是一步撤销，`apply_ops` 的一整批也是一步；
   - 截图由编辑器自己画，和“导出图片”完全一样；
   - 删除屏幕、删除组件、清空画布等破坏性调用会弹出确认卡片，60 秒内不点“允许”就拒绝，AI 收到拒绝的原因。名字不像删除、却会拿走内容的调用也一样要确认：改写数据集合时少了行或字段、改变量集合时去掉了模式（连同各变量在它下面的值）、用同一个编号替换自定义风格或文档自己的图标（包括 `generate_style` 的 `refine` 和 `generate_svg` 的 `icon` 指向已有的风格或图标，在画之前就问）、去掉组件属性。卡片上写着会拿走什么；
   - 确认只对你看到的那份文档有效：卡片还在时你继续编辑也可以（调用之间串行，但不会锁住你的编辑）。点“允许”时如果文档在这期间变了，编辑器重新检查一遍；要拿走的内容或要删除的对象有变化（比如你又加了几行，或改了要删的组件），卡片会带着“画布已变化”的提示和新的说明再问一次，旧的说明不能批准新的变化；改的是别处则直接执行。检查本身出错时这次调用被拒绝并说明原因，不会当作“什么都不拿走”；
   - AI 的客户端取消一个调用（或调用超时）时，不管它还在排队、正在检查、正在等你确认还是正在运行，都会停下：排队中的不再执行，确认卡片收起。连接断开后，旧连接上还没执行的调用全部作废，重连后不会再执行，也不会弹出过时的确认；
   - 面板里有连接状态、客户端名字、可编辑或只读、最近的调用记录和断开按钮。
5. 刷新标签页后会自动回到同一个服务器，不用再输入。客户端每次启动服务器（Claude Desktop 重启、Codex 开新会话）都是新的进程和新的配对码，默认要再输入一次。
6. **记住这个客户端**：输入配对码批准时勾选“记住这个客户端”，以后同一个客户端（按它连接时报的名字，如 `claude-ai`）从同一个编辑器地址启动的服务器会自动连上，权限和这次一样，不用再输入配对码。面板的“记住的客户端”里可以逐个“忘记”，之后又会询问；服务器启动时加 `--forget-editors` 会忘记全部。不勾选时和以前完全一样。

   做法：批准时编辑器生成一个随机密钥交给服务器。编辑器把它存在这个浏览器的 IndexedDB（项目数据库的 `kv`，键 `mcp:trusted`），服务器存在用户配置目录下的 `m3e-canvas-mcp/trusted-editors.json`（Linux `~/.config/`，macOS `~/Library/Application Support/`，Windows `%APPDATA%\`），文件权限 0600、文件夹 0700：文件或文件夹别人能读时（文件夹要是你自己的）改回 0600 / 0700 并在日志里提醒。几个客户端各自的服务器共用这个文件：每次添加、使用、忘记、全部忘记都在旁边的锁文件（`trusted-editors.json.lock`）下完成整个读改写，所以同时添加不会丢记录，刚被忘记的配对也不会被别的进程用旧内容写回来；持锁的进程退出了、或锁超过 15 秒还在，会被清理并在日志里说明。下次服务器在问候里列出它保存的配对编号和一个随机挑战。双方互相证明：编辑器发一个随机挑战，服务器用密钥对“挑战和端口”算 HMAC-SHA256 回答，编辑器核对通过后，再用同一个密钥对服务器的挑战算另一个 HMAC 交回，服务器核对通过才不要配对码直接配对（核对不过算一次输错）。密钥本身不再传输（只有“忘记”时发一次，让服务器删掉它那份）。在编辑器里忘记时如果没有服务器在线，等下一个服务器连上时再通知它删除。180 天没用过的配对自动失效。

一个服务器同时只连一个标签页。同一台电脑上的第二个客户端（比如 Claude Desktop 和 Codex 都开着）会用下一个端口，编辑器会分别询问。

## 文件模式

```bash
npx -y m3e-canvas-mcp --file "m3e-canvas Shop.json"
```

- 读写的格式和编辑器保存的完全相同，都经过 `lib/core/projectFile.ts`（格式见 [项目文件](项目文件.md)）：键排序、一个组件一行，同一份文档总是写出相同的字节，放进版本库时只有真正的改动。打开、校验和迁移经过 `loadDocument`（`lib/project.ts`），和编辑器的每条读入路径相同；文件里不认识的字段写回时原样保留。更新版本的编辑器写的文件只读：能读、能截图，会写文件的调用都被拒绝并说明原因（见 [项目文件](项目文件.md#更新版本写的文档)）。服务器只通过 `mcp/src/fileStore.ts` 的 `ProjectFormat` 接口接触格式。
- 单个文件时图片以 data URL 留在文件里；文件夹（`m3e-project.json`）时较大的图片和模拟库的文件（每种格式）放在旁边的 `m3e-assets/`，文档里写 `m3e-file:m3e-assets/<哈希>.<扩展名>`。写文件夹和编辑器的顺序一样（[项目文件](项目文件.md#图片)）：先写文档引用的每个文件并读回核对，已有同名文件的核对内容，内容不对（损坏的副本）就重写，任何一个写不成项目文件就不动；然后原子写入项目文件；最后删掉 `m3e-assets/` 里文档不再用到的文件，但只删它自己写的、之后没被改过的，或者名字正是内容哈希的（格式自己起的名字）；别人放进去的文件（名字不像哈希，或者内容对不上名字）不碰，别的程序一分钟内刚写的也先不删（可能是它正在保存的）。撤销把文件带回来时会重新写出。
- 图片只在项目所在的文件夹里读、写、删（`mcp/src/inside.ts`，和导出产品时的约束一致）：路径先按文字检查，再逐段检查磁盘，路上有符号链接（Windows 的 junction 也算）就拒绝，不跟过去；有别的名字的硬链接也拒绝；文件夹固定为第一次打开时的真实位置，之后被移走并换成别的文件夹或链接，就不再读写。读不了的图片留空并在日志里说明，写不了时这次修改不保存并说明原因。检查和使用之间被调包的情况也处理了：读取时用打开的句柄再核对一次是不是检查过的那个文件，写入先写在旁边再核对文件夹后改名覆盖，删除前再核对文件夹（只剩核对和删除之间的一瞬，Node 没有 `unlinkat` 无法完全消除）。项目文件本身按你给的路径读写，写入是改名覆盖，不会穿过链接写到别处。
- 每次改动成功后立刻写回文件。写入是原子的：先写同目录下的临时文件，再改名覆盖；文件夹里先写图片，再写项目文件。覆盖时保留原文件的权限，只有自己能读的项目文件写完仍然只有自己能读。
- 编辑器绑定了同一个文件时也不会互相覆盖：两边都会在写之前检查文件是否被对方改过。
- **撤销和重做**：文件模式多两个工具 `undo`、`redo`，撤销或重做这个服务器这次运行里对文件做的修改（一次调用或一批 `apply_ops` 是一步，最多 100 步），每次都立刻写回文件。历史只在内存里：服务器重启后、或者别的程序改过文件被重新读入后从头开始，所以不会撤销别人的修改。没能保存的修改直接丢掉，不能重做。只读会话没有这两个工具；有配对的标签页时（`--live`）改动在编辑器里，由作者在编辑器里撤销。
- 每次调用前都检查文件：如果别的程序（或编辑器）在这期间保存过它，服务器重新读入，**这次写入被拒绝**并说明原因，不会覆盖别人的修改；AI 重新读大纲后再改。
- 没有编辑器时，组件的尺寸先用各组件自己的估计（`guessMeasurer`）。截图时会在浏览器里实际测量，之后的排版也用测量值。
- 破坏性调用：客户端支持 MCP 的 elicitation 时，会请客户端里的人确认；不支持时拒绝，除非用 `--allow-destructive` 启动。

### 截图

文件模式的截图用无头 Chromium：服务器在 127.0.0.1 上提供编辑器的构建，打开其中的 `/render` 页面（`src/editor/RenderPage.tsx`），按画布的方式测量组件、排版，再用和“导出图片”相同的代码（`src/editor/render.tsx` 的 `renderExport`）画出屏幕。这个页面只加载画屏幕要用的代码，不加载编辑器（编辑器的代码只在首页预取）。它先加载文档主题的字体（Google Fonts，需要能联网；连不上时测量和绘制都用系统字体，两者仍然一致），截图只嵌入文字真正用到的字体子集，所以文字和编辑器画布上一样宽。

这需要 Playwright 和它的 Chromium，它们不打包在服务器里：

```bash
npm i -g playwright
npx playwright install chromium
```

服务器会在 `PLAYWRIGHT_PATH`、`NODE_PATH`、全局模块里找它。没装时，截图工具返回错误并说明怎样安装，其他工具不受影响。

截图页面能加载什么由服务器决定，不由文档决定：只加载编辑器构建自己的资源、内嵌的内容（`data:`、`blob:`，项目文件夹里的图片读进来后就是这样）和编辑器为主题字体请求的 Google Fonts。文档里指向别处的图片、视频、网页（包括本机和内网的地址）默认一律不加载：渲染页像编辑器打开别人的项目时一样把它们画成占位，浏览器这一层也拒绝这些请求，结果的 `skipped` 列出这些地址。需要时用 `--allow-outside <来源>` 放行某个来源（`*` 放行任意网址）。

一次截图从启动 Chromium、打开页面到测量、绘制，共用一个 60 秒的截止时间；客户端取消调用时截图立即停止。超时、取消或页面出错后，这个页面被关掉，下一次截图换一个新页面（浏览器保留），不会被前一次卡住。

屏幕上有加载不了的图片（外链失效、返回的不是图片、不允许复制）时，那张图画成灰块，截图照常返回，结果里的 `skipped` 列出这些地址并提示换成 `generate_image` 或图标；实时模式在编辑器里截图也一样（编辑器自己的外部资源设置决定加载与否）。

截图可以带模拟场景和状态：`screenshot {id, scenario: ""}` 让模拟库回答屏幕的数据源，按预览的方式画出列表、绑定的文字和区域的状态，结果的 `data` 说明每个数据源拿到了什么；`{state: "empty"}` 让区域显示某个状态的设计（见 [组件规范](组件规范.md) 的“产品层”）。没装 Playwright 时带场景的截图仍然返回 `data`，只是没有图片。

## 安全

| 方面 | 做法 |
| --- | --- |
| 只在本机 | 实时连接、HTTP 和截图用的页面都只监听 127.0.0.1 |
| 只让编辑器连接 | WebSocket 只接受编辑器的来源（本机 3000–3010、4173–4183、5173–5183 端口，或 `--origin` 给的地址），并检查 Host 必须是 127.0.0.1 或 localhost，网页通过 DNS 重绑定也连不上 |
| 配对 | 服务器生成一个六位配对码，只打印在日志里、只交给自己的 MCP 客户端（`connection_status`、未配对时每个调用的提示），**从不经过 WebSocket 发给网页**。作者在编辑器里输入客户端给的码，服务器核对后才配对，之前不会运行任何调用。码 10 分钟内有效、只能配对一个标签页，之后换新码（显示码的地方都写着剩余时间）。同一个服务器一共输错 8 次后不再接受配对码，直到重启（日志里提醒：不是你输的，说明本机有网页在试） |
| 记住的客户端 | 只有作者勾选才记住；双方各自用只有本用户能读的密钥回答对方一次性的挑战（绑定端口，转发别的服务器的回答没用），都核对通过才不用配对码；可在面板里随时忘记 |
| 只读和编辑 | `--read-only` 只提供读取的工具；作者批准时也可以只给只读。服务器和编辑器两边都检查 |
| 破坏性操作 | 实时模式在编辑器里点“允许”，超时即拒绝；文件模式经客户端确认或 `--allow-destructive`。是否会拿走内容不只看操作的名字：每个写入的调用先在文档的副本上试运行，少了数据行、字段、变量、变量模式、组件或组件属性，或者替换了自定义风格、文档图标，也要确认（`apply_ops` 和 `edit_component` 里的也算）；生成工具按参数判断：`generate_style {refine}` 改写已有的自定义风格、`generate_svg {icon}` 重画已有的文档图标，在调用模型之前就确认。这项检查出错时拒绝执行并说明原因；确认绑定到询问时的文档，等待期间要拿走的内容变了就重新询问 |
| 密钥 | 生成图形只用服务器自己环境里的 `OPENAI_API_KEY`。密钥不经过 MCP 消息，也不经过和编辑器的连接：实时模式下生成工具在标签页里运行，图由服务器画好后只把结果传回去，而且只为服务器正在等的生成调用作图。日志里不出现密钥 |
| HTTP | 每个请求都要带令牌（`Authorization: Bearer`），检查 Host 和 Origin。持有令牌的客户端能占用的也有上限：最多 32 个会话（新会话需要位置时关掉最久没用、没有进行中请求的那个，都在忙则返回 503），一小时没用的会话自动关闭（客户端重新初始化即可），同时进行的请求总共 64 个、每个会话 16 个（超出返回 503 / 429，带 `Retry-After`），请求头和请求体要在 30 秒内传完（408），请求体最大 8 MB |
| 取消 | 客户端取消或超时的调用，在排队、检查、等待确认、运行的任何阶段都会停下；断线后旧连接上的调用不会在重连后执行 |
| 截图的网络请求 | 文件模式截图只加载编辑器构建自己的资源、内嵌内容和主题字体，文档里指向别处（含本机、内网）的地址默认不请求，`--allow-outside` 按来源放行；一次截图有整体截止时间，可取消 |
| 项目文件夹 | 图片只在项目文件夹里读写和清理，路上的符号链接、junction、硬链接和被替换的文件夹都拒绝 |
| 本机静态服务 | 截图用的编辑器构建只在 127.0.0.1 的随机端口上提供；离开构建目录的地址返回 403，编码不合法的地址返回 400（以前会让服务器进程退出） |
| 没有代码执行 | 工具只有注册表里的类型化操作和读取，没有运行任意代码的工具 |

| 本机文件 | 记住的配对文件 0600、所在文件夹 0700（已有的文件夹太宽时收紧，只动属于你的）；`--log <文件>` 写出的日志 0600（日志里有配对码，已有的文件太宽时收紧） |
| 打开的文档 | 屏幕的宽高打开时限制在 3840 以内、长屏的长度在 15360 以内，和操作允许的一样，恶意文件不能让画布和截图去画一块巨大的屏幕 |

为什么配对码要输入而不是核对：WebSocket 只接受编辑器的来源（本机 3000–3010、4173–4183、5173–5183 端口），但这些端口上跑的也可能是别的开发服务器、别人的网页。以前服务器把配对码发给连上来的网页，由作者在编辑器里核对后点批准，这样一个占着这些端口的恶意网页可以自己读到配对码、自己发“批准”，冒充编辑器拿到 AI 的调用（AI 读到的内容由它决定）。现在网页拿不到配对码：只有看得到 MCP 客户端的人才能让标签页配对。

局限：配对码保证和服务器配对的是看得到客户端的你；本机上的其他程序（不是网页）可以伪造来源连接服务器，但同样拿不到配对码，只能猜，8 次后服务器就不再接受。本机程序本来就能读写你的文件（包括记住的配对文件和日志），这不在防护范围内。Windows 上不设置 0600 / 0700 这样的权限位：文件放在 `%APPDATA%` 下，默认只有你自己的账户（和管理员）能访问，服务器不改它的访问控制列表；把 `M3E_MCP_CONFIG_DIR` 或 `--log` 指到共享的文件夹时，要自己保证别人读不到。

## 工具、资源和提示词

工具就是注册表的工具，带完整的 JSON Schema 输入、`outputSchema`（结果在 `structuredContent.result` 里，同时有文本），以及 `readOnlyHint`、`destructiveHint`、`idempotentHint`、`openWorldHint` 提示。错误以 `{code, message, hint}` 返回，模型能据此改正。截图以图片返回。长时间的调用（生成）会定时发进度通知。

- **常见的猜错按本意读**：点击位置写成属性名（应用栏的 `leading`/`trailing` 是 `icon`/`icon2`）、行的序号或文字，按钮的 `text`（`label`）、图片的 `url`（`src`）这类属性名，都按本意执行。
- **批量**：`apply_ops` 有操作失败时整批不执行，错误列出每个失败的操作和原因，并说明其余操作没问题，只改这些再发。
- **图片**：图片属性、列表行的图片、实例的图片覆盖和屏幕的 `backgroundImage` 只接受 `data:image/…` 和项目自己的图片；外链被拒（提示用 `generate_image`）。SVG data URL 先过和矢量原子相同的清理。
- **组件定义**：`list_components` 给出每个组件的部件和实例可覆盖的键（`部件 id/属性 = 定义里的值`），`describe_node` 也能读组件定义里的部件。

- **说明**：服务器的 instructions 是工具指南（`toolGuide`）加上 MCP 的说明；工具指南里有做成能用的产品的顺序（契约、绑定、状态、模拟库、检查），和应用内的智能体看到的一样。
- **提示词**：`guide`（工具指南）、`design_screen`（按一段需求设计一个屏幕，先搭再截图检查）。
- **资源**：`m3e://document/outline`、`m3e://document/screens`、`m3e://document/components`、`m3e://document/data`、`m3e://document/styles`；目录 `m3e://catalog/parts`、`kits`、`templates`、`looks`、`icons`；模板 `m3e://screen/{id}/outline`、`m3e://screen/{id}/screenshot`、`m3e://node/{id}`、`m3e://part/{slug}`。文档资源可以订阅，改动后会收到通知。

<!-- tools:start (bun run mcp:docs) -->

共 176 个工具：服务器环境里没有 OPENAI_API_KEY 时不含“生成”组，只读会话只列出“只读”一栏为“是”的，`undo`、`redo`、`export_product` 只在文件模式里有。说明取自工具给模型看的描述。

| 工具 | 组 | 只读 | 需作者确认 | 说明 |
| --- | --- | --- | --- | --- |
| `get_outline` | 读取 | 是 |  | The document as a compact outline: title and style, components, collections and variables, then each screen and the tree of its parts, one line each (id, part, name, position and … |
| `list_screens` | 读取 | 是 |  | Every screen: id, name, size, how far it scrolls, background, what it is for, which screen it is another size of, and how many parts stand on it. |
| `find_nodes` | 读取 | 是 |  | Finds parts that match everything given: on a screen, of a part slug, tier or category, with a name or shown words containing `name` / `text` (case-insensitive). |
| `describe_node` | 读取 | 是 |  | Everything about one part (also one inside a component's definition, with its overrideKeys; or a component by its id): what it is, its screen and bounds, its group's fields, its p… |
| `get_selection` | 读取 | 是 |  | What the author has selected in the editor: the parts (the last one is the one the panel shows) and the selected screen. |
| `list_parts` | 读取 | 是 |  | The catalog of parts: atoms (box, text, icon, svg, image, button, input… compose them in boxes) and ready-made composites. |
| `describe_part` | 读取 | 是 |  | One part (or kit) of the catalog in full: its tier and category, default size, whether it holds parts, has an auto layout or splits into atoms, and each prop with its kind, defaul… |
| `list_kits` | 读取 | 是 |  | Kits: composites built from atoms in nested auto layouts (search bar, list row, prompt box, tab bar…), each composed the way the document's style composes it and re-composed when … |
| `list_templates` | 读取 | 是 |  | Screen and flow templates (sign-in, shop, social, content, tools, games, desktop) that add_template puts on the canvas. |
| `list_styles` | 读取 | 是 |  | The style the document wears (and whether it is held to that style's rules), the built-in style packs modeled on real products (key, name, products), and the document's own custom… |
| `get_style` | 读取 | 是 |  | One style in full (the document's own when no key is given): colors (light and dark roles), faces, shape, icon family, control recipes, how its screens are spaced and composed, an… |
| `look_reference` | 读取 | 是 |  | How to write a part's `look` (its effects: fills, strokes, shadows, glass, text effects, textures…), the look presets with the look each one writes, the color roles fill, textColo… |
| `list_icons` | 读取 | 是 |  | Material Symbols names (snake_case) every icon family draws offline. |
| `list_components` | 读取 | 是 |  | The document's reusable components: id, name, size, the parts in their definition (id:slug "words"), the keys an instance overrides them by (overrideKeys: `partId/prop = the defin… |
| `list_data` | 读取 | 是 |  | The document's data collections (id, name, fields, rows) and prototype variables (id, name, type, starting value). |
| `screenshot` | 读取 | 是 |  | A picture of a screen (or of one part, cut out of its screen) as the app draws it, to check your work by eye: alignment, spacing, overflow, contrast, anything missing. |
| `get_api` | 读取 | 是 |  | The API section in a few lines: title and servers, auth (schemes, default security, the login and refresh endpoints), every model with its fields (name? |
| `describe_endpoint` | 读取 | 是 |  | One endpoint in full: the OpenAPI operation as stored (parameters, requestBody, responses, security, pagination), its parameters with references followed, the security that applie… |
| `describe_model` | 读取 | 是 |  | One model in full: its JSON Schema, its fields as rows (name, type, required, format, enum, description, example), the TypeScript type it becomes, where it is used (models, endpoi… |
| `get_spec` | 读取 | 是 |  | The API written as a standard file: openapi (OpenAPI 3.1 YAML, the HTTP endpoints), asyncapi (AsyncAPI 3.0 YAML, the realtime channels) or typescript (the models as TypeScript typ… |
| `get_mocks` | 读取 | 是 |  | The mock library in a few lines: seed, locale, latency, sign-in; how each operation is answered (list, get, create, update, delete, singleton, upload, download, login…, the model … |
| `list_mock_records` | 读取 | 是 |  | The records the mocks have for a model, pinned ones first, as the app would get them (files shortened). |
| `try_mock` | 读取 | 是 |  | Calls the API the way the app would, answered by the mocks on a fresh session (what one call makes, the next sees: create then list), with no waiting: each call by operationId wit… |
| `list_capabilities` | 读取 | 是 |  | The platform capabilities (payment, sign-in with another service, location, scanning, push, share, clipboard, links, files, analytics, biometrics, calls; the views of a map, a cam… |
| `describe_bindings` | 读取 | 是 |  | How a screen is bound to the API: its params and sign-in, each data source (endpoint, params, paging, and the paths it offers: data.&lt;name>.items[], value fields), its regions w… |
| `sample_colors` | 读取 | 是 |  | Measures the colors of a picture: an attached reference (ref1…) or a screen or part of the canvas. |
| `compare_to_reference` | 读取 | 是 |  | Holds a screen of the canvas against the reference picture it copies: draws the screen, hands back both pictures (the reference first), and lays them over each other in a grid, gi… |
| `apply_ops` | 搭建 |  | 含破坏性操作时 | Runs many operations as one change: all of them or none (if any fail, the document stays as it was and the error lists each one that failed and why: fix only those), one undo step. |
| `set_title` | 搭建 |  |  | Sets the app's name. |
| `set_brief` | 搭建 |  |  | Sets the brief: what the app is for, in the author's words; it goes into the prompt. |
| `set_prompt` | 搭建 |  |  | Sets the prompt's fields: title, brief, promptEdit (the prompt as rewritten by hand; null for the generated one), promptOptions (the guidance lines; null for the default set). |
| `set_theme` | 风格 |  |  | Changes the theme: dark, contrast (standard, medium, high), shape (none, square, soft, rounded, full), font, displayFont, motion, icons, recipes, emphasized, bothModes. |
| `apply_style` | 风格 |  |  | Puts one of the style packs on the document ("" for Android's Material 3), or one of the document's own styles by its custom: key: its colors, shapes, faces, icons and control rec… |
| `set_custom_styles` | 风格 |  | 是 | Replaces the document's own styles (custom styles, each with a custom: key). |
| `add_custom_style` | 风格 |  |  | Adds a custom style to the document's own styles, or replaces the one with its key, validated like a style file: roles as #RRGGBB with contrast checked, faces, icon families, shap… |
| `set_icon` | 搭建 |  |  | Keeps an SVG drawing as one of the document's own icons, named svg:&lt;id>: it then goes wherever a part takes an icon name (an icon atom's name, a button's or a list row's icon, … |
| `remove_icon` | 搭建 |  | 是 | Takes one of the document's own icons away. |
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
| `set_item` | 搭建 |  |  | Changes a part's own fields: props, fill, textColor, corners, look, note, action/actions, bind, slot (true or a component name such as "BuyButton": the exported apps draw the part… |
| `set_props` | 搭建 |  |  | Sets prop values of a part (checked against its PropDefs); null resets one to its default. |
| `set_rows` | 搭建 |  |  | Gives a list prop of a part its rows (a navigation bar's tabs, a menu's entries…), in order: each {label, icon?…}. |
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
| `split_retired` | 搭建 |  |  | Splits the retired parts (inventory, task-row, pull-to-refresh, cart-list, contact-list, comment-list, notification-list, settings-group, todo-list, auth-form, chat-composer, resi… |
| `set_split` | 搭建 |  |  | Sets a split view's design: split (the first pane's share, 0–100, of the room the divider leaves) and collapsed (its folding pane starts folded; the pane that folds is its `collap… |
| `convert_to_split_view` | 搭建 |  |  | Turns a legacy resizable into a split view (two panes that hold parts): the same size, orientation and share; the parts lying over each panel (by their centre) move into that pane… |
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
| `edit_component` | 搭建 |  |  | Changes the parts inside a component's definition (after make_component they live there, not on the screen): runs operations on it as if it were open on a screen of its own, namin… |
| `add_collection` | 数据与交互 |  |  | Adds a data collection: named fields and rows of text (one cell per field). |
| `update_collection` | 数据与交互 |  |  | Changes a data collection's name, fields or rows, or the API model it is linked to (model; null unlinks it). |
| `remove_collection` | 数据与交互 |  | 是 | Removes a data collection; layouts that repeated it stop repeating. |
| `set_repeat` | 数据与交互 |  |  | Makes a container with an auto layout draw its first child once per row of a collection ({collection}), or once per element of a list an expression reads ({data: "data.products.it… |
| `add_var` | 数据与交互 |  |  | Adds a variable: type text, number, bool or color (a role such as primary or a hex), with its value in the first mode of its collection (values: what it is in the other modes, by … |
| `update_var` | 数据与交互 |  |  | Changes a variable's name, type, value (in the first mode of its collection), its values in the other modes (values, by mode id or name), its collection, or whether it drives the … |
| `remove_var` | 数据与交互 |  | 是 | Removes a variable; props bound to it are unbound. |
| `add_var_collection` | 数据与交互 |  |  | Adds a collection of variables with the modes its variables have values in (names such as Light and Dark; one mode when left out). |
| `update_var_collection` | 数据与交互 |  |  | Renames a collection of variables, gives it its modes (each {id, name}; one without an id is new, one left out is removed with its values, and the first is the one whose values ar… |
| `remove_var_collection` | 数据与交互 |  | 是 | Removes a collection of variables and every variable in it; what was bound to them is unbound. |
| `set_var_mode` | 数据与交互 |  |  | Chooses the mode of a variable collection the document shows (or one screen shows, over the document's choice), by mode id or name; null goes back to the default (a screen follows… |
| `set_action` | 数据与交互 |  |  | Sets what a tap on a part does, or what runs on one of the outlets it declares (describe_node lists them): a place, slot "tab:0" or "icon"; a family of places, slot "tab:*", one a… |
| `bind_prop` | 数据与交互 |  |  | Binds a prop of a part to a variable: it is bound to the expression that reads it ("=vars.&lt;name>"), which an input writes back to as it is used (bind_expression binds any other… |
| `reorder_panes` | 搭建 |  |  | Puts a dock's tabs in a new order; what each tab holds follows it. |
| `add_model` | 数据与交互 |  |  | Adds a data model: a named JSON Schema 2020-12 (usually an object: {type: "object", properties: {id: {type: "string", format: "uuid"}, email: {type: "string", format: "email"}, av… |
| `update_model` | 数据与交互 |  |  | Changes a model: its whole schema, or some of its properties (by name: a schema, or null to remove it; a new one goes last, a changed one stays in its place), its required list, i… |
| `rename_model` | 数据与交互 |  |  | Renames a model; every reference to it (other models, endpoints, channels) and the data collections linked to it follow. |
| `remove_model` | 数据与交互 |  | 是 | Removes a model. |
| `add_endpoint` | 数据与交互 |  |  | Adds an HTTP endpoint (an OpenAPI 3.1 operation). |
| `update_endpoint` | 数据与交互 |  |  | Changes an endpoint: its method, path (path parameters follow), words, tags, parameters (the whole list), body, responses (by status; null removes one), security, pagination; rena… |
| `remove_endpoint` | 数据与交互 |  | 是 | Removes an endpoint; the auth stops naming it as the login, refresh or logout. |
| `set_auth` | 数据与交互 |  |  | Sets how the app signs in: security schemes by name (an OpenAPI Security Scheme, null removes one), the default security every endpoint needs, and the endpoints that sign in (logi… |
| `add_channel` | 数据与交互 |  |  | Adds a realtime channel (AsyncAPI 3.0): an address on the realtime server with {params}, the messages that go over it, and its operations from the back end's side: action "send" i… |
| `update_channel` | 数据与交互 |  |  | Changes a channel: its address (parameters follow), words, transport, parameters, messages or operations (each list whole, in place of the one there); rename gives it another id. |
| `remove_channel` | 数据与交互 |  | 是 | Removes a realtime channel with its messages and operations. |
| `set_servers` | 数据与交互 |  |  | Sets the environments the API runs in, all of them: [{env: "dev", url: "http://localhost:3000"}, {env: "staging", url: "https://staging.example.com/v1"}, {env: "prod", url: "https… |
| `set_api_info` | 数据与交互 |  |  | Sets the API's title, version and description (OpenAPI info), and the tags endpoints are grouped by, with words about each (the whole list). |
| `import_openapi` | 数据与交互 |  |  | Imports an OpenAPI 3.1 or 3.0 document (YAML or JSON): models from components.schemas, endpoints from paths, security schemes, servers, tags. |
| `import_asyncapi` | 数据与交互 |  |  | Imports an AsyncAPI 3.0 document (YAML or JSON): channels with their messages and operations, models from components.schemas, the realtime URLs of its servers. |
| `set_mocks` | 数据与交互 |  |  | Sets the mock library's settings: seed (the same seed, the same made-up data), locale (zh, en, ja, ko: names, words, addresses, phone numbers), scenario (the scenario the preview … |
| `set_mock_model` | 数据与交互 |  |  | Sets how a model's mock records are made: count (how many records, pinned ones included; null for the default 24), hints by field path ({"name": {kind: "personName"}, "price.amoun… |
| `pin_mock_records` | 数据与交互 |  |  | Pins records of a model by hand: they come first in its mock data, exactly as written (the rest are made up). |
| `unpin_mock_records` | 数据与交互 |  | 是 | Takes pinned records of a model away: those with these ids, or all of them. |
| `add_mock_scenario` | 数据与交互 |  |  | Adds a named scenario the app can be previewed in: e.g. |
| `update_mock_scenario` | 数据与交互 |  |  | Changes a scenario: its name, words, what every operation does (all), how single operations answer (ops: merged by operationId; null removes one), latency, error rate, record coun… |
| `remove_mock_scenario` | 数据与交互 |  | 是 | Removes a scenario. |
| `add_mock_file` | 数据与交互 |  |  | Adds a file to the mock library: a picture, a PDF, audio, video or any other file, as a data URL (data:&lt;type>;base64,…, up to about 12 MB). |
| `generate_mock_files` | 数据与交互 |  |  | Makes placeholder files for the mock library without a model. |
| `update_mock_file` | 数据与交互 |  |  | Renames a file of the mock library or changes its tags. |
| `remove_mock_file` | 数据与交互 |  | 是 | Removes a file from the mock library; hints that named it no longer do. |
| `set_mock_realtime` | 数据与交互 |  |  | Adds or replaces (by id) a realtime script: the messages the server sends over a channel, each at a time in ms after it starts, e.g. |
| `remove_mock_realtime` | 数据与交互 |  | 是 | Removes a realtime script. |
| `set_mock_auth` | 数据与交互 |  |  | How signing in behaves in the mocks: signedIn (true by default: secured calls work without a token; false: 401 until the app signs in), accept (the credentials the login endpoint … |
| `set_mock_route` | 数据与交互 |  |  | Says how the mocks answer an operation when its method and path do not say it plainly: kind auto, list, get, create, update, replace, delete, singleton, upload, download, login, r… |
| `fill_mocks` | 数据与交互 |  |  | Fills the mock library for the API in one step: every model's fields get the hint their names, formats and enums say (written down, to change), each listed model a record count, t… |
| `clear_mocks` | 数据与交互 |  | 是 | Takes every mock setting away (hints, counts, pinned records, scenarios, files, scripts): the API is then answered with data made from its schemas alone. |
| `set_mock_capability` | 数据与交互 |  |  | Says how the mock library answers a capability in the preview (and in an exported app's tests or development build that puts its createMockCapabilities in place): in every scenari… |
| `declare_capability` | 数据与交互 |  |  | Declares a platform capability of the product's own, beside the catalog's (list_capabilities): name (dotted, e.g. |
| `remove_capability` | 数据与交互 |  | 是 | Removes a capability the product declared (declare_capability). |
| `use_capabilities` | 数据与交互 |  |  | Says the product uses these capabilities beyond the ones its designs invoke or draw (those count anyway): an event such as push.opened, or one only the code will invoke. |
| `add_data_source` | 数据与交互 |  |  | Makes a screen load data from an endpoint: read as data.&lt;name> (value, items, status, loading, error, hasMore, empty). |
| `update_data_source` | 数据与交互 |  |  | Changes a screen's data source: its endpoint, params, body, when it loads, pull to refresh, paging, page size (null clears one), or its name (rename: the screen's expressions, the… |
| `remove_data_source` | 数据与交互 |  | 是 | Stops a screen loading a data source; what reads data.&lt;name> reads nothing. |
| `set_subscription` | 数据与交互 |  |  | Makes a screen listen to a realtime channel (AsyncAPI) while it is on show, or changes how it does: read as data.&lt;name> (value: the latest message's payload; items: every paylo… |
| `remove_subscription` | 数据与交互 |  | 是 | Stops a screen listening to a realtime channel; what reads data.&lt;name> reads nothing, and its actions on messages go with it. |
| `set_screen_params` | 数据与交互 |  |  | Declares what a screen is opened with (navigation passes them: set_action {params: {productId: "item.id"}}): each {name, type?: string\|number\|boolean, example?}; the screen read… |
| `rename_screen_param` | 数据与交互 |  |  | Renames a param a screen is opened with. |
| `set_screen_auth` | 数据与交互 |  |  | Says a screen needs a session ("required": without one the app goes to the sign-in screen first) or is the sign-in screen ("login": where a 401 and a required screen send the app;… |
| `bind_expression` | 数据与交互 |  |  | Binds a prop of a part to an expression, read in the preview and the exported app: data.&lt;source>.value.&lt;field>, item.&lt;field> inside a repeat over data, params.&lt;name>, … |
| `set_region` | 数据与交互 |  |  | Makes a container with an auto layout a region bound to a data source of its screen: it shows its content when the data is there, and a design of its own while it loads, when it i… |
| `remove_region` | 数据与交互 |  | 是 | Makes a region a plain container again: its state designs are removed with what they hold (keepDesigns: they stay, as content). |
| `set_form` | 数据与交互 |  |  | Makes a container a form for an endpoint's request body ({operationId, params, values, then, catch}), or a plain container again (null). |
| `make_form` | 数据与交互 |  |  | Makes a form for an endpoint's request body in one step: the container given (id) or a new one (on screen, or into a container) becomes the form, and an input for each body field … |
| `bind_field` | 数据与交互 |  |  | Binds an input inside a form to a field of its request body ("email", "address.city"): it fills that field, is checked by the field's schema, and shows its error. |
| `wire_screen` | 数据与交互 |  |  | Wires a screen to an endpoint in one step: a data source for it; for a list endpoint a region repeating a row bound to each element's fields (a tap opens `detail` with its params)… |
| `generate_svg` | 生成（需 OPENAI_API_KEY） |  |  | Draws a custom SVG and puts it on the canvas as a vector (svg) part: a new icon, a logo, an illustration, a decoration nothing in the catalog has. |
| `generate_image` | 生成（需 OPENAI_API_KEY） |  |  | Paints a picture with the image model (about 20–40 s): with `background` and `screen`, it becomes the picture behind that whole screen (its scene, filling the screen under every p… |
| `generate_style` | 生成（需 OPENAI_API_KEY） |  |  | Writes a custom style with the text model, from a description and/or an attached reference picture (ref1…), validated (colors, contrast, catalog recipes, safe CSS), added to the d… |
| `undo` | 文件模式自带 |  |  | Takes back the last change this server made to the project file (one tool call, or one apply_ops batch) and saves the file. |
| `redo` | 文件模式自带 |  |  | Makes the last change undo took back again, and saves the file. |
| `export_product` | 文件模式自带 |  |  | Exports the project as a whole product (an npm workspaces monorepo) into a folder; exporting again never overwrites custom code, see [导出](导出.md). |
| `connection_status` | 服务器自带 | 是 |  | Where this server's calls go, whether an editor tab is paired, and the pairing code when none is. |

<!-- tools:end -->

## 故障排除

| 现象 | 处理 |
| --- | --- |
| AI 说 “No editor tab is connected” | 在编辑器里打开“连接 MCP”，输入配对码。问 AI 调用 `connection_status` 可以看到配对码和状态 |
| 编辑器说“输错的次数太多” | 同一个服务器输错了 8 次，不再接受配对码：重启 MCP 服务器（重启客户端或重新加载它的 MCP 服务器），用新的配对码。不是你输错的，说明本机有网页在试 |
| 编辑器一直显示“正在查找” | 服务器没有启动，或端口被占用（看服务器日志）。用了 `--port` 时，编辑器只找 47831–47834 |
| 日志里有 “Refused a bridge connection from …” | 编辑器不在默认的本机端口上：用 `--origin <编辑器的地址>` 启动 |
| 部署在 https 上的编辑器连不上 | 用 `--origin https://你的地址` 启动服务器；浏览器可能会询问是否允许网页访问本机网络，选允许 |
| 显示 “Another tab is already connected” | 一个服务器只连一个标签页：先在原来的标签页里断开，或关掉它 |
| 截图报错 “need Playwright” | 按上面安装 Playwright 和 Chromium，然后重启服务器 |
| 截图报错 “cannot find the editor's build” | 先 `bun run build` 再 `bun run mcp:build`，或用 `--app` 指向 `dist` 或正在运行的编辑器 |
| 文件模式截图里外部图片是占位，`skipped` 列出了它们 | 默认不加载文档里指向别处的地址。信得过那个来源时用 `--allow-outside https://那个来源` 启动，或让 AI 把图片换成 `generate_image` 画的、项目里的图片 |
| 截图报错 “was not drawn within 60 s” | 这次截图超过了截止时间（常见于加载很慢的外部图片），已经放弃，下一次截图会用新页面。再试一次，或先读大纲 |
| 编辑器说配对码不对，但是刚从 AI 那里拿到的 | 配对码 10 分钟后过期，配对过一个标签页后也会换新：让 AI 再调用一次 `connection_status` 拿当前的码 |
| HTTP 客户端收到 “There is no such session” | 会话一小时没用被关闭了（或服务器重启过）：客户端重新初始化即可 |
| 日志里有 “trusted-editors.json.lock was left by a process that stopped” | 有个服务器在改记住的配对时退出了，留下的锁已被清理，不用处理 |
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
mcp/src/trust.ts        记住的配对：用户配置目录里的 0600 文件、跨进程锁下的读改写、挑战的 HMAC
mcp/src/file.ts         文件后端：DocStore、写回、冲突、确认
mcp/src/fileStore.ts    磁盘上的项目文件和文件夹（ProjectFormat 接口接 lib/core/projectFile.ts、原子写入、改动检测）
mcp/src/inside.ts       只在一个文件夹里读写删：拒绝路上的链接和被替换的文件夹，检查后再核对
mcp/src/render.ts       无头截图：Playwright、提供编辑器构建、/render 页面、请求策略、截止和取消
mcp/src/http.ts         Streamable HTTP：令牌、Host 和 Origin 检查、每个会话一个 Server、会话和请求上限
mcp/src/generate.ts     服务器环境里的生成配置、走代理的 fetch
lib/mcp/protocol.ts     服务器和编辑器之间的消息
lib/mcp/editorBridge.ts 编辑器这一端：查找、配对、记住的客户端、在 store 上运行调用、确认、活动记录
lib/mcp/trusted.ts      编辑器记住的客户端（IndexedDB）和核对服务器的回答
lib/tools/removals.ts   名字不像删除的调用会拿走什么：在文档副本上试运行再比较，结果交给确认
src/editor/useMcpBridge.ts、components/McpPanel.tsx、lib/i18n/mcp.ts   编辑器里的开关、卡片和面板
src/editor/RenderPage.tsx、src/editor/screenShot.tsx   截图：/render 页面和编辑器共用的离屏绘制
```

测试：`mcp/src/*.test.ts`（内存中的 MCP 客户端对文件后端；真实 WebSocket 上的实时连接；HTTP 和它的上限；多个子进程同时改记住的配对文件；真实的符号链接、硬链接和被替换的项目文件夹；模拟浏览器上的截图截止、取消和请求策略）和 `lib/mcp/editorBridge.test.ts`（由测试扮演服务器：排队、检查、确认中取消，断线重连，确认期间文档变化）随 `bun run test` 运行；`e2e/mcp.e2e.ts` 用真实的编辑器标签页配对、改画布、一步撤销，并在文件模式下用渲染页截图，用本地记录服务器验证截图默认不请求外部地址、放行后才请求、挂起和取消的截图不影响下一次，随 `bun run test:e2e` 运行。`bun mcp/live-check.ts --mode file|live` 用真实模型（OpenAI Responses）当客户端的大脑，跑一遍完整流程（需要密钥，不在测试里）。
