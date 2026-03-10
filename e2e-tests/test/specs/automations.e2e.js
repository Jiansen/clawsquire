/**
 * E2E: Automations page — list and create automations
 */

describe("Automations Page", () => {
  before(async () => {
    await browser.execute(() => localStorage.setItem("clawsquire.locale", "en"));
    await browser.refresh();
    await browser.pause(3000);
  });

  it("navigates to /automations", async () => {
    const link = await $("aside a[href='/automations']");
    await link.click();
    await browser.pause(1000);
  });

  it("renders page heading", async () => {
    const heading = await $("h1");
    await heading.waitForExist({ timeout: 5000 });
    const text = await heading.getText();
    expect(text.length).toBeGreaterThan(0);
  });

  it("shows create automation button", async () => {
    const btn = await $("button*=New");
    const exists = await btn.isExisting();
    expect(exists).toBe(true);
  });

  it("shows empty state or job list", async () => {
    const body = await $("main");
    const text = await body.getText();
    expect(text.length).toBeGreaterThan(0);
  });
});
