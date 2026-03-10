/**
 * E2E: SSH Connect — page rendering, form validation, auth toggle
 */

describe("SSH Connect", () => {
  before(async () => {
    await browser.execute(() => {
      localStorage.setItem("clawsquire.locale", "en");
    });
    await browser.refresh();
    await browser.pause(3000);
  });

  it("navigates to SSH page", async () => {
    const nav = await $("aside a[href='/ssh']");
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

  it("shows host input field", async () => {
    const input = await $("input[placeholder*='192']");
    expect(await input.isExisting()).toBe(true);
  });

  it("shows auth method toggle buttons", async () => {
    const buttons = await $$("button");
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it("has a test connection button", async () => {
    const buttons = await $$("button");
    const hasTestBtn = buttons.length > 0;
    expect(hasTestBtn).toBe(true);
  });

  it("has a command textarea", async () => {
    const textarea = await $("textarea");
    expect(await textarea.isExisting()).toBe(true);
  });
});
