import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import Settings from "./Settings";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

const mockedInvoke = vi.mocked(invoke);

function renderSettings() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>,
  );
}

describe("Settings — initial render", () => {
  beforeEach(() => {
    mockedInvoke.mockImplementation(async (...args: unknown[]) => {
      const cmd = args[0] as string;
      if (cmd === "get_environment") return { openclaw_installed: true, openclaw_version: "0.1.0" };
      return {};
    });
  });

  it("renders without crashing", async () => {
    renderSettings();
    expect(await screen.findByText("settings.title")).toBeDefined();
  });

  it("shows safety section", async () => {
    renderSettings();
    await screen.findByText("settings.title");
    expect(screen.getByText("settings.safety")).toBeDefined();
  });

  it("shows danger zone and uninstall button", async () => {
    renderSettings();
    await screen.findByText("settings.title");
    expect(screen.getByText("settings.dangerZone")).toBeDefined();
    expect(screen.getByText("settings.uninstallOpenClaw")).toBeDefined();
  });

  it("shows about section with version info", async () => {
    renderSettings();
    await screen.findByText("settings.title");
    expect(screen.getByText("settings.about")).toBeDefined();
    expect(screen.getByText("0.0.0-test")).toBeDefined();
  });
});

describe("Settings — uninstall flow", () => {
  beforeEach(() => {
    mockedInvoke.mockImplementation(async (...args: unknown[]) => {
      const cmd = args[0] as string;
      if (cmd === "get_environment") return { openclaw_installed: true, openclaw_version: "0.1.0" };
      if (cmd === "create_backup") return {};
      if (cmd === "uninstall_openclaw") {
        return { daemon_stopped: true, npm_uninstalled: true, config_removed: false, errors: [] };
      }
      return {};
    });
  });

  it("uninstall button opens confirm step", async () => {
    renderSettings();
    await screen.findByText("0.1.0");
    fireEvent.click(screen.getByText("settings.uninstallOpenClaw"));
    expect(await screen.findByText("settings.uninstall.confirmTitle")).toBeDefined();
  });

  it("confirm step has remove config checkbox", async () => {
    renderSettings();
    await screen.findByText("0.1.0");
    fireEvent.click(screen.getByText("settings.uninstallOpenClaw"));
    await screen.findByText("settings.uninstall.confirmTitle");
    expect(screen.getByText("settings.uninstall.alsoDeleteConfig")).toBeDefined();
  });

  it("cancel returns to idle", async () => {
    renderSettings();
    await screen.findByText("0.1.0");
    fireEvent.click(screen.getByText("settings.uninstallOpenClaw"));
    await screen.findByText("common.cancel");
    fireEvent.click(screen.getByText("common.cancel"));
    expect(screen.getByText("settings.uninstallDescription")).toBeDefined();
  });
});

describe("Settings — not installed", () => {
  beforeEach(() => {
    mockedInvoke.mockImplementation(async (...args: unknown[]) => {
      const cmd = args[0] as string;
      if (cmd === "get_environment") return { openclaw_installed: false, openclaw_version: null };
      return {};
    });
  });

  it("uninstall button disabled when not installed", async () => {
    renderSettings();
    const uninstallBtn = await screen.findByText("settings.uninstallOpenClaw");
    expect(uninstallBtn).toHaveAttribute("disabled");
  });
});
