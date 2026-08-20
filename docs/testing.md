# 测试管理规范

测试不是按开发时间无限追加到一个 walk 文件，而是按“证明什么”归档。

## 分类

| 分类 | 路径 | 证明范围 | 命令 |
|---|---|---|---|
| Contract | `tests/contract` | 账本、字段 id/label、渲染/抽取同构 | `npm run test:contract` |
| Runtime | `tests/runtime` | 浏览器校验、提交信封、持久恢复、封闭控件词表 | `npm run test:runtime` |
| E2E | `tests/e2e` | 改装、新生、发布/解绑、作者后台显示与响应式 | `npm run test:e2e` |

共享的 API reset、agent 查询和基准示例读取只放 `tests/support`；手写 HTML/JSON 只放 `tests/fixtures`。Playwright 官方建议把重复 setup 抽为可复用 fixture，使测试按意义分组，而不是按共同 setup 堆在一起：[Playwright Fixtures](https://playwright.dev/docs/test-fixtures)。

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
- Accessibility / Reflow：身份查询的空、加载、失败状态可读，主路径可键盘完成；宽屏设计 / 预览并排，中屏上下分区，窄屏无水平溢出。

以上已由 `owner-binding.spec.mjs`、`workbench-ui.spec.mjs`、`agent-entry.spec.mjs` 和 `submission.spec.mjs` 覆盖。它们只证明本地改装机制。若将来实施条件式平台入口，必须增加独立真实环境证据；没有正式接口和授权时不得伪造。

## 2C 已落地证据

`tests/runtime/persistence.spec.mjs` 使用临时 SQLite 文件启动本地 HTTP 服务，完成新生、编辑、发布、继续改草稿和提交后关闭服务；再以同一数据库重启并验证：

- 同一 `ownerAgent` 和 `/a/:id` 路径仍存在，新生编号继续递增；
- 草稿字段不会泄漏到已发布用户页面；
- 绑定、发布版本与历史 `inputBag` 一致恢复；
- 下架后再次重启仍返回 404，但历史提交不丢。

临时数据库在测试结束后删除；生产 `data/form-studio.sqlite` 不参与 reset，也不是测试夹具。该测试证明单机跨重启持久性，不证明多实例并发、用户鉴权、老师权限或 Poffices agent 已收到输入。
