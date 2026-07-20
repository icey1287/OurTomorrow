import { expect, test } from "@playwright/test";

const APP_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const PORTRAIT_NOTE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAAECAYAAACk7+45AAAAEklEQVR4nGP4v2XffxBmwM0AAO8LG4H86nsEAAAAAElFTkSuQmCC",
  "base64",
);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto(`${APP_URL}/login`);
  await page.getByLabel("你的真名").fill("示例用户甲");
  await page.getByRole("button", { name: /翻开我们的手账/ }).click();
  await expect(page).toHaveURL(/\/today$/);
});

test("the journal exposes only status, place and notes", async ({ page }) => {
  const noteText = `竖屏照片完整显示 ${Date.now()}`;

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
    buffer: PORTRAIT_NOTE_PNG,
  });
  const composerPhoto = page.getByAltText("待发送的照片");
  await expect(composerPhoto).toBeVisible();
  await expect(composerPhoto).toHaveCSS("object-fit", "contain");
  await page.getByLabel("想说什么？").fill(noteText);
  await page.getByRole("button", { name: "放进对方的手账" }).click();
  await expect(page.getByRole("dialog", { name: "写一张新便笺" })).toBeHidden();
  await expect(
    page.getByTestId("latest-note-card").getByText(noteText),
  ).toBeVisible();
  const latestPhoto = page
    .getByTestId("latest-note-card")
    .getByAltText("便笺照片");
  await expect(latestPhoto).toBeVisible();
  await expect(latestPhoto).toHaveCSS("object-fit", "contain");
  await expect(latestPhoto.locator("..")).toHaveAttribute(
    "data-orientation",
    "portrait",
  );

  await page.getByTestId("latest-note-card").click();
  const storedNote = page
    .getByTestId("note-box")
    .locator(".stored-note")
    .filter({ hasText: noteText });
  await expect(storedNote).toHaveCount(1);
  await expect(storedNote.getByAltText("便笺照片")).toHaveCSS(
    "object-fit",
    "contain",
  );

  const openOriginal = storedNote.getByRole("button", {
    name: "查看便笺照片原图",
  });
  await expect(openOriginal).toBeVisible();
  await expect(openOriginal).toHaveText("");
  await openOriginal.click();
  const photoViewer = page.getByRole("dialog", { name: "照片原图" });
  await expect(photoViewer).toBeVisible();
  await expect(photoViewer.getByAltText("便笺照片原图")).toHaveCSS(
    "object-fit",
    "contain",
  );
  await photoViewer.getByRole("button", { name: "关闭照片原图" }).click();
  await expect(photoViewer).toBeHidden();
});

test("location uses one ordinary-accuracy request", async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(
          success: PositionCallback,
          _failure: PositionErrorCallback | null,
          options?: PositionOptions,
        ) {
          const calls = ((
            window as typeof window & {
              __locationOptions?: PositionOptions[];
            }
          ).__locationOptions ??= []);
          calls.push(options ?? {});

          success({
            coords: {
              accuracy: 20,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              latitude: 31.2304161234,
              longitude: 121.4737011234,
              speed: null,
            },
            timestamp: Date.now(),
          } as GeolocationPosition);
        },
      },
    });
  });

  let nearbyRequests = 0;
  let nearbyPayload: unknown;
  await page.route("**/api/v1/places/nearby", async (route) => {
    nearbyRequests += 1;
    nearbyPayload = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      json: {
        items: [
          {
            id: "spring-library",
            name: "春日图书馆",
            address: "梧桐路 20 号",
            district: "徐汇区",
            latitude: 31.2305,
            longitude: 121.4738,
            distanceMeters: 42,
          },
        ],
      },
    });
  });

  await page.getByRole("button", { name: /MY MOMENT/ }).click();
  await page.getByRole("button", { name: "定位现在的位置" }).click();

  await expect(page.getByRole("option", { name: /春日图书馆/ })).toBeVisible();
  expect(nearbyRequests).toBe(1);
  expect(nearbyPayload).toEqual({
    latitude: 31.2304161,
    longitude: 121.4737011,
    radius: 1_000,
    limit: 6,
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __locationOptions?: PositionOptions[];
            }
          ).__locationOptions,
      ),
    )
    .toEqual([expect.objectContaining({ enableHighAccuracy: false })]);
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
