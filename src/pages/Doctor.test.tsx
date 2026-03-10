import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import Doctor from "./Doctor";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

const mockedInvoke = vi.mocked(invoke);

const SAMPLE_REPORT = {
  checks: [
    { name: "Node.js", status: "pass" as const, message: "v20.0.0", category: "installation", fix_hint: null },
    { name: "OpenClaw", status: "warn" as const, message: "Not running", category: "gateway", fix_hint: "Start daemon" },
  ],
  summary: { total: 2, passed: 1, warnings: 1, failures: 0 },
};

function renderDoctor() {
  return render(
    <MemoryRouter>
      <Doctor />
    </MemoryRouter>,
  );
}

describe("Doctor — initial render", () => {
  beforeEach(() => {
    mockedInvoke.mockImplementation(async (...args: unknown[]) => {
      const cmd = args[0] as string;
      if (cmd === "run_doctor") return SAMPLE_REPORT;
      return {};
    });
  });

  it("renders without crashing", async () => {
    renderDoctor();
    expect(await screen.findByText(/doctor\.title/)).toBeDefined();
  });

  it("shows run or rerun button after load", async () => {
    renderDoctor();
    const btn = await screen.findByRole("button", { name: /doctor\.(runCheck|rerun)/ }, { timeout: 10000 });
    expect(btn).toBeDefined();
  });

  it("displays report with summary", async () => {
    renderDoctor();
    expect(await screen.findByText("doctor.total")).toBeDefined();
    expect(screen.getAllByText("doctor.pass").length).toBeGreaterThanOrEqual(1);
  });
});

describe("Doctor — report display", () => {
  beforeEach(() => {
    mockedInvoke.mockImplementation(async (...args: unknown[]) => {
      const cmd = args[0] as string;
      if (cmd === "run_doctor") return SAMPLE_REPORT;
      return {};
    });
  });

  it("shows summary cards with correct values", async () => {
    renderDoctor();
    await screen.findByText("doctor.total");
    const twos = screen.getAllByText("2");
    expect(twos.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("doctor.warn").length).toBeGreaterThanOrEqual(1);
  });

  it("rerun button appears after report loads", async () => {
    renderDoctor();
    expect(await screen.findByText("doctor.rerun")).toBeDefined();
  });

  it("expands check on click to show fix hint", async () => {
    renderDoctor();
    await screen.findByText("OpenClaw");
    const checkBtn = screen.getByText("OpenClaw");
    fireEvent.click(checkBtn);
    expect(await screen.findByText("Start daemon")).toBeDefined();
  });
});
