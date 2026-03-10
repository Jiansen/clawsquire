/**
 * E2E: Backup page — page rendering, heading, create backup button
 */

describe("Backup Page", () => {
  before(async () => {
    await browser.execute(() => {
      localStorage.setItem("clawsquire.locale", "en");
    });
    await browser.refresh();
    await browser.pause(3000);
  });

  it("navigates to backup page", async () => {
    const nav = await $("aside a[href='/backup']");
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

  it("has a create backup button", async () => {
    const buttons = await $$("button");
    const btnTexts = await Promise.all(buttons.map(async (b) => await b.getText()));
    const createIdx = btnTexts.findIndex((t) => t.toLowerCase().includes("create") || t.toLowerCase().includes("backup"));
    expect(createIdx).toBeGreaterThanOrEqual(0);
  });
});
