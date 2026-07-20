import { expect, test } from "@playwright/test";

const APP_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto(`${APP_URL}/login`);
  await page.getByLabel("你的真名").fill("示例用户甲");
  await page.getByRole("button", { name: /翻开我们的手账/ }).click();
  await expect(page).toHaveURL(/\/today$/);
});

test("the journal exposes only status, place and notes", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "今天的我们" })).toBeVisible();

  await page.getByRole("button", { name: /MY MOMENT/ }).click();
  await expect(
    page.getByRole("heading", { name: "换一张此刻贴纸" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "定位现在的位置" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭状态编辑" }).click();

  await page.getByRole("button", { name: /写给乙/ }).click();
  await page.getByLabel("从相册选择一张照片").setInputFiles({
    name: "spring-note.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlZ4h8AAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByAltText("待发送的照片")).toBeVisible();
  await page.getByLabel("想说什么？").fill("这是一张独立保存的测试便笺。");
  await page.getByRole("button", { name: "放进对方的手账" }).click();
  await expect(page.getByRole("dialog", { name: "写一张新便笺" })).toBeHidden();
  await expect(
    page
      .getByTestId("latest-note-card")
      .getByText("这是一张独立保存的测试便笺。"),
  ).toBeVisible();
  await expect(
    page.getByTestId("latest-note-card").getByAltText("便笺照片"),
  ).toBeVisible();

  await page.getByTestId("latest-note-card").click();
  await expect(
    page.getByTestId("note-box").getByAltText("便笺照片").first(),
  ).toBeVisible();
});

test("settings keeps only the shared anniversary and current user", async ({
  page,
}) => {
  await page.getByRole("link", { name: "打开设置" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(
    page.getByRole("heading", { name: "我们的纪念日" }),
  ).toBeVisible();
  await expect(page.getByText("我在手账里的称呼")).toHaveCount(0);
});
