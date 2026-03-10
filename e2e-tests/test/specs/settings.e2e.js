/**
 * E2E: Settings page — page rendering, heading, safety section, about section
 */

describe("Settings Page", () => {
  before(async () => {
    await browser.execute(() => {
      localStorage.setItem("clawsquire.locale", "en");
    });
    await browser.refresh();
    await browser.pause(3000);
  });

  it("navigates to settings page", async () => {
    const nav = await $("aside a[href='/settings']");
    await nav.waitForExist({ timeout: 10_000 });
    await nav.click();
    await browser.pause(1000);
  });

  it("renders page heading", async () => {
    const heading = await $("h2");
    await heading.waitForExist({ timeout: 10_000 });
    const text = await heading.getText();
    expect(text.length).toBeGreaterThan(0);
  });

  it("shows safety section", async () => {
    const body = await $("body");
    const text = await body.getText();
    expect(text.toLowerCase()).toContain("safety");
  });

  it("shows about section", async () => {
    const body = await $("body");
    const text = await body.getText();
    expect(text.toLowerCase()).toContain("about");
  });
});
