# 作者面信息架构与演进

本文维护作者面已经观察到的可用性问题、界面结构和渐进实现路线。产品身份、逻辑对象和分期仍只以根目录 `DESIGN.md` 为准；这里不借 UI 重构扩大控件词表或 Poffices 权限。

## 已解决问题清单

2026-08-20 质检时，工作台把三种任务堆在同一条左侧栏：

1. 2A Poffices 真实身份核对；
2. 新生 agent form；
3. 本地 mock 设计对象选择。

这不是单纯文案问题，而是对象关系表达错误。2B-A 已按下表修复；清单保留为 UI 回归依据。

| 优先级 | 问题 | 用户可能误解 | 修正方向 |
|---|---|---|---|
| P0 | 顶部显示 `Market Analysis / ownerAgent 18`，同时下方选中并编辑本地示例 | 本地示例已经绑定 Market Analysis | 身份核对移入改装选择流程；工作区只显示当前真正 owner |
| P1 | 改装、新生、搜索和诊断平铺在同一级 | 必须从上到下依次操作；搜索范围不明 | 起始页先选“改已有 / 新建”，再进入各自流程 |
| P1 | 主标题只写表名，未显著显示来源、`ownerAgent` 和本地/平台状态 | 不知道正在改谁、是否影响 Poffices | 工作区标题固定展示主人、出生路径、草稿/已发布版本和入口模式 |
| P1 | 发布和解绑未写清本地边界 | 误以为会直接修改 Poffices Official agent | 顶部固定说明只影响 Form Studio；动作使用“发布用户页面 / 解除本地绑定” |
| P2 | `mock`、2A、`agent ID` 等工程词直接暴露 | 不知道它们对作者有什么用 | mock 只留测试；真实身份查询解释为“选择页面主人” |
| P2 | 左栏同时承担创建、连接、导航和状态 | 对象增多后无限纵向堆积 | 起始流程与工作区导航分开；高级诊断收进设置或开发区 |

作者面最低可理解性标准：进入工作区后五秒内能回答「正在改谁」「改装还是新生」「草稿还是已发布版本」「当前只影响本地还是已接平台」。

2026-08-20 第二轮质检又修复三项：

- 左侧页面库删去重复解释，增加“全部 / 已发布 / 草稿”筛选和结果数；列表项只保留名称、状态、出生路径与稳定 id。
- “显示编号”改成“显示字段 ID”，并说明它只用于接口对接和排错。原实现复用了 `.show-ids` 类，误把整个设计区切成 flex 布局；现已拆成 `.id-toggle` 和 `.ids-visible`，切换前后设计区几何尺寸保持不变。
- 草稿预览只保留一个状态说明，提交按钮改为“发布后可提交”；未发布时隐藏无意义的解除绑定动作并禁用用户页链接；产品文案统一使用“草稿 / 已发布版本”。
- 字段 ID 关闭时不预留空行，只在设计区内部按需展开。宽屏工作区不再把上下两块拉成很长页面：容器达到 1280px 时设计 / 预览并排；中屏保留可调上下分区；小屏单列回流。

字段控件继续使用可见、可理解的标签，依据 [W3C WAI Form Labels](https://www.w3.org/WAI/tutorials/forms/labels/)；对可切换内容预留稳定空间，避免突发布局移动，依据 [web.dev Optimize Cumulative Layout Shift](https://web.dev/articles/optimize-cls)。采用的是标签清晰与稳定布局原则，不引入新的 UI 框架。

## 目标信息架构

### 起始页

```text
你准备做什么？

[ 改已有 agent 的页面 ]   [ 新建 agent form ]
  核实一个真实主人            agent 与 form 同时出生
```

改装路径：

```text
输入精确 ID / 未来可验证 Key
  → 展示名称、Key、Official / 来源上下文
  → 明确“Poffices 只读、Form Studio 本地副本”
  → 创建隔离本地工作区，写入 ownerAgent
```

新生路径：

```text
输入名称
  → 立即分配新 agent 身份
  → 创建本地工作区
```

两条路径都不允许先产生无主 form。

### 工作区

```text
左侧：我的设计工作区
  - 一个条目就是一个 agent 的用户 UI

顶部：My Sandbox Agent / 用户页面
      Poffices · ownerAgent 42 · 本地改装 · 已发布 v1

中间：设计 / 预览
右侧或抽屉：账本 / 提交信封 / inputBag
```

2A 身份查询在这个结构里是改装向导的一步，不是常驻设计对象。开发阶段仍可保留独立诊断入口，但不得与当前工作区形成视觉绑定。

## Alan 会议截图的理解

截图显示 Gravity 品牌业务系统内的专业表单编辑器，界面与 SurveyJS Creator 高度相似：左侧 Toolbox、中央设计面、右侧 Property Grid，以及 Designer / Preview / JSON Editor / Translation。SurveyJS 官方说明也采用“工具箱拖入问题、属性面板修改配置”的结构：[End-User Interface](https://surveyjs.io/survey-creator/documentation/end-user-guide/user-interface)。工具箱条目会向 survey JSON schema 加入对应元素：[Toolbox Customization](https://surveyjs.io/survey-creator/documentation/toolbox-customization)。

从截图可采信的方向：

- form 由作者根据业务要求设计，不从 agent 内部详情自动生成；
- 工具箱、画布、属性面板、预览是一条成熟作者流；
- JSON 是设计结果的另一种视图，不是先写 JSON 再补页面；
- Page、Matrix、Comment、Logic、Translation 说明成熟版本可能需要比当前 `fields[]` 更强的 form definition。

不能仅凭截图采信的范围：

- 截图不是 Alan 后续承诺提供的完成版源码或合同；
- `file`、Dynamic Panel、Matrix、多页、Logic、Translation 仍超出当前封闭控件词表；
- 高度相似不等于已确认采用 SurveyJS；若考虑直接复用，还需检查持久化格式、提交结构、包体和商业授权；
- 参考实现的通用 Survey 能力不能覆盖 Form Studio 的 `ownerAgent`、一表一 agent、独占入口和提交信封合同。

SurveyJS 提供 Basic / Advanced / Expert 渐进 UI preset，证明“先最小作者流、再按证据开放高级能力”在成熟工具中可行：[UI Preset Editor](https://surveyjs.io/survey-creator/documentation/ui-preset-editor)。这是方法依据，不是采用该库的决定。

## 渐进实现路线

### 2B-A（已完成）：先修清流程

- 起始页拆成改装 / 新生两个主动作。
- 把 Poffices 核对卡移入改装选择流程或开发诊断区。
- 工作区头部固定显示当前主人、来源、出生路径、发布状态和入口模式。
- 平台未对接前，所有发布/解绑文案明确为本地操作。

完成定义：不会再把 `Market Analysis` 候选身份误认为已经绑定 `exercise-1`；窄屏、键盘操作、空/加载/失败状态仍清楚。

不做：新控件、拖拽、Poffices 写入、设计系统大重构。

### 2B-B / C（已完成）：本地绑定和旁路入口

- 冻结 `owner-agent-binding/v1`。
- 有效只读真实身份可建立 `local-shadow-only` 本地设计对象；Official 也可建，但不获得 Poffices 写权。
- 本地入口只渲染 `published`；草稿只在作者面。
- 提交信封按 `values[id]` 追加进绑定主人对应的本地 `inputBag`。

### Designer 后续：按完成版证据扩展

Alan 完成版到手后，先审计：

1. 实际依赖和授权；
2. JSON/schema 形状和版本；
3. 控件、Page、Panel、Matrix、Logic、Translation 的真实必要性；
4. 校验、提交和数据存储；
5. 是否以及如何关联 agent 身份。

只有出现明确业务样例（例如财务年度矩阵）且当前扁平字段无法表达时，才设计 `form-definition/v2`。`owner-agent-identity/v1` 继续只回答谁是主人；不得把表单结构塞进身份合同。

## 2B-A / B / C 验收清单

- [x] 起始页只呈现改装 / 新生两条路径。
- [x] 身份核对结果不与未绑定设计对象同时常驻。
- [x] 当前工作区显著显示真实 `ownerAgent` 或新生 id。
- [x] Official 可产生隔离本地绑定，界面不把它冒充为 Poffices 平台改动。
- [x] 本地发布、解绑没有 Poffices 写端口可调用。
- [x] 绑定合同保持一表一 agent，提交信封形状不变。
- [x] `published` 独占使用入口，草稿不泄漏。
- [x] 自动测试覆盖空、加载、失败、键盘和窄屏状态。
- [x] 宽屏并排、中屏上下、小屏单列；换屏无水平溢出。

响应式实现按工作区容器宽度选择布局，而不是猜设备型号，依据 [MDN Container Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries)；小屏验收遵循内容无需双向滚动的 [WCAG 2.2 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)。

## 延期的 AI 辅助边界

“人工为主、AI 为辅”可缓解空白表的起步成本，但当前不插入 2C 和真实应用闭环。日后若实施，AI 只在独立建议区生成候选字段，作者逐项接受、修改或拒绝后才写入 `fields[]`；不得读取 Creator Studio Block Diagram 自动制表、直接覆盖稳定 `id` 或自动发布。Google PAIR 建议在创意任务中平衡自动化与用户控制，并允许用户修改或关闭建议；参考 [Feedback + Control](https://pair.withgoogle.com/guidebook-v2/chapter/feedback-controls/)。Microsoft 的人机交互指南强调在 AI 出错时提供校正与控制；参考 [Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/research/project/guidelines-for-human-ai-interaction/)。
