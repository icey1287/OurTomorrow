import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

import {
  resetStageSixState,
  stageSixResetUnavailableReason,
} from "./stage6-test-database";

const APP_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const IDENTITY_HEADER = "X-Our-Tomorrow-Role";

type IdentityRole = "boy" | "girl";

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

async function openDaily(page: Page) {
  await page.goto(`${APP_URL}/daily`);
  await expect(page.getByRole("heading", { name: "抱抱信号" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "冷静信箱" })).toBeVisible();
}

function sectionByHeading(page: Page, heading: string) {
  return page
    .getByRole("heading", { name: heading, exact: true })
    .locator("xpath=ancestor::section[1]");
}

async function apiPost<T>(
  page: Page,
  role: IdentityRole,
  pathname: string,
  data: unknown,
): Promise<T> {
  const response = await page.request.post(`${APP_URL}/api/v1${pathname}`, {
    headers: { [IDENTITY_HEADER]: role },
    data,
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as T;
}

test.setTimeout(120_000);

test.beforeEach(() => {
  const unavailableReason = stageSixResetUnavailableReason();
  test.skip(Boolean(unavailableReason), unavailableReason ?? undefined);
  resetStageSixState();
});

test("an offline partner receives a durable fixed-kind hug and explicitly opens an immediately available calm letter", async ({
  browser,
}, testInfo) => {
  const suffix = `${testInfo.project.name}-${randomUUID().slice(0, 8)}`;
  const calmSecret = `等我们都准备好，再一起读完这句话。${suffix}`;
  const boyContext = await browser.newContext();
  const girlContext = await browser.newContext();
  const boy = await boyContext.newPage();
  const girl = await girlContext.newPage();

  try {
    await selectIdentity(boy, "boy");
    await selectIdentity(girl, "girl");
    await openDaily(boy);
    await openDaily(girl);

    await girlContext.setOffline(true);
    const touchSection = sectionByHeading(boy, "抱抱信号");
    await touchSection
      .getByRole("button", { name: "抱抱", exact: true })
      .click();
    await expect(
      touchSection.getByText(/“抱抱”已经轻轻送到.+那里。/),
    ).toBeVisible();

    await girlContext.setOffline(false);
    await girl.reload();
    const notificationResponse = await girl.request.get(
      `${APP_URL}/api/v1/notifications?limit=10`,
      { headers: { [IDENTITY_HEADER]: "girl" } },
    );
    expect(notificationResponse.ok()).toBe(true);
    const notificationPage = (await notificationResponse.json()) as {
      items: Array<{
        type: string;
        payload: Record<string, unknown>;
        title: string;
        body: string;
      }>;
    };
    const touchNotification = notificationPage.items.find(
      ({ type }) => type === "TOUCH_EVENT_RECEIVED",
    );
    expect(touchNotification).toMatchObject({
      type: "TOUCH_EVENT_RECEIVED",
      payload: { kind: "HUG" },
    });
    expect(JSON.stringify(touchNotification)).not.toContain("message");

    const notificationTrigger = girl.getByRole("button", {
      name: /打开通知中心，有 [1-9]\d* 条未读通知/,
    });
    await expect(notificationTrigger).toBeVisible({ timeout: 15_000 });
    await notificationTrigger.click();
    const notificationDialog = girl.getByRole("dialog", {
      name: "通知中心",
    });
    await expect(
      notificationDialog.getByText("收到一个轻轻的信号", { exact: true }),
    ).toBeVisible();
    await expect(
      notificationDialog.getByText("对方送来一个抱抱。", { exact: true }),
    ).toBeVisible();
    await notificationDialog
      .getByRole("button", { name: "关闭通知中心" })
      .click();

    const boyLetters = sectionByHeading(boy, "冷静信箱");
    await boyLetters.getByLabel("什么时候可打开").selectOption("0");
    await boyLetters
      .getByPlaceholder("只写你真正想表达的部分，不必马上找到答案…")
      .fill(calmSecret);
    const [createLetterResponse] = await Promise.all([
      boy.waitForResponse((response) =>
        isApiResponse(response, "POST", "/api/v1/calm-letters"),
      ),
      boyLetters.getByRole("button", { name: "放进冷静信箱" }).click(),
    ]);
    expect(createLetterResponse.ok()).toBe(true);
    const createdLetter = (await createLetterResponse.json()) as {
      id: string;
    };
    await expect(
      boyLetters.getByText("信已经送达；对方仍需亲自点开，正文才会出现。", {
        exact: true,
      }),
    ).toBeVisible();

    const unopenedResponse = await girl.request.get(
      `${APP_URL}/api/v1/calm-letters/${createdLetter.id}`,
      { headers: { [IDENTITY_HEADER]: "girl" } },
    );
    expect(unopenedResponse.ok()).toBe(true);
    const unopened = (await unopenedResponse.json()) as Record<string, unknown>;
    expect(unopened).toMatchObject({
      status: "AVAILABLE",
      bodyAvailable: false,
      canOpen: true,
    });
    expect(unopened).not.toHaveProperty("content");
    expect(JSON.stringify(unopened)).not.toContain(calmSecret);

    const girlLetters = sectionByHeading(girl, "冷静信箱");
    await girlLetters.getByRole("button", { name: "刷新" }).click();
    const receivedList = girlLetters.getByRole("group", {
      name: "冷静信列表",
    });
    const receivedLetter = receivedList.getByRole("button", {
      name: /^写给我的，可以打开，/,
    });
    await expect(receivedLetter).toContainText("写给我的");
    await expect(receivedLetter).toContainText("可以打开");
    await expect(girl.getByText(calmSecret, { exact: true })).toBeHidden();
    await receivedLetter.click();
    await expect(
      girlLetters.getByText(
        "时间已经到了；只有你点击下面的按钮后，服务端才会返回正文。",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(girl.getByText(calmSecret, { exact: true })).toBeHidden();
    await girlLetters.getByRole("button", { name: "我准备好打开了" }).click();
    await expect(girl.getByText(calmSecret, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await boyContext.close();
    await girlContext.close();
  }
});

test("the blind box, first-time museum, footprint map and future map share one coherent place history", async ({
  page,
}, testInfo) => {
  const suffix = `${testInfo.project.name}-${randomUUID().slice(0, 8)}`;
  const firstTitle = `第一次一起看海 · ${suffix}`;
  const historyPlaceName = `一起住过的城市 · ${suffix}`;
  const futurePlaceName = `下一次想去的海岛 · ${suffix}`;

  await selectIdentity(page, "boy");
  const firstMemory = await apiPost<{ id: string }>(page, "boy", "/memories", {
    title: firstTitle,
    content: `这段正文只能在盲盒打开后出现。${suffix}`,
    happenedAt: "2025-01-01T10:30:00.000Z",
    status: "PUBLISHED",
    isFirstTime: true,
    firstTimeLabel: "第一次一起看海",
  });
  await apiPost(page, "boy", "/places", {
    name: historyPlaceName,
    address: "上海",
    latitude: 31.2304,
    longitude: 121.4737,
    historyState: "VISITED",
    futureState: "NONE",
  });
  await apiPost(page, "boy", "/places", {
    name: futurePlaceName,
    address: "冲绳",
    latitude: 26.2124,
    longitude: 127.6809,
    historyState: "UNVISITED",
    futureState: "WANT_TO_GO",
  });

  await page.goto(`${APP_URL}/remember`);
  const blindBox = sectionByHeading(page, "回忆盲盒");
  await expect(blindBox).toBeVisible();
  await expect(blindBox.getByText(firstTitle, { exact: true })).toBeHidden();
  await expect(
    blindBox.getByText("同一盒，正在等你们亲手打开", { exact: true }),
  ).toBeVisible();
  await blindBox.getByRole("button", { name: "显式打开今天的盲盒" }).click();
  await expect(blindBox.getByText(firstTitle, { exact: true })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "第一次博物馆", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "第一次博物馆", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `打开第一次藏品：${firstTitle}` }),
  ).toBeVisible();
  await expect(page.getByText(/你们第一次一起看海，是在/)).toBeVisible();

  await page.getByRole("button", { name: "足迹地图", exact: true }).click();
  const footprint = sectionByHeading(page, "我们一起走过的地方");
  await expect(
    footprint.getByRole("img", { name: "共同地点世界地图" }),
  ).toBeVisible();
  const footprintList = footprint.getByRole("group", {
    name: "共同足迹地点列表",
  });
  await expect(footprintList.getByText(historyPlaceName)).toBeVisible();
  await footprintList.getByText(historyPlaceName).click();
  await footprint.getByRole("button", { name: "住过", exact: true }).click();
  await expect(
    footprint.getByText("已记为一起住过。", { exact: true }),
  ).toBeVisible();

  await page.goto(`${APP_URL}/tomorrow`);
  const futureMap = sectionByHeading(page, "把想去的地方放在同一张地图上");
  await expect(
    futureMap.getByRole("img", { name: "共同地点世界地图" }),
  ).toBeVisible();
  const futureList = futureMap.getByRole("group", { name: "未来地点列表" });
  await expect(futureList.getByText(futurePlaceName)).toBeVisible();
  await futureList.getByText(futurePlaceName).click();
  await futureMap.getByRole("button", { name: "已计划", exact: true }).click();
  await expect(
    futureMap.getByText(`${futurePlaceName} 已更新为“已计划”。`, {
      exact: true,
    }),
  ).toBeVisible();

  const openedResponse = await page.request.get(
    `${APP_URL}/api/v1/memory-resurfaces/today`,
    { headers: { [IDENTITY_HEADER]: "boy" } },
  );
  expect(openedResponse.ok()).toBe(true);
  expect(await openedResponse.json()).toMatchObject({
    box: { memory: { id: firstMemory.id } },
  });
});

test("a generated annual memory book renders public yearly statistics and keywords", async ({
  page,
}, testInfo) => {
  const suffix = `${testInfo.project.name}-${randomUUID().slice(0, 8)}`;
  const memoryTitle = `这一年的公开故事 · ${suffix}`;
  const placeName = `这一年的共同地点 · ${suffix}`;
  const keyword = `年度-${randomUUID().slice(0, 6)}`;
  const currentYear = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
    }).format(),
  );

  await selectIdentity(page, "boy");
  const tag = await apiPost<{ id: string }>(page, "boy", "/tags", {
    name: keyword,
  });
  const place = await apiPost<{ id: string }>(page, "boy", "/places", {
    name: placeName,
    latitude: 31.2304,
    longitude: 121.4737,
    historyState: "VISITED",
    futureState: "NONE",
  });
  await apiPost(page, "boy", "/memories", {
    title: memoryTitle,
    content: `只统计已经公开的共同内容。${suffix}`,
    happenedAt: new Date().toISOString(),
    status: "PUBLISHED",
    placeId: place.id,
    tagIds: [tag.id],
  });

  await page.goto(`${APP_URL}/us`);
  const annual = sectionByHeading(page, "年度回忆书");
  await annual.getByLabel("回忆书年份").selectOption(String(currentYear));
  await expect(
    annual.getByText(`${currentYear} 年还没有一本回忆书`, { exact: true }),
  ).toBeVisible();
  await annual.getByRole("button", { name: "生成这一年的回忆书" }).click();
  await expect(
    annual.getByText("年度回忆书已经交给后台整理。", { exact: true }),
  ).toBeVisible();
  await expect(
    annual.getByText("补上你的年度选择", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });

  await expect(
    annual.getByRole("article", { name: "共同回忆 1" }),
  ).toBeVisible();
  await expect(
    annual.getByRole("article", { name: "一起去过 1" }),
  ).toBeVisible();
  await expect(annual.getByText(`# ${keyword}`, { exact: true })).toBeVisible();
  await expect(annual.getByText(memoryTitle, { exact: true })).toBeHidden();
});
