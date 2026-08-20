# 工程架构与管理边界

本文只解释代码放在哪里、依赖能往哪里走。产品定义、必须成立和分期只在根目录 `DESIGN.md` 维护。

## 分层

```text
public ──HTTP──> server ──> application ──> domain
                              │               ▲
                              └─> infrastructure
presentation ────────────────────────────────┘
```

| 目录 | 唯一职责 | 禁止放入 |
|---|---|---|
| `src/domain` | 字段合同、账本抽取、提交信封等纯规则 | HTTP、DOM 工作台状态、mock 文件路径 |
| `src/application` | 编排一个产品用例，如提交到 agent、生成作者面投影 | 监听端口、读静态文件 |
| `src/infrastructure` | 当前阶段可替换的内存仓储和 mock 数据适配 | UI 文案、页面渲染 |
| `src/presentation` | 把既有合同渲染为 HTML | 改写 agent、追加 inputBag |
| `src/server` | HTTP 路由、JSON/文件传输 | 产品规则和字段发明 |
| `public` | 浏览器资产；前端纯规则放 `modules` | Node 仓储实现、测试夹具 |
| `contracts` | 可机读、带版本的外部合同 | 实现代码 |
| `data` | 当前阶段 mock 种子 | 产品规格文档 |
| `tests` | 按证据层分类的回归与夹具 | 生产模块 |

Poffices 外部字段先经 `src/infrastructure/poffices-agent-directory.mjs` 映射为 `owner-agent-identity/v1`，再交给 application。适配事实与升级条件集中在 [`docs/poffices-integration.md`](./poffices-integration.md)；外部响应不得直接变成账本或提交信封。

第 2 段保持三类对象分离：身份合同回答「主人是谁」，`form-ledger/v1` 回答「发布了哪些字段」，待建的 `owner-agent-binding/v1` 只回答「哪个本地金稿属于哪个获授权主人」。绑定合同不得塞入 Poffices adapter，也不得把远端详情复制成本地 agent 本体。作者面信息架构和渐进路线见 [`docs/authoring-experience.md`](./authoring-experience.md)。

依赖规则是本仓拍板项：外层可以依赖内层，`domain` 不反向依赖 `server`、`infrastructure` 或 `public`。第 2 段替换真实 agent 身份时，优先新增/替换 infrastructure 适配器，不改提交信封形状。

## 管理门禁

`npm run check:structure` 当前自动阻止：

- 旧目录重新出现；
- 根目录新增散落 Markdown 或产品设计副本；
- 支持的 `.spec.js/.mjs/.cjs`（不区分大小写）不进入 contract/runtime/e2e 分类；
- 嵌套 `test-results`、源码区 Markdown 或根目录临时文本绕过归档；
- domain/application/infrastructure/presentation 违反声明的静态 import 方向；
- 单个测试文件超过 300 行、单个 JS/MJS/CJS 源文件超过 450 行。

300/450 行是当前规模下的工程拍板项，不是行业定律。触发门禁时应先拆职责；确有理由调整阈值，必须同时修改本文件和门禁脚本，留下原因。

### 覆盖边界

门禁绿色仍不是完整架构证明。当前检查已经由合同测试覆盖大小写/JS 后缀、嵌套 `test-results`、源码区 Markdown 和关键层反向 import；它只分析字符串可确定的静态 import/export 与字面量 dynamic import，不尝试执行代码或理解运行时拼接路径。门禁保护以下语义，而不是无限扩大文件警察：

- 测试文件无论大小写和支持的 JS 后缀，都必须进入已声明测试分类；测试输出目录只允许出现在批准位置。
- `domain` 不得依赖 Node HTTP、server、infrastructure 或 public；application 不得反向依赖 server/public。
- 文档检查守的是“产品金稿唯一、文档有归属”，不是一律禁止 `docs/` 下增加专题文档。
- 行数阈值只作职责过载信号；改阈值时同步改脚本和本页即可。

字段规范化、发布与 `formVersion` 规则现已位于 domain/application；内存仓储只实现 `list/get/save/appendEnvelope/nextBornFormId/reset` repository port。2A 的真实身份读取器由服务器组合注入，Poffices adapter 只做 IO 与外部字段映射，没有复制发布、账本或提交规则。`/fixture/exercise-1` 与 `/api/test/reset` 已移入 `tests/support`，只有显式 `--test-mode` 才动态注册。

## 依据和暂不上项

- Node 官方把明确入口和封装边界作为 package 接口治理手段；本仓目前是单一私有应用，先用目录和结构门禁，不急着发布多 package 或 monorepo：[Node.js Packages](https://nodejs.org/api/packages.html)。
- 文档采用“用途分离”而不是复制正文：`DESIGN.md` 解释产品，架构文档描述机器结构，测试文档指导工作。这对应 Diátaxis 对 explanation / reference / how-to 边界的区分：[Diátaxis](https://diataxis.fr/start-here/)。

最小 repository port 和用例注入已经建立。升级触发条件：只有出现独立部署单元、第三种适配器或明确的多包复用需求时，才评估显式 interface package、package `exports` 或 workspace。当前不上依赖注入容器、DDD 全套、monorepo。

`owner-agent-binding/v1` 尚未实现。实施时应作为 domain/application 合同，由本地 repository 保存；Poffices infrastructure 在当前授权下只读，不新增 save/publish/unbind 端口。
