/**
 * E2E: Welcome → Language Selection → Dashboard
 *
 * First-launch flow: the app shows a language picker.
 * After selecting a language the app navigates to the Dashboard.
 */

describe("Welcome / First Launch", () => {
  before(async () => {
    // Ensure no locale is stored so Welcome screen appears
    await browser.execute(() => localStorage.removeItem("clawsquire.locale"));
    await browser.refresh();
    await browser.pause(2000);
  });

  it("shows the language selection grid on first launch", async () => {
    // Welcome page has language buttons with flag emojis or language names
    const buttons = await $$("button");
    // At least 7 languages: en, zh-CN, zh-TW, es, ja, de, pt-BR
    expect(buttons.length).toBeGreaterThanOrEqual(7);
  });

  it("displays the app title / branding", async () => {
    const heading = await $("h1,h2");
    await heading.waitForExist({ timeout: 10_000 });
    const text = await heading.getText();
    expect(text.length).toBeGreaterThan(0);
  });

  it("selects English and navigates to Dashboard", async () => {
    // Find a button that contains "English" or "EN"
    const enBtn = await $("button*=English");
    if (await enBtn.isExisting()) {
      await enBtn.click();
    } else {
      // Fallback: click the first button
      const firstBtn = await $("button");
      await firstBtn.click();
    }

    await browser.pause(2000);

    // After language selection, localStorage should be set
    const locale = await browser.execute(() =>
      localStorage.getItem("clawsquire.locale")
    );
    expect(locale).not.toBeNull();

    // Dashboard should now be visible — look for sidebar or main content
    const sidebar = await $("nav, aside, [class*='sidebar']");
    await sidebar.waitForExist({ timeout: 10_000 });
    expect(await sidebar.isExisting()).toBe(true);
  });
});
