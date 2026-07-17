import { expect, test, type Download, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

import {
  resetStageFiveState,
  stageFiveResetUnavailableReason,
} from "./stage5-test-database";

const APP_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const IDENTITY_HEADER = "X-Our-Tomorrow-Role";

async function selectBoy(page: Page) {
  await page.goto(APP_URL);
  await page.getByLabel("你的名字").fill("示例用户甲");
  await page.getByRole("button", { name: "验证名字" }).click();
  await expect(page).toHaveURL(/\/today$/);
}

async function downloadText(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

test.setTimeout(120_000);

test.beforeEach(() => {
  const unavailableReason = stageFiveResetUnavailableReason();
  test.skip(Boolean(unavailableReason), unavailableReason ?? undefined);
  resetStageFiveState();
});

test("a deleted memory can be restored and a private export downloads from settings", async ({
  page,
}, testInfo) => {
  const suffix = `${testInfo.project.name}-${randomUUID().slice(0, 8)}`;
  const memoryTitle = `仍然可以反悔的回忆 · ${suffix}`;

  await selectBoy(page);

  const created = await page.request.post(`${APP_URL}/api/v1/memories`, {
    headers: { [IDENTITY_HEADER]: "boy" },
    data: {
      title: memoryTitle,
      content: `这段内容会先进入回收站。${suffix}`,
      happenedAt: new Date().toISOString(),
      status: "PUBLISHED",
    },
  });
  expect(created.ok()).toBe(true);
  const memory = (await created.json()) as { id: string; version: number };

  const removed = await page.request.delete(
    `${APP_URL}/api/v1/memories/${memory.id}`,
    {
      headers: {
        [IDENTITY_HEADER]: "boy",
        "If-Match": `"memory:${memory.id}:${memory.version}"`,
      },
    },
  );
  expect(removed.status()).toBe(204);

  await page.goto(`${APP_URL}/settings`);
  await expect(
    page.getByRole("heading", { name: "管理身份、资料与共同外观。" }),
  ).toBeVisible();
  await page.getByLabel("内容类型").selectOption("MEMORY");

  const recycleItem = page
    .getByText(new RegExp(`资源 ${memory.id.slice(0, 8)}`))
    .locator("xpath=ancestor::article");
  await expect(recycleItem).toBeVisible();
  await recycleItem.getByRole("button", { name: "恢复" }).click();
  await expect(page.getByText("回忆已经恢复。", { exact: true })).toBeVisible();

  const restored = await page.request.get(
    `${APP_URL}/api/v1/memories/${memory.id}`,
    { headers: { [IDENTITY_HEADER]: "boy" } },
  );
  expect(restored.ok()).toBe(true);
  expect(await restored.json()).toMatchObject({ title: memoryTitle });

  await page.getByLabel("导出格式").selectOption("JSON");
  await page
    .getByRole("checkbox", {
      name: "我确认现在要为当前身份生成一份私密数据导出。",
    })
    .check();
  await page.getByRole("button", { name: "生成导出" }).click();

  const readyJob = page
    .locator("article")
    .filter({ hasText: "可以下载" })
    .first();
  await expect(readyJob).toBeVisible({ timeout: 30_000 });
  const downloadPromise = page.waitForEvent("download");
  await readyJob.getByRole("button", { name: "下载" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^our-tomorrow-.+\.json$/);

  const exported = JSON.parse(await downloadText(download)) as {
    format: string;
    version: number;
    identity: { role: string };
    memories: Array<{ title: string }>;
  };
  expect(exported).toMatchObject({
    format: "our-tomorrow-data",
    version: 1,
    identity: { role: "boy" },
  });
  expect(exported.memories).toContainEqual(
    expect.objectContaining({ title: memoryTitle }),
  );
  await expect(
    page.getByText("导出已交给浏览器下载。请把文件保存在私密位置。", {
      exact: true,
    }),
  ).toBeVisible();
});
