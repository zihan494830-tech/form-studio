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
| `src/infrastructure` | 可替换仓储、Poffices 只读适配和持久化 IO | UI 文案、页面渲染 |
| `src/presentation` | 把既有合同渲染为 HTML | 改写 agent、追加 inputBag |
| `src/server` | HTTP 路由、JSON/文件传输 | 产品规则和字段发明 |
| `public` | 浏览器资产；前端纯规则放 `modules` | Node 仓储实现、测试夹具 |
| `contracts` | 可机读、带版本的外部合同 | 实现代码 |
| `data` | 本地课堂配置和被 Git 忽略的 SQLite 产品数据 | 产品规格文档、密钥 |
| `tests` | 按证据层分类的回归与夹具 | 生产模块 |

Poffices 外部字段先经 `src/infrastructure/poffices-agent-directory.mjs` 映射为 `owner-agent-identity/v1`，再交给 application。适配事实与升级条件集中在 [`docs/poffices-integration.md`](./poffices-integration.md)；外部响应不得直接变成账本或提交信封。

第 2 段保持三类对象分离：身份合同回答「主人是谁」，`form-ledger/v1` 回答「发布了哪些字段」，`owner-agent-binding/v1` 只回答「哪个本地已发布版本属于哪个只读主人」。绑定规则位于 `src/domain/agent/owner-agent-binding.mjs`，不塞入 Poffices adapter，也不把远端详情复制成本地 agent 本体。`local-shadow-only` 只授权 Form Studio 自己的数据域，不代表 Poffices 写权。作者面信息架构见 [`docs/authoring-experience.md`](./authoring-experience.md)。

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
- 文档检查守的是“产品真相源唯一、文档有归属”，不是一律禁止 `docs/` 下增加专题文档。
- 行数阈值只作职责过载信号；改阈值时同步改脚本和本页即可。

字段规范化、发布与 `formVersion` 规则位于 domain/application；agent repository 管设计对象，submission repository 独立管理提交记录并在同一事务保存 agent 输入 outbox 事件，`submission-aware-agent-repository` 只把记录投影成兼容的逻辑 `inputBag`。生产组合根默认打开 `data/form-studio.sqlite`，测试模式显式注入内存仓储和测试 actor resolver。2A 的真实身份读取器由服务器组合注入，Poffices adapter 只做 IO 与外部字段映射。`/fixture/exercise-1` 与 `/api/test/reset` 只有显式 `--test-mode` 才动态注册。

## 依据和暂不上项

- Node 官方把明确入口和封装边界作为 package 接口治理手段；本仓目前是单一私有应用，先用目录和结构门禁，不急着发布多 package 或 monorepo：[Node.js Packages](https://nodejs.org/api/packages.html)。
- 文档采用“用途分离”而不是复制正文：`DESIGN.md` 解释产品，架构文档描述机器结构，测试文档指导工作。这对应 Diátaxis 对 explanation / reference / how-to 边界的区分：[Diátaxis](https://diataxis.fr/start-here/)。

最小 repository port 和用例注入已经建立。升级触发条件：只有出现独立部署单元、第三种适配器或明确的多包复用需求时，才评估显式 interface package、package `exports` 或 workspace。当前不上依赖注入容器、DDD 全套、monorepo。

`owner-agent-binding/v1` 已作为 domain 合同落地，与已发布版本一起保存在本地 agent 记录中。使用面和提交用例都通过 `activePublishedBinding()` 复核主人、表 id 和发布版本。Poffices infrastructure 仍只提供 `getById`，没有 save/publish/unpublish 端口。

## 从本地演示到真实使用的数据链路

3A 已把提交从 agent JSON 拆到独立 submission 表；原信封、服务端 actor context、tenant / class scope 和接收时间一起保存。逻辑 `inputBag` 仍可读，但不再是物理真相源。老师查询投影只读取获授权范围；这仍不能证明真实登录、多实例共享或 agent 消费。第 3 段剩余链路如下：

当前使用 Node 内置 `node:sqlite` 和单文件 SQLite；agent 与 submission 共用数据库文件，WAL、`synchronous=FULL` 和严格表结构明确落在适配器。依据 [Node.js SQLite](https://nodejs.org/api/sqlite.html) 与 [SQLite Atomic Commit](https://www.sqlite.org/atomiccommit.html)。这是当前单机规模的低档位选择；`node:sqlite` 仍会给出实验性警告，若运行时兼容性成为部署阻碍，再评估成熟驱动或外部数据库。

```text
学生用户页面
  -> SubmitToAgent 用例
     -> 持久 SubmissionRepository ----> 老师查询投影 / 统计
     -> 同事务 Outbox
          -> 幂等 Relay
               -> AgentInputPort
                    -> Poffices adapter（仅在官方输入合同存在后）
```

- `SubmissionRepository` 保存原提交信封以及可验证的学生、班级 / 租户归属；老师界面读取投影，不直接抓浏览器或内存对象。
- 提交信封和待投递事件必须一起落盘，避免“老师看见了、agent 没收到”或反过来的双写裂缝。该选择属于 Transactional Outbox 谱系，参考 [Microsoft Transactional Outbox](https://learn.microsoft.com/en-us/samples/azure-samples/cosmos-db-design-patterns/transactional-outbox/)；当前数据量先用同库表和后台 relay，不上消息平台。
- `AgentInputPort` 只接受既有提交信封；它不理解 Variables / Block Diagram，也不改 `values[id]`。当并发量、独立消费者或跨服务隔离成为实测瓶颈，再升级为发布 / 订阅中间件；参考 [Azure Publisher-Subscriber pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/publisher-subscriber)。
- Poffices 目前公开材料证明 Creator Studio 可创建、配置、测试和发布 agent，但没有给出本项目可依赖的公开输入 API；参考 [Poffices Creator Studio 介绍](https://poffices.ai/2026/08/11/build-your-own-ai-agent-in-clicks-introducing-poffices-ai-creator-studio/)。因此 adapter 是明确升级点，不是假装已完成的接口。

3A 的“独立 submission 表 + 老师查询投影”已经完成；3B 已按同一 SQLite 增加 outbox 表和单 relay，并先用可审计的本地 `AgentInputPort`（内存 + SQLite 双实现，按幂等键去重）验证机制。升级为 Poffices adapter 的触发条件是正式输入合同和获授权 sandbox trace；升级消息系统的触发条件则是实测跨进程吞吐或隔离压力。

### 3A 数据与权限边界

`makeEnvelope()` 不再接受客户端身份回退；`submitToAgent` 只采用 actor resolver 给出的已验证 actor，并把其 id 写入既有 `submitterId`。外层 `submission-record/v1` 保存独立记录 id、原信封、服务端确认的 actor context、班级 / 租户 scope 和接收时间；3B 仍消费原信封，不向信封塞角色和租户字段。

当前生产模式使用 `data/local-classroom.json` 的本地演示名单和内存 session cookie；测试模式使用显式测试 resolver。它们验证授权机制，不是 Poffices 登录。联网试点前仍需 Alan / Poffices 明确学生、老师、班级和租户来自登录会话、平台 token 还是受控名单；body、query 或普通自定义 header 永远不能成为生产身份来源。

权限规则已采用“默认拒绝、每次请求按具体资源复核”；老师列表、详情和 student 提交都同时校验 actor、role、ownerAgent、tenant 和 class，并在 repository 查询中带范围条件。该方向依据 [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) 与 [OWASP Multi-Tenant Security](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)。具体认证供应商仍是外部拍板项。

浏览器面分三条明确入口：`/` 是作者后台，`/a/:ownerAgent` 是已发布用户页面，`/classroom` 是老师最小视图；`/session` 只为本地课堂演示选择 actor。老师 HTTP API 只提供获授权页面列表、提交列表和单条详情，不把 agent repository 或全库 submission 暴露给前端。页面包含加载、空、错误与窄屏状态，但不承担真实认证或完整统计职责。

历史迁移已显式处理 2C 的嵌入式 `inputBag`：以 legacy key 保证同一信封只生成一条 submission record，成功导入后才清空物理旧袋并标记迁移版本。合同测试证明可重试、不丢、不重复；它不替代真实备份与恢复演练。

### 输入能力与字段映射

Form Studio 不能从 agent 名字或内部变量猜运行时请求。下面四份合同均已落地：

| 合同 | 回答什么 | 不负责 |
|---|---|---|
| `owner-agent-identity/v1` | agent 是谁、来源是什么 | 它需要哪些输入 |
| `form-ledger/v1` | 用户页面收哪些稳定字段 | agent 内部怎么跑 |
| `agent-input-profile/v1` | agent 的 skill、输入模式、transport、认证引用和可选 schema | 自动决定页面栏位、保存密钥 |
| `agent-input-mapping/v1` | 某一 `formVersion` 的 `values[id]` 如何映射为目标请求 | 改写原提交信封、静默追随 agent 变化 |

发现顺序：

1. 优先读取平台发布的机器合同，例如 Agent Card、OpenAPI 或 JSON Schema。A2A 的 Agent Card 谱系可声明 identity、skills、输入模式、接口和认证要求；参考 [A2A Protocol Specification](https://github.com/a2aproject/A2A/blob/main/docs/specification.md)。结构化请求约束使用 [JSON Schema Specification](https://json-schema.org/specification)，不自造一套验证语言。
2. 平台没有机器合同时，由 agent 作者人工提供任务说明、必填信息、示例输入、endpoint / SDK、认证方式和成功输出。
3. 静态说明不能替代运行证据；必须在获授权 sandbox 用至少一条成功样例复核。若只接受 `text/plain`，首版 mapper 可显式把多个 `values[id]` 组合为一段版本化文本；这比引入完整 A2A 便宜，也保留以后升级机器发现的路径。

完整 Block Diagram JSON 可用于诊断 block、edge、变量来源、分支和外部依赖，并产出“事实 / 推断 / 未知”清单。它不是 `form-ledger` 的来源；缺少 block 定义、schema/version、外部工具合同和 execution trace 时，不能证明真实运行语义。
