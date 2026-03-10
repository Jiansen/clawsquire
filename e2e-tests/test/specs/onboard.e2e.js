/**
 * E2E: Onboard — template list rendering, wizard navigation
 */

describe("Onboard", () => {
  before(async () => {
    await browser.execute(() => {
      localStorage.setItem("clawsquire.locale", "en");
    });
    await browser.refresh();
    await browser.pause(3000);
  });

  it("navigates to the onboard page", async () => {
    const nav = await $("aside a[href='/onboard']");
    await nav.waitForExist({ timeout: 10_000 });
    await nav.click();
    await browser.pause(1000);
  });

  it("renders the onboard page heading", async () => {
    const heading = await $("h2");
    await heading.waitForExist({ timeout: 10_000 });
    const text = await heading.getText();
    expect(text.length).toBeGreaterThan(0);
  });

  it("shows at least 6 template cards", async () => {
    const cards = await $$("a[href^='/onboard/']");
    expect(cards.length).toBeGreaterThanOrEqual(6);
  });

  it("has the email-telegram template", async () => {
    const link = await $("a[href='/onboard/email-telegram']");
    expect(await link.isExisting()).toBe(true);
  });

  it("navigates to LLM provider wizard", async () => {
    const link = await $("a[href='/onboard/llm-provider']");
    await link.click();
    await browser.pause(1000);
    const heading = await $("h2");
    const text = await heading.getText();
    expect(text.length).toBeGreaterThan(0);
  });

  it("shows back button in wizard", async () => {
    const buttons = await $$("button");
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it("can go back to template list", async () => {
    const backLink = await $("a[href='/onboard']");
    if (await backLink.isExisting()) {
      await backLink.click();
      await browser.pause(1000);
    }
    const cards = await $$("a[href^='/onboard/']");
    expect(cards.length).toBeGreaterThanOrEqual(6);
  });
});
