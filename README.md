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

第 0 / 1 / 1b、2A 和 **2B-A / B / C 本地改装机制**已落地。起始页拆清改装 / 新生，发布产生 `owner-agent-binding/v1`，本地旁路入口只渲染已发布版本并追加提交信封。第 1b 已证明临时新生 id 和旁路 URL；当前下一件是 **2C 持久新生身份**，使身份、页面版本和提交跨重启存在。随后按 3A 持久提交与老师视图 → 3B agent 输入投递 → 3C Alan 课堂故事推进。不得先做 AI 制表、直接修改 Poffices 官方 agent，或把本地 `inputBag` 冒充真实 agent 交互。
