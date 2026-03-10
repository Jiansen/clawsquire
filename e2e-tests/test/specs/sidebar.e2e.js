/**
 * E2E: Sidebar — all navigation items present and clickable
 */

const EXPECTED_NAV_ROUTES = [
  "/",
  "/onboard",
  "/doctor",
  "/backup",
  "/config",
  "/vps",
  "/imap",
  "/help",
  "/settings",
];

describe("Sidebar Navigation", () => {
  before(async () => {
    await browser.execute(() => {
      localStorage.setItem("clawsquire.locale", "en");
    });
    await browser.refresh();
    await browser.pause(5000);
  });

  it("renders the sidebar", async () => {
    const sidebar = await $("aside");
    await sidebar.waitForExist({ timeout: 10_000 });
    expect(await sidebar.isExisting()).toBe(true);
  });

  it("has navigation links for all routes", async () => {
    for (const route of EXPECTED_NAV_ROUTES) {
      const link = await $(`aside a[href='${route}']`);
      expect(await link.isExisting()).toBe(true);
    }
  });

  it("each nav link is clickable", async () => {
    for (const route of EXPECTED_NAV_ROUTES) {
      const link = await $(`aside a[href='${route}']`);
      await link.click();
      await browser.pause(500);
      const heading = await $("h2, h1");
      if (await heading.isExisting()) {
        const text = await heading.getText();
        expect(text.length).toBeGreaterThan(0);
      }
    }
  });
});
