import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import Sources from "./Sources";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) => {
    if (cmd === "config_get") return Promise.resolve("");
    return Promise.resolve({});
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === "string" ? fallback : key),
    i18n: { language: "en" },
  }),
}));

function renderSources() {
  return render(
    <BrowserRouter>
      <Sources />
    </BrowserRouter>,
  );
}

describe("Sources", () => {
  it("renders title", async () => {
    renderSources();
    expect(await screen.findByText("sources.title")).toBeDefined();
  });

  it("shows description", async () => {
    renderSources();
    expect(await screen.findByText("sources.description")).toBeDefined();
  });

  it("shows IMAP source type", async () => {
    renderSources();
    expect(await screen.findByText("sources.types.imap.name")).toBeDefined();
  });

  it("shows coming soon badge for RSS", async () => {
    renderSources();
    const badges = await screen.findAllByText("sources.comingSoon");
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it("shows configure button for IMAP", async () => {
    renderSources();
    expect(await screen.findByText("sources.configure")).toBeDefined();
  });

  it("shows tip section", async () => {
    renderSources();
    expect(await screen.findByText("sources.tipTitle")).toBeDefined();
  });

  it("shows IMAP configured status when config exists", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((_cmd: string, args?: Record<string, string>) => {
      if (args?.path === "email.imap.host") return Promise.resolve("imap.gmail.com");
      if (args?.path === "email.imap.username") return Promise.resolve("test@gmail.com");
      return Promise.resolve("");
    });
    renderSources();
    expect(await screen.findByText(/test@gmail\.com/)).toBeDefined();
  });
});
