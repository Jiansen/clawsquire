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
  it("renders the main window", async () => {
    const title = await $("h2");
    await title.waitForExist({ timeout: 15_000 });
    const text = await title.getText();
    // Dashboard title in any language should be a non-empty string
    expect(text.length).toBeGreaterThan(0);
  });

  it("shows OpenClaw status section", async () => {
    // Status card contains the status text
    const statusCard = await $(".bg-white.rounded-xl");
    await statusCard.waitForExist({ timeout: 10_000 });
    expect(await statusCard.isExisting()).toBe(true);
  });

  it("shows Not Installed status for OpenClaw", async () => {
    // The gray dot indicates not-installed
    const grayDot = await $(".bg-gray-400");
    await grayDot.waitForExist({ timeout: 10_000 });
    expect(await grayDot.isExisting()).toBe(true);
  });

  it("shows quick action buttons", async () => {
    const actionCards = await $$("button.flex.flex-col.items-center");
    expect(actionCards.length).toBeGreaterThanOrEqual(4);
  });

  it("shows InstallCard when OpenClaw is not installed", async () => {
    // The dashed-border yellow card is the InstallCard
    const installCard = await $(".border-dashed.border-yellow-300");
    await installCard.waitForExist({ timeout: 15_000 });
    expect(await installCard.isExisting()).toBe(true);
  });
});

describe("Node.js Detection (Node IS available)", () => {
  it("does NOT show the Node.js required warning", async () => {
    // The red warning block only appears when npm is NOT detected
    const npmWarning = await $(".bg-red-100");
    // Should not exist since Node.js is on PATH
    expect(await npmWarning.isExisting()).toBe(false);
  });

  it("shows the Install OpenClaw button (not Node install)", async () => {
    // When Node.js is available, the InstallCard shows the OpenClaw install flow
    const installBtn = await $("button*=OpenClaw");
    expect(await installBtn.isExisting()).toBe(true);
  });
});
