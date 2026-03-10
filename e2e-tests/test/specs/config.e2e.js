/**
 * E2E: Config page — page rendering, heading, view toggle buttons (tree/json)
 */

describe("Config Page", () => {
  before(async () => {
    await browser.execute(() => {
      localStorage.setItem("clawsquire.locale", "en");
    });
    await browser.refresh();
    await browser.pause(3000);
  });

  it("navigates to config page", async () => {
    const nav = await $("aside a[href='/config']");
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

  it("has view toggle buttons (tree/json)", async () => {
    const buttons = await $$("button");
    const btnTexts = await Promise.all(buttons.map(async (b) => await b.getText()));
    const hasTreeOrJson = btnTexts.some((t) =>
      t.toLowerCase().includes("tree") || t.toLowerCase().includes("json")
    );
    expect(hasTreeOrJson).toBe(true);
  });
});
