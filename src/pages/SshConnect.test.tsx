import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import SshConnect from "./SshConnect";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

function renderSsh() {
  return render(
    <MemoryRouter>
      <SshConnect />
    </MemoryRouter>,
  );
}

describe("SshConnect", () => {
  it("renders the page title", () => {
    renderSsh();
    expect(screen.getByText("ssh.title")).toBeDefined();
  });

  it("renders host and port inputs", () => {
    renderSsh();
    const inputs = screen.getAllByRole("textbox");
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it("test connection button is disabled when host is empty", () => {
    renderSsh();
    const buttons = screen.getAllByRole("button");
    const testBtn = buttons.find((b) => b.textContent?.includes("ssh.testConnection"));
    expect(testBtn).toBeDefined();
    expect(testBtn!.hasAttribute("disabled") || testBtn!.closest("[disabled]")).toBeTruthy();
  });

  it("switches auth method between password and key", () => {
    renderSsh();
    const keyBtn = screen.getByText(/ssh\.keyFile/);
    fireEvent.click(keyBtn);
    expect(screen.getByText("ssh.keyPath")).toBeDefined();

    const pwBtn = screen.getByText(/ssh\.password/);
    fireEvent.click(pwBtn);
    expect(screen.queryByText("ssh.keyPath")).toBeNull();
  });

  it("run button is disabled when command is empty", () => {
    renderSsh();
    const buttons = screen.getAllByRole("button");
    const runBtn = buttons.find((b) => b.textContent?.includes("ssh.execute"));
    expect(runBtn).toBeDefined();
    expect(runBtn!.hasAttribute("disabled") || runBtn!.closest("[disabled]")).toBeTruthy();
  });
});
