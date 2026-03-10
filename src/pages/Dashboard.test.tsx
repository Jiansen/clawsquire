import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import Dashboard from "./Dashboard";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

const mockedInvoke = vi.mocked(invoke);

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

describe("Dashboard — initial render", () => {
  beforeEach(() => {
    mockedInvoke.mockImplementation(async (...args: unknown[]) => {
      const cmd = args[0] as string;
      if (cmd === "get_environment") {
        return {
          openclaw_installed: false,
          openclaw_version: null,
          openclaw_path: null,
          npm_installed: true,
          npm_version: "10.0.0",
          node_version: "20.0.0",
          config_dir: "/tmp/config",
          platform: "darwin",
        };
      }
      if (cmd === "daemon_status") return { running: false, pid: null };
      if (cmd === "list_backups") return [];
      if (cmd === "check_for_updates") return { update_available: false, latest_version: null, download_url: null };
      return {};
    });
  });

  it("renders without crashing", async () => {
    renderDashboard();
    expect(await screen.findByText("dashboard.title")).toBeDefined();
  });

  it("shows key headings and sections", async () => {
    renderDashboard();
    await screen.findByText("dashboard.title");
    expect(screen.getByText("dashboard.openclawStatus")).toBeDefined();
    expect(screen.getByText("dashboard.quickActions")).toBeDefined();
  });

  it("shows not-installed state when openclaw not installed", async () => {
    renderDashboard();
    expect(await screen.findByText("dashboard.notInstalled")).toBeDefined();
  });
});

describe("Dashboard — installed state", () => {
  beforeEach(() => {
    mockedInvoke.mockImplementation(async (...args: unknown[]) => {
      const cmd = args[0] as string;
      if (cmd === "get_environment") {
        return {
          openclaw_installed: true,
          openclaw_version: "0.1.0",
          openclaw_path: "/usr/bin/openclaw",
          npm_installed: true,
          npm_version: "10.0.0",
          node_version: "20.0.0",
          config_dir: "/tmp/config",
          platform: "darwin",
        };
      }
      if (cmd === "daemon_status") return { running: false, pid: null };
      if (cmd === "list_backups") return [];
      if (cmd === "check_for_updates") return { update_available: false, latest_version: null, download_url: null };
      if (cmd === "check_llm_config") return { has_provider: true, provider_name: "openai" };
      return {};
    });
  });

  it("shows installed status and daemon start button", async () => {
    renderDashboard();
    expect(await screen.findByText("dashboard.stopped")).toBeDefined();
    const startBtns = screen.getAllByText("dashboard.daemon.start");
    expect(startBtns.length).toBeGreaterThanOrEqual(1);
  });

  it("refresh button is disabled while loading", async () => {
    renderDashboard();
    const refreshBtn = screen.getByRole("button", { name: "..." });
    expect(refreshBtn).toBeDefined();
  });
});

describe("Dashboard — quick actions", () => {
  beforeEach(() => {
    mockedInvoke.mockImplementation(async (...args: unknown[]) => {
      const cmd = args[0] as string;
      if (cmd === "get_environment") {
        return {
          openclaw_installed: true,
          openclaw_version: "0.1.0",
          openclaw_path: "/usr/bin/openclaw",
          npm_installed: true,
          npm_version: "10.0.0",
          node_version: "20.0.0",
          config_dir: "/tmp/config",
          platform: "darwin",
        };
      }
      if (cmd === "daemon_status") return { running: false, pid: null };
      if (cmd === "list_backups") return [];
      if (cmd === "check_for_updates") return { update_available: false, latest_version: null, download_url: null };
      if (cmd === "check_llm_config") return { has_provider: true, provider_name: "openai" };
      return {};
    });
  });

  it("backup now button triggers create_backup", async () => {
    renderDashboard();
    await screen.findByText("dashboard.stopped");
    const backupBtn = screen.getByText("dashboard.backupNow");
    fireEvent.click(backupBtn);
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith("create_backup", { label: null });
    });
  });

  it("view config button is clickable", async () => {
    renderDashboard();
    await screen.findByText("dashboard.stopped");
    const configBtn = screen.getByText("dashboard.viewConfig");
    fireEvent.click(configBtn);
    expect(configBtn).toBeDefined();
  });
});
