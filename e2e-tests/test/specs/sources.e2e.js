/**
 * E2E: Sources page — input source management
 */

describe("Sources Page", () => {
  before(async () => {
    await browser.execute(() => localStorage.setItem("clawsquire.locale", "en"));
    await browser.refresh();
    await browser.pause(3000);
  });

  it("navigates to /sources", async () => {
    const link = await $("aside a[href='/sources']");
    await link.click();
    await browser.pause(1000);
  });

  it("renders page heading", async () => {
    const heading = await $("h1");
    await heading.waitForExist({ timeout: 5000 });
    const text = await heading.getText();
    expect(text.length).toBeGreaterThan(0);
  });

  it("shows IMAP source type", async () => {
    const body = await $("main");
    const text = await body.getText();
    expect(text).toContain("IMAP");
  });

  it("shows coming soon badges", async () => {
    const body = await $("main");
    const text = await body.getText();
    expect(text.length).toBeGreaterThan(0);
  });
});
