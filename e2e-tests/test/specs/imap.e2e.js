/**
 * E2E: IMAP page — page rendering, heading, email input, next button
 */

describe("IMAP Page", () => {
  before(async () => {
    await browser.execute(() => {
      localStorage.setItem("clawsquire.locale", "en");
    });
    await browser.refresh();
    await browser.pause(3000);
  });

  it("navigates to IMAP page (via sidebar)", async () => {
    const nav = await $("aside a[href='/imap']");
    await nav.waitForExist({ timeout: 10_000 });
    await nav.click();
    await browser.pause(1000);
  });

  it("renders page heading", async () => {
    const heading = await $("h1, h2");
    await heading.waitForExist({ timeout: 10_000 });
    const text = await heading.getText();
    expect(text.length).toBeGreaterThan(0);
  });

  it("shows email input", async () => {
    const emailInput = await $("input[type='email']");
    await emailInput.waitForExist({ timeout: 10_000 });
    expect(await emailInput.isExisting()).toBe(true);
  });

  it("has a next button", async () => {
    const buttons = await $$("button");
    const btnTexts = await Promise.all(buttons.map(async (b) => await b.getText()));
    const nextIdx = btnTexts.findIndex((t) => t.toLowerCase().includes("next"));
    expect(nextIdx).toBeGreaterThanOrEqual(0);
  });
});
