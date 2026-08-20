# Form Studio

Form Studio 是作者后台：作者为某一个 agent 设计可提交的 web 表，并把它发布成该 agent 独占的用户 UI。

## 从这里开始

- 产品方向与分期：[`DESIGN.md`](./DESIGN.md)（唯一产品真相源）
- 模块职责与依赖方向：[`docs/architecture.md`](./docs/architecture.md)
- 测试分类与新增规则：[`docs/testing.md`](./docs/testing.md)
- Git、文档生命周期与清理方法：[`docs/maintenance.md`](./docs/maintenance.md)
- Poffices 只读身份边界：[`docs/poffices-integration.md`](./docs/poffices-integration.md)
- 作者面问题与演进路线：[`docs/authoring-experience.md`](./docs/authoring-experience.md)

## 常用命令

```bash
npm start
npm run check
npm run test:contract
npm run test:runtime
npm run test:e2e
```

`npm run check` 是开发交付前的统一入口：先检查目录和文件规模，再跑完整行为回归。

## 当前阶段

第 0 / 1 / 1b、第 2 段本地旁路、3A 和 3B-A/B/C 已落地。生产模式使用本地 SQLite；提交已成为带服务端 actor / scope 的独立记录；提交与 outbox 事件同事务落盘，经幂等 relay 投进本地 `AgentInputPort`；本地演示身份可完成学生提交、获授权老师查看与投递状态。Poffices 身份仍只读，真实 agent 尚未收到输入，因此当前仍是**本地可演示 Alpha**，不是联网学生 / 老师 MVP。下一件是 3C 课堂端到端故事（课堂作为外置的参考消费者读提交台账，不进入产品面）；Poffices adapter 只有在正式输入合同和获授权 sandbox trace 齐全后才实施。AI 制表继续延期。
