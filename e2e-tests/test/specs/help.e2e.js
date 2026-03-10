/**
 * E2E: Help page — page rendering, heading, search input, FAQ items
 */

describe("Help Page", () => {
  before(async () => {
    await browser.execute(() => {
      localStorage.setItem("clawsquire.locale", "en");
    });
    await browser.refresh();
    await browser.pause(3000);
  });

  it("navigates to help page", async () => {
    const nav = await $("aside a[href='/help']");
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

  it("has search input", async () => {
    const input = await $("input[type='text']");
    await input.waitForExist({ timeout: 10_000 });
    expect(await input.isExisting()).toBe(true);
  });

  it("shows FAQ items", async () => {
    const faqButtons = await $$("button");
    expect(faqButtons.length).toBeGreaterThan(0);
  });
});
