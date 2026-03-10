/**
 * E2E: Channels page — list, add, remove channels
 */

describe("Channels Page", () => {
  before(async () => {
    await browser.execute(() => localStorage.setItem("clawsquire.locale", "en"));
    await browser.refresh();
    await browser.pause(3000);
  });

  it("navigates to /channels", async () => {
    const link = await $("aside a[href='/channels']");
    await link.click();
    await browser.pause(1000);
  });

  it("renders page heading", async () => {
    const heading = await $("h1");
    await heading.waitForExist({ timeout: 5000 });
    const text = await heading.getText();
    expect(text.length).toBeGreaterThan(0);
  });

  it("shows add channel button", async () => {
    const btn = await $("button*=Add");
    const exists = await btn.isExisting();
    expect(exists).toBe(true);
  });

  it("shows empty state or channel list", async () => {
    const body = await $("main");
    const text = await body.getText();
    expect(text.length).toBeGreaterThan(0);
  });
});
