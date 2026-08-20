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

第 0 / 1 / 1b 段和 **2A 真实身份只读纳管**已经落地。当前下一件是 **2B-A 作者流整理**：把身份核对移入改装选择流程，拆清改装 / 新生两条入口；然后才冻结本地绑定合同、实现旁路入口。不得先做 Frankie，也不得直接修改 Poffices 官方 agent。2A 的身份卡片只读，不代表已经绑定。
