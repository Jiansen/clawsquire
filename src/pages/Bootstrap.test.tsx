import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import Bootstrap from "./Bootstrap";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}`;
      return key;
    },
    i18n: { language: "en" },
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));

vi.mock("../context/ActiveTargetContext", () => ({
  useActiveTarget: () => ({
    target: { mode: "local" },
    instances: [],
    switching: false,
    error: null,
    setTarget: vi.fn(),
    refreshInstances: vi.fn(),
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

const mockedInvoke = vi.mocked(invoke);

describe("Bootstrap page", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    mockedInvoke.mockImplementation(async (...args: unknown[]) => {
      const cmd = args[0] as string;
      if (cmd === "list_instances") return [];
      if (cmd === "bootstrap_get_script") return "#!/bin/bash\necho 'test'";
      if (cmd === "bootstrap_get_cargo_script") return "cargo install clawsquire-serve";
      if (cmd === "get_active_target") return { mode: "local" };
      return "";
    });
  });

  it("renders the page title", async () => {
    render(
      <MemoryRouter>
        <Bootstrap />
      </MemoryRouter>,
    );
    expect(screen.getByText("bootstrap.title")).toBeInTheDocument();
  });

  it("renders three tabs", async () => {
    render(
      <MemoryRouter>
        <Bootstrap />
      </MemoryRouter>,
    );
    expect(screen.getByText("bootstrap.tabAuto")).toBeInTheDocument();
    expect(screen.getByText("bootstrap.tabManual")).toBeInTheDocument();
    expect(screen.getByText("bootstrap.tabVerify")).toBeInTheDocument();
  });

  it("shows auto setup tab by default with SSH form", async () => {
    render(
      <MemoryRouter>
        <Bootstrap />
      </MemoryRouter>,
    );
    expect(screen.getByText("bootstrap.autoTitle")).toBeInTheDocument();
  });

  it("switches to manual tab on click", async () => {
    render(
      <MemoryRouter>
        <Bootstrap />
      </MemoryRouter>,
    );
    const manualTab = screen.getByText("bootstrap.tabManual");
    fireEvent.click(manualTab);
    await waitFor(() => {
      expect(screen.getByText("bootstrap.step1Title")).toBeInTheDocument();
    });
  });

  it("switches to verify tab on click", async () => {
    render(
      <MemoryRouter>
        <Bootstrap />
      </MemoryRouter>,
    );
    const verifyTab = screen.getByText("bootstrap.tabVerify");
    fireEvent.click(verifyTab);
    await waitFor(() => {
      expect(screen.getByText("bootstrap.step3Title")).toBeInTheDocument();
    });
  });

  it("shows start button in auto setup tab", async () => {
    render(
      <MemoryRouter>
        <Bootstrap />
      </MemoryRouter>,
    );
    expect(screen.getByText("bootstrap.startSetup")).toBeInTheDocument();
  });
});
