/** 金稿字段。只当例子 / 回归，不当全库模板。 */
export const GOLD_FIELDS = [
  { id: "q1", label: "题目", control: "text", required: true },
  { id: "n1", label: "得分", control: "number", required: true },
  { id: "a1", label: "答案", control: "textarea", required: true },
];

export const CONTROLS = ["text", "textarea", "number", "select", "checkbox"];
export const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
