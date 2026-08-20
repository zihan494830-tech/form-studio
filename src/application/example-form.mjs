/** 完整示例字段。只当作者复制的起点 / 回归，不属于全库字段合同。 */
export const EXAMPLE_FIELDS = [
  { id: "company_name", label: "公司或品牌", control: "text", required: true },
  { id: "analysis_goal", label: "分析目标", control: "textarea", required: true },
  { id: "target_market", label: "目标市场", control: "select", required: true, options: ["中国内地", "香港", "东南亚", "北美", "欧洲"] },
  { id: "budget_wan", label: "预算（万元）", control: "number", required: false },
  { id: "include_competitors", label: "包含竞品对比", control: "checkbox", required: false },
];
