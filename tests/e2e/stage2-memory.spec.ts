import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

const APP_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWO4kxcFQQxwFgBlkAnZCjtrrwAAAABJRU5ErkJggg==",
  "base64",
);

test.setTimeout(90_000);

test("two local identities complete and rediscover one private memory", async ({
  browser,
}, testInfo) => {
  const suffix = `${testInfo.project.name.replace(/[^a-z0-9]+/gi, "-")}-${randomUUID().slice(0, 8)}`;
  const title = `第一次一起看海 · ${suffix}`;
  const tag = `海边-${suffix}`;
  const place = `晚风海岸-${suffix}`;
  const boyPerspective = `我记得那天的风，也记得你笑得很开心。${suffix}`;
  const girlPerspective = `其实我提前准备了两把伞。${suffix}`;
  const comment = `下次还要一起去。${suffix}`;

  const boyContext = await browser.newContext();
  const girlContext = await browser.newContext();
  const boy = await boyContext.newPage();
  const girl = await girlContext.newPage();

  await boy.goto(APP_URL);
  await boy.getByRole("button", { name: "选择我是男生" }).click();
  await expect(boy).toHaveURL(/\/today$/);
  await boy.goto(`${APP_URL}/remember`);
  await boy.getByRole("button", { name: "新回忆" }).click();

  await boy.getByLabel("回忆标题").fill(title);
  await boy.getByLabel("发生时间").fill("2025-01-01T18:30");
  await boy.getByLabel("共同正文").fill("傍晚风很大，但我们都舍不得离开。");
  await boy
    .getByText("这是我们的第一次")
    .locator("xpath=ancestor::label")
    .getByRole("checkbox")
    .check();
  await boy.getByPlaceholder("这次第一次是什么？").fill("第一次一起看海");

  await boy.getByText("+ 快速创建").first().click();
  await boy.getByPlaceholder("地点名称").fill(place);
  await boy.getByPlaceholder("地点名称").press("Enter");
  await expect(boy.getByPlaceholder("地点名称")).toBeHidden();

  await boy.getByText("+ 快速创建").last().click();
  await boy.getByPlaceholder("新标签名").fill(tag);
  await boy.getByPlaceholder("新标签名").press("Enter");
  await expect(boy.getByPlaceholder("新标签名")).toBeHidden();

  await boy.getByLabel("选择照片").setInputFiles({
    name: `${suffix}.png`,
    mimeType: "image/png",
    buffer: PNG,
  });
  await boy.getByRole("button", { name: "保存回忆" }).click();
  const boyDetail = boy.getByRole("dialog", { name: "回忆详情" });
  await expect(boyDetail).toBeVisible();
  await expect(boyDetail.getByRole("heading", { name: title })).toBeVisible();

  await boy.getByPlaceholder("只写属于你的感受…").fill(boyPerspective);
  await boy.getByRole("button", { name: "提交视角" }).click();
  await expect(boy.getByText("你的视角已经提交给另一半。")).toBeVisible();

  await girl.goto(APP_URL);
  await girl.getByRole("button", { name: "选择我是女生" }).click();
  await expect(girl).toHaveURL(/\/today$/);
  await girl.goto(`${APP_URL}/remember`);
  await girl.getByRole("button", { name: `打开回忆：${title}` }).click();
  await expect(girl.getByText(boyPerspective)).toBeVisible();

  const privateImage = girl.getByAltText(`${suffix}.png`);
  await expect(privateImage).toBeVisible();
  await expect
    .poll(() =>
      privateImage.evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);

  await girl.getByPlaceholder("只写属于你的感受…").fill(girlPerspective);
  await girl.getByRole("button", { name: "提交视角" }).click();
  await expect(girl.getByText("你的视角已经提交给另一半。")).toBeVisible();

  await girl.getByPlaceholder("写一句想说的话…").fill(comment);
  await girl.getByRole("button", { name: "发送评论" }).click();
  await expect(girl.getByText(comment)).toBeVisible();
  await girl.getByRole("button", { name: /❤️/ }).click();
  await expect(girl.getByRole("button", { name: /❤️ 1/ })).toBeVisible();

  await girl
    .getByRole("dialog", { name: "回忆详情" })
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await girl.getByPlaceholder("搜索标题、正文或地点").fill(title);
  await girl.getByRole("button", { name: "筛选" }).click();
  await girl.getByLabel("年份").selectOption("2025");
  await girl.getByLabel("月份").selectOption("8");
  await girl.getByLabel("标签").selectOption({ label: `# ${tag}` });
  await girl.getByLabel("地点").selectOption({ label: place });
  await girl.getByLabel("双方视角").selectOption("complete");
  await expect(
    girl.getByRole("button", { name: `打开回忆：${title}` }),
  ).toBeVisible();

  await girl.reload();
  await expect(girl).toHaveURL(/\/remember$/);
  await expect(girl.getByText(title).first()).toBeVisible();

  await boy.reload();
  await boy.goto(`${APP_URL}/remember`);
  await boy.getByRole("button", { name: `打开回忆：${title}` }).click();
  await expect(boy.getByText(girlPerspective)).toBeVisible();
  await expect(boy.getByText(comment)).toBeVisible();
});
