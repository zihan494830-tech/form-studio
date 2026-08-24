export function workspaceButton(page, ownerAgent) {
  return page.locator(`#agent-list [data-id="${ownerAgent}"]`);
}

export async function selectWorkspace(page, ownerAgent) {
  await workspaceButton(page, ownerAgent).click();
}

export async function addField(page, control = "text") {
  await page.locator("#add-field").click();
  await page.locator(`[data-add-control="${control}"]`).click();
}

export async function userFace(page) {
  await page.locator("#view-design").click();
  return page.frameLocator('iframe[name="face"]');
}

export async function openPublishedFace(context, ownerAgent) {
  const page = await context.newPage();
  await page.goto(`/a/${ownerAgent}`);
  return page;
}

export async function submitFace(face) {
  await face.locator("#agent-form [type=submit]").click();
}

export async function publishWorkspace(page) {
  await page.locator("#bind-btn").click();
  await page.locator("#publish-confirm").click();
  await page.locator("#publish-receipt").waitFor({ state: "visible" });
}

export async function unpublishWorkspace(page) {
  await page.locator("#more-actions > summary").click();
  await page.locator("#unbind-btn").click();
  await page.locator("#confirm-accept").click();
}

export async function startBornFlow(page) {
  await page.locator("#born-start").click();
}

export async function startRetrofitFlow(page) {
  await page.locator("#retrofit-start").click();
}

export async function lookupOwner(page) {
  await page.locator("#identity-check-btn").click();
}

export async function createRetrofitWorkspace(page) {
  await page.locator("#create-retrofit-btn").click();
}

export async function openRecords(page) {
  await page.locator("#view-submissions").click();
}
