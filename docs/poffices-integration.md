# Poffices 外部边界

本文只维护 Poffices 适配事实、身份映射、失败语义和本地绑定边界。产品边界与分期仍以 `DESIGN.md` 为准；这里不授权修改 Poffices 官方 agent。

## 为什么读取 Poffices

读取的唯一产品意义是「选择主人时做外键校验」：确认作者点名的 agent 真实存在、展示它是谁，并为后续判断是否允许本地绑定提供上下文。它不参与决定表上有哪些栏，也不从 Variables / Block Diagram / prompts 自动制表。

没有这一步，作者只能手写一个未经验证的 `ownerAgent`；系统无法区分不存在、选错或 Official 对象。2A 的“存在”足以创建隔离本地副本，但不等于拥有 Poffices 写权。

| 信息 | 当前用途 | 不代表 |
|---|---|---|
| `id` | 内部稳定 `ownerAgent` | 已获得编辑权 |
| `name` | 给作者确认选中对象 | 可作主键 |
| Key | 易读检索别名；当前公开详情不能按 Key 查询 | 已验证不可变 |
| `agent_type` / `is_official` | 展示来源上下文、提醒平台对象只读 | 已知道完整权限或获得写权 |
| prompts / Variables / Block Diagram | 不读取、不保留 | form 字段来源 |

因此 Poffices 查询应出现在「改已有 agent」选择流程中，或留在开发诊断区；不应固定占据作者主侧栏。作者确认主人后，Form Studio 才创建自己的隔离设计工作区。

## 2A 已落地范围

只按明确数字 id 读取一个候选 agent，确认它能映射为合法 `ownerAgent`。不列全库、不保存浏览器登录态、不绑定真实入口。

2026-08-20 对 `Market Analysis` 的只读取证：

- Creator Studio v1.26.1 当前 URL 为 `workspace?agent=18&tab=overview`；页面显示 Name=`Market Analysis`、Key=`marketanalyzer`，并把 Key 描述为唯一标识。
- 该对象标为 Official，Overview 的保存与字段编辑均不可用；这证明 Poffices 侧只读，不妨碍 Form Studio 在自己数据库中引用 `ownerAgent=18` 并创建隔离页面。
- 公开 Store detail `GET /wp-json/sen-bot-master/v1/agents/store/18` 返回 `id=18`、`name=Market Analysis`、`agent_type=app`、`is_official=true`；这是 2A 生产适配器实际依赖的最小外部响应。[实测端点](https://poffices.ai/wp-json/sen-bot-master/v1/agents/store/18)
- 公开 Store detail 用 `marketanalyzer` 查询返回 404，受保护 agent detail 用该 Key 查询实测返回 500；所以当前 Key 只作人工别名，不能冒充已存在可靠 Key resolver。
- Creator Workspace 的哈希前端包显示内部详情路由存在，但直接从自动化浏览器打开受保护详情接口被客户端拦截。因此 2A 不依赖登录 cookie、nonce 或该受保护路由。

Poffices 官方文章只证明 Creator Studio 用于创建、配置、测试和发布 agent，并没有公开承诺上述插件端点的长期兼容性：[Creator Studio 介绍](https://poffices.ai/2026/08/11/build-your-own-ai-agent-in-clicks-introducing-poffices-ai-creator-studio/)。端点形状属于“实测外部合同”，不是官方稳定性保证。

## 身份映射

`contracts/owner-agent-identity.v1.schema.json` 是 Form Studio 内部冻结形状。2A 映射规则：

| 外部字段 | 内部字段 | 规则 |
|---|---|---|
| `id` | `ownerAgent`, `externalId` | 转成非空字符串；当前实例为 `"18"` |
| `name` | `name` | 只作展示，不作主键 |
| `agent_type` | `agentType` | 可空元数据 |
| `is_official` | `official` | 布尔元数据 |
| `updated_at` | `updatedAt` | 可空来源时间 |

把 Store detail 返回的 `id` 字符串化作为 `ownerAgent` 是本项目拍板项：它是当前可实时复核的真实 id，也与 Creator Studio URL 的 `agent=18` 对上。`marketanalyzer` 只作为本次人工交叉核对的 Creator Key，不写进适配结果、不冒充公开端点已经证明的字段。若 2B 的真实用户入口合同证明必须以 Key 路由，应在绑定前显式升级映射并迁移测试数据，不能静默改主键。

适配器返回的是“候选主人”，不是可编辑 agent：没有 `fields`、`published`、`inputBag` 或绑定方法。这个隔离采用防腐层思路，让 Poffices 字段名变化不进入 `form-ledger/v1` 或提交信封；参考 [Microsoft Anti-Corruption Layer](https://learn.microsoft.com/azure/architecture/patterns/anti-corruption-layer)。身份卡片已移入改装选择流程；Official 也可以进入本地工作区，但页面必须同时显示“Poffices 只读来源”和“Form Studio 本地页面”。

## 失败合同

| 情况 | Form Studio HTTP | 错误码 |
|---|---:|---|
| id 非正整数 | 400 | `invalid_id` |
| 需要认证 | 401 | `unauthorized` |
| 无权限 | 403 | `forbidden` |
| 不存在 | 404 | `not_found` |
| 上游 5xx / 其他异常状态 | 502 | `upstream_error` |
| JSON 或最小字段不合法 | 502 | `contract_invalid` |
| 网络不可达 | 503 | `unavailable` |

单次外部读取默认 8 秒超时，超时同样按 `unavailable` fail closed。

所有失败都 fail closed：不创建本地 agent、不产生账本、不写 `inputBag`。

## 2B 本地优先绑定

2B 已建立 Form Studio 自己的本地关系，不把 Poffices 当可写仓储。`contracts/owner-agent-binding.v1.schema.json` 和合同测试冻结了以下形状：

```json
{
  "version": "owner-agent-binding/v1",
  "ownerAgent": "42",
  "sourceSystem": "poffices",
  "formId": "42",
  "publishedFormVersion": 1,
  "entryMode": "form-studio-sidecar",
  "status": "published",
  "authorization": {
    "basis": "local-shadow-only",
    "confirmedAt": "2026-08-20T09:00:00.000Z"
  }
}
```

边界：

这里必须区分两种完全不同的权限：创建 Form Studio 本地页面，只需要一个有效只读身份；修改 Poffices agent 或官方入口，才需要平台授权。对 `Market Analysis / id=18`，名称、数字 id、来源和 Official 状态已经足够完成主人核对并创建隔离副本。更多描述、Key 或内部栏位不会自动产生 Poffices 写权。

1. 作者先选择一个真实存在的 Poffices agent；Form Studio 记为 `local-shadow-only`，只授权自己的页面、版本、提交和旁路入口。Official 不再被错误阻断。
2. 选择通过后，Form Studio 本地创建设计工作区；字段、草稿、已发布版本、`formVersion`、提交信封和 `inputBag` 全由本仓管理。
3. 本地旁路入口只渲染 `published`，没有输入框逃生门；解绑只修改本地映射并保留历史袋子。
4. 使用面和提交端点都会复核 `ownerAgent`、`formId` 与 `publishedFormVersion`；任一不一致即拒绝打开或入袋。`local-shadow-only` 不能调用任何 Poffices 写端口；本仓目前也没有这种端口。

## 条件式平台入口

若最终要求 Poffices 官方 URL 直接显示 Form Studio 已发布版本，还需平台另行提供正式、可授权、可回滚的入口映射能力。WordPress 官方说明 cookie 认证依赖登录会话和 `X-WP-Nonce`，只适用于站内登录上下文：[REST API Authentication](https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/)。因此不得复制浏览器 cookie、不得因“进入第 2 段”就自动获得外部写权限。

只有同时确认稳定路由（数字 id 还是 Key）、最小权限、发布/解绑/回滚合同和真实 sandbox，才允许实施平台入口适配；仍不得修改 agent 的 Overview、Variables、Block Diagram、prompts 或 Documentation。若这些条件未满足，只能报告“本地改装机制完成，平台入口未对接”，不能冒充 Poffices 官方入口已改变。

## 真正调用 agent 仍缺的外部合同

当前公开资料和只读身份接口只能确认 agent 存在，不能给出 Form Studio 可依赖的程序化输入 schema。进入 3B 前，需要 Alan / Poffices 针对一个获授权 sandbox 明确：

1. 可调用的 agent id / Key 与环境；
2. 接受 `text/plain`、结构化 JSON 还是其他模式；
3. 正式 endpoint / SDK 与认证范围；
4. 请求、响应和错误形状；
5. 同步、异步、回调和任务状态规则；
6. 重试、幂等和限流约束；
7. 一条成功输入、输出和可核对的运行记录；
8. 老师 agent 通过什么只读工具或查询端口访问学生提交。

这些内容形成独立的 `agent-input-profile/v1`，不扩容 `owner-agent-identity/v1`。若对方只提供完整 Block Diagram JSON，Form Studio 可以审计数据流并提出候选 mapping，但仍需 block 类型说明、schema/version、外部工具合同和 sandbox trace 才能把推断升级为运行事实。任何 JSON 中的 token、cookie、API key 和密码都不得进入仓库。
