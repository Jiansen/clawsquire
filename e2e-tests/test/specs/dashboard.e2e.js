/**
 * E2E tests for ClawSquire Dashboard — Node.js detection and install flow.
 *
 * Expectations on CI runners:
 * - Node.js IS installed (via actions/setup-node)
 * - OpenClaw is NOT installed
 *
 * Therefore:
 * - Dashboard should show "Not Installed" status
 * - InstallCard should appear with "Install OpenClaw" button (Node detected)
 * - The Node.js warning block should NOT appear (Node IS available)
 */

describe("Dashboard", () => {
  before(async () => {
    // Skip the Welcome/language-selection screen by pre-setting locale
    await browser.execute(() => {
      localStorage.setItem("clawsquire.locale", "en");
    });
    await browser.refresh();
    // Wait for React to render after reload
    await browser.pause(3000);
  });

  it("renders the main window", async () => {
    const heading = await $("h2");
    await heading.waitForExist({ timeout: 20_000 });
    const text = await heading.getText();
    expect(text.length).toBeGreaterThan(0);
  });

  it("shows OpenClaw status section", async () => {
    const statusCard = await $(".rounded-xl");
    await statusCard.waitForExist({ timeout: 10_000 });
    expect(await statusCard.isExisting()).toBe(true);
  });

  it("shows Not Installed status for OpenClaw", async () => {
    const grayDot = await $('[class*="bg-gray"]');
    await grayDot.waitForExist({ timeout: 10_000 });
    expect(await grayDot.isExisting()).toBe(true);
  });

  it("shows quick action buttons", async () => {
    const buttons = await $$("button");
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it("shows InstallCard when OpenClaw is not installed", async () => {
    const installCard = await $('[class*="border-dashed"]');
    await installCard.waitForExist({ timeout: 15_000 });
    expect(await installCard.isExisting()).toBe(true);
  });
});

describe("Node.js Detection (Node IS available)", () => {
  it("does NOT show the Node.js required warning", async () => {
    const npmWarning = await $('[class*="bg-red-"]');
    expect(await npmWarning.isExisting()).toBe(false);
  });

  it("shows the Install OpenClaw button (not Node install)", async () => {
    const installBtn = await $("button*=OpenClaw");
    expect(await installBtn.isExisting()).toBe(true);
  });
});
