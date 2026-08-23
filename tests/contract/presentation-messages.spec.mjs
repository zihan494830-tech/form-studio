import { expect, test } from "@playwright/test";
import { renderFormHtml } from "../../src/presentation/form/render-html.mjs";
import { locale, presentProblem, t } from "../../src/presentation/messages/zh-HK.mjs";

test("zh-HK 消息目录按稳定 key 格式化错误和动态句子", () => {
  expect(locale).toBe("zh-HK");
  expect(t("ui.face.saved", { agent: "分析 agent" })).toBe("提交已儲存到 分析 agent");
  expect(presentProblem({ errorCode: "field_id_invalid", parameters: { id: "中文" }, status: 400 }))
    .toMatchObject({ errorCode: "field_id_invalid", error: "欄位 ID「中文」不合法。", status: 400 });
  expect(() => t("missing.key")).toThrow("missing_message:missing.key");
});

test("已发布页面的关键 zh-HK chrome 由消息目录渲染", () => {
  const html = renderFormHtml({ id: "a-1", name: "作者資料" }, [
    { id: "company", label: "公司", control: "select", required: true, options: ["甲"] },
  ], { formVersion: 1 });
  expect(html).toContain(`<html lang="${locale}">`);
  expect(html).toContain(t("ui.face.lead"));
  expect(html).toContain(`>${t("ui.face.select")}<`);
  expect(html).toContain(`>${t("ui.face.submit")}<`);
});
