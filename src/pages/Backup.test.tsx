import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import Backup from "./Backup";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

const mockedInvoke = vi.mocked(invoke);

const SAMPLE_BACKUPS = [
  {
    id: "backup-1",
    label: "Manual backup",
    timestamp: "2026-03-10T12:00:00Z",
    size_bytes: 1024,
    path: "/tmp/backup-1",
  },
];

function renderBackup() {
  return render(
    <MemoryRouter>
      <Backup />
    </MemoryRouter>,
  );
}

describe("Backup — empty state", () => {
  beforeEach(() => {
    mockedInvoke.mockImplementation(async (...args: unknown[]) => {
      const cmd = args[0] as string;
      if (cmd === "list_backups") return [];
      return {};
    });
  });

  it("renders without crashing", async () => {
    renderBackup();
    expect(await screen.findByText("backup.title")).toBeDefined();
  });

  it("shows empty state when no backups", async () => {
    renderBackup();
    expect(await screen.findByText("backup.noBackups")).toBeDefined();
  });

  it("create button in empty state triggers create_backup", async () => {
    renderBackup();
    await screen.findByText("backup.noBackups");
    const createBtns = screen.getAllByText("backup.create");
    fireEvent.click(createBtns[1]);
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith("create_backup", { label: null });
    });
  });
});

describe("Backup — with backups", () => {
  beforeEach(() => {
    mockedInvoke.mockImplementation(async (...args: unknown[]) => {
      const cmd = args[0] as string;
      if (cmd === "list_backups") return SAMPLE_BACKUPS;
      if (cmd === "diff_backups") return [];
      return {};
    });
  });

  it("renders backup list", async () => {
    renderBackup();
    expect(await screen.findByText("Manual backup")).toBeDefined();
  });

  it("diff button toggles diff view", async () => {
    renderBackup();
    await screen.findByText("Manual backup");
    const diffBtn = screen.getByText("backup.diff");
    fireEvent.click(diffBtn);
    expect(await screen.findByText("backup.noDifferences")).toBeDefined();
  });

  it("restore shows confirm/cancel buttons", async () => {
    renderBackup();
    await screen.findByText("Manual backup");
    const restoreBtn = screen.getByText("backup.restore");
    fireEvent.click(restoreBtn);
    expect(screen.getByText("common.confirm")).toBeDefined();
    expect(screen.getByText("common.cancel")).toBeDefined();
  });
});
