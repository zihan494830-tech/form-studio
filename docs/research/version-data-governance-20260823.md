# Form Studio 开发期版本、Mock 数据与验收证据治理调研

日期：2026-08-23
范围：产品合同、数据库迭代、单一 mock 数据源、桌面验收入口、证据身份。本文只给调研结论与建议，不实施代码。

## 结论摘要

Form Studio 当前应采用“一份定义、多个隔离运行副本”，而不是“一份共享可写数据库”：

- 唯一内容源：版本库中的 canonical mock catalog；桌面 demo SQLite 与测试内存均从它物化。
- 桌面 demo：dataset revision 变更时允许替换整套旧 mock；普通重启不重置。
- 自动化测试：每次从同一 catalog 建立隔离副本，不写桌面 SQLite。
- 版本不能只用一个 `v0.27`：至少分产品版本、构建身份、数据库 schema 版本、mock dataset revision、表单合同版本。
- 前端和截图必须显示/记录同一组身份：运行模式、产品版本、Git/构建 revision、dataset revision、ownerAgent、formVersion、URL、时间。

这是当前阶段的低成本做法。无需引入 Flyway、Schema Registry 或完整制品供应链系统；只借用其成熟规则，在现有 Node.js + SQLite 中做最小实现。

## 调研依据

### 1. 产品版本：先声明公共合同，再谈 SemVer

Semantic Versioning 要求先定义公共 API；`0.y.z` 明确表示初始开发期，任何内容都可能变化；发布过的版本内容不得原地修改。它区分不兼容变更、兼容新增和兼容修复。[Semantic Versioning 2.0.0](https://semver.org/)

对 Form Studio 的含义：

- 产品版本使用完整 `0.27.0`，而不是把 `v0.27` 同时当代码、数据和合同版本。
- 目前仍在 `0.x`，可以调整合同，但必须把不兼容变化写明，不能只说“信封形状没变”。
- build metadata 或独立字段记录 Git SHA；不要用产品版本替代精确构建身份。

### 2. 发布身份：每次可验收运行必须有唯一 release/build ID

Twelve-Factor 的 build-release-run 原则把构建、发布配置和运行分开，并要求每个 release 有唯一 ID、发布记录不可原地修改。[The Twelve-Factor App: Build, release, run](https://12factor.net/build-release-run)

对本地开发不必照搬部署平台，但截图和健康接口至少要能回答：“这是哪个代码版本、什么运行模式、用了哪版 mock 数据”。

### 3. 数据库演进：单一迁移源、顺序执行、记录历史与校验和

Flyway 的版本化迁移把 schema/data 变更纳入版本控制、按顺序应用；schema history 记录已应用版本、状态与 checksum，用于发现漂移。Repeatable migration 在内容 checksum 变化时重跑，官方列出的用途包括批量 reference data 重建。[Flyway Migrations](https://documentation.red-gate.com/fd/migrations-271585107.html)；[Schema history table](https://documentation.red-gate.com/flyway/flyway-concepts/migrations/flyway-schema-history-table)；[Repeatable migrations](https://documentation.red-gate.com/fd/repeatable-migrations-273973335.html)

对 Form Studio 的含义：

- SQLite schema 版本与 mock dataset revision 是两个轴，不能混用同一个 `PRAGMA user_version`。
- schema 变化走不可变、递增迁移；开发 mock 内容可按 catalog checksum/revision 重建。
- 运行库必须记录已物化的 dataset revision，才能判断是否需要同步，而不是靠“表是否为空”。

### 4. Seed/fixture：集中定义、显式初始化，避免普通业务路径偷偷改库

EF Core 官方把 seeding 定义为数据库初始化，推荐集中在一个明确入口并使用迁移锁；同时警告不要把初始化逻辑混入正常应用执行，以免多实例并发和权限问题。[EF Core Data Seeding](https://learn.microsoft.com/en-us/ef/core/modeling/data-seeding)

Django 官方允许用迁移或 JSON/YAML/XML fixture 提供初始数据；fixture 每次重载会覆盖此前对相同行的修改，并用于建立一致测试环境。[Django: How to provide initial data](https://docs.djangoproject.com/en/5.2/howto/initial-data/)

对 Form Studio 的含义：

- 当前四张已确认是 mock，可在一次明确的 dataset 升级中替换。
- 不应在每个 HTTP 请求或每次普通启动无条件覆盖；应由 launcher/init 阶段按 revision 决定是否同步。
- 同步需要在 UI 启动前完成，并整体重置 agents、submissions、outbox、本地投递，防止新页面混入旧提交。

### 5. “一个数据源”不等于“测试与桌面共用一个可写库”

Flyway 将“一份迁移项目作为 source of truth、各目标数据库从它得到一致状态”列为核心原则。[Flyway fleet rollout core principles](https://documentation.red-gate.com/flyway/deploying-database-changes-using-flyway/rolling-out-updates-from-a-single-schema-to-multiple-production-databases)

Playwright 明确要求测试隔离，并特别建议并行测试使用各自后端数据，避免同时创建或编辑同一记录产生竞态。[Playwright Best Practices](https://playwright.dev/docs/best-practices)；[Playwright Parallelism: Avoiding shared state](https://playwright.dev/docs/test-parallel)

因此建议：

- “一份数据来源”＝一份 canonical catalog。
- “两个物理副本”＝demo SQLite 与 test in-memory，它们都是可丢弃派生物。
- 让测试直接写桌面 SQLite 不属于统一，属于共享可变状态，会降低可复现性。

### 6. 表单合同：版本必须绑定完整语义快照

Confluent Schema Registry 的 schema evolution 做法是：每版 schema 有唯一 ID/递增版本，在接受新版本前按 backward/forward/full 规则检查兼容性；不兼容类型变化需要协调升级或新建 schema subject。[Confluent Schema Evolution and Compatibility](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html)

对 Form Studio 的直接映射：

- `ownerAgent + formVersion` 必须定位到不可变完整 form definition，而不只是值信封。
- 历史 submission 必须按自己的 `formVersion` 解读字段语义；定义缺失时显式失败或降级，不能拿当前草稿猜。
- `form-ledger/v1` 的兼容政策需要写清楚：当前若允许不兼容变更，应明确为 Alpha/`0.x`，而不是用 append-only 信封替代兼容性声明。

### 7. 证据标识：版本、环境和实例身份应可机器读取

OpenTelemetry 的资源语义约定把 `service.version` 等版本属性定义为识别具体制品的精确字符串，可以是 SemVer、Git hash 或构建使用的其他版本串，并单独描述 deployment environment。[OpenTelemetry Resource Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/resource/)

Form Studio 不必接入 OTel，但可以沿用字段含义。

## 建议的 Form Studio 最小规范

### 五个独立版本轴

| 轴 | 示例 | 什么时候变化 | 用途 |
|---|---|---|---|
| `productVersion` | `0.27.0` | 产品能力发布 | 人类沟通与路线图 |
| `runtimeRevision` | Git short SHA | 代码构建变化 | 精确确认当前运行代码 |
| `schemaVersion` | `1` | SQLite 表结构变化 | 数据库迁移 |
| `datasetRevision` | `mock-v0.27.1` | canonical mock 内容变化 | demo/test 内容一致性 |
| `formVersion` | `2` | 某 ownerAgent 发布新定义 | 历史信封语义解释 |

不要把其中任意两个合并成一个数字。

### Canonical mock catalog

唯一文件应同时包含：

```json
{
  "schema": "form-studio-mock-catalog/v1",
  "datasetRevision": "mock-v0.27.1",
  "defaultScenario": "financial-grid-v027",
  "agents": []
}
```

规则：

1. catalog 进入 Git，是内容真相源。
2. demo SQLite 和 test in-memory 只通过同一个 loader 读取它。
3. demo 数据库记录已经应用的 `datasetRevision` 与 catalog checksum。
4. revision 相同：普通启动不覆盖当前编辑。
5. revision 不同且数据库只处于 mock 等级：初始化阶段整体重建。
6. 测试每次 reset 回 catalog 基线；绝不连桌面 SQLite。

### 何时停止自动覆盖

出现任一条件，立即把 demo reset 从自动改成显式确认或拒绝：

- 存在 `sourceSystem != local-fixture/form-studio-mock` 的记录；
- 提交已被用于真实业务判断；
- 运行模式为 product；
- 用户把某页面标记为需保留的开发草稿。

当前四页已由用户确认全是 mock，因此本次替换符合边界。

### 统一验收入口

桌面快捷方式应进入同一 demo 服务并默认打开 catalog 的 `defaultScenario`。UI 顶部显示：

`DEV MOCK · Form Studio 0.27.0 · data mock-v0.27.1 · build 8f923d0`

健康接口和截图 manifest 返回同一组字段：

```json
{
  "application": "form-studio",
  "mode": "demo",
  "productVersion": "0.27.0",
  "runtimeRevision": "8f923d0",
  "datasetRevision": "mock-v0.27.1",
  "defaultScenario": "financial-grid-v027"
}
```

每份视觉证据再加：`ownerAgent`、`formVersion`、URL、viewport、capturedAt、截图 SHA-256。测试截图必须标 `mode=test`，不得冒充桌面 demo 验收。

## 可行性与成本判断

当前不建议引入 Flyway、Liquibase、Schema Registry 或 OpenTelemetry SDK：项目只有一个本地 Node 进程和 SQLite，引入这些系统的成本大于收益。

建议只实现它们的最小原则：

- 一个 catalog loader；
- 一个 dataset revision/checksum 记录；
- 一个显式初始化器；
- 一个 UI/health provenance 标识；
- 两个隔离物化目标（SQLite、内存）；
- 一个 visual evidence manifest。

升级触发条件：第二个持久环境、多人并行改数据库、真实用户数据、外部 consumer 或正式发布流水线出现时，再引入完整迁移工具和制品 provenance。

## 仍存在的行业空白与项目机会

通用工具通常分别管理代码 release、数据库 schema 和事件 schema，但很少直接覆盖“可视化表单定义 + 历史 submission 语义 + 截图验收身份”的联动。Form Studio 可以把 `runtimeRevision + datasetRevision + ownerAgent/formVersion` 做成轻量的一体化证据标识。这比单纯保存截图更有产品价值，也正好回应当前“打开前端却看不到更新”的根因。
