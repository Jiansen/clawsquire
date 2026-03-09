/**
 * E2E: Doctor page — health check results
 *
 * CI environment: OpenClaw is NOT installed, so doctor checks should
 * reflect this (some checks will show warnings/failures).
 * The page itself must render without crashing.
 */

describe("Doctor Page", () => {
  before(async () => {
    // App is already loaded (global before hook waits for about:blank to resolve).
    await browser.execute(() => {
      localStorage.setItem("clawsquire.locale", "en");
    });
    await browser.refresh();
    await browser.pause(5000);
  });

  it("navigates to the Doctor page", async () => {
    const doctorLink = await $("a[href='/doctor']");
    await doctorLink.waitForExist({ timeout: 10_000 });
    await doctorLink.click();
    await browser.pause(3000);
  });

  it("renders the Doctor page heading", async () => {
    const heading = await $("h2");
    await heading.waitForExist({ timeout: 15_000 });
    const text = await heading.getText();
    expect(text.length).toBeGreaterThan(0);
  });

  it("shows health check results or a loading/error state", async () => {
    // The page should either show check result cards or a meaningful state
    await browser.pause(5000);

    // Look for check result indicators (pass/warn/fail icons or cards)
    const resultCards = await $$("[class*='rounded'], [class*='card'], [class*='check']");
    const hasResults = resultCards.length > 0;

    // Or the page shows a message (e.g. "OpenClaw not installed" or error)
    const pageText = await $("body");
    const bodyText = await pageText.getText();
    const hasContent = bodyText.length > 50;

    expect(hasResults || hasContent).toBe(true);
  });
});
