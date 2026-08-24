# Form Studio 1.0.0-alpha.1 无角色工作流与版本体系整改记录

> 日期：2026-08-24；产品版本：`1.0.0-alpha.1`；SQLite：`user_version=3`；canonical mock：保持 `mock-v0.27.1`

## 1. 已验证问题与产品拍板

只读源码与数据库证据证明，旧 UI 把内部整数 `formVersion` 当发布次数展示：字段定义保存会推进它，而 `financial-grid-v027` 的内部版本 9 只有 `[1,9]` 两份可证明发布定义，`form-1` 的版本 9 只有 `[7,8,9]` 三份。因此保留整数合同键，但新增发布展示投影：合并 `publishedDefinitions + current published`，按 formVersion 去重升序后映射为 `v1.0、v1.1…`。同定义下架重发不增加；未知定义不猜测。

用户提出的“不区分作者和使用者”在界面层成立，在授权层不能取消。Alpha 1 不再显示角色切换，主流程是编辑、草稿试填、发布、正式填写和管理提交；服务端仍以 `form:author`、`submission:create`、`submission:read`、`submission:manage` 逐资源 fail closed。demo 的两个 HttpOnly audience cookie 自动建立默认会话，product 缺正式 provider 继续返回 503。

提交“编辑”采用原文不可变、可审计修正：管理状态/标签/备注/负责人/归档是独立投影；修正按原整数 formVersion 对应的不可变定义校验，保留原因、操作者和时间。submitter、submittedAt、ownerAgent、formVersion、intent、原 envelope 和既有 outbox 永不覆盖，修正不自动重投 Agent。

## 2. 版本治理与依据

四条对外明确的版本轴：产品 `1.0.0-alpha.1`、发布展示 `v1.x`、内部整数 `formVersion`、SQLite schema 3。后续本地里程碑只推进 `alpha.2/alpha.3`；满足外部合同冻结、非 demo provider、真实 Poffices trace、非 mock 备份恢复和两类真实作者任务前，不称稳定 `1.0.0`。

- 预发布语法：[Semantic Versioning 2.0.0](https://semver.org/)
- 高显著度服务起始行动：[GOV.UK Start using a service](https://design-system.service.gov.uk/patterns/start-using-a-service/)
- 可访问 splitter 键盘模型：[WAI-ARIA Window Splitter Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/)

来源规定了语义和交互基线；`v1.x` 的次版本投影、340/280/520px 边界和 demo 默认身份是当前产品规模下的项目拍板，不宣称为行业标准。

## 3. 实现结果

- Agent、填写页和提交投影返回 `releaseVersion`；正式提交仍发送整数 `formVersion`。
- 工作台画布改为“编辑 / 试填草稿”；草稿试填可输入但无正式 submit。未发布时主行动是发布，已发布无修改时主行动是打开填写页，有修改时是发布更新并保留线上入口。
- demo 自动使用配置中的默认设计与填写身份，提供次要“演示身份详情/更换”入口。
- 提交管理新增详情、management PATCH 和 corrections POST；独立 ETag 缺失 428、过期 412。
- SQLite v3 新增 `submission_management`、`submission_corrections`、`submission_management_audit`，内存 adapter 具备同一端口。
- 收件箱改为列表 + 详情；表单结构折叠，零提交提供填写页 CTA，原始/有效答案与修正历史同时可见。
- 属性栏 splitter 支持 pointer capture、键盘、默认恢复和 localStorage；1280px 以下停用并沿用抽屉/全宽布局。
- UI 显示 `Form Studio v1.0 Alpha 1`；健康接口和视觉 manifest 使用完整 `1.0.0-alpha.1`。

## 4. SQLite v2 → v3 迁移与回滚

迁移命令先检查 `form_studio_runtime_meta`，只接受受 canonical mock 管理的库。使用 SQLite `VACUUM INTO` 建立 `form-studio-schema-v2-<timestamp>.sqlite` 一致性备份，再在 `BEGIN IMMEDIATE` 中建三张管理表和索引，最后核对 submissions 数量与按 sequence/envelope 计算的 SHA-256 未改变、`PRAGMA user_version=3`。v1 测试夹具可直接同样安全地升级到 v3。

回滚必须停服务，恢复记录的来源版本备份，并同时运行理解该 schema 的旧代码；不能单独降低 user_version，也不能用 `demo:reset` 冒充 schema 回滚。

## 5. 验收证据

实施前 dirty v0.29 基线：`npm run check` 为 138/138。最终 `npm run check` 返回 `structure ok` 与 151/151：Contract 59、Runtime 40、E2E 52。新增证据覆盖 `[1,9] → v1.0/v1.1`、`v1.10`、同定义下架重发不升级、英文逗号选项、草稿零写入、正式入口和默认身份、真实 pointer splitter、管理 ETag/权限/归档/恢复/修正不变量及 v1/v2→v3 迁移。

### 实际受管 demo 迁移

| 项目 | 结果 |
|---|---|
| 数据库 | `<repo>/data/form-studio.sqlite` |
| 迁移前身份 | schema 2；`mock-v0.27.1`；checksum `c29d74a0b77f5a294da5a0c267ebe1640dcb86ed0184931680cf7bd7e73bcaf0` |
| 一致性备份 | `<repo>/data/backups/form-studio-schema-v2-2026-08-24T02-01-18Z.sqlite` |
| 备份 SHA-256 | `8240D24189395A81C550D3F57EF41050F85FC5D6AB0845A61CFFFAE51605301C` |
| 迁移前/后 | agents 5/5；submissions 0/0；outbox 0/0；schema 2→3 |
| 迁移前/后 envelope hash | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` / 相同 |
| 新表 | `submission_management`、`submission_corrections`、`submission_management_audit` |

迁移完成后才通过本地浏览器新增一条明确标注的 Alpha 1 验收 submission；这不是迁移产生的数据。随后在工作台把它设为 `in_review`，保存标签、负责人和内部备注，重启 demo 后仍可读取。只读 SQLite 复核为 1 submission、management revision 2、1 management audit、0 corrections；原表单未配置 Agent-input mapping，因此 outbox 为 0，submission 本身已独立持久化。

### 运行与视觉

迁移并重启后的 `/api/health` 返回：`application=form-studio`、`mode=demo`、`productVersion=1.0.0-alpha.1`、`schemaVersion=3`、`datasetRevision=mock-v0.27.1`、`defaultScenario=financial-grid-v027`。本地浏览器完成了草稿试填不提交、正式填写页默认身份、正式提交、收件箱主动刷新、管理资料保存和重启恢复；390px 页面无页面级横向溢出。

最终只读视觉清单位于本地忽略目录 `.learnings/screens/2026-08-24T02-05-33-948Z-manifest.json`，包含桌面工作台、字段/grid 选择、70% 缩放、字段接口、中屏抽屉、390px 画布/属性页、带真实记录的提交管理、正式填写页宽/窄屏共十张截图。manifest 记录 `1.0.0-alpha.1`、schema 3、`v1.1`、每张截图 SHA-256，十项 `pageOverflowX` 均为 false；它不是开源仓库制品。

## 6. 保留边界

本地绿色只证明 Alpha 1 的本地产品合同。正式外部身份提供方、真实 Poffices Agent 调用授权和成功 trace、非 mock 数据备份恢复、填写者自行编辑、永久删除、修正版自动投递及完整事件溯源均未被本轮实现或冒充完成。
