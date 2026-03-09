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
    // Skip Welcome by pre-setting locale
    await browser.execute(() => {
      localStorage.setItem("clawsquire.locale", "en");
    });
    await browser.refresh();
    // Wait for React to mount and show the window (visible:false until ready)
    await browser.pause(8000);
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

  it("shows install-related UI when OpenClaw is not installed", async () => {
    // Look for any dashed border card (InstallCard) or install-related button
    const installIndicator = await $("[class*='border-dashed'], button*=Install, button*=OpenClaw");
    await installIndicator.waitForExist({ timeout: 15_000 });
    expect(await installIndicator.isExisting()).toBe(true);
  });
});

describe("Node.js Detection (Node IS available)", () => {
  it("does NOT show the Node.js required warning", async () => {
    // Red warning only appears when npm is NOT detected
    const npmWarning = await $("[class*='bg-red-']");
    expect(await npmWarning.isExisting()).toBe(false);
  });
});
