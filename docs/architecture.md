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
| `src/infrastructure` | 可替换仓储、Poffices 只读身份适配、条件式运行时调用适配和持久化 IO | UI 文案、页面渲染、Poffices 配置写入 |
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

字段规范化、发布与 `formVersion` 规则位于 domain/application；agent repository 管设计对象，submission repository 独立管理提交记录并在同一事务保存 agent 输入 outbox 事件，`submission-aware-agent-repository` 只把记录投影成兼容的逻辑 `inputBag`。每次发布把规范化 composite definition 追加到 `publishedDefinitions[formVersion]`，当前 `published` 只是使用面指针；历史提交必须按信封版本解析，找不到定义就 fail explicit，不拿草稿猜。`grid` 只由 domain 的 `expandFields()` 产生执行 leaf fields；渲染、提交校验、mapping 与投影消费同一展开结果。DOM 抽取器是另一条 conformance path：它从原生表头 / 控件重建 definition，再用 domain 展开结果交叉核对，不读取隐藏 JSON。`/fixture/exercise-1` 与 `/api/test/reset` 只有显式 `--test-mode` 才动态注册。

`form-ledger/v1` 的 Draft 2020-12 schema 由 [Ajv](https://ajv.js.org/json-schema.html) 在合同测试中实际编译执行。当前将其标为 internal Alpha，是阶段性兼容拍板，不是“v1 可以永久原地改义”；接入首个外部 consumer 前必须冻结兼容政策，破坏性语义变化另开版本。

## 依据和暂不上项

- Node 官方把明确入口和封装边界作为 package 接口治理手段；本仓目前是单一私有应用，先用目录和结构门禁，不急着发布多 package 或 monorepo：[Node.js Packages](https://nodejs.org/api/packages.html)。
- 文档采用“用途分离”而不是复制正文：`DESIGN.md` 解释产品，架构文档描述机器结构，测试文档指导工作。这对应 Diátaxis 对 explanation / reference / how-to 边界的区分：[Diátaxis](https://diataxis.fr/start-here/)。

最小 repository port 和用例注入已经建立。升级触发条件：只有出现独立部署单元、第三种适配器或明确的多包复用需求时，才评估显式 interface package、package `exports` 或 workspace。当前不上依赖注入容器、DDD 全套、monorepo。

`owner-agent-binding/v1` 已作为 domain 合同落地，与已发布版本一起保存在本地 agent 记录中。使用面和提交用例都通过 `activePublishedBinding()` 复核主人、表 id 和发布版本。Poffices 身份 infrastructure 只提供 `getById`；按产品边界不设计 save、publish、unpublish 或官方入口映射端口。未来的运行时调用 adapter 也只能 invoke / 读取本次 run，不得复用为配置写入。

## 从本地演示到真实使用的数据链路

3A 已把提交从 agent JSON 拆到独立 submission 表；原信封、服务端 actor context、tenant / class scope 和接收时间一起保存。逻辑 `inputBag` 仍可读，但不再是物理真相源。现已抽出 `src/application/read-submissions.mjs`：它只通过 `principal + submission:read + resource` 调用注入的授权适配器，并对列表和详情逐资源复核。现役 HTTP 仍由课堂适配器映射 teacher/class 合同；这不能证明真实登录、多实例共享或真实第二消费者。第 3 段链路如下：

当前使用 Node 内置 `node:sqlite` 和单文件 SQLite；agent 与 submission 共用数据库文件，WAL、`synchronous=FULL` 和严格表结构明确落在适配器。依据 [Node.js SQLite](https://nodejs.org/api/sqlite.html) 与 [SQLite Atomic Commit](https://www.sqlite.org/atomiccommit.html)。这是当前单机规模的低档位选择；`node:sqlite` 仍会给出实验性警告，若运行时兼容性成为部署阻碍，再评估成熟驱动或外部数据库。

```text
学生用户页面
  -> SubmitToAgent 用例
     -> 持久 SubmissionRepository ----> 老师查询投影 / 统计
     -> 同事务 Outbox
          -> 幂等 Relay
               -> AgentInputPort
                    -> Poffices 运行时调用 adapter（仅在正式输入合同存在后）
```

- `SubmissionRepository` 保存原提交信封以及可验证的学生、班级 / 租户归属；老师界面读取投影，不直接抓浏览器或内存对象。
- 提交信封和待投递事件必须一起落盘，避免“老师看见了、agent 没收到”或反过来的双写裂缝。该选择属于 Transactional Outbox 谱系，参考 [Microsoft Transactional Outbox](https://learn.microsoft.com/en-us/samples/azure-samples/cosmos-db-design-patterns/transactional-outbox/)；当前数据量先用同库表和后台 relay，不上消息平台。
- `AgentInputPort` 只接受既有提交信封；它不理解 Variables / Block Diagram，也不改 `values[id]`。当并发量、独立消费者或跨服务隔离成为实测瓶颈，再升级为发布 / 订阅中间件；参考 [Azure Publisher-Subscriber pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/publisher-subscriber)。
- Poffices 目前公开材料证明 Creator Studio 可创建、配置、测试和发布 agent，但没有给出本项目可依赖的公开输入 API；参考 [Poffices Creator Studio 介绍](https://poffices.ai/2026/08/11/build-your-own-ai-agent-in-clicks-introducing-poffices-ai-creator-studio/)。因此运行时调用 adapter 是明确升级点，不是假装已完成的接口；Creator Studio 的配置与发布能力不进入 Form Studio。

3A 的“独立 submission 表 + 老师查询投影”已经完成；3B 已按同一 SQLite 增加 outbox 表和单 relay，并先用可审计的本地 `AgentInputPort`（内存 + SQLite 双实现，按幂等键去重）验证机制。增加 Poffices 运行时调用 adapter 的触发条件是正式输入合同和获授权 sandbox trace，权限上限是 invoke / run read；升级消息系统的触发条件则是实测跨进程吞吐或隔离压力。

### 3A 数据与权限边界

`makeEnvelope()` 不再接受客户端身份回退；`submitToAgent` 只采用 actor resolver 给出的已验证 actor，并把其 id 写入既有 `submitterId`。外层 `submission-record/v1` 保存独立记录 id、原信封、服务端确认的 actor context、班级 / 租户 scope 和接收时间；3B 仍消费原信封，不向信封塞角色和租户字段。

组合根现已显式区分 product、demo 和 test：product 不读取本地课堂或 mock catalog，没有正式身份提供方时 fail closed；demo 使用本地演示名单、内存 session cookie 和 SQLite 运行副本；test 使用显式测试 resolver、测试钩子和内存运行副本。demo/test 的页面内容都只经 `canonical-mock-catalog.mjs` 读取 `data/mock-agents.json`，但遵循 Playwright 的隔离原则，不共享可写数据库。demo 在端口监听前由 `synchronize-demo-dataset.mjs` 校验 `datasetRevision + checksum`；升级 revision 时用一个 SQLite 事务整体替换 mock 状态，同版重启不覆盖编辑。后两者验证授权机制，不是 Poffices 登录。联网试点前仍需 Alan / Poffices 明确学生、老师、班级和租户来自登录会话、平台 token 还是受控名单；body、query 或普通自定义 header 永远不能成为生产身份来源。

权限规则已采用“默认拒绝、每次请求按具体资源复核”；老师列表、详情和 student 提交都同时校验 actor、role、ownerAgent、tenant 和 class，并在 repository 查询中带范围条件。该方向依据 [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) 与 [OWASP Multi-Tenant Security](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)。具体认证供应商仍是外部拍板项。

浏览器表面现为三个：`/` 是作者工作台（`public/workbench`），`/a/:ownerAgent` 是通用表单渲染器渲染的已发布用户页面，`/classroom` 是 Frankie 课堂参考应用。旧 `/session` 页面和静态资产已撤下；demo/test 的 profile 与 session API 只供自动进入作者态和显式测试设置身份。作者工作台内部只有「输入表单 / 收到的提交」两层：输入表单以 `/preview/:ownerAgent?mode=design|preview` 作为中央唯一真实画布，右侧上下文属性栏修改当前字段或 grid 行列；960–1279px 属性栏变成 360px 抽屉，960px 以下为工作区全宽属性视图。预览文档以 CSS `zoom` 在 60%–140% 内缩放，Ctrl/⌘ + wheel 与显式按钮共用一份状态，普通 wheel 不被截获。字段 `id` 由 `field-contract-panel.js` 在独立 modal 中投影，默认只读并提供复制；显式修改仍调用原 author-scoped fields API，只更新 draft，不能改写 published 快照或历史信封。真实 `/a/` 提交仍要求 student capability。

作者收件箱不再从兼容 `inputBag` 猜人类名称。`GET /api/agents/:ownerAgent/submissions` 先以 owner author 身份逐资源授权，再由通用 `read-submissions` application 按每条信封的 `formVersion` 读取不可变 definition，投影 `submissionNumber`、字段值和投递状态。definition 缺失时只显示原始字段 ID 并标注不可可靠还原，不借当前草稿或当前发布版补标签。前端主标识只显示「提交 #N」与时间；底层信封及 `submitterId` 不被改写。

历史迁移已显式处理 2C 的嵌入式 `inputBag`：以 legacy key 保证同一信封只生成一条 submission record，成功导入后才清空物理旧袋并标记迁移版本。合同测试证明可重试、不丢、不重复；它不替代真实备份与恢复演练。

### 读取能力与消费者边界

目标上，Form Studio 核心负责稳定的提交读取能力，课堂、CRM 或分析应用可以通过各自 adapter 和 UI 消费；新应用不应要求核心新增应用专属角色、scope 字段或页面分支。作者工作台现已加入 owner-scoped 提交诊断视图：它每次激活都重新读取当前 agent，解决独立用户页提交后工作台快照过期的问题；这不是消费者连接控制台，也不承担课堂/CRM 业务管理。

当前已完成最小读取端口抽取：核心 application 用例不判断 teacher/class，`src/infrastructure/classroom-submission-read-authorizer.mjs` 负责把现有课堂成员关系映射为通用 `submission:read` 请求，`/api/teacher/...` 暂作兼容 HTTP adapter。`agent-access/v1` 与 `submission-record/v1` 仍保留课堂含义，没有被冒充为跨应用通用合同。product/demo/test 已在组合根隔离；测试侧 CRM adapter 以 owner allow-list 和 account scope 证明另一消费者无需修改核心。该探针不是产品 CRM 集成，下一步等待真实消费者证据，不先建设 `AppConnection`、策略引擎或管理控制台。

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
