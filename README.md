# Form Studio

Form Studio 是作者后台：作者为某一个 agent 设计可提交的 web 表，并把它发布成该 agent 独占的用户 UI。

## 从这里开始

- 产品方向与分期：[`DESIGN.md`](./DESIGN.md)（唯一产品真相源）
- 模块职责与依赖方向：[`docs/architecture.md`](./docs/architecture.md)
- 测试分类与新增规则：[`docs/testing.md`](./docs/testing.md)
- Git、文档生命周期与清理方法：[`docs/maintenance.md`](./docs/maintenance.md)
- Poffices 只读身份与运行时调用边界：[`docs/poffices-integration.md`](./docs/poffices-integration.md)
- 作者面问题与演进路线：[`docs/authoring-experience.md`](./docs/authoring-experience.md)
- 实施计划生命周期（当前无现役计划）：[`docs/plans/README.md`](./docs/plans/README.md)

## 常用命令

```bash
npm start          # product：不加载本地示范身份或课堂参考应用
npm run demo       # demo：自动进入作者工作区，并启用课堂参考 API/页面
npm run demo:reset # 丢弃本轮 demo 交互，恢复 Git 中的 canonical mock
npm run check
npm run test:contract
npm run test:runtime
npm run test:e2e
npm run visual:local # 连接已启动的 desktop demo，生成带来源标识的九张截图与 manifest
```

`npm run check` 是开发交付前的统一入口：先检查目录和文件规模，再跑完整行为回归。

## 一键启动

双击仓库根目录的 `start-form-studio.bat`：自动 git pull（有远端时）、按需 `npm install`、可选 `npm run check`，然后以 demo 模式启动并打开作者工作台。启动器会对 `src/`、`public/`、`contracts/`、canonical mock catalog 与运行入口生成源码指纹；4190 已有同指纹 / 同模式实例才复用，确认是旧 Form Studio 时会自动重启，身份不明则 fail closed。脚本和日志分别在 [`scripts/start-form-studio.ps1`](./scripts/start-form-studio.ps1) 与 `logs/`。

开发期只有一份 mock 内容源：[`data/mock-agents.json`](./data/mock-agents.json)。desktop demo 把它物化到 SQLite，test 把同一 catalog 克隆到隔离内存；两者不共享可写数据库。`datasetRevision` 升级时 demo 会在监听端口前整体替换旧 mock 状态，普通重启则保留同版本下的编辑；需要回到 Git 中的干净基线时执行 `npm run demo:reset`，该命令拒绝未受 catalog 管理的数据库。工作台默认打开 catalog 的验收场景，并在页头显示 product / data / build 身份。

当前仓库**没有 Git 远端**，所以桌面启动只能更新依赖和切换到磁盘上的最新源码，不能从其他机器拉取新版本；启动时会明确显示“跳过拉取”。需要跨机器更新时，先按 [`docs/maintenance.md`](./docs/maintenance.md) 配置受控远端与数据备份。

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

v0.27 作者侧表达力与质检修复已落地：信封仍是扁平 `values[id]`，但发布 definition 现在按 `formVersion` 不可变保存，历史记录不再拿当前表单解释；DOM 抽取是发布验证，不是隐藏状态副本。下一行动先用真实作者任务验证合同、历史回看与 fixed grid 安全，不预建 `AppConnection`。Poffices 仍等待正式调用合同；AI 候选字段生成继续延期，不能只靠修改一句文档转正。
