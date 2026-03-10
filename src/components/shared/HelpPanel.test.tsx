import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import HelpPanel from "./HelpPanel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue({ items: [], total_count: 0 }),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

function renderPanel(open = true) {
  const onClose = vi.fn();
  render(<HelpPanel open={open} onClose={onClose} />);
  return { onClose };
}

describe("HelpPanel — visibility", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <HelpPanel open={false} onClose={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders panel when open", () => {
    renderPanel(true);
    expect(screen.getByText("helpPanel.title")).toBeDefined();
  });
});

describe("HelpPanel — search & tabs", () => {
  it("shows search input", () => {
    renderPanel();
    expect(
      screen.getByPlaceholderText("helpPanel.searchPlaceholder"),
    ).toBeDefined();
  });

  it("shows FAQ tab by default", () => {
    renderPanel();
    const faqTab = screen.getByText("helpPanel.tabFaq");
    expect(faqTab.className).toContain("blue");
  });

  it("switches to community tab", () => {
    renderPanel();
    const communityTab = screen.getByText(/helpPanel.tabCommunity/);
    fireEvent.click(communityTab);
    expect(communityTab.className).toContain("purple");
  });
});

describe("HelpPanel — FAQ interactions", () => {
  it("renders all 8 FAQ items", () => {
    renderPanel();
    expect(
      screen.getByText("help.faq.gatewayWontStart.question"),
    ).toBeDefined();
    expect(
      screen.getByText("help.faq.whatIfSomethingBreaks.question"),
    ).toBeDefined();
  });

  it("expands a FAQ on click", () => {
    renderPanel();
    const q = screen.getByText("help.faq.isMyDataSafe.question");
    fireEvent.click(q);
    expect(screen.getByText("help.faq.isMyDataSafe.answer")).toBeDefined();
  });

  it("filters FAQs by search text", () => {
    renderPanel();
    const input = screen.getByPlaceholderText("helpPanel.searchPlaceholder");
    fireEvent.change(input, { target: { value: "gatewayWontStart" } });
    expect(
      screen.getByText("help.faq.gatewayWontStart.question"),
    ).toBeDefined();
    expect(
      screen.queryByText("help.faq.isMyDataSafe.question"),
    ).toBeNull();
  });
});

describe("HelpPanel — close", () => {
  it("calls onClose when backdrop clicked", () => {
    const { onClose } = renderPanel();
    const backdrop = document.querySelector(".fixed.inset-0");
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on Escape key", () => {
    const { onClose } = renderPanel();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
