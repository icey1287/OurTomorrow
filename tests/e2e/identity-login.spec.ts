import { expect, test } from "@playwright/test";

const APP_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

test("the login page matches a real name before revealing the identity", async ({
  page,
}) => {
  await page.goto(`${APP_URL}/login`);

  await page.getByLabel("你的真名").fill("不是真名");
  await page.getByRole("button", { name: /翻开我们的手账/ }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "这本手账只认得我们两个人的真名。",
  );
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("你的真名").fill("示例用户甲");
  await page.getByRole("button", { name: /翻开我们的手账/ }).click();
  await expect(page.getByRole("status")).toContainText("认出你了");
  await expect(page.getByRole("status")).toContainText("示例用户甲");
  await expect(page).toHaveURL(/\/today$/);
  await expect(
    page.evaluate(() => localStorage.getItem("our-tomorrow-role")),
  ).resolves.toBe("boy");
});
