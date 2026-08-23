# 测试管理规范

测试不是按开发时间无限追加到一个 walk 文件，而是按“证明什么”归档。

## 分类

| 分类 | 路径 | 证明范围 | 命令 |
|---|---|---|---|
| Contract | `tests/contract` | 账本、字段 id/label、渲染/抽取同构 | `npm run test:contract` |
| Runtime | `tests/runtime` | 浏览器校验、提交信封、持久恢复、封闭控件词表 | `npm run test:runtime` |
| E2E | `tests/e2e` | 改装、新生、发布/解绑、作者后台显示与响应式 | `npm run test:e2e` |

共享的 API reset、agent 查询和基准示例读取只放 `tests/support`；手写 HTML/JSON 只放 `tests/fixtures`。Playwright 官方建议把重复 setup 抽为可复用 fixture，使测试按意义分组，而不是按共同 setup 堆在一起：[Playwright Fixtures](https://playwright.dev/docs/test-fixtures)。

## 主证明层清单

同一个行为可以被更高层故事经过，但只能有一个负责诊断失败的主证明层：

| 行为 | 最低责任层 / 主测试 | 更高层只保留什么 |
|---|---|---|
| 字段 ID、控件词表、账本与绑定形状 | Contract | `form-ledger.v1.schema.json` 必须由 Ajv Draft 2020-12 实际编译和验证，不能只读 JSON |
| 字段展开、格子 id 与 radio 选项 / 小数位合同 | `tests/contract/grid-expansion.spec.mjs` | 渲染 / 抽取同构与手写 grid 基准夹具同在 Contract 层 |
| grid / radio 逐格校验、mapping 按格引用、浏览器整表提交 | `tests/runtime/grid-submission.spec.mjs` | number 必须覆盖与浏览器 step 一致的 `1.0` / 尾随零 / 科学计数边界 |
| 工作台表格编辑器、行列按钮、接口面板格子 ID、收件箱小表格 | `tests/e2e/grid-authoring.spec.mjs` | 布局 spec 继续守响应式矩阵 |
| `submission:read`、资源隔离、默认拒绝 | Contract / Runtime | 参考课堂只证明适配后仍能完成故事 |
| submission、outbox、持久化与投递幂等 | Runtime | E2E 只确认浏览器可见结果来自同一记录 |
| 改装 / 新生、草稿隔离、发布 / 下架 | E2E flow specs | 不在布局或 locale spec 重复业务状态机 |
| 工作台两层页签、中央画布/属性栏、抽屉、缩放与溢出 | `tests/e2e/workbench-layout.spec.mjs` | 流程 spec 不再承担响应式矩阵 |
| 字段接口面板、默认只读、主编辑区不位移、ID 修改只进草稿 | `tests/e2e/workbench-layout.spec.mjs` | Contract 继续负责 ID 格式、重复与版本语义 |
| `zh-HK` 消息、错误映射和可访问名称 | `presentation-messages.spec.mjs` + `localization.spec.mjs` | 其他测试只在文案本身是产品合同的时候断言完整句子 |
| 发布定义历史与旧提交解释 | `owner-binding.spec.mjs` + `submission-reader.spec.mjs` | 必须证明旧 `formVersion` 不读取当前草稿 / 当前发布定义；缺失时显式降级 |
| 启动器拒绝复用旧代码 | `server-boundary.spec.mjs` + 启动烟测 | `/api/health` 返回 application / mode / runtimeRevision；端口占用者身份不明时不得终止 |
| Canonical mock 与 demo 同步 | `canonical-mock-catalog.spec.mjs` + `demo-dataset.spec.mjs` | test/demo 从同一 catalog 物化；同 revision 保留编辑、checksum 漂移拒绝、升级时清空旧 mock 状态 |

`workbench-ui.spec.mjs` 保留作者边界说明与跨模块管理流程；响应式和布局已移到 `workbench-layout.spec.mjs`。若一个失败只发生在视觉重排，应先在布局文件定位，不能靠扩大完整流程 E2E 来兜底。

2026-08-23 v0.27 单画布、矩阵视觉收口与开发数据统一后的基线为 `structure ok + 115/115`。数字只是当前测试清单计数；发布定义历史、schema 真执行、step 同构、可访问名称、滚动归属、catalog 同步与验收身份这些具体断言才是证据含义。

### 本地视觉验收

先通过桌面快捷方式启动 demo；需要验收 Git 中的 canonical 基线时，先执行 `npm run demo:reset`，再运行 `npm run visual:local`。截图命令只读连接现有 demo，拒绝 product/test，输出字段/表格选择、70% 缩放、字段接口、抽屉、移动画布/属性视图和用户页宽/窄屏共九张截图，并在同目录写 manifest。manifest 必须包含 `mode`、`productVersion`、`runtimeRevision`、`datasetRevision/checksum`、`ownerAgent`、`formVersion`、URL、viewport、时间与截图 SHA-256。测试模式截图必须明确标 `mode=test`，不能作为 desktop demo 当前数据证据。该边界依据 [Playwright Test Isolation](https://playwright.dev/docs/browser-contexts) 与 [OpenTelemetry version attributes](https://opentelemetry.io/docs/specs/semconv/resource/)。

字段接口信息测试必须同时量测打开前后的字段卡片 `top/height`，不能再用“布局不变”的测试名称却断言高度增加。面板默认态不得出现 textbox；显式修改已发布字段后，草稿 ID 改变而 `published.fields[].id` 保持旧值。

## 定位器与文案规则

1. 验证字段行为时优先使用稳定字段 ID；验证工作区、发布、下架、提交等文案无关动作时，使用 `tests/support/ui-actions.mjs` 中的稳定动作合同或明确 DOM ID。
2. 当测试目标是键盘导航、可访问名称或目标语言本身时，继续使用 `role + accessible name`。不以“全部改成 `data-testid`”换取表面稳定。
3. 完整本地化句子只集中在 presentation / locale 测试；产品边界告知、危险确认等“措辞本身就是行为”的场景可以保留窄范围断言。
4. API、contract 和 runtime 测试断言稳定 `errorCode + parameters + status`，不依赖展示语言。
5. 作者创建的表名、字段 label/options、外部 agent 名称是业务数据，不进入产品消息目录。
6. 黄金 `form.html` 与 `ledger.expected.json` 是独立 Oracle；fixture 用语义 table attributes 表达 grid，不得复制生产渲染器的完整 JSON 声明再自证。

## 新增测试的决策顺序

1. 先判断它证明合同、运行时还是完整用户流程。
2. 在对应目录寻找同一行为文件；同职责才追加。
3. 新行为拥有独立生命周期或原文件接近 300 行时，新建命名明确的 spec。
4. 不为同一事实在三层重复测试；E2E 只保留跨模块、浏览器可见的关键路径。
5. 修复缺陷时先写能复现根因的最低层测试，再保留最多一条必要 E2E。

## 交付标准

```bash
npm run check
```

结构绿和当前完整行为回归缺一不可。单独某个分类绿色只能说明该层，没有资格替代完整检查。测试数量会随合同变化，不把某个数字写成永久目标；每条测试必须能回答“它守住 DESIGN.md 的哪条合同或哪次已证实缺陷”。

## 第 2 段边界证据

浏览器 `checkValidity()` 继续证明用户面入口校验；`tests/runtime/server-boundary.spec.mjs` 另外证明绕过浏览器时，服务端仍返回缺必填栏 400、无首页表 409、未知 agent 404，坏 JSON 返回 400：

- application 用例测试证明缺字段提交信封不会写进 `inputBag`。
- HTTP 层证明坏 JSON 是 400、测试钩子在非测试配置下是 404。
- 结构合同测试证明支持的 spec 后缀不能绕过分类，并锁住关键 import 方向。

2A 已新增外部 agent 身份合同测试，冻结“存在 / 不存在 / 无权限 / 外部异常”的映射。测试钩子只服务自动测试，不属于产品 API；普通运行模式不加载夹具处理器，也不注册 reset。

## 2B-A / B / C 已落地证据

2B-A / B / C 按最低责任层保留证据，不把 UI 绿冒充平台对接：

- E2E：起始页只有改装 / 新生两条主路径；候选身份不会与未绑定工作区形成视觉假绑定。
- Contract：`owner-agent-binding/v1` 一表一 agent；Official 可建 `local-shadow-only` 隔离副本；无效身份来源 fail closed；解绑保留历史 `inputBag`。
- Runtime：真实 `ownerAgent` 的本地旁路入口只渲染 `published`；草稿不泄漏；提交信封形状不变并追加入袋。
- 架构：Poffices adapter 只有 `getById`；本地发布、解绑没有可调用的 Poffices 写端口。
- Accessibility / Reflow：身份查询的空、加载、失败状态可读，主路径可键盘完成；两层页签、设计/预览和属性页签有选中态与方向键行为，宽屏中央画布/属性栏、中屏抽屉和窄屏全宽属性视图均无页面级水平溢出。

以上已由 `owner-binding.spec.mjs`、`workbench-ui.spec.mjs`、`workbench-layout.spec.mjs`、`agent-entry.spec.mjs` 和 `submission.spec.mjs` 覆盖。它们只证明本地改装机制。Poffices agent 配置、发布或官方入口写端口一旦进入仓库，属于架构回归；不能用新增测试把它包装成已授权功能。

## 2C 已落地证据

`tests/runtime/persistence.spec.mjs` 使用临时 SQLite 文件启动本地 HTTP 服务，完成新生、编辑、发布、继续改草稿和提交后关闭服务；再以同一数据库重启并验证：

- 同一 `ownerAgent` 和 `/a/:id` 路径仍存在，新生编号继续递增；
- 草稿字段不会泄漏到已发布用户页面；
- 绑定、发布版本与历史 `inputBag` 一致恢复；
- 下架后再次重启仍返回 404，但历史提交不丢。

临时数据库在测试结束后删除；生产 `data/form-studio.sqlite` 不参与 reset，也不是测试夹具。该测试证明单机跨重启持久性，不证明多实例并发、用户鉴权、老师权限或 Poffices agent 已收到输入。

## 3A 已建立证据

3A 不以“老师页面能打开”作为单独完成证据，现已按三刀建立最低层测试：

1. **3A-A：** 同一提交只形成一条 submission record；原信封不变；既有 `inputBag` 迁移可重试且不丢、不重复；能按 `ownerAgent`、actor、scope 和时间查询。
2. **3A-B：** body 中伪造 `submitterId`、角色或租户不能改变服务端 actor context；未登录、跨班级、跨租户和无老师权限默认拒绝；每个读写请求都检查具体资源归属。
3. **3A-C：** 获授权老师能看列表和单条 `values[id]`，学生或其他老师不能越权；空态、错误态和窄屏仍可理解。
4. **作者收件箱：** `/api/agents/:ownerAgent/submissions` 只允许该 owner 的 author，按追加顺序返回 `submissionNumber` 并保留审计身份；UI 断言最新在前的「提交 #N」，不把 demo `actorName` 或 `student-*` 当展示文案。

2026-08-20 完整 `npm run check` 为 61/61。另以普通生产本地会话完成合成浏览器故事：选择“学生一”打开 `/a/exercise-1`，提交“星海科技”；再选择“授课老师”进入 `/classroom`，看到同一 `submission-1`、student-1 和五个 `values[id]`。桌面三栏与 390×844 窄屏重排均人工检查。该证据只允许报告“3A 本地机制就绪”，不能报告“学生 / 老师联网 MVP”或“真实 agent 已收到输入”。权限测试方向参考 [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) 和 [OWASP Multi-Tenant Security](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)。

## 3B 已建立证据

3B 已按 `3B-A → 3B-B → 3B-C` 建证（`3B-P` 仅是既有 agent 的外部运行时调用条件项）：

1. `tests/contract/agent-input-config.spec.mjs`：输入 profile 与 mapping 都有版本，只接受已声明的稳定字段 ID；缺字段、未知字段、formVersion / profileVersion 漂移和错控件类型 fail closed；outbox event 保存 submission、mapping 与幂等键。
2. `tests/runtime/agent-input-delivery.spec.mjs`：SQLite 中 payload 无法序列化时 submission 与 outbox 一起回滚；relay 失败可重试，目标按幂等键只消费一次。
3. 同文件：本地 `AgentInputPort` 跨重启按幂等键只保留一份输入，载荷可追溯到同一 submission id、原提交信封和 mapping version；机制证据不标成 Poffices 证据。
4. `tests/e2e/classroom-story.spec.mjs`：学生提交、老师查看、本地 `AgentInputPort` 收件走同一条端到端故事；老师详情显示投递状态与 target。
5. 只有 Poffices 正式 endpoint、最小 invoke / run-read 认证、请求 / 返回 schema 与获授权 sandbox 成功 trace 齐全，才增加并通过 3B-P 外部适配测试；测试不得要求或使用 agent 配置写权。

2026-08-20 完整 `npm run check` 为 69/69。
