# 测试管理规范

测试不是按开发时间无限追加到一个 walk 文件，而是按“证明什么”归档。

## 分类

| 分类 | 路径 | 证明范围 | 命令 |
|---|---|---|---|
| Contract | `tests/contract` | 账本、字段 id/label、渲染/抽取同构 | `npm run test:contract` |
| Runtime | `tests/runtime` | 浏览器校验、提交信封、inputBag 追加、封闭控件词表 | `npm run test:runtime` |
| E2E | `tests/e2e` | 改装、新生、发布/解绑、作者后台显示与响应式 | `npm run test:e2e` |

共享的 API reset、agent 查询和金稿读取只放 `tests/support`；手写 HTML/JSON 只放 `tests/fixtures`。Playwright 官方建议把重复 setup 抽为可复用 fixture，使测试按意义分组，而不是按共同 setup 堆在一起：[Playwright Fixtures](https://playwright.dev/docs/test-fixtures)。

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

结构绿和当前 28 条行为绿缺一不可。单独某个分类绿色只能说明该层，没有资格替代完整检查。数量会随合同变化，不把“28”写成永久目标；每条测试必须能回答“它守住 DESIGN.md 的哪条合同或哪次已证实缺陷”。

## 第 2 段边界证据

浏览器 `checkValidity()` 继续证明用户面入口校验；`tests/runtime/server-boundary.spec.mjs` 另外证明绕过浏览器时，服务端仍返回缺必填栏 400、无首页表 409、未知 agent 404，坏 JSON 返回 400：

- application 用例测试证明缺字段提交信封不会写进 `inputBag`。
- HTTP 层证明坏 JSON 是 400、测试钩子在非测试配置下是 404。
- 结构合同测试证明支持的 spec 后缀不能绕过分类，并锁住关键 import 方向。

2A 仍需新增外部 agent 身份合同测试，冻结“存在 / 不存在 / 无权限 / 外部异常”的映射；该合同测试只证明接口形状，不冒充 2B 的真实入口人判。测试钩子只服务自动测试，不属于产品 API；普通运行模式不加载夹具处理器，也不注册 reset。
