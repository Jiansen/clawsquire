import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import RemoteInstall from "./RemoteInstall";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

function renderRemote() {
  return render(
    <MemoryRouter>
      <RemoteInstall />
    </MemoryRouter>,
  );
}

describe("RemoteInstall", () => {
  it("renders the page title", () => {
    renderRemote();
    expect(screen.getByText("remote.title")).toBeDefined();
  });

  it("shows security note", () => {
    renderRemote();
    expect(screen.getByText("remote.securityNote")).toBeDefined();
  });

  it("renders generate button", () => {
    renderRemote();
    const btn = screen.getByText("remote.generate");
    expect(btn).toBeDefined();
  });

  it("renders provider selection options", () => {
    renderRemote();
    expect(screen.getByText("OpenAI")).toBeDefined();
    expect(screen.getByText("DeepSeek")).toBeDefined();
  });
});
