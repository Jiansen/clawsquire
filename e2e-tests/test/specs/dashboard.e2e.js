/**
 * E2E: Dashboard — environment detection, status display, install card
 *
 * CI environment:
 * - Node.js IS installed (via actions/setup-node)
 * - OpenClaw is NOT installed
 *
 * The dashboard should correctly reflect this state.
 */

describe("Dashboard", () => {
  before(async () => {
    // App is already loaded (global before hook waits for about:blank to resolve).
    // Skip Welcome by pre-setting locale, then refresh to apply.
    await browser.execute(() => {
      localStorage.setItem("clawsquire.locale", "en");
    });
    await browser.refresh();
    await browser.pause(5000);
  });

  it("renders the sidebar navigation", async () => {
    const nav = await $("nav, aside, [class*='sidebar']");
    await nav.waitForExist({ timeout: 15_000 });
    expect(await nav.isExisting()).toBe(true);
  });

  it("renders a heading on the Dashboard", async () => {
    const heading = await $("h2");
    await heading.waitForExist({ timeout: 15_000 });
    const text = await heading.getText();
    expect(text.length).toBeGreaterThan(0);
  });

  it("shows at least one status card", async () => {
    const cards = await $$("[class*='rounded']");
    expect(cards.length).toBeGreaterThan(0);
  });

  it("has action buttons", async () => {
    const buttons = await $$("button");
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it("shows OpenClaw not-installed status", async () => {
    const status = await $("*=Not Installed");
    await status.waitForExist({ timeout: 15_000 });
    expect(await status.isExisting()).toBe(true);
  });
});

describe("Node.js Detection (Node IS available)", () => {
  it("does NOT show the Node.js required warning", async () => {
    // Red warning only appears when npm is NOT detected
    const npmWarning = await $("[class*='bg-red-']");
    expect(await npmWarning.isExisting()).toBe(false);
  });
});
