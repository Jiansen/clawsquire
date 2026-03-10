import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import Help from "./Help";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

function renderHelp() {
  return render(
    <MemoryRouter>
      <Help />
    </MemoryRouter>,
  );
}

describe("Help — initial render", () => {
  it("renders without crashing", () => {
    renderHelp();
    expect(screen.getByText("help.title")).toBeDefined();
  });

  it("shows search input", () => {
    renderHelp();
    expect(screen.getByPlaceholderText("help.searchPlaceholder")).toBeDefined();
  });

  it("shows common questions section", () => {
    renderHelp();
    expect(screen.getByText("help.commonQuestions")).toBeDefined();
  });
});

describe("Help — FAQ interactions", () => {
  it("expands FAQ on click", () => {
    renderHelp();
    const firstQuestion = screen.getByText("help.faq.gatewayWontStart.question");
    fireEvent.click(firstQuestion);
    expect(screen.getByText("help.faq.gatewayWontStart.answer")).toBeDefined();
  });

  it("collapses FAQ when clicked again", () => {
    renderHelp();
    const firstQuestion = screen.getByText("help.faq.gatewayWontStart.question");
    fireEvent.click(firstQuestion);
    expect(screen.getByText("help.faq.gatewayWontStart.answer")).toBeDefined();
    fireEvent.click(firstQuestion);
    expect(screen.queryByText("help.faq.gatewayWontStart.answer")).toBeNull();
  });

  it("search filters FAQs", () => {
    renderHelp();
    const searchInput = screen.getByPlaceholderText("help.searchPlaceholder");
    fireEvent.change(searchInput, { target: { value: "nonexistentxyz123" } });
    expect(screen.getByText("help.noResults")).toBeDefined();
  });
});
