import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import Channels from "./Channels";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) => {
    if (cmd === "list_channels") return Promise.resolve([]);
    return Promise.resolve({});
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === "string" ? fallback : key),
    i18n: { language: "en" },
  }),
}));

function renderChannels() {
  return render(
    <BrowserRouter>
      <Channels />
    </BrowserRouter>,
  );
}

describe("Channels", () => {
  it("renders title", async () => {
    renderChannels();
    expect(await screen.findByText("channels.title")).toBeDefined();
  });

  it("shows empty state when no channels", async () => {
    renderChannels();
    expect(await screen.findByText("channels.emptyTitle")).toBeDefined();
  });

  it("has add channel button", async () => {
    renderChannels();
    const btn = await screen.findByText("channels.addFirst");
    expect(btn).toBeDefined();
  });

  it("shows channel type grid when add clicked", async () => {
    renderChannels();
    const addBtn = await screen.findByText("channels.addFirst");
    fireEvent.click(addBtn);
    expect(await screen.findByText("telegram")).toBeDefined();
    expect(await screen.findByText("discord")).toBeDefined();
  });

  it("shows token input when telegram selected", async () => {
    renderChannels();
    const addBtn = await screen.findByText("channels.addFirst");
    fireEvent.click(addBtn);
    const tgBtn = await screen.findByText("telegram");
    fireEvent.click(tgBtn);
    expect(await screen.findByText("channels.tokenLabel")).toBeDefined();
  });

  it("renders with configured channels", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === "list_channels")
        return Promise.resolve([{ name: "telegram", status: "configured" }]);
      return Promise.resolve({});
    });
    renderChannels();
    expect(await screen.findByText("telegram")).toBeDefined();
    expect(await screen.findByText("channels.statusConfigured")).toBeDefined();
  });
});
