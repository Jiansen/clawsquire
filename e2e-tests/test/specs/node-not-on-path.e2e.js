/**
 * E2E test: Node.js NOT on PATH scenario.
 *
 * This test is designed to run with a stripped PATH where node/npm
 * are not directly available. The app should:
 * 1. Still launch successfully
 * 2. Show the "Node.js & npm required" warning
 * 3. Show the "Auto-Install Node.js" button
 *
 * NOTE: This test requires special CI setup that removes Node from PATH
 * before launching the app. See ci.yml for details.
 * It is tagged with @no-node so it can be selectively included.
 */

describe("Dashboard without Node.js on PATH @no-node", () => {
  it("renders the main window", async () => {
    const title = await $("h2");
    await title.waitForExist({ timeout: 15_000 });
    expect((await title.getText()).length).toBeGreaterThan(0);
  });

  it("shows the Node.js required warning", async () => {
    const npmWarning = await $(".bg-red-100");
    await npmWarning.waitForExist({ timeout: 15_000 });
    expect(await npmWarning.isExisting()).toBe(true);
  });

  it("shows the Auto-Install Node.js button", async () => {
    const autoInstallBtn = await $("button.bg-green-600");
    await autoInstallBtn.waitForExist({ timeout: 10_000 });
    expect(await autoInstallBtn.isExisting()).toBe(true);
  });

  it("shows the manual download link", async () => {
    const downloadLink = await $('a[href="https://nodejs.org"]');
    expect(await downloadLink.isExisting()).toBe(true);
  });
});
