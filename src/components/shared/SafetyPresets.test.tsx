import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import SafetyPresets, { type SafetyLevel } from "./SafetyPresets";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

const mockedInvoke = vi.mocked(invoke);

describe("SafetyPresets", () => {
  beforeEach(() => {
    localStorage.clear();
    mockedInvoke.mockReset();
    mockedInvoke.mockResolvedValue({} as never);
  });

  it("allows toggling switches in custom mode", async () => {
    const onChange = vi.fn<(level: SafetyLevel) => void>();
    render(<SafetyPresets value="custom" onChange={onChange} showDetails />);

    const slashSwitch = screen.getByRole("switch", {
      name: "settings.permissions.slashCommands",
    });

    expect(slashSwitch).toHaveAttribute("aria-checked", "true");
    fireEvent.click(slashSwitch);

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith("run_openclaw_cli", {
        args: ["config", "set", "commands.native", "false", "--json"],
      });
    });
    expect(mockedInvoke).toHaveBeenCalledWith("run_openclaw_cli", {
      args: ["config", "set", "commands.nativeSkills", "false", "--json"],
    });
  });

  it("keeps switches locked in non-custom preset mode", () => {
    const onChange = vi.fn<(level: SafetyLevel) => void>();
    render(<SafetyPresets value="standard" onChange={onChange} showDetails />);

    expect(screen.queryByRole("switch")).toBeNull();
  });
});
