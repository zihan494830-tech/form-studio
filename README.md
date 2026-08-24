# Form Studio

Form Studio `1.0.0-alpha.1` 是 Agent 表单工作台：设计、草稿试填、发布、正式填写并管理收到的提交。

当前是绑定 `127.0.0.1` 的本地 Alpha。demo 只使用 canonical mock；product 模式在正式身份提供方缺失时 fail closed，不能直接当作公网服务部署。

## 从这里开始

- 产品方向与分期：[`DESIGN.md`](./DESIGN.md)（唯一产品真相源）
- 模块职责与依赖方向：[`docs/architecture.md`](./docs/architecture.md)
- 测试分类与新增规则：[`docs/testing.md`](./docs/testing.md)
- Git、文档生命周期与清理方法：[`docs/maintenance.md`](./docs/maintenance.md)
- Poffices 只读身份与运行时调用边界：[`docs/poffices-integration.md`](./docs/poffices-integration.md)
- 作者面问题与演进路线：[`docs/authoring-experience.md`](./docs/authoring-experience.md)
- v0.28 外审复核、v0.29 整改与 SQLite 迁移证据：[`docs/research/form-studio-v028-audit-remediation-20260824.md`](./docs/research/form-studio-v028-audit-remediation-20260824.md)
- Alpha 1 无角色工作流、发布版本与 schema v3 证据：[`docs/research/form-studio-100-alpha1-workflow-version-remediation-20260824.md`](./docs/research/form-studio-100-alpha1-workflow-version-remediation-20260824.md)
- 开源发布依据、已完成门禁与剩余拍板：[`docs/research/open-source-release-readiness-20260824.md`](./docs/research/open-source-release-readiness-20260824.md)
- 实施计划生命周期：[`docs/plans/README.md`](./docs/plans/README.md)
- 许可证、贡献、安全与变更记录：[`LICENSE`](./LICENSE) · [`CONTRIBUTING.md`](./CONTRIBUTING.md) · [`SECURITY.md`](./SECURITY.md) · [`CHANGELOG.md`](./CHANGELOG.md)

## 快速开始

需要 Node.js 22.13+ 或 24.x LTS。首次安装使用锁文件；Linux CI 另执行 `npx playwright install --with-deps chromium`。

```bash
npm ci
npx playwright install chromium
npm run demo
```

打开 <http://127.0.0.1:4190/>。如需验证代码，运行 `npm run check`。

## 常用命令

```bash
npm start          # product：不加载本地示范身份或课堂参考应用
npm run demo       # demo：自动进入作者工作区，并启用课堂参考 API/页面
npm run demo:reset # 丢弃本轮 demo 交互，恢复 Git 中的 canonical mock
npm run data:migrate # 仅对受管 mock 做 SQLite v1/v2→v3 备份与迁移
npm run check
npm run test:contract
npm run test:runtime
npm run test:e2e
npm run visual:local # 连接已启动的 desktop demo，生成带来源标识的十二张截图与 manifest
npm run check:syntax # 跨平台检查全部 .js/.mjs 语法
```

`npm run check` 是开发交付前的统一入口：先检查目录和文件规模，再跑完整行为回归。

## 一键启动

双击仓库根目录的 `start-form-studio.bat`：自动 git pull（有远端时）、按需 `npm ci`、可选 `npm run check`，然后以 demo 模式启动并打开作者工作台。启动器会对 `src/`、`public/`、`contracts/`、canonical mock catalog 与运行入口生成源码指纹；4190 已有同指纹 / 同模式实例才复用，确认是旧 Form Studio 时会自动重启，身份不明则 fail closed。脚本和日志分别在 [`scripts/start-form-studio.ps1`](./scripts/start-form-studio.ps1) 与被忽略的 `logs/`。

开发期只有一份 mock 内容源：[`data/mock-agents.json`](./data/mock-agents.json)。desktop demo 把它物化到 SQLite，test 把同一 catalog 克隆到隔离内存；两者不共享可写数据库。只有启动前确认数据库文件原本不存在，demo 才可初始化 canonical ownership；之后 `datasetRevision` 升级会整体替换受管 mock，同版重启保留编辑。无 ownership metadata 的既有数据库一律 fail closed；需要回到 Git 基线时执行 `npm run demo:reset`。

启动器只在当前 checkout 已配置远端时执行 `git pull --ff-only`；没有远端会明确跳过。Git 只分发源码，不备份被忽略的 SQLite、日志或视觉证据，数据恢复边界见 [`docs/maintenance.md`](./docs/maintenance.md)。

| 参数 | 作用 |
|---|---|
| `-Mode product` | 以 product 模式启动（无本地示范身份，需正式身份提供方） |
| `-UpdateOnly` | 只更新（pull + install + 可选 check），不启动 |
| `-SkipUpdate` | 跳过更新，直接启动 |
| `-Check` | 启动前先跑 `npm run check` |
| `-NoBrowser` | 不自动打开浏览器 |
| `-Loop` | 服务退出后自动重启 |
| `-Port 4200` | 改用 4200 端口 |

## 当前阶段

第 0 / 1 / 1b、第 2 段本地旁路和 3A / 3B / 3C 本地切片已落地。作者工作台现按同一 agent 提供「输入表单 / 收到的提交」两层；输入表单使用中央真实画布与右侧上下文属性栏，设计 / 预览共用画布并可在 60%–140% 缩放。字段稳定 ID 集中在不挤压主编辑区的「字段接口信息」面板，默认只读查看/复制，显式修改只进入草稿。作者收件箱按同一 owner 的追加顺序显示「提交 #N」，不把 demo 人名或技术 `student-*` ID 当界面名称；身份仍保留在授权和审计层。旧身份选择页已撤下。封闭词表已扩展 `radio`、固定行列 `grid`（格子展开为扁平 `gridId_rowId_colId`）与 `number` 小数位（v0.27）。3C 的通用读取 application、课堂授权 adapter、product/demo/test 隔离、稳定错误码和 `zh-HK` 消息目录继续成立。当前仍是**本地可演示 Alpha**，不是通用消费者产品、真实 CRM 集成或联网学生 / 老师 MVP。

Alpha 1 的主流程不再显示角色切换：demo 自动建立默认设计/填写会话，核心仍按 capability fail closed。产品版本为 `1.0.0-alpha.1`；表单发布展示 `v1.x`，内部整数 `formVersion` 继续承担历史合同。画布保留“编辑 / 试填草稿”；顶部按状态只突出“发布”、“去填写”或“发布更新 + 去填写目前线上版”，停用和可恢复移除收进“更多”。文本停止输入 700ms 自动保存，切换/发布前强制 flush，失败时保留本地值并提供重试和离页警告。收件箱在未知数量时显示读取状态，刷新失败保留旧计数；桌面为左右独立滚动，单列尺寸改为自然滚动，并展示未配置、待投递、投递中、已送达、失败和 mapping 需复核。原始 envelope 和 outbox 不变。SQLite 已升到 schema 3；canonical mock 内容未变，`datasetRevision` 仍为 `mock-v0.27.1`。真实外部身份提供方与 Poffices Agent 投递仍是外部条件，不以本地 demo 绿灯冒充完成。

## 开源发布状态

Form Studio 采用 [Apache License 2.0](./LICENSE)，允许使用、修改和分发，并提供明确的版权与专利授权边界；使用者仍须遵守许可证中的署名、修改说明和再分发条件。代码、测试、CI、贡献与安全文件已经整理，发布证据及仍需在远端完成的设置见[开源发布依据](./docs/research/open-source-release-readiness-20260824.md)。
