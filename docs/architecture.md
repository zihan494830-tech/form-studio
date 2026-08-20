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

字段规范化、发布与 `formVersion` 规则现已位于 domain/application；内存仓储只实现 `list/get/save/appendEnvelope/nextBornFormId/reset` repository port。2A 的真实身份读取器由服务器组合注入，Poffices adapter 只做 IO 与外部字段映射，没有复制发布、账本或提交规则。`/fixture/exercise-1` 与 `/api/test/reset` 已移入 `tests/support`，只有显式 `--test-mode` 才动态注册。

## 依据和暂不上项

- Node 官方把明确入口和封装边界作为 package 接口治理手段；本仓目前是单一私有应用，先用目录和结构门禁，不急着发布多 package 或 monorepo：[Node.js Packages](https://nodejs.org/api/packages.html)。
- 文档采用“用途分离”而不是复制正文：`DESIGN.md` 解释产品，架构文档描述机器结构，测试文档指导工作。这对应 Diátaxis 对 explanation / reference / how-to 边界的区分：[Diátaxis](https://diataxis.fr/start-here/)。

最小 repository port 和用例注入已经建立。升级触发条件：只有出现独立部署单元、第三种适配器或明确的多包复用需求时，才评估显式 interface package、package `exports` 或 workspace。当前不上依赖注入容器、DDD 全套、monorepo。

`owner-agent-binding/v1` 已作为 domain 合同落地，与已发布版本一起保存在本地 agent 记录中。使用面和提交用例都通过 `activePublishedBinding()` 复核主人、表 id 和发布版本。Poffices infrastructure 仍只提供 `getById`，没有 save/publish/unpublish 端口。

## 从本地演示到真实使用的数据链路

当前 `inputBag` 是单进程内存列表，只能证明“校验后追加提交信封”的合同，不能证明多人持久保存、老师权限或真实 agent 消费。第 2 段完成 2C 后，第 3 段按以下端口推进：

第 1b 已经有 `form-1` 这类临时新生 id、发布 URL 和下架行为，因此 2C 的工程目标不是再生成一次 id，而是引入持久 repository：服务重启后同一 agent、草稿、已发布版本、绑定和提交仍可恢复。这是为了消除文档与代码的重复完成定义而作的项目拍板项。

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

当前低档位是“持久库 + outbox 表 + 单 relay”；升级触发条件是正式 Poffices 输入合同、跨进程投递需求或实测吞吐 / 重试压力。这样先打通 Alan 所说的学生提交、老师可见，再把同一信封投递给真实 agent，不为尚未出现的规模提前堆消息系统。

### 输入能力与字段映射

Form Studio 不能从 agent 名字或内部变量猜运行时请求。第 3 段新增的合同边界如下；当前均为待实现设计，不冒充现有能力：

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
