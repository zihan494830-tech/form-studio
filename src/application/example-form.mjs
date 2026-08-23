/** 完整示例字段。只当作者复制的起点 / 回归，不属于全库字段合同。 */
export const EXAMPLE_FIELDS = [
  { id: "company_name", label: "公司或品牌", control: "text", required: true },
  { id: "analysis_goal", label: "分析目標", control: "textarea", required: true },
  { id: "target_market", label: "目標市場", control: "select", required: true, options: ["中國內地", "香港", "東南亞", "北美", "歐洲"] },
  { id: "budget_wan", label: "預算（萬元）", control: "number", required: false },
  { id: "include_competitors", label: "包含競品對比", control: "checkbox", required: false },
];
