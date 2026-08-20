# Poffices 外部边界

本文只维护 Poffices 适配事实、身份映射、失败语义和本地绑定边界。产品边界与分期仍以 `DESIGN.md` 为准；这里不授权修改 Poffices 官方 agent。

## 为什么读取 Poffices

读取的唯一产品意义是「选择主人时做外键校验」：确认作者点名的 agent 真实存在、展示它是谁，并为后续判断是否允许本地绑定提供上下文。它不参与决定表上有哪些栏，也不从 Variables / Block Diagram / prompts 自动制表。

没有这一步，作者只能手写一个未经验证的 `ownerAgent`；系统无法区分不存在、选错、Official 或权限未知的对象。2A 的“存在”不等于 2B 的“允许绑定”。

| 信息 | 当前用途 | 不代表 |
|---|---|---|
| `id` | 内部稳定 `ownerAgent` | 已获得编辑权 |
| `name` | 给作者确认选中对象 | 可作主键 |
| Key | 易读检索别名；当前公开详情不能按 Key 查询 | 已验证不可变 |
| `agent_type` / `is_official` | 展示上下文、阻止把 Official 当默认改装对象 | 已知道完整权限 |
| prompts / Variables / Block Diagram | 不读取、不保留 | form 字段来源 |

因此 Poffices 查询应出现在「改已有 agent」选择流程中，或留在开发诊断区；不应固定占据作者主侧栏。作者选定且通过绑定资格后，才创建本地设计工作区。

## 2A 已落地范围

只按明确数字 id 读取一个候选 agent，确认它能映射为合法 `ownerAgent`。不列全库、不保存浏览器登录态、不绑定真实入口。

2026-08-20 对 `Market Analysis` 的只读取证：

- Creator Studio v1.26.1 当前 URL 为 `workspace?agent=18&tab=overview`；页面显示 Name=`Market Analysis`、Key=`marketanalyzer`，并把 Key 描述为唯一标识。
- 该对象标为 Official，Overview 的保存与字段编辑均不可用；它适合做 2A 只读身份证据，不得默认升级成 2B 本地绑定对象。
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

适配器返回的是“候选主人”，不是可编辑 agent：没有 `fields`、`published`、`inputBag` 或绑定方法。这个隔离采用防腐层思路，让 Poffices 字段名变化不进入 `form-ledger/v1` 或提交信封；参考 [Microsoft Anti-Corruption Layer](https://learn.microsoft.com/azure/architecture/patterns/anti-corruption-layer)。身份卡片已移入改装选择流程，Official 候选只显示不可绑定，不进入工作区。

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
    "basis": "author-confirmed",
    "confirmedAt": "2026-08-20T09:00:00.000Z"
  }
}
```

边界：

1. 作者必须先明确选择一个自己拥有或获授权的 sandbox agent；Official fail closed。当前公开详情不提供所有权字段，所以非官方对象还需作者显式确认权限，记为 `author-confirmed`。这是本地单用户阶段的权宜拍板，平台日后提供可验证权限后必须替换。
2. 选择通过后，Form Studio 本地创建设计工作区；字段、草稿、金稿、`formVersion`、提交信封和 `inputBag` 全由本仓管理。
3. 本地旁路入口只渲染 `published`，没有输入框逃生门；解绑只修改本地映射并保留历史袋子。
4. 使用面和提交端点都会复核 `ownerAgent`、`formId` 与 `publishedFormVersion`；任一不一致即拒绝打开或入袋。授权规则采用默认拒绝，参考 [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)。

## 条件式平台入口

若最终要求 Poffices 官方 URL 直接显示 Form Studio 金稿，还需平台另行提供正式、可授权、可回滚的入口映射能力。WordPress 官方说明 cookie 认证依赖登录会话和 `X-WP-Nonce`，只适用于站内登录上下文：[REST API Authentication](https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/)。因此不得复制浏览器 cookie、不得因“进入第 2 段”就自动获得外部写权限。

只有同时确认稳定路由（数字 id 还是 Key）、最小权限、发布/解绑/回滚合同和真实 sandbox，才允许实施平台入口适配；仍不得修改 agent 的 Overview、Variables、Block Diagram、prompts 或 Documentation。若这些条件未满足，只能报告“本地改装机制完成，平台入口未对接”，不能冒充 Poffices 官方入口已改变。
