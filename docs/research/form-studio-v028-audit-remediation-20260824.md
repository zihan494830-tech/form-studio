# Form Studio v0.28 外审复核与 v0.29 整改记录

> 状态：已实施并通过统一检查；复核日期：2026-08-24；目标版本：Form Studio `0.29.0`；SQLite `user_version=2`；dataset 保持 `mock-v0.27.1`

## 1. 为什么保留这份记录

这是一份需要长期追溯的外部审核、数据迁移和合同决策记录，不是第二份产品真相源。当前产品定义以 [`DESIGN.md`](../../DESIGN.md) 为准，模块职责和测试规则分别以 [`architecture.md`](../architecture.md) 与 [`testing.md`](../testing.md) 为准。

本轮没有照抄外审。复核方法是：先沿 UI、HTTP、application/domain、repository 与 JSON Schema 逐条定位，再用最低责任层测试和真实 demo 浏览器交叉验证。结论严格区分：

- **已验证：** 源码路径成立，且已有或新增动态测试复现边界；
- **部分成立：** 风险存在，但外审描述的成因、严重度或复现结论不准确；
- **不成立：** 当前平台行为或源码不支持该断言；
- **延后：** 不是已证实缺陷，当前阶段投入价值不足，保留升级触发条件。

## 2. 产品结论：作者页与填写页不是两种“人设”

作者工作台与正式填写页是两种能力不同的 surface，不应由互斥的 `author/student` 角色模拟：

- `/` 是**设计工作台**，需要 `form:author`，负责编辑、发布和读取本表提交；内嵌预览永不产生正式 submission。
- `/a/:ownerAgent` 是**正式填写页**，需要 `submission:create`，负责形成可审计的提交 intent。demo 首次进入时选择参考填写者；product 由外部身份提供方注入可信 principal。
- `/classroom` 继续是 demo/test 课堂参考适配器，不是 Form Studio 核心身份模型。

因此，“必须切到用户页才能提交”本身是正确边界：预览不应把作者试填伪装成正式提交。原设计不合理之处在于把该边界表达成“学生角色”，且单个 cookie 会让作者/填写者互相覆盖。v0.29 把核心授权改为 capability，并为 `authoring` 与 `submission` 建立独立 HttpOnly 会话；同一浏览器已经动态验证可同时显示“课程作者”和“市场研究员林悦”。product 未配置身份提供方时明确返回 `503 identity_provider_unconfigured`，不伪装成普通未登录，也不虚构 Poffices 登录已接通。

## 3. 外审逐项处置

### 3.1 P1 / P2

| 外审项 | 复核结论 | 证据与处置 |
|---|---|---|
| P1-1 属性面板并发保存错写/丢失 | **部分成立** | Chromium 未复现外审所述稳定 P1 时序，但旧实现确实把 DOM target 与提交完成时的当前 selection 耦合。`property-inspector.mjs` 现快照 stable field/grid selection、值与控件类型；失败不吞后续队列。Agent 另增独立 `revision`，作者写入必须 `If-Match`，跨标签页 stale write 返回 412，从存储层消除 lost update。 |
| P1-2 连点产生重复 submission | **已验证** | 单靠禁用按钮不是服务端不变量。填写页增加 single-flight；提交必须使用 UUID `Idempotency-Key`。repository 以 `ownerAgent + principal + intent` 唯一约束：同内容重放返回原记录并标 `replayed:true`，不同内容返回 409。并发 runtime 测试证明只产生一条 submission 和一条 outbox。 |
| P2-1 Enter 连击创建重复 workspace | **已验证风险** | 创建入口增加函数级 single-flight、busy 文案和 `aria-busy`；E2E 双 Enter 只产生一个工作区。 |
| P2-2 `showModal()` InvalidStateError | **不成立（原成因）/部分成立（重复动作）** | 当前 Chromium 下 `showModal()` 不是报告声称的主因；真实缺口是重复监听和发布请求可并发。dialog 现只维护一个 pending promise，发布 busy 在 flush 前建立，确认只发一次请求。 |
| P2-3 生命周期/复制网络失败无反馈 | **已验证** | 归档、恢复、停用、复制均加入 single-flight、busy 与可见错误；状态在 `finally` 恢复。 |
| P2-4 字段 ID 无客户端校验 | **已验证** | 客户端在保存前校验格式、空值和重复 ID并就地提示；服务端仍是最终权威。 |
| P2-5 decimals 软锁与 Escape 不完整 | **已验证** | decimals 在客户端限制为 0–6 整数；Escape 覆盖 input/select/checkbox/textarea 并恢复最近成功值。 |
| P2-6 前一次失败吞掉后续编辑 | **已验证** | 保存队列不再以 `saved === false` 短路后续任务；失败项保留本地内容，后续项仍明确执行或报错。 |
| P2-7 课堂 fetch/非 JSON 失败难理解 | **已验证** | `json()` 捕获网络异常；非 JSON 5xx 保留 HTTP status；授权失败仍回到入口。 |
| P2-8 不校验客户端 `formVersion` | **已验证** | `formVersion` 现必填且必须为正整数；与 published 不一致返回 `409 form_version_conflict` 且零写入。填写页把未提交答案暂存到 `sessionStorage`，加载新版后只恢复仍存在且合法的 ID，并要求重新检查/提交。 |
| P2-9 text/textarea 静默 `String()` | **已验证** | 对象和数组被拒绝；同时拒绝未知字段、非法 option 与非法 number，不再存入 `[object Object]`。 |
| P2-10 JSON Schema 死信、抽取器漂移 | **已验证** | 全部 9 份 schema 由 Ajv 2020 + `ajv-formats` 编译，每份至少校验一份生产对象和一份非法对象。HTML 抽取字段统一经过 `normalizeFields`，重复 option 去重、空 option/非法 ID fail closed。 |
| P2-11 mapping `required` 未校验 | **已验证** | `mapping.fields[].required` 必须是 boolean；schema 与运行时合同一致。 |
| P2-12 legacy 记录可违反 v1 | **已验证** | v1 校验补齐；迁移/导入必须形成完整合法记录。历史 v1 不被重写，v2 读取与 v1 并存。 |
| P2-13 scope `classId/accountId` 漂移 | **已验证** | 不原地改变 `submission-record/v1` 课堂语义；v1 冻结只读。新增 v2：`principal`、`authorization.capability`、`tenantId + attributes`、`submissionIntentId`，可承载 class/account 等适配器 scope。 |
| P2-14 `Boolean("false")` | **条件风险成立** | 尚无证据证明上游实际返回字符串，但原强转会误判。现在只接受 boolean，非法外部合同 fail closed。 |
| P2-15 demo session Map 不回收 | **已验证** | authoring/submission 两类会话都存 `expiresAt`，解析与创建时主动 prune；cookie 与服务端均为 8 小时。 |
| P2-16 JSON body 无上限 | **已验证** | JSON 入口只接受正确 Content-Type；同时检查 Content-Length 和流式累计，默认 1 MiB，超限 413，错误类型 415。 |

### 3.2 流畅性与硬化项

| 外审项 | 复核结论 | 处置 |
|---|---|---|
| F1 保存后全量重渲染 | **已验证** | 非结构属性保存只更新 agent/revision/stage，不重建 inspector；结构变化仍按需要重渲染。 |
| F2 搜索逐键全量重建 | **延后** | 当前数据仅 5 个 mock agent，没有卡顿效果证据；不为理论性能引入额外状态。课堂 actor filter 现有 220ms debounce 保留。升级触发：真实列表达到可测卡顿或 long task。 |
| F3 iframe busy 无超时 | **已验证** | 加入 8 秒兜底并清理竞态。 |
| F4 发布回执跨 agent | **已验证** | 切换 agent/空工作区时清空回执。 |
| F5 过滤后 submissionNumber 变化 | **已验证** | 稳定编号先基于完整追加序列生成，再过滤。 |
| F6 课堂无深链 | **延后** | 它是功能建议，不是正确性缺陷；当前课堂只是参考适配器。真实消费者出现并需要分享链接时再设计。 |
| F7 option 不能含逗号 | **已验证** | 编辑器改为一行一个 option，逗号成为普通字符；持久合同继续是数组。 |
| F8 单引号未转义 | **硬化项成立** | 生产渲染与工作台 escape 均补齐单引号；当前双引号属性下未发现既有可利用 XSS。 |
| F9 busy 文案不足 | **已验证** | 创建、发布、复制、归档、恢复、停用、提交统一 single-flight，按钮有 busy 文案/`aria-busy`。 |
| F10 空名称变“未命名表” | **已验证** | 客户端先 trim 并拒绝空名称；domain 默认仍作最后防线。 |

### 3.3 外审未列出、但本轮确认的共享根因

1. **核心身份耦合课堂角色：** 已由 capability/principal 取代；demo role 只留在参考适配器。
2. **authoring/submission 共享 cookie：** 已拆成两个 audience cookie，切换填写者不覆盖作者会话。
3. **mapping 发布版本漂移会阻断正常提交：** 发布前检查并自动重绑兼容 mapping；不兼容时阻止发布、旧页面继续服务并列出 fieldId/targetKey/reason。启动时也修复兼容历史漂移；遗留不兼容 mapping 不再丢 submission，而是生成 `mapping_review_required` delivery。
4. **跨标签页作者覆盖：** Agent `revision` 与 `formVersion` 分离，所有作者状态变更递增 revision；fields/copy/publish/unpublish/archive/restore 都要求 ETag/If-Match，缺失 428、stale 412，SQLite 在 `BEGIN IMMEDIATE` 中比较后写入。
5. **填写页向工作台 `postMessage("*")`：** envelope 发送和监听均删除；提交页 `frame-ancestors 'none'`，预览只允许 `'self'`。工作台切到提交页签时重新读取服务端真相。
6. **提交响应泄露历史 inputBag：** `submitToAgent` 不再返回 hydrated Agent，只返回当前 envelope、submission ID、replayed 与 delivery。两名不同提交者的 runtime 回归证明第二个响应不含 `agent` 或第一人的值。
7. **born-form ID 并发覆盖：** 新建和 retrofit 都以 `expectedRevision: 0` 条件插入；候选 ID 被另一连接抢先写入时重试，SQLite 双连接回归证明两张表保留为 `form-1`、`form-2`。
8. **未受管 demo 数据误删：** 只有组合根确认数据库文件原先不存在时可传一次性初始化授权；已有但无 canonical metadata 的数据库在自动同步与显式 reset 两条路径都 fail closed。

## 4. v0.29 合同与实现结果

### 4.1 提交 intent

`POST /submit/:ownerAgent` 现在必须同时满足：可信 principal 具有 `submission:create`、UUID `Idempotency-Key`、精确 `application/json`、body 为 `{formVersion, values}`、版本与当前发布版一致、所有字段和值符合发布定义。成功响应不含 Agent 或历史 inputBag；浏览器锁定表单，“再填一份”通过重新载入获得新 intent。

`Idempotency-Key` 是本项目 API 合同，不宣称为正式 IETF 标准。IETF HTTPAPI 草案页在本轮复核时显示该 draft 已于 2026-04 过期；后续若标准化文本变化，应评估 header 语义和错误码，不自动升级。

### 4.2 submission-record/v2

v2 保存：

- `principal: {id, name, verifiedBy}`，不包含课堂角色枚举；
- `authorization.capability = "submission:create"`；
- `scope: {tenantId, attributes}`；
- `submissionIntentId`；
- 原 `envelope: {ownerAgent, formVersion, submittedAt, submitterId, values}`。

读取投影同时接受 v1/v2，作者收件箱和课堂参考页面的 HTTP 形状未改变。`submission-record/v1` 继续是历史只读合同，不再扩写成通用 scope。

### 4.3 HTTP 与浏览器安全

- JSON 默认 1 MiB、Content-Type fail closed；
- 默认 `Cache-Control: no-store`、`X-Content-Type-Options: nosniff`、受限 referrer policy；
- 填写页 CSP `frame-ancestors 'none'`，预览为 `'self'`；
- 正式提交不再通过跨窗口消息回传 envelope；
- product 缺身份 provider 返回明确 503。

## 5. SQLite v1 → v2 迁移记录

迁移仅接受 `form_studio_runtime_meta` 中存在 canonical dataset revision/checksum 的受管 mock。当前数据库迁移前已确认：`user_version=1`、`integrity_check=ok`、5 agents、0 submissions、dataset `mock-v0.27.1`。

执行命令：

```bash
npm run data:migrate
```

结果：

| 项目 | 结果 |
|---|---|
| 备份 | `data/backups/form-studio-schema-v1-2026-08-23T19-07-02Z.sqlite` |
| 备份 SHA-256 | `D4CB641BCC6C54F89BE5677585CADC9563E34DD54C1E7886E73B715526489927` |
| 备份验证 | `user_version=1`、`integrity_check=ok`、5 agents、0 submissions |
| 迁移后验证 | `user_version=2`、`integrity_check=ok`、5 agents、0 submissions |
| 迁移前/后 envelope hash | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` / 相同 |
| dataset | revision/checksum/appliedAt 全部保持不变 |

v2 增加 record version、scope JSON、submission intent/fingerprint 与唯一索引，并扩展 outbox review 状态；历史 v1 row 不重写。

### 回滚

1. 停止 4190 demo，确认没有进程持有数据库；
2. 另存迁移后的 v2 数据库，不直接删除；
3. 用上表 v1 备份恢复 `data/form-studio.sqlite`；
4. 校验备份 SHA-256、`PRAGMA integrity_check`、记录数与 `user_version=1`；
5. 只有同时回退到理解 schema v1 的 v0.28 代码后才启动。v0.29 repository 会拒绝 v1 并提示迁移，不会静默兼容写入。

## 6. 自动与浏览器证据

本轮分层结果：

- Contract：54/54；全部 9 份 JSON Schema 均有生产对象与非法对象证据；
- Runtime：35/35；覆盖双 cookie、503、stale form 零写入、intent replay/conflict、非法值、413/415、mapping rebinding、SQLite 迁移与 stale revision；
- E2E：49/49；覆盖同浏览器双身份、提交锁定/新 intent、旧页兼容答案恢复、双 Enter、预览不提交与 390px 工作区；
- 统一入口：`npm run check` 返回 `structure ok + 138/138 passed`。

迁移后 `/api/health`：`application=form-studio`、`mode=demo`、`productVersion=0.29.0`、`datasetRevision=mock-v0.27.1`、`schemaVersion=2`。

视觉证据脚本成功生成 9 张截图和 SHA-256 manifest：`.learnings/screens/2026-08-23T19-08-54-370Z-manifest.json`。其中 1920px 工作台、1180px 属性抽屉、390px 工作台画布/属性页、1440px/390px 填写页均记录 `pageOverflowX=false`。独立 in-app browser 另确认：

- 宽屏保持中央真实画布与右侧属性栏；预览按钮明确为“设计模式不会提交”；
- demo 填写页先解释并选择演示填写者；选择“市场研究员林悦”后字段才可填写；
- 同一浏览器的设计工作台仍显示“课程作者”，双会话互不覆盖；
- 校准后的 390px 工作台 `innerWidth=390`、document width/scrollWidth 均为 375，无页面级横溢出；填写页同样为 375/375。

## 7. 标准依据、项目拍板与领域空白

采用的外部依据：

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)：每次请求按具体资源校验、默认拒绝；
- [RFC 9110 If-Match](https://www.rfc-editor.org/rfc/rfc9110.html#name-if-match)：用条件请求阻止 lost update；
- [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)：POST 非幂等与 HTTP 条件语义边界；
- [IETF Idempotency-Key draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)：header 设计谱系；当前草案过期，因此只作为参考；
- [WHATWG postMessage security](https://html.spec.whatwg.org/multipage/web-messaging.html#security-postmsg)：避免宽泛 origin 与不必要的跨窗口数据通道；
- [JSON Schema 2020-12](https://json-schema.org/draft/2020-12) 与 [Ajv JSON Schema](https://ajv.js.org/json-schema.html)：schema 编译和格式验证；
- [SQLite Backup API](https://www.sqlite.org/backup.html)：一致性备份边界。

本项目权宜拍板：1 MiB body 上限、8 小时 demo 会话、UUID intent、兼容 mapping 自动重绑、v1 冻结/v2 新建、8 秒 iframe timeout。这些不是行业普适值；真实负载、正式身份 provider、第二个外部消费者或大附件需求出现时应以测量数据重审。

该领域仍有一个明确空白：通用表单/问卷产品通常没有同时覆盖不可变 `formVersion`、Agent input mapping、可重试 submission intent、作者 `revision` 和多消费者 scope。v0.29 选择显式版本与适配器边界，而不是引入连接注册表或通用策略引擎。第二个真实外部消费者出现前，后两者没有足够价值证据。

## 8. 残余边界

- 正式外部身份提供方尚未接入；product 的 503 是诚实边界，不是完成登录。
- 真实 Poffices Agent invoke/run-read 合同与获授权 sandbox trace 仍缺失；本地 `AgentInputPort` 绿灯不能冒充真实投递。
- 搜索性能、课堂深链和 connection registry 没有当前效果证据，明确延后。
- demo 当前 0 submissions；迁移逻辑已由带历史 v1 记录的 runtime fixture 验证，但真实数据上线前仍需独立停服备份/恢复演练。
- SQLite 单机 `BEGIN IMMEDIATE` 已防本地 stale write；多实例/网络数据库不在本轮证明范围。
