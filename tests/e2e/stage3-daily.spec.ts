import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

import {
  resetStageThreeState,
  stageThreeResetUnavailableReason,
} from "./stage3-test-database";

const APP_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const IDENTITY_HEADER = "X-Our-Tomorrow-Role";

type IdentityRole = "boy" | "girl";

type CreatedNote = {
  id: string;
  version: number;
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function dateTimeLocalValue(value: Date): string {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

test.setTimeout(90_000);

test.beforeEach(() => {
  const unavailableReason = stageThreeResetUnavailableReason();
  test.skip(Boolean(unavailableReason), unavailableReason ?? undefined);
  resetStageThreeState();
});

async function selectIdentity(page: Page, role: IdentityRole) {
  await page.goto(APP_URL);
  await page.getByLabel("你的名字").fill(role === "boy" ? "示例用户甲" : "示例用户乙");
  await page.getByRole("button", { name: "验证名字" }).click();
  await expect(page).toHaveURL(/\/today$/);
}

async function openDaily(page: Page) {
  await page.goto(`${APP_URL}/daily`);
  await expect(
    page.getByRole("heading", {
      name: "让对方知道，你正在经历怎样的现在。",
    }),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder("不用写得完整，诚实地留下今天的这一刻就好…"),
  ).toBeVisible();
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

test("two identities receive live status and a scheduled view-once note without an early body leak", async ({
  browser,
}, testInfo) => {
  const suffix = `${testInfo.project.name}-${randomUUID().slice(0, 8)}`;
  const statusMessage = `正在认真准备今晚的晚餐 · ${suffix}`;
  const noteContent = `等你看到时，记得先闭一下眼睛。${suffix}`;
  const boyContext = await browser.newContext();
  const girlContext = await browser.newContext();
  const boy = await boyContext.newPage();
  const girl = await girlContext.newPage();

  try {
    await selectIdentity(boy, "boy");
    await selectIdentity(girl, "girl");
    await openDaily(boy);
    await openDaily(girl);

    await boy.getByRole("button", { name: "设置我的状态" }).click();
    await boy.getByRole("button", { name: "✍️ 自定义" }).click();
    await boy.getByPlaceholder("例如：在专心赶一个小项目").fill(statusMessage);
    await boy.getByRole("button", { name: "保存并开始计时" }).click();

    await expect(girl.getByText(statusMessage, { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await boy.getByRole("button", { name: "新纸条" }).click();
    await boy.getByRole("button", { name: /隐藏惊喜/ }).click();
    await boy
      .getByPlaceholder("想念、感谢、提醒，或者一句晚点想聊的话…")
      .fill(noteContent);
    await boy
      .getByLabel("揭晓时间（当前设备时区）")
      .fill(dateTimeLocalValue(new Date(Date.now() + 10 * 60_000)));
    await boy
      .getByRole("checkbox", { name: "阅后仍然保留" })
      .uncheck({ force: true });

    const [createResponse] = await Promise.all([
      boy.waitForResponse((response) =>
        isApiResponse(response, "POST", "/api/v1/notes"),
      ),
      boy.getByRole("button", { name: "交给服务器定时送达" }).click(),
    ]);
    expect(createResponse.ok()).toBe(true);
    const created = (await createResponse.json()) as CreatedNote;
    const hiddenDetailResponse = await girl.request.get(
      `${APP_URL}/api/v1/notes/${created.id}`,
      { headers: { [IDENTITY_HEADER]: "girl" } },
    );
    expect(hiddenDetailResponse.ok()).toBe(true);
    const placeholder = (await hiddenDetailResponse.json()) as Record<
      string,
      unknown
    >;

    expect(placeholder).toMatchObject({
      id: created.id,
      status: "SCHEDULED",
      isPlaceholder: true,
    });
    expect(placeholder).not.toHaveProperty("content");
    expect(placeholder).not.toHaveProperty("color");
    expect(placeholder).not.toHaveProperty("icon");
    expect(JSON.stringify(placeholder)).not.toContain(noteContent);
    await expect(girl.getByText(noteContent, { exact: true })).toBeHidden();
    await expect(
      girl.getByRole("heading", { name: "一份内容尚未揭晓" }),
    ).toBeVisible();

    const revealAt = new Date(Date.now() + 4_000).toISOString();
    const rescheduled = await boy.request.patch(
      `${APP_URL}/api/v1/notes/${created.id}`,
      {
        headers: { [IDENTITY_HEADER]: "boy" },
        data: { version: created.version, showAt: revealAt },
      },
    );
    expect(rescheduled.ok()).toBe(true);

    await expect(girl.getByText(noteContent, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    const receivedNote = girl
      .getByText(noteContent, { exact: true })
      .locator("xpath=ancestor::article");
    await receivedNote.getByRole("button", { name: "看完并收起" }).click();
    await expect(girl.getByText(noteContent, { exact: true })).toBeHidden();

    const disappearedDetail = await girl.request.get(
      `${APP_URL}/api/v1/notes/${created.id}`,
      { headers: { [IDENTITY_HEADER]: "girl" } },
    );
    expect(disappearedDetail.status()).toBe(404);

    const notificationTrigger = girl.getByRole("button", {
      name: /打开通知中心，有 [1-9]\d* 条未读通知/,
    });
    await expect(notificationTrigger).toBeVisible({ timeout: 15_000 });
    await notificationTrigger.click();
    const notificationDialog = girl.getByRole("dialog", {
      name: "通知中心",
    });
    await expect(notificationDialog).toBeVisible();
    await notificationDialog.getByRole("button", { name: "全部已读" }).click();
    await expect(
      notificationDialog.getByText("所有通知都已读。", { exact: true }),
    ).toBeVisible();
    await notificationDialog
      .getByRole("button", { name: "关闭通知中心" })
      .click();
    await expect(
      girl.getByRole("button", {
        name: "打开通知中心，没有未读通知",
      }),
    ).toBeVisible();
  } finally {
    await boyContext.close();
    await girlContext.close();
  }
});

test("exchange diary reveals atomically and a public mood is withdrawn in real time", async ({
  browser,
}, testInfo) => {
  const suffix = `${testInfo.project.name}-${randomUUID().slice(0, 8)}`;
  const boyAnswer = `我最想记住的是你今天很认真听我说话。${suffix}`;
  const girlAnswer = `我最想告诉你的是，慢一点也没有关系。${suffix}`;
  const publicMood = `被理解的安心-${suffix}`;
  const publicMoodNote = `今天有人接住了我的小情绪。${suffix}`;
  const boyContext = await browser.newContext();
  const girlContext = await browser.newContext();
  const boy = await boyContext.newPage();
  const girl = await girlContext.newPage();

  try {
    await selectIdentity(boy, "boy");
    await selectIdentity(girl, "girl");
    await openDaily(boy);
    await openDaily(girl);

    await boy
      .getByPlaceholder("不用写得完整，诚实地留下今天的这一刻就好…")
      .fill(boyAnswer);
    await boy.getByRole("button", { name: "提交并锁定" }).click();
    await expect(boy.getByText(/已提交，正在等待/)).toBeVisible();

    const girlWaitingResponse = await girl.request.get(
      `${APP_URL}/api/v1/daily-entries/today`,
      { headers: { [IDENTITY_HEADER]: "girl" } },
    );
    expect(girlWaitingResponse.ok()).toBe(true);
    const girlWaiting = (await girlWaitingResponse.json()) as {
      partner: Record<string, unknown>;
    };
    expect(girlWaiting.partner).toEqual({ submitted: true });
    expect(JSON.stringify(girlWaiting)).not.toContain(boyAnswer);
    await expect(girl.getByText(boyAnswer, { exact: true })).toBeHidden();

    await girl
      .getByPlaceholder("不用写得完整，诚实地留下今天的这一刻就好…")
      .fill(girlAnswer);
    await girl.getByRole("button", { name: "提交并锁定" }).click();

    await expect(girl.getByText(boyAnswer, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(boy.getByText(girlAnswer, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      boy.getByText("两份答案已在同一时刻揭晓，正文现在锁定。"),
    ).toBeVisible();
    await expect(
      girl.getByText("两份答案已在同一时刻揭晓，正文现在锁定。"),
    ).toBeVisible();

    await boy.getByPlaceholder("例如：有点复杂，但还算平静").fill(publicMood);
    await boy
      .getByPlaceholder("不必解释得很完整，只写你愿意留下的部分。")
      .fill(publicMoodNote);
    await boy.getByRole("button", { name: "保存今日心情" }).click();

    await expect(girl.getByText(publicMood, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(girl.getByText(publicMoodNote, { exact: true })).toBeVisible();

    await boy
      .getByRole("checkbox", { name: "向对方公开" })
      .uncheck({ force: true });
    await boy.getByRole("button", { name: "保存今日心情" }).click();

    await expect(girl.getByText(publicMood, { exact: true })).toBeHidden({
      timeout: 15_000,
    });
    await expect(girl.getByText(publicMoodNote, { exact: true })).toBeHidden();
    await expect(
      girl.getByRole("heading", { name: "今天还没有公开心情" }),
    ).toBeVisible();
  } finally {
    await boyContext.close();
    await girlContext.close();
  }
});

test("an old private query response cannot cross a local identity switch", async ({
  browser,
}, testInfo) => {
  const suffix = `${testInfo.project.name}-${randomUUID().slice(0, 8)}`;
  const privateMood = `只属于男生的旧响应-${suffix}`;
  const privateNote = `切换身份后绝不能落进女生界面。${suffix}`;
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await selectIdentity(page, "boy");
    const savedMood = await page.request.put(`${APP_URL}/api/v1/moods/today`, {
      headers: { [IDENTITY_HEADER]: "boy" },
      data: {
        mood: privateMood,
        note: privateNote,
        visibleToPartner: false,
        wantsResponse: false,
      },
    });
    expect(savedMood.ok()).toBe(true);

    const captured = deferred<string>();
    const release = deferred<void>();
    const completed = deferred<void>();
    let heldBoyRequest = false;
    await page.route("**/api/v1/moods?*", async (route) => {
      const role = route.request().headers()[IDENTITY_HEADER.toLowerCase()];
      if (
        heldBoyRequest ||
        route.request().method() !== "GET" ||
        role !== "boy"
      ) {
        await route.continue();
        return;
      }

      heldBoyRequest = true;
      const upstream = await route.fetch();
      const body = await upstream.text();
      captured.resolve(body);
      await release.promise;
      await route.fulfill({ response: upstream, body });
      completed.resolve();
    });

    await page.goto(`${APP_URL}/daily`);
    const oldBody = await captured.promise;
    expect(oldBody).toContain(privateMood);
    expect(oldBody).toContain(privateNote);

    await page.locator('a[href="/settings"]:visible').click();
    await expect(page).toHaveURL(/\/settings$/);
    await page.getByRole("button", { name: "切换为女生" }).click();
    await expect(page).toHaveURL(/\/today$/);
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("our-tomorrow-role-v2")),
      )
      .toBe("girl");

    release.resolve();
    await completed.promise;

    const girlMoodResponsePromise = page.waitForResponse(
      (response) =>
        isApiResponse(response, "GET", "/api/v1/moods") &&
        response.request().headers()[IDENTITY_HEADER.toLowerCase()] === "girl",
    );
    await page.goto(`${APP_URL}/daily`);
    const girlMoodResponse = await girlMoodResponsePromise;
    expect(
      girlMoodResponse.request().headers()[IDENTITY_HEADER.toLowerCase()],
    ).toBe("girl");
    const girlBody = await girlMoodResponse.text();
    expect(girlBody).not.toContain(privateMood);
    expect(girlBody).not.toContain(privateNote);
    await expect(page.getByText(privateMood, { exact: true })).toBeHidden();
    await expect(page.getByText(privateNote, { exact: true })).toBeHidden();
    await expect(
      page.getByPlaceholder("例如：有点复杂，但还算平静"),
    ).toHaveValue("");
  } finally {
    await context.close();
  }
});
