# 项目维护指南

本指南回答“如何持续维护”，不复制 `DESIGN.md` 的产品定义。它是一套轻量默认做法，不是不可修改的祖训。

## 1. 三种约束

| 层级 | 含义 | 如何改变 |
|---|---|---|
| 产品合同 | `ownerAgent`、字段 `id` / `label` 分离、封闭控件词表、提交信封追加进 `inputBag`、独占入口、一表一 agent | 只能先修改 `DESIGN.md`，说明产品依据与人判变化 |
| 工程硬线 | 密钥不落盘、真实环境不暴露测试钩子、交付前完整检查、变更应可审计和回滚 | 修复安全或证据缺口时可升级；降级必须明确风险与替代保护 |
| 当前默认 | 目录名、300/450 行阈值、测试文件后缀、分支命名、具体工具 | 有证据表明不合适即可改；门禁、说明和迁移应在同一次变更中同步 |

判断顺序：先问是否破坏产品合同，再问是否降低安全或证据能力，最后才讨论目录和工具偏好。后续重构可以换结构，但不能靠搬文件偷偷改产品语义。

## 2. 文档管理

| 文档 | 唯一职责 |
|---|---|
| `DESIGN.md` | 产品定义、必须成立、逻辑对象、分期与人判；唯一产品真相源 |
| `README.md` | 新进入项目时的索引、常用命令和当前阶段 |
| `docs/architecture.md` | 模块职责、依赖方向、机器门禁和已知架构债 |
| `docs/testing.md` | 测试分层、证据范围、运行与新增规则 |
| `docs/maintenance.md` | Git、文档生命周期、清理和规则变更方法 |
| `docs/poffices-integration.md` | Poffices 适配事实、身份映射、失败合同与升级条件 |
| `docs/authoring-experience.md` | 作者面信息架构、已证实可用性问题和渐进演进路线 |
| `docs/research/form-studio-v028-audit-remediation-20260824.md` | v0.28 外审逐项复核、v0.29 难回滚合同与 SQLite 迁移/回滚证据 |
| `docs/research/form-studio-100-alpha1-workflow-version-remediation-20260824.md` | Alpha 1 版本轴、无角色流程、提交管理与 schema v3 迁移/验收证据 |
| `docs/plans/README.md` | 现役实施计划索引、状态和清理规则；不复制项目状态 |
| `docs/plans/*.md` | 已获准但尚未完成的短期实施方案；不是永久真相源 |

新增文档前先查现有文档能否容纳。不得复制整段产品定义；需要背景时链接到 `DESIGN.md` 的对应小节。临时分析默认不进入仓库；若结论会影响后续决策，把结论并入有负责人的现役文档，不长期保留多份会议稿、审计稿和“最终版 2”。

外部资料真正影响设计或代码时，在相关文档或代码注释中留下链接，并区分“有依据”与“本项目拍板”。没有被采用的搜索结果不堆进仓库。

### 实施计划的生命周期

`README.md` 当前阶段只保留已经成立的状态、下一行动和现役计划链接；具体步骤进入 `docs/plans/`。计划不得反过来覆盖 `DESIGN.md`、架构或测试真相源。

计划只在 `proposed`、`active` 或有明确恢复条件的 `blocked` 状态下留在目录。完成或失效时，先把永久结论回写承担唯一责任的文档，再从索引移除并删除计划文件。一般历史由 Git 保存，不建立长期 `archive/`、`done/`、`old/` 目录；只有审计、数据迁移或难回滚决策存在明确保留义务时，才另写长期决策/证据记录。

每份计划必须写复审截止和失效条件。修改 `README.md` 当前阶段、开始相关主题分支或交付一个计划切片时，都要检查 `docs/plans/README.md`；超过复审截止的计划不得继续作为实施授权，必须先核对当前代码和产品决定后续期、改写或删除。具体字段和操作清单以 [`docs/plans/README.md`](./plans/README.md) 为准。

## 3. Git 与工作分支

仓库于 2026-08-20 初始化；早期 `main` 提交冻结第 0–1b 段基线。公开发布时必须为默认分支配置受控远端和保护规则；本地 `.git` 只能提供本机回滚，不是异机备份。首次建仓步骤保留为维护记录：

1. 检查 `.gitignore`，确认依赖、测试产物、报告、密钥和本地配置不会进入基线。
2. 运行 `npm run check`，记录已知失败；不能把未知红灯冻结成“稳定基线”。
3. 使用 `git init -b main` 建仓，审阅 `git status` 与待提交文件，再提交一次“第 0–1b 段基线”。
4. 若需要异机恢复，再配置受控远端；本地 `.git` 不是备份。

后续默认：`main` 保持可运行；一项产品切片或一类根因使用一个短期主题分支。Codex 创建的分支用 `codex/<topic>`；人工分支可以使用团队约定，不强制套用复杂 Git Flow。提交按可解释、可检查、可回滚的责任边界组织；不要把无关格式化、架构迁移和产品行为混在一个提交里。

进入学生 / 老师网络试点前，必须把当前分支推到受控远端，并对 `data/form-studio.sqlite` 做一次停服备份与恢复演练。Git 远端只备份源码，不备份被忽略的 SQLite；两项缺一不可。远端位置、保留周期和数据责任人目前都是待拍板项。

### 桌面启动与更新

桌面 `Form Studio.lnk` 只指向仓库根目录 `start-form-studio.bat`，不固定某个 commit。启动脚本对现役源码生成 `runtimeRevision`，通过 `/api/health` 判断 4190 中已加载的进程是否仍是当前版本；只有健康响应与 `node server.mjs` 进程身份同时成立时才自动替换旧实例。这个机制解决“磁盘已更新、内存仍跑旧代码”，不替代源码分发。

开发期 mock 的唯一内容源是 `data/mock-agents.json`，其 `datasetRevision` 与内容 checksum 独立于 SQLite schema version。仅当组合根在打开 SQLite 前确认文件原本不存在，才传入一次性 `allowInitialize` 建立 canonical ownership；无 metadata 的既有数据库不会自动升级或 reset。受管库 revision 相同但 checksum 改变会拒绝启动；revision 升级或显式 `npm run demo:reset` 才整体替换 mock。该做法参考 [Flyway schema history](https://documentation.red-gate.com/flyway/flyway-concepts/migrations/flyway-schema-history-table) 和 [Django fixtures](https://docs.djangoproject.com/en/5.2/howto/initial-data/)，但当前不引入外部迁移框架。

### SQLite schema 迁移

Alpha 1 repository 要求 `PRAGMA user_version=3`，不静默写入 v1/v2。`npm run data:migrate` 只接受 `form_studio_runtime_meta` 中带 canonical revision/checksum 的受管 mock：先以 SQLite `VACUUM INTO` 生成 `data/backups/form-studio-schema-v<来源版本>-<timestamp>.sqlite`，再在事务内补齐历史 v1 列（如需）并创建 `submission_management`、`submission_corrections`、`submission_management_audit`，最后核对 submission 计数、envelope hash 与 user_version。迁移不更新 submissions、outbox 或 envelope；未受管库、目标备份已存在或任何校验不一致都停止。

回滚必须停服务，用记录过 SHA-256 的来源版本备份恢复数据库，并同时运行理解该 schema 的旧代码；不能只降数据库不降代码，也不能把 `demo:reset` 当 schema 回滚。实际备份路径、hash 与前后计数记录在对应永久审计文档。备份位于被 Git 忽略的数据目录，仍需另行纳入受控备份策略。

建议维护顺序：

1. 为发布 checkout 配置受控远端并确定唯一默认分支；未配置时启动器应继续明确跳过拉取。
2. 更新窗口先运行 `start-form-studio.bat -UpdateOnly -Check`；检查通过后再正常双击。工作树有未提交改动时，先审阅 diff，不用自动 merge / reset 掩盖冲突。
3. 每次可回滚发布使用一个可识别 commit/tag；运行指纹定位“加载了哪份文件”，commit/tag 才回答“这份版本如何恢复”。
4. SQLite 按停服备份 / 恢复演练单独管理；Git、桌面快捷方式和源码指纹都不是数据备份。

Git 官方将 commit 作为可重建的项目快照，也把短期 topic branch 作为隔离相关工作的常见方式：

- [git init](https://git-scm.com/docs/git-init.html)
- [Git Branching Workflows](https://git-scm.com/book/en/v2/Git-Branching-Branching-Workflows)

## 4. 清理旧文件与临时脚本

清理前按以下顺序取证：

1. 用 `git status` 确认文件归属，避免删除别人尚未提交的工作。
2. 用 `rg` 查入口、import、脚本命令和文档引用；“零引用”只是候选，不自动等于可删。
3. 区分四类：现役源码、合同/基准夹具、可再生输出、一次性临时物。
4. 删除现役模块时同步删除或迁移测试与文档引用，并运行 `npm run check`。

处理规则：

- 可再生输出放入已忽略目录，不纳入源码管理。
- `data/form-studio.sqlite` 虽被 Git 忽略，但它是本地产品数据，不是可再生缓存；清理前必须停服务、确认目标并复制备份，不能把“未被 Git 跟踪”当成可删除依据。
- 一次性探针优先放系统临时目录；若会重复使用，命名后进入 `scripts/`，并写清输入、输出和退出条件。
- 基准夹具与合同不能因“旧”直接删除；先确认是否仍承担回归证据。
- 过时实现应删除，不建长期 `legacy/`、`old/`、`backup/` 垃圾场。必须保留的历史理由进入 Git 历史或现役文档，不靠复制文件保存。
- 涉及不可恢复数据、真实 agent 或外部写入时，清理不自动获得授权，必须另行确认目标和回滚方案。

## 5. 允许重构规则本身

当现有目录、阈值或工具妨碍维护时，可以修改。本次变更至少同时包含：

1. 现状证据：规则实际造成了什么问题。
2. 新边界：替代规则保护什么，不保护什么。
3. 迁移范围：哪些文件移动、删除或改名。
4. 验证：更新对应门禁与测试，运行完整检查。
5. 文档同步：更新 `architecture.md` / `testing.md` / 本指南中的唯一责任页。

不要求为小调整写长 RFC；只有跨产品合同、真实外部身份、数据迁移或难回滚变更才需要单独设计记录。这个升级条件是本项目拍板项。

## 6. 日常最小清单

开始前：

- 确认当前阶段和 `DESIGN.md` 人判。
- 查看 Git 分支与工作区状态。
- 先跑与目标相关的最低层检查；要改 dirty 文件时先确认现有变化。

交付前：

- 运行 `npm run check`。
- 查看 diff，确认没有生成物、密钥、测试钩子或无关改动。
- 更新承担唯一责任的文档；不要为了“文档齐全”复制正文。
- 明确哪些是自动证据、哪些仍需人判或真实环境验证。
