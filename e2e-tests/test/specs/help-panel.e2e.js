/**
 * E2E: Global Help Panel — TopBar ? button opens/closes help panel
 */

describe("Global Help Panel", () => {
  before(async () => {
    await browser.execute(() => {
      localStorage.setItem("clawsquire.locale", "en");
    });
    await browser.refresh();
    await browser.pause(5000);
  });

  it("has a help button in the top bar", async () => {
    const btn = await $('[data-testid="help-button"]');
    await btn.waitForExist({ timeout: 10_000 });
    expect(await btn.isExisting()).toBe(true);
  });

  it("opens the help panel on click", async () => {
    const btn = await $('[data-testid="help-button"]');
    await btn.click();
    await browser.pause(500);
    const panel = await $("h2=Help");
    expect(await panel.isExisting()).toBe(true);
  });

  it("shows FAQ items in the panel", async () => {
    const faqItem = await $("button*=Gateway");
    expect(await faqItem.isExisting()).toBe(true);
  });

  it("closes on Escape key", async () => {
    await browser.keys("Escape");
    await browser.pause(300);
    const panel = await $("h2=Help");
    expect(await panel.isExisting()).toBe(false);
  });
});
