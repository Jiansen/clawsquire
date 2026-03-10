import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import VpsManager from "./VpsManager";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

const mockedInvoke = vi.mocked(invoke);

function renderVps() {
  return render(
    <MemoryRouter>
      <VpsManager />
    </MemoryRouter>,
  );
}

const SAMPLE_INSTANCE = {
  id: "vps-test-1",
  name: "Test Server",
  host: "10.0.0.1",
  port: 22,
  username: "root",
  auth_method: "password",
  key_path: null,
  openclaw_installed: false,
  openclaw_version: null,
  last_connected: null,
  created_at: "2026-03-10T00:00:00Z",
};

async function waitForInstances() {
  const items = await screen.findAllByText("Test Server");
  expect(items.length).toBeGreaterThanOrEqual(1);
}

describe("VpsManager — empty state", () => {
  beforeEach(() => {
    mockedInvoke.mockResolvedValue([]);
  });

  it("renders empty state when no instances exist", async () => {
    renderVps();
    expect(await screen.findByText("vps.emptyTitle")).toBeDefined();
  });

  it("shows add-first prompt in sidebar", async () => {
    renderVps();
    expect(await screen.findByText("vps.addFirst")).toBeDefined();
  });

  it("opens add form on + button click", async () => {
    renderVps();
    const addBtn = screen.getByTitle("vps.addInstance");
    fireEvent.click(addBtn);
    expect(await screen.findByText("vps.addDesc")).toBeDefined();
  });
});

describe("VpsManager — add instance form", () => {
  beforeEach(() => {
    mockedInvoke.mockResolvedValue([]);
  });

  it("test connection button disabled when fields empty", async () => {
    renderVps();
    fireEvent.click(screen.getByTitle("vps.addInstance"));
    await screen.findByText("vps.addDesc");
    const testBtn = screen.getAllByRole("button").find(b => b.textContent === "ssh.testConnection");
    expect(testBtn).toBeDefined();
    expect(testBtn!.hasAttribute("disabled")).toBe(true);
  });

  it("save button disabled without successful test", async () => {
    renderVps();
    fireEvent.click(screen.getByTitle("vps.addInstance"));
    await screen.findByText("vps.addDesc");
    const saveBtn = screen.getAllByRole("button").find(b => b.textContent === "vps.save");
    expect(saveBtn).toBeDefined();
    expect(saveBtn!.hasAttribute("disabled")).toBe(true);
  });

  it("switches auth method to key and shows key path field", async () => {
    renderVps();
    fireEvent.click(screen.getByTitle("vps.addInstance"));
    await screen.findByText("vps.addDesc");
    const keyBtn = screen.getAllByRole("button").find(b => b.textContent === "ssh.keyFile");
    expect(keyBtn).toBeDefined();
    fireEvent.click(keyBtn!);
    expect(screen.getByText("ssh.keyPath")).toBeDefined();
  });

  it("cancel button closes form", async () => {
    renderVps();
    fireEvent.click(screen.getByTitle("vps.addInstance"));
    await screen.findByText("vps.addDesc");
    const cancelBtn = screen.getAllByRole("button").find(b => b.textContent === "common.cancel");
    fireEvent.click(cancelBtn!);
    expect(screen.queryByText("vps.addDesc")).toBeNull();
  });
});

describe("VpsManager — with instances", () => {
  beforeEach(() => {
    mockedInvoke.mockImplementation(async (...args: unknown[]) => {
      const cmd = args[0] as string;
      if (cmd === "list_instances") return [SAMPLE_INSTANCE];
      return {};
    });
  });

  it("renders instance in sidebar", async () => {
    renderVps();
    await waitForInstances();
  });

  it("shows overview tab by default with host info", async () => {
    renderVps();
    await waitForInstances();
    expect(screen.getByText("vps.tab.overview")).toBeDefined();
    expect(screen.getByText("10.0.0.1")).toBeDefined();
  });

  it("shows delete confirmation on delete click", async () => {
    renderVps();
    await waitForInstances();
    const deleteBtn = screen.getByText("vps.delete");
    fireEvent.click(deleteBtn);
    const confirmBtns = screen.getAllByText("common.confirm");
    expect(confirmBtns.length).toBeGreaterThanOrEqual(1);
  });

  it("cancels delete confirmation", async () => {
    renderVps();
    await waitForInstances();
    fireEvent.click(screen.getByText("vps.delete"));
    await screen.findByText("common.cancel");
    fireEvent.click(screen.getByText("common.cancel"));
    expect(screen.getByText("vps.delete")).toBeDefined();
  });

  it("switches to deploy tab", async () => {
    renderVps();
    await waitForInstances();
    fireEvent.click(screen.getByText("vps.tab.deploy"));
    expect(screen.getByText("remote.securityNote")).toBeDefined();
  });

  it("switches to terminal tab", async () => {
    renderVps();
    await waitForInstances();
    fireEvent.click(screen.getByText("vps.tab.terminal"));
    expect(screen.getByText("ssh.command")).toBeDefined();
  });

  it("deploy button disabled when password not entered for password auth", async () => {
    renderVps();
    await waitForInstances();
    fireEvent.click(screen.getByText("vps.tab.deploy"));
    const deployBtn = screen.getAllByRole("button").find(b => b.textContent === "vps.deployNow");
    expect(deployBtn).toBeDefined();
    expect(deployBtn!.hasAttribute("disabled")).toBe(true);
  });

  it("confirms and deletes instance", async () => {
    renderVps();
    await waitForInstances();
    fireEvent.click(screen.getByText("vps.delete"));
    const confirmBtns = screen.getAllByText("common.confirm");
    const actionBtn = confirmBtns.find(b => b.tagName === "BUTTON" || b.closest("button"));
    fireEvent.click(actionBtn!);
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith("delete_instance", { id: "vps-test-1" });
    });
  });
});
