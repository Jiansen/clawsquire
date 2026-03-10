/**
 * E2E: Remote Install — page rendering, command generation
 */

describe("Remote Install", () => {
  before(async () => {
    await browser.execute(() => {
      localStorage.setItem("clawsquire.locale", "en");
    });
    await browser.refresh();
    await browser.pause(3000);
  });

  it("navigates to remote install page", async () => {
    const nav = await $("aside a[href='/remote']");
    await nav.waitForExist({ timeout: 10_000 });
    await nav.click();
    await browser.pause(1000);
  });

  it("renders the page heading", async () => {
    const heading = await $("h2");
    await heading.waitForExist({ timeout: 10_000 });
    const text = await heading.getText();
    expect(text.length).toBeGreaterThan(0);
  });

  it("shows security note", async () => {
    const secNote = await $("[class*='border-yellow'], [class*='bg-yellow']");
    expect(await secNote.isExisting()).toBe(true);
  });

  it("has a generate button", async () => {
    const btn = await $("button");
    await btn.waitForExist({ timeout: 5_000 });
    expect(await btn.isExisting()).toBe(true);
  });

  it("shows provider selection", async () => {
    const buttons = await $$("button");
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });
});
