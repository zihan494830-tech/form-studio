# Poffices 外部边界

本文只维护 Poffices 适配事实、身份映射和失败语义。产品边界与分期仍以 `DESIGN.md` 为准；这里不授权真实入口写回。

## 2A 当前范围

只按明确 id 读取一个候选 agent，确认它能成为合法 `ownerAgent`。不列全库、不读取 Variables / Block Diagram、不保存浏览器登录态、不绑定真实入口。

2026-08-20 对 `Market Analysis` 的只读取证：

- Creator Studio v1.26.1 当前 URL 为 `workspace?agent=18&tab=overview`；页面显示 Name=`Market Analysis`、Key=`marketanalyzer`，并把 Key 描述为唯一标识。
- 该对象标为 Official，Overview 的保存与字段编辑均不可用；它适合做 2A 只读身份证据，不得默认升级成 2B 写入目标。
- 公开 Store detail `GET /wp-json/sen-bot-master/v1/agents/store/18` 返回 `id=18`、`name=Market Analysis`、`agent_type=app`、`is_official=true`；这是 2A 生产适配器实际依赖的最小外部响应。[实测端点](https://poffices.ai/wp-json/sen-bot-master/v1/agents/store/18)
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

适配器返回的是“候选主人”，不是可编辑 agent：没有 `fields`、`published`、`inputBag` 或绑定方法。作者面真实身份卡片也不提供发布按钮。这个隔离采用防腐层思路，让 Poffices 字段名变化不进入 `form-ledger/v1` 或提交信封；参考 [Microsoft Anti-Corruption Layer](https://learn.microsoft.com/azure/architecture/patterns/anti-corruption-layer)。

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

## 2B 前的升级触发条件

2B 会接触认证与真实入口修改，不能复用 2A 的“公开详情可读”来假装写权限已经解决。WordPress 官方说明 cookie 认证依赖登录会话和 `X-WP-Nonce`，只适用于站内登录上下文；外部应用应使用明确支持的认证方式：[REST API Authentication](https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/)。因此进入 2B 前必须另行确认：

1. 先由人明确选择一个有编辑权限、允许回滚的 sandbox agent；`Market Analysis` 是官方只读对象，不是默认写入目标。再确认 Poffices 认可的认证方式与最小权限；密钥只走环境配置，不落盘。
2. 用户入口的稳定路由究竟使用数值 id 还是 Key。
3. 发布、解绑与回滚端点；先有可逆探针，才允许一次明确 agent 的写入。
4. 草稿 / `published` 的真实入口读取位置；表必须独占，不能与输入框并存。

以上未确认前，2A 的只读卡片不得升级成“绑定”按钮。
