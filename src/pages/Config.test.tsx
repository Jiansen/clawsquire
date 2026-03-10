import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import Config from "./Config";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

const mockedInvoke = vi.mocked(invoke);

const SAMPLE_CONFIG = JSON.stringify({
  openclaw: { version: "0.1.0" },
  llm: { provider: "openai", apiKey: "sk-secret" },
});

function renderConfig() {
  return render(
    <MemoryRouter>
      <Config />
    </MemoryRouter>,
  );
}

describe("Config — initial render", () => {
  beforeEach(() => {
    mockedInvoke.mockImplementation(async (...args: unknown[]) => {
      const cmd = args[0] as string;
      if (cmd === "get_full_config") return SAMPLE_CONFIG;
      return {};
    });
  });

  it("renders without crashing", async () => {
    renderConfig();
    expect(await screen.findByText("config.title")).toBeDefined();
  });

  it("shows config tree by default", async () => {
    renderConfig();
    expect(await screen.findByText("openclaw")).toBeDefined();
    expect(screen.getByText("llm")).toBeDefined();
  });

  it("toggle to JSON view shows raw JSON", async () => {
    renderConfig();
    await screen.findByText("config.title");
    const jsonBtn = screen.getByText("config.jsonView");
    fireEvent.click(jsonBtn);
    expect(await screen.findByText(/openclaw/)).toBeDefined();
  });
});

describe("Config — tree interactions", () => {
  beforeEach(() => {
    mockedInvoke.mockImplementation(async (...args: unknown[]) => {
      const cmd = args[0] as string;
      if (cmd === "get_full_config") return SAMPLE_CONFIG;
      return {};
    });
  });

  it("expand/collapse tree node", async () => {
    renderConfig();
    await screen.findByText("openclaw");
    const openclawBtn = screen.getByText("openclaw");
    fireEvent.click(openclawBtn);
    await waitFor(() => {
      expect(screen.getByText("version")).toBeDefined();
    });
  });

  it("refresh button reloads config", async () => {
    renderConfig();
    await screen.findByText("config.title");
    const refreshBtn = screen.getByRole("button", { name: "↻" });
    fireEvent.click(refreshBtn);
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith("get_full_config");
    });
  });

  it("shows not found when config empty", async () => {
    mockedInvoke.mockImplementation(async (...args: unknown[]) => {
      const cmd = args[0] as string;
      if (cmd === "get_full_config") return "";
      return {};
    });
    renderConfig();
    expect(await screen.findByText("config.notFound")).toBeDefined();
  });
});
