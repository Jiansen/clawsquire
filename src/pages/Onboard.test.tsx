import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import Onboard from "./Onboard";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

function renderOnboard(path = "/onboard") {
  const router = createMemoryRouter(
    [
      { path: "/onboard", element: <Onboard /> },
      { path: "/onboard/:templateId", element: <Onboard /> },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

describe("Onboard — TemplateList", () => {
  it("renders wizard template cards and nav cards", async () => {
    renderOnboard();
    const links = await screen.findAllByRole("link");
    expect(links.length).toBeGreaterThanOrEqual(5);
  });

  it("includes channels nav card", async () => {
    renderOnboard();
    expect(await screen.findByText("onboard.navCards.channels.name")).toBeDefined();
  });

  it("includes vps-headless template", async () => {
    renderOnboard();
    expect(await screen.findByText("onboard.templates.vps-headless.name")).toBeDefined();
  });
});

describe("Onboard — Wizard navigation", () => {
  it("renders wizard for llm-provider template", async () => {
    renderOnboard("/onboard/llm-provider");
    expect(await screen.findByText("onboard.wizard.llmProvider.step1Title")).toBeDefined();
  });

  it("renders wizard for email-telegram template", async () => {
    renderOnboard("/onboard/email-telegram");
    expect(await screen.findByText("onboard.wizard.emailTelegram.step1Title")).toBeDefined();
  });

  it("shows step counter", async () => {
    renderOnboard("/onboard/telegram");
    expect(await screen.findByText(/onboard\.step/)).toBeDefined();
  });

  it("shows 'Template not found' for unknown template", async () => {
    renderOnboard("/onboard/nonexistent");
    expect(await screen.findByText("Template not found.")).toBeDefined();
  });
});
