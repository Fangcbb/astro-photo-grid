import { expect, test } from "@playwright/test";
import catalog from "../../.portfolio/catalog.json" with { type: "json" };

test("gallery is accessible and responsive with working display images", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".gallery figure")).toHaveCount(
    catalog.photos.length,
  );
  const image = page.locator(".photo-link img").first();
  if (catalog.photos.length) {
    await expect(image).toHaveAttribute("alt", /.+/);
    await expect(image).toHaveJSProperty("complete", true);
    expect(
      await image.evaluate((img: HTMLImageElement) => img.naturalWidth),
    ).toBeGreaterThan(0);
    for (const photo of catalog.photos) {
      const response = await page.request.get(photo.large);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("image/webp");
    }
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `.portfolio/home-${testInfo.project.name}.png`,
    fullPage: false,
  });
});

test("lightbox opens the compressed display photo and closes with Escape", async ({
  page,
}) => {
  test.skip(catalog.photos.length === 0, "No photos published");
  await page.goto("/");
  await page.locator(".photo-link").first().click();
  await expect(page.locator(".fancybox__container")).toBeVisible();
  await expect(
    page.locator(".fancybox__container img").first(),
  ).toHaveAttribute("src", /\/media\/.+\.webp/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".fancybox__container")).toHaveCount(0);
});

test("album navigation, detail links and previous/next navigation", async ({
  page,
}) => {
  test.skip(catalog.photos.length === 0, "No photos published");
  const photo = catalog.photos[0];
  await page.goto(`/albums/${photo.album}/`);
  await expect(page.locator(".gallery figure")).toHaveCount(
    catalog.photos.filter((p) => p.album === photo.album).length,
  );
  await page.locator("figcaption a").first().click();
  await expect(page).toHaveURL(new RegExp(`/photos/${photo.slug}/$`));
  await expect(
    page.getByRole("heading", { name: photo.title, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".detail-image")).toHaveAttribute("alt", photo.alt);
  if (catalog.photos.length > 1) {
    await page.getByRole("link", { name: "下一幅 →" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/photos/${catalog.photos[1].slug}/$`),
    );
  }
  await page.getByRole("link", { name: "关于", exact: true }).click();
  await expect(page).toHaveURL(/\/about\/$/);
});

test("unknown routes return the custom 404 page", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist/");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "这一页暂时没有作品。" }),
  ).toBeVisible();
});
