import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

import {
  resetStageFourState,
  stageFourResetUnavailableReason,
} from "./stage4-test-database";

const APP_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const IDENTITY_HEADER = "X-Our-Tomorrow-Role";

type IdentityRole = "boy" | "girl";

function dateTimeLocalValue(value: Date): string {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function isApiResponse(
  response: {
    request(): { method(): string };
    url(): string;
  },
  method: string,
  pathname: string,
) {
  return (
    response.request().method() === method &&
    new URL(response.url()).pathname === pathname
  );
}

async function selectIdentity(page: Page, role: IdentityRole) {
  await page.goto(APP_URL);
  await page.getByLabel("你的名字").fill(role === "boy" ? "示例用户甲" : "示例用户乙");
  await page.getByRole("button", { name: "验证名字" }).click();
  await expect(page).toHaveURL(/\/today$/);
}

async function openTomorrow(page: Page) {
  await page.goto(`${APP_URL}/tomorrow`);
  await expect(
    page.getByRole("heading", {
      name: "把期待写下来，让它有一天真的发生。",
    }),
  ).toBeVisible();
}

function cardFor(page: Page, title: string) {
  return page
    .locator("main")
    .getByRole("heading", { name: title, exact: true })
    .locator("xpath=ancestor::button");
}

test.setTimeout(120_000);

test.beforeEach(() => {
  const unavailableReason = stageFourResetUnavailableReason();
  test.skip(Boolean(unavailableReason), unavailableReason ?? undefined);
  resetStageFourState();
});

test("two identities carry a wish into memory and cannot read a locked capsule early", async ({
  browser,
}, testInfo) => {
  const suffix = `${testInfo.project.name}-${randomUUID().slice(0, 8)}`;
  const wishTitle = `一起看一场日出 · ${suffix}`;
  const wishExpectation = `希望出发前还能听见彼此说早安。${suffix}`;
  const planTitle = `海边日出计划 · ${suffix}`;
  const completionNote = `真的比想象里更安静，也更值得。${suffix}`;
  const memoryTitle = `我们一起等到的日出 · ${suffix}`;
  const memoryContent = `从愿望、计划到真正发生，这个清晨终于被我们记住。${suffix}`;
  const capsuleTitle = `明年此刻再打开 · ${suffix}`;
  const capsuleSecret = `这句话只能在正确的时间被看见。${suffix}`;

  const boyContext = await browser.newContext();
  const girlContext = await browser.newContext();
  const boy = await boyContext.newPage();
  const girl = await girlContext.newPage();

  try {
    await selectIdentity(boy, "boy");
    await selectIdentity(girl, "girl");
    await openTomorrow(boy);
    await openTomorrow(girl);

    await expect(
      girl.getByRole("heading", {
        name: "把想去的地方放在同一张地图上",
      }),
    ).toBeVisible();
    const futureLetter = girl
      .locator('[aria-disabled="true"]')
      .filter({ has: girl.getByRole("heading", { name: "未来来信" }) });
    await expect(futureLetter).toContainText("稍后开放");

    await boy.getByRole("button", { name: "新愿望" }).first().click();
    const wishComposer = boy.getByRole("dialog", {
      name: "写下一件想一起实现的事",
    });
    await wishComposer.getByLabel("愿望标题").fill(wishTitle);
    await wishComposer.getByLabel("想做什么").fill("天亮前一起走到海边。");
    await wishComposer.getByLabel("一句期待").fill(wishExpectation);
    await wishComposer.getByRole("button", { name: "写下愿望" }).click();

    await expect(cardFor(girl, wishTitle)).toBeVisible({ timeout: 15_000 });
    await expect(cardFor(girl, wishTitle)).toContainText("有个想法");

    const wishDialog = boy.getByRole("dialog", { name: wishTitle });
    await wishDialog.getByRole("button", { name: "开始计划" }).click();
    const planComposer = boy.getByRole("dialog", {
      name: "把期待变成轻量计划",
    });
    await planComposer.getByLabel("计划标题").fill(planTitle);
    await planComposer
      .getByLabel("轻量行程")
      .fill("带上热饮，天亮前抵达海边。");
    await planComposer.getByRole("button", { name: "保存并进入计划" }).click();

    await expect(cardFor(girl, wishTitle)).toContainText("已经计划", {
      timeout: 15_000,
    });
    await boy
      .getByRole("dialog", { name: wishTitle })
      .getByRole("button", { name: "开始实现" })
      .click();
    await expect(cardFor(girl, wishTitle)).toContainText("正在实现", {
      timeout: 15_000,
    });

    await boy
      .getByRole("dialog", { name: wishTitle })
      .getByRole("button", { name: "完成愿望" })
      .click();
    const completionComposer = boy.getByRole("dialog", {
      name: "这件未来已经发生了",
    });
    await completionComposer.getByLabel("完成后的感受").fill(completionNote);
    await completionComposer
      .getByRole("button", { name: "确认已经完成" })
      .click();

    await expect(cardFor(girl, wishTitle)).toContainText("已经完成", {
      timeout: 15_000,
    });
    await boy
      .getByRole("dialog", { name: wishTitle })
      .getByRole("button", { name: "转为回忆" })
      .click();
    const memoryComposer = boy.getByRole("dialog", {
      name: "把它写进记录",
    });
    await memoryComposer.getByLabel("回忆标题").fill(memoryTitle);
    await memoryComposer.getByLabel("回忆正文").fill(memoryContent);
    await memoryComposer.getByRole("button", { name: "转为一段回忆" }).click();

    await expect(cardFor(girl, wishTitle)).toContainText("已成为回忆", {
      timeout: 15_000,
    });
    await girl.goto(`${APP_URL}/remember`);
    await expect(
      girl.getByRole("button", { name: `打开回忆：${memoryTitle}` }),
    ).toBeVisible({ timeout: 15_000 });

    await boy
      .getByRole("dialog", { name: wishTitle })
      .getByRole("button", { name: "关闭面板" })
      .click();
    await boy.getByRole("button", { name: "新胶囊", exact: true }).click();
    const capsuleComposer = boy.getByRole("dialog", {
      name: "写一枚时间胶囊",
    });
    await capsuleComposer.getByLabel("胶囊标题").fill(capsuleTitle);
    await capsuleComposer
      .getByLabel("解锁时间")
      .fill(dateTimeLocalValue(new Date(Date.now() + 24 * 60 * 60 * 1_000)));
    await capsuleComposer.getByLabel("胶囊正文").fill(capsuleSecret);

    const [createCapsuleResponse] = await Promise.all([
      boy.waitForResponse((response) =>
        isApiResponse(response, "POST", "/api/v1/capsules"),
      ),
      capsuleComposer.getByRole("button", { name: "创建胶囊草稿" }).click(),
    ]);
    expect(createCapsuleResponse.ok()).toBe(true);
    const createdCapsule = (await createCapsuleResponse.json()) as {
      id: string;
    };

    const capsuleDialog = boy.getByRole("dialog", { name: capsuleTitle });
    await capsuleDialog.getByRole("button", { name: "封存胶囊" }).click();
    await expect(capsuleDialog.getByText("内容还在封存中")).toBeVisible();
    await expect(
      capsuleDialog.getByText(capsuleSecret, { exact: true }),
    ).toBeHidden();

    const lockedDetailResponse = await girl.request.get(
      `${APP_URL}/api/v1/capsules/${createdCapsule.id}`,
      { headers: { [IDENTITY_HEADER]: "girl" } },
    );
    expect(lockedDetailResponse.ok()).toBe(true);
    const lockedDetail = (await lockedDetailResponse.json()) as Record<
      string,
      unknown
    >;
    expect(lockedDetail).toMatchObject({
      id: createdCapsule.id,
      bodyAvailable: false,
    });
    expect(lockedDetail).not.toHaveProperty("messages");
    expect(lockedDetail).not.toHaveProperty("media");
    expect(JSON.stringify(lockedDetail)).not.toContain(capsuleSecret);

    await openTomorrow(girl);
    await expect(cardFor(girl, capsuleTitle)).toBeVisible({ timeout: 15_000 });
    await cardFor(girl, capsuleTitle).click();
    const partnerCapsuleDialog = girl.getByRole("dialog", {
      name: capsuleTitle,
    });
    await expect(
      partnerCapsuleDialog.getByText("内容还在封存中"),
    ).toBeVisible();
    await expect(
      partnerCapsuleDialog.getByText(capsuleSecret, { exact: true }),
    ).toBeHidden();
  } finally {
    await boyContext.close();
    await girlContext.close();
  }
});
