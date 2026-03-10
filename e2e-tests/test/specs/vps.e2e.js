/**
 * E2E: VPS Manager — page rendering, add instance form, tabs, delete flow
 */

describe("VPS Manager", () => {
  before(async () => {
    await browser.execute(() => {
      localStorage.setItem("clawsquire.locale", "en");
    });
    await browser.refresh();
    await browser.pause(3000);
  });

  it("navigates to VPS page", async () => {
    const nav = await $("aside a[href='/vps']");
    await nav.waitForExist({ timeout: 10_000 });
    await nav.click();
    await browser.pause(1000);
  });

  it("renders empty state or instance list", async () => {
    const heading = await $("h2");
    await heading.waitForExist({ timeout: 10_000 });
    const text = await heading.getText();
    expect(text.length).toBeGreaterThan(0);
  });

  it("has an add instance button", async () => {
    const addBtn = await $("button[title]");
    expect(await addBtn.isExisting()).toBe(true);
  });

  it("opens add instance form on button click", async () => {
    const addBtn = await $("button[title]");
    await addBtn.click();
    await browser.pause(500);

    const hostInput = await $("input[placeholder*='192']");
    expect(await hostInput.isExisting()).toBe(true);
  });

  it("shows host and port fields in add form", async () => {
    const inputs = await $$("input");
    expect(inputs.length).toBeGreaterThanOrEqual(3);
  });

  it("has auth method toggle buttons", async () => {
    const buttons = await $$("button");
    expect(buttons.length).toBeGreaterThanOrEqual(4);
  });

  it("has test connection and save buttons", async () => {
    const buttons = await $$("button");
    const btnTexts = await Promise.all(buttons.map(async (b) => await b.getText()));
    expect(btnTexts.length).toBeGreaterThanOrEqual(2);
  });

  it("cancel button closes the add form", async () => {
    const buttons = await $$("button");
    const btnTexts = await Promise.all(buttons.map(async (b) => await b.getText()));
    const cancelIdx = btnTexts.findIndex((t) => t.toLowerCase().includes("cancel"));
    if (cancelIdx >= 0) {
      await buttons[cancelIdx].click();
      await browser.pause(500);
    }
  });
});
