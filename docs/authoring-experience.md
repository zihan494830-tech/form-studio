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
| P1 | 主标题只写表名，未提供可找到的归属和发布范围 | 不知道正在改谁、是否影响 Poffices | 主标题保留名称与草稿状态；来源、`ownerAgent`、版本和入口模式收进默认折叠的「归属与发布范围」 |
| P1 | 发布和停用未写清本地边界 | 误以为会直接修改 Poffices Official agent | 顶部固定说明只影响 Form Studio；动作使用“发布用户页面 / 停用用户页面” |
| P2 | `mock`、2A、`agent ID` 等工程词直接暴露 | 不知道它们对作者有什么用 | mock 只留测试；真实身份查询解释为“选择页面主人” |
| P2 | 左栏同时承担创建、连接、导航和状态 | 对象增多后无限纵向堆积 | 起始流程与工作区导航分开；高级诊断收进设置或开发区 |

作者面最低可理解性标准：进入工作区后五秒内能回答「正在改哪张 Agent 表单」「是否有未保存修改」「下一步如何预览或发布」；需要核对归属、版本和本地／平台边界时，能从同一处「归属与发布范围」一键找到。

### 2026-08-20 已修复：新生身份文案

旧新建页写“创建时会同时分配稳定的 `ownerAgent`”。技术合同正确，但用户反馈证明它没有解释实际作用，还容易被理解成 Form Studio 会创建或连接一个 Poffices agent。`ownerAgent` 是路由、持久化和提交归属所需的内部身份，不是作者购买功能的理由。

主流程现已改为：“创建一个由 Form Studio 管理的 agent form；它可以独立设计、发布和持续接收提交，不会创建或修改 Poffices agent。”这不是暂时缺权限，而是永久产品边界。系统生成的 `form-N` 只在详情中标为“本地页面 ID”。新生身份一经创建不可改绑为已有 agent；需要复用时只复制字段设计，不移动原 `ownerAgent`、URL、发布历史或提交记录。

退出条件已由 E2E 冻结：首次使用者无需理解 `ownerAgent` 术语，也能在选择前看清“改装是给已有 Poffices agent 做本地页面；新生是创建 Form Studio 自己管理的新页面身份”。

2026-08-20 第二轮质检又修复三项：

- 左侧页面库删去重复解释，增加“全部 / 已发布 / 草稿”筛选和结果数；列表项只保留名称、状态、出生路径与稳定 id。
- 字段稳定 ID 不在主属性区永久展开；右栏只保留展示名称、控件、必填和上下文动作，「字段接口信息」独立对话框集中展示 label ↔ ID、复制动作和发布状态。
- 作者预览按“设计 / 未发布草稿 / 已发布版本”解释状态：设计模式不可填写，草稿可试填但未发布，已发布版本可试填但不会制造正式提交。未发布时隐藏无意义的停用动作并禁用用户页链接；产品文案统一使用“草稿 / 已发布版本”。
- 字段接口信息默认只读；点击「修改草稿 ID」后才显示输入框和影响说明。已发布字段修改只进入草稿，重新发布后新提交才使用新键，历史提交和旧发布版本仍保留旧 ID。工作区只保留「输入表单 / 收到的提交」两个上层任务；输入表单使用中央真实画布与右侧上下文属性栏，中窄屏变成抽屉且不产生页面级水平溢出。
- 左侧目录徽标只表达生命周期状态：「已发布 / 未发布 / 待发布」，不再显示缺少上下文的 `vN`。当前表单标题区明确写「线上版本 N」「编辑版本 N」；提交历史使用「表单版本 N」。版本合同和存储值不变，只优化人的解释层。状态标签遵循 [GOV.UK Tag](https://design-system.service.gov.uk/components/tag/) 关于 tag 只表示状态、使用尽可能少状态且不只靠颜色传达信息的指导。

字段控件继续使用可见、可理解的标签，依据 [W3C WAI Form Labels](https://www.w3.org/WAI/tutorials/forms/labels/)；少数人才需要的接口信息采用渐进披露，依据 [GOV.UK Details](https://design-system.service.gov.uk/components/details/) 和 [Carbon Disclosures](https://preview.carbondesignsystem.com/building-blocks/core/patterns/disclosures)；主编辑区避免突发布局移动，依据 [web.dev Optimize Cumulative Layout Shift](https://web.dev/articles/optimize-cls)。本项目选择对话框而非逐行 details，是因为技术字段存在多行重复且包含复制/修改控件；这是当前空间约束下的工程拍板，不引入新 UI 框架。

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

主区页签：输入表单 / 收到的提交
  - 两者始终绑定同一个 ownerAgent
  - 输入表单中央只有一个真实表单画布；设计 / 预览共用该区域
  - 所有字段与 grid 行列修改进入右侧上下文属性栏
- 真实提交仍从独立发布页发生，不从作者预览伪造填表身份
  - 收到的提交切入时刷新当前 owner 的字段账本和信封
```

2A 身份查询在这个结构里是改装向导的一步，不是常驻设计对象。开发阶段仍可保留独立诊断入口，但不得与当前工作区形成视觉绑定。

### 提交管理与消费者：作者诊断已进入工作区

目标中的通用读取能力按 `ownerAgent`、主体能力和具体资源范围浏览提交列表、详情与 `values[id]`；课堂、CRM 或分析应用可以有自己的 UI，但不应把应用专属角色和 scope 写回 Form Studio 核心。

当前 `/classroom` 仍呈现 teacher/class 业务界面并调用兼容 teacher 路由，但其后已由课堂 adapter 映射到通用 `submission:read` application 端口；它不是通用台账。工作区现在保留 owner-scoped「收到的提交」：它相当于该 agent 的通用收件箱，只显示输入结构、原始提交值、时间和投递状态，并在切入时刷新。课堂里的“教师收到学生提交”是这项能力的一次业务实例，不是核心里的固定角色。批改、评分、统计、工单和跨应用连接健康仍属于外部消费者，不因此进入 Form Studio。

中央画布支持 60%–140% 缩放。普通滚轮继续滚动长表单；Ctrl/⌘ + 滚轮才改变倍率，并同时提供 − / 百分比重设 / + 按钮，避免把手势设为唯一入口。实现依据 [MDN wheel event](https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event)、[MDN CSS zoom](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/zoom) 和 [WCAG 2.2 Pointer Gestures](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html)。作者收件箱用 owner 内追加顺序产生的「提交 #N」作为主标识，符合交易使用稳定 reference 的思路，可参考 [GOV.UK Confirmation pages](https://design-system.service.gov.uk/patterns/confirmation-pages/)；`actorName`、`actorId` 和 `submitterId` 只保留在授权、审计及外部消费者投影中。

页签实现遵循 [W3C APG Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)；[Google Forms 官方界面说明](https://support.google.com/docs/answer/3527854?hl=en)把 Questions/Responses 作为上层任务，并把 Preview 作为编辑上下文内的动作，这支持本项目把「输入定义 / 收到的数据」作为第一层、把预览留在输入设计上下文。SurveyJS 的 [Creator API](https://surveyjs.io/survey-creator/documentation/api-reference/surveycreator)也证明设计与预览是同一作者工具的不同工作模式；本项目只借用“设计面选择对象 → Property Grid 修改”的作者流，继续使用现有 `renderFormHtml` 和封闭字段合同，未引入其完整工具框架。用户表单采用移动优先、受控行长、标签置于控件上方的单栏结构，依据 [GOV.UK Layout](https://design-system.service.gov.uk/styles/layout/) 与 [GOV.UK Text input](https://design-system.service.gov.uk/components/text-input/)。这些是交互与可读性依据，不代表引入 SurveyJS 或复制参考系统品牌。

### 2026-08-23：单画布与上下文属性栏

双主画布在加入 grid 后产生了真实的操作歧义：左侧配置卡和右侧表单都占据主视觉，作者无法从表格本身判断正在改哪一行或列。现改为：左侧只导航页面，中央 iframe 是唯一真实设计画布，右侧 340px 属性栏承担字段与 grid 结构修改；960–1279px 为 360px 非模态抽屉，960px 以下为工作区全宽属性视图。设计和预览通过同一画布切换，公开 `/a/:ownerAgent` 不获得作者选择行为。

有依据的部分：

- [SurveyJS End-User Interface](https://surveyjs.io/survey-creator/documentation/end-user-guide/user-interface)与其 [Creator API](https://surveyjs.io/survey-creator/documentation/api-reference/surveycreator)支持“中央设计面 + 选中元素属性面板 + 设计/预览模式”这条成熟作者流。
- 设计/预览及 grid 基本/行/列页签遵循 [W3C APG Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) 的选择状态、单一 tab stop 和方向键切换。
- 稳定字段、行、列 ID 保留在接口弹窗中渐进披露，依据 [GOV.UK Details](https://design-system.service.gov.uk/components/details/) 关于只隐藏少数用户需要的补充信息。

本项目的工程拍板：当前预览明确同源，先用 `contentDocument` 事件委托，不引入 `postMessage` 协议；只有出现跨域预览适配器才升级桥接。画布没有 cell 选择类型，因为现有合同没有单格属性。非 grid 转 grid 仍建默认 2×2；任何会丢弃 grid、选项或小数位的类型转换先确认。以上选择降低实现量，同时保留明确升级触发条件。

### 2026-08-23：第一轮真实使用反馈修正

作者在已发布页面的预览模式填完表格后，按钮仍显示“发布后可提交”。这不是未发布，而是作者预览被统一禁用后使用了错误原因。正式提交必须带填写者身份，并进入正式收件箱；作者预览直接提交会把测试数据冒充真实提交。因此修正为三种可见状态：设计模式“不提交”、草稿“尚未发布”、已发布版本“作者预览不提交”。已发布状态不再暗示需要重复发布，并明确说明测试填写不会进入正式收件箱；正式提交继续来自填写者打开的 `/a/:ownerAgent` 用户页面。

画布两侧空白不通过增加 Toolbox、Logic 或技术诊断来填满，也不通过把表单强行拉伸来消除。真实反馈证明 `90rem` 作者表单会让三列矩阵失去比较密度，输入框过长、横向扫描距离过大。现将公开用户页继续保持约 `48rem`，作者 iframe 表单上限收回到 `58rem`；矩阵使用固定布局、约 `6.25rem` 行标题列、紧凑控件高度和弱边框，多列时只在 grid 自身横向滚动。这里借鉴参考界面的受控列宽、居中列标题和轻量表格视觉，但不复制其 Toolbox 或问卷平台能力。只有真实任务超过约 12 个字段并反复出现定位成本时，才评估结构大纲；排序需求出现后再评估拖拽。

“栏位接口信息”也由整表默认展开改为上下文披露：打开时只显示当前选中的字段、grid 行或 grid 列；复制 ID 是直接动作，修改 ID 收进“高级”，派生格子 ID 默认折叠。完整表结构仍可通过“查看整张表的接口结构”进入。该修正继续依据 [GOV.UK Details](https://design-system.service.gov.uk/components/details/) 的渐进披露边界，也保留外部对接和排错所需的完整能力。

“解除本地绑定”被证实是合同内部词：实际效果只是停用 Form Studio 用户页面，保留草稿和历史提交，之后仍可重新发布，且不修改 Poffices agent。作者动作统一改名为“停用用户页面”，确认框只描述可见后果，不再暴露 `binding` 或 `inputBag`。

参考方案的空白也很明确：通用问卷编辑器文档没有覆盖 `ownerAgent`、不可变发布快照、`values[id]`、历史 grid 派生 ID 和 Agent 输入映射的共同约束。因此这些参考只证明作者流，不证明能替换 Form Studio 合同；本轮继续复用现有 renderer、保存队列和服务端校验。

### 2026-08-23：v0.28 新手安全闭环

本轮把第一次使用者的主路径收敛为「创建 Agent 表单 → 添加字段 → 排序 → 预览 → 发布」。主流程不再要求先理解 `ownerAgent`、发布快照或开发数据身份；这些内容默认收进「归属与发布范围」和「环境信息」。稳定字段、行列与派生格子 ID 也只从「高级：数据接口」进入。这里采用渐进披露，不删除接口能力，也不改变任何持久化合同。

有依据的部分：

- [W3C WAI Forms Tutorial](https://www.w3.org/WAI/tutorials/forms/)要求标签、指令、校验和用户通知共同构成可理解的表单体验。因此字段类型菜单补充用途说明，空表提供三步引导，填写页继续使用明确 label／legend。
- [W3C WAI User Notifications](https://www.w3.org/WAI/tutorials/forms/notifications/)建议在提交后提供错误摘要，同时在对应字段附近给出具体反馈并帮助用户定位。因此公开填写页使用繁体中文错误摘要、字段旁错误和首个错误焦点；grid 的可访问名称由表格名、行名和列名组成，不再依赖浏览器语言不同的原生气泡。
- [NN/g Response Time Limits](https://www.nngroup.com/articles/response-times-3-important-limits/)把约 0.1 秒视为即时反馈、约 1 秒视为保持思路连续的边界。基于此，输入时立即显示「有未储存修改」，真正网络保存期间显示「储存中」；字段保存、切换 Agent、发布和手动刷新会立即打开 `aria-busy` 加载层。本地设计／预览切换以一秒内完成为人工验收上限，并通过复用同一 iframe 避免一次无价值的 `/preview` 请求。

工程取舍：

- 所有属性输入共享一个保存协议：文本停止输入 700ms 后进入串行保存队列，select / checkbox 立即保存；失焦、Enter、关闭属性、切换选择、切换预览、发布和生命周期动作都会强制 flush，Escape 回到最近成功值。保存失败保留本地文字、提供重试并阻止发布；dirty / saving / failed 才注册离页警告。没有新增保存 API，也没有改变 `fields[]` 的版本规则。
- 排序直接重排现有 `fields[]`、`grid.rows[]`、`grid.columns[]`，一次移动只发一次保存并保持稳定 ID。按钮在首尾禁用且键盘可用；当前规模没有证据证明拖拽的工程与可访问性成本值得承担。
- 发布检查是客户端确认边界：展示 Agent、草稿／线上版本、字段数、展开后的必填格子数和「只发布到 Form Studio」。预设名称只产生警告；返回修改不调用发布 API，明确确认才发一次既有 POST。
- 设计／预览始终使用同一份服务端渲染 HTML，同源桥只切换作者选择行为、输入可用状态和说明文字。字段保存仍重载画布，以保证 renderer 是唯一显示真相源；没有引入第二套 DOM renderer 或跨域消息合同。
- 空表“三步完成”只是辅助说明，不要求用户先作决定，因此改为画布外的可关闭信息条，不再用绝对定位卡片盖住 iframe。关闭后焦点回到“新增栏位”。[W3C APG Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)明确把模态定义为使底层内容不可操作，并要求可见关闭动作、Escape 和正确焦点；本提示不满足模态使用价值，所以不冒充 dialog。真正会改变状态的“移除表单”仍使用原生确认对话框，取消按钮在前，关闭时回到合理流程。
- 左侧清理采用可恢复移除而非物理删除：记录 `archivedAt`，同时清空当前 `published`／`binding` 以停用 Form Studio 用户页；字段、不可变 `publishedDefinitions` 和历史提交继续保留。“全部／已发布／草稿”默认排除已移除对象，“已移除”筛选提供恢复。恢复只回到未发布草稿，不擅自重新开放用户页，也不调用 Poffices 写端口。

参考资料没有覆盖不可变发布快照、Agent 独占入口、可恢复移除和 `values[id]` 信封，因此「发布前先排空保存队列」「预设内容仅警告」「同 iframe 同源桥」「移除保留历史但停用入口」属于本项目合同下的工程拍板。升级触发条件分别是：出现真实跨域 renderer、上下移动在真实长表任务中反复造成明显排序成本，或正式 Poffices 目录提供可授权名称查询合同。

### 2026-08-24：v0.29 设计工作台与正式填写页

“作者页面/用户页面”容易被理解成必须切换人格。v0.29 将界面名称改为“设计工作台/填写页”，并把差异解释为能力：工作台负责设计、预览与管理提交；内嵌预览明确“不提交”；只有独立填写页形成正式、可审计的 submission。demo 填写页第一次打开时解释并选择演示填写者，正式 product 不提供假登录，缺身份 provider 直接显示服务不可用。

### 2026-08-24：1.0 Alpha 1 无角色感主流程

主路径固定为“编辑表单 → 试填草稿 → 发布 → 去填写 → 正式提交 → 管理提交”。`编辑/试填草稿` 只保留为画布状态，不在顶部重复；未发布时顶部主行动是“发布”，已发布且无修改时是“去填写”，有草稿修改时是“发布更新”并保留“去填写目前线上版”。停用和可恢复移除收进支持 Escape / 外部点击关闭的“更多”。该层级同时遵循 [W3C Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) 的模式切换语义和 [GOV.UK Button](https://design-system.service.gov.uk/components/button/) 的单一主行动原则。

收件箱左侧承担搜索、状态和归档筛选；右侧展示有效答案、永不覆盖的原始答案、管理表单、投递状态和修正历史。桌面两栏同高并各自滚动，左侧标题/筛选和选中项不会因右侧长详情被带走；窄屏改为单列自然滚动。“表单结构”收进折叠详情，不再永久占据半页。修正必须二次确认，页面同时标出原值与“已修正”。提交数未读完不显示 0；失败时保留旧数并明确“可能不是最新”。`not_configured` 解释为提交已保存于 Form Studio、尚未转交 Agent，不冒充已投递。

桌面属性栏宽度默认 340px，可在 280–520px 间拖动并记忆；键盘支持左右键、Home/End 和 Enter 恢复默认。低于 1280px 停用 splitter，沿用抽屉/全宽属性页。语义与键盘模型依据 [WAI-ARIA Window Splitter Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/)，像素边界是本项目当前画布可用宽度的权衡。

作者和填写者会话现可在同一浏览器共存，不再互相登出。属性编辑快照 stable field/grid ID，非法 decimals/空 label/重复 ID 就地提示；option 一行一个，英文逗号不再被拆分。创建、发布、复制、移除、恢复、停用与提交均有 single-flight/busy；发布回执在切换 Agent 时清空，iframe 失败有超时。仍保留中央画布和右侧属性栏，不借整改重做视觉系统；搜索 debounce 和课堂深链因无当前效果证据未实施。

跨标签页冲突不再通过“最后写入覆盖”静默解决。工作台每次作者写入携带当前 ETag，412 时保留本地输入并要求重新载入；这是可恢复冲突提示，不自动合并两个作者意图。正式填写成功后表单锁定，“再填一份”才重新加载新 intent；版本冲突时只恢复新版仍存在且合法的未提交答案，并要求使用者重新检查。

## Alan 会议截图的理解

截图显示 Gravity 品牌业务系统内的专业表单编辑器，界面与 SurveyJS Creator 高度相似：左侧 Toolbox、中央设计面、右侧 Property Grid，以及 Designer / Preview / JSON Editor / Translation。SurveyJS 官方说明也采用“工具箱拖入问题、属性面板修改配置”的结构：[End-User Interface](https://surveyjs.io/survey-creator/documentation/end-user-guide/user-interface)。工具箱条目会向 survey JSON schema 加入对应元素：[Toolbox Customization](https://surveyjs.io/survey-creator/documentation/toolbox-customization)。

从截图可采信的方向：

- form 由作者根据业务要求设计，不从 agent 内部详情自动生成；
- 工具箱、画布、属性面板、预览是一条成熟作者流；
- JSON 是设计结果的另一种视图，不是先写 JSON 再补页面；
- Page、Matrix、Comment、Logic、Translation 说明成熟版本可能需要比当前 `fields[]` 更强的 form definition。

不能仅凭截图采信的范围：

- 截图不是 Alan 后续承诺提供的完成版源码或合同；
- `file`、Dynamic Panel、多页、Logic、Translation 仍超出当前封闭控件词表；固定行列 Matrix 已由 `grid` 控件承载（v0.27），不在此列；
- 高度相似不等于已确认采用 SurveyJS；若考虑直接复用，还需检查持久化格式、提交结构、包体和商业授权；
- 参考实现的通用 Survey 能力不能覆盖 Form Studio 的 `ownerAgent`、一表一 agent、独占入口和提交信封合同。

v0.27 收口：截图的字段类（Rating、Multiple-Choice Matrix 等）属于**可借的设计表达力**——它们是同一封闭词表内的字段语义；Cookie name、Width mode、Logo in title 属于**问卷平台语义**，因服务于无主问卷与任意嵌入而被排除（`DESIGN.md` 3.2）。财务年度矩阵与单选矩阵作为固定行列 `grid` 的两种列配置进入词表；Dynamic Panel（填写者增删行）留在 v2 触发清单。

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

财务年度矩阵（固定行列）已由 `grid` 控件承担（v0.27）：作者保存 composite definition，执行时展开为扁平 leaf id，不改变 `values[id]` 信封。Dynamic Panel 是 v2 的明确候选但不是唯一触发条件；合同语义无法兼容、外部 consumer 无法无损读取或信封编码改变时也必须升版。`owner-agent-identity/v1` 继续只回答谁是主人；不得把表单结构塞进身份合同。

### v0.27 设计表达力（已完成）：radio / grid / number 小数位

- 控件词表包含「單選（評分）」与「表格（行 × 列）」；grid 的基本 / 行 / 列属性页提供加删行列、每列控件 / 必填 / 选项 / 小数位，不再保留另一套内联 grid 编辑器。
- 「接口資訊」面板默认只显示当前字段、行或列；行列 ID 可在高级区受控修改，派生格子 ID 折叠后只读复制，整表结构按需展开。「收到的提交」按信封版本把同一 grid 聚合成小表格，旧 definition 缺失则警告并保留原始 ID。
- grid 顶层不再出现含糊的“必填”；行列编辑先等保存队列排空并锁定当前 agent，删除行列要确认，删到最后一项会给出可见反馈。
- 表格输入以 legend + 行表头 + 列表头组成可访问名称，依据 [W3C ARIA9 的表格输入示例](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA9.html)；fieldsets 显式解除默认 min-content 宽度，390px 时滚动发生在 grid 容器而非整个页面。
- 财务年度矩阵（固定行列）即由此承担；动态行仍延期，但合同不兼容本身同样是 v2 触发条件。

## 2B-A / B / C 验收清单

- [x] 起始页只呈现改装 / 新生两条路径。
- [x] 身份核对结果不与未绑定设计对象同时常驻。
- [x] 当前工作区显著显示真实 `ownerAgent` 或新生 id。
- [x] Official 可产生隔离本地绑定，界面不把它冒充为 Poffices 平台改动。
- [x] 本地发布、解绑没有 Poffices 写端口可调用。
- [x] 绑定合同保持一表一 agent，提交信封形状不变。
- [x] `published` 独占使用入口，草稿不泄漏。
- [x] 自动测试覆盖空、加载、失败、键盘和窄屏状态。
- [x] 宽屏中央画布 + 右侧属性栏；中屏右侧抽屉；小屏全宽属性视图；换屏无水平溢出。

响应式实现按工作区容器宽度选择布局，而不是猜设备型号，依据 [MDN Container Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries)；小屏验收遵循内容无需双向滚动的 [WCAG 2.2 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)。

## 延期的 AI 辅助边界

“人工为主、AI 为辅”可能缓解空白表的起步成本，但当前瓶颈仍是合同一致性、历史解释和作者安全，因此继续延期。转正前先用至少两种真实作者任务建立无 AI 的首稿时间 / 返工量基线；AI 原型只有在这些指标可比较时才试验。即使实施，也只在独立建议区生成可审查草稿，作者逐项接受、修改、拒绝或完全不用后才写入 `fields[]`；不得覆盖稳定 `id` 或自动发布。依据 [Google PAIR Feedback + Control](https://pair.withgoogle.com/guidebook-v2/chapter/feedback-controls/) 与 [Microsoft Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/research/project/guidelines-for-human-ai-interaction/)。
