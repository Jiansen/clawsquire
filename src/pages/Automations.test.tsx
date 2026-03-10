import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import Automations from "./Automations";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) => {
    if (cmd === "cron_list") return Promise.resolve([]);
    if (cmd === "list_channels") return Promise.resolve([]);
    return Promise.resolve({});
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === "string" ? fallback : key),
    i18n: { language: "en" },
  }),
}));

function renderAutomations() {
  return render(
    <BrowserRouter>
      <Automations />
    </BrowserRouter>,
  );
}

describe("Automations", () => {
  it("renders title", async () => {
    renderAutomations();
    expect(await screen.findByText("automations.title")).toBeDefined();
  });

  it("shows empty state when no jobs", async () => {
    renderAutomations();
    expect(await screen.findByText("automations.emptyTitle")).toBeDefined();
  });

  it("shows no-channels hint when no channels configured", async () => {
    renderAutomations();
    expect(await screen.findByText("automations.noChannelsHint")).toBeDefined();
  });

  it("shows create button", async () => {
    renderAutomations();
    const btns = await screen.findAllByText(/automations\.create/);
    expect(btns.length).toBeGreaterThanOrEqual(1);
  });

  it("shows preset selection when create clicked", async () => {
    renderAutomations();
    const createBtn = await screen.findByText("+ automations.create");
    fireEvent.click(createBtn);
    expect(await screen.findByText("automations.presets.email-summary.name")).toBeDefined();
    expect(await screen.findByText("automations.presets.custom.name")).toBeDefined();
  });

  it("shows form after preset selected", async () => {
    renderAutomations();
    const createBtn = await screen.findByText("+ automations.create");
    fireEvent.click(createBtn);
    const emailPreset = await screen.findByText("automations.presets.email-summary.name");
    fireEvent.click(emailPreset);
    expect(await screen.findByText("automations.nameLabel")).toBeDefined();
    expect(await screen.findByText("automations.messageLabel")).toBeDefined();
  });

  it("renders with existing jobs", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === "cron_list")
        return Promise.resolve([
          { name: "Email Check", every: "15m", channel: "telegram", message: "Check emails" },
        ]);
      if (cmd === "list_channels")
        return Promise.resolve([{ name: "telegram", status: "configured" }]);
      return Promise.resolve({});
    });
    renderAutomations();
    expect(await screen.findByText("Email Check")).toBeDefined();
  });
});
