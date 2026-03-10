import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import ImapWizard from "./ImapWizard";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

const mockedInvoke = vi.mocked(invoke);

function renderImap() {
  return render(
    <MemoryRouter>
      <ImapWizard />
    </MemoryRouter>,
  );
}

describe("ImapWizard — Step 1 (Email)", () => {
  beforeEach(() => {
    mockedInvoke.mockResolvedValue({});
  });

  it("renders title and step 1", () => {
    renderImap();
    expect(screen.getByText("imap.title")).toBeDefined();
    expect(screen.getByText("imap.step1Title")).toBeDefined();
  });

  it("next button disabled without valid email", () => {
    renderImap();
    const nextBtn = screen.getAllByRole("button").find(b => b.textContent === "onboard.next");
    expect(nextBtn).toBeDefined();
    expect(nextBtn!.hasAttribute("disabled")).toBe(true);
  });

  it("next button enabled with valid email", () => {
    renderImap();
    const emailInput = screen.getByPlaceholderText("imap.emailPlaceholder");
    fireEvent.change(emailInput, { target: { value: "test@gmail.com" } });
    const nextBtn = screen.getAllByRole("button").find(b => b.textContent === "onboard.next");
    expect(nextBtn!.hasAttribute("disabled")).toBe(false);
  });

  it("shows progress dots", () => {
    renderImap();
    const dots = screen.getAllByText(/^[123]$/);
    expect(dots.length).toBe(3);
  });
});

describe("ImapWizard — Step 2 (Server)", () => {
  beforeEach(() => {
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "detect_imap_preset") {
        return { host: "imap.gmail.com", port: 993, tls: true };
      }
      return {};
    });
  });

  async function goToStep2() {
    renderImap();
    const emailInput = screen.getByPlaceholderText("imap.emailPlaceholder");
    fireEvent.change(emailInput, { target: { value: "test@gmail.com" } });
    const nextBtn = screen.getAllByRole("button").find(b => b.textContent === "onboard.next");
    fireEvent.click(nextBtn!);
    await screen.findByText("imap.step2Title");
  }

  it("navigates to step 2 and shows detected host", async () => {
    await goToStep2();
    const hostInput = screen.getByDisplayValue("imap.gmail.com");
    expect(hostInput).toBeDefined();
  });

  it("shows port and TLS checkbox", async () => {
    await goToStep2();
    expect(screen.getByDisplayValue("993")).toBeDefined();
    expect(screen.getByText("imap.useTls")).toBeDefined();
  });

  it("back button returns to step 1", async () => {
    await goToStep2();
    const backBtn = screen.getAllByRole("button").find(b => b.textContent === "onboard.back");
    fireEvent.click(backBtn!);
    expect(screen.getByText("imap.step1Title")).toBeDefined();
  });
});

describe("ImapWizard — Step 3 (Password) and Save", () => {
  beforeEach(() => {
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "detect_imap_preset") {
        return { host: "imap.gmail.com", port: 993, tls: true };
      }
      if (cmd === "save_imap_config") return {};
      if (cmd === "store_secret") return { success: true, error: null };
      return {};
    });
  });

  async function goToStep3() {
    renderImap();
    const emailInput = screen.getByPlaceholderText("imap.emailPlaceholder");
    fireEvent.change(emailInput, { target: { value: "test@gmail.com" } });
    const next1 = screen.getAllByRole("button").find(b => b.textContent === "onboard.next");
    fireEvent.click(next1!);
    await screen.findByText("imap.step2Title");
    const next2 = screen.getAllByRole("button").find(b => b.textContent === "onboard.next");
    fireEvent.click(next2!);
    await screen.findByText("imap.step3Title");
  }

  it("navigates to step 3 and shows password input", async () => {
    await goToStep3();
    expect(screen.getByText("imap.password")).toBeDefined();
    expect(screen.getByText("imap.appPasswordHint")).toBeDefined();
  });

  it("save button disabled without password", async () => {
    await goToStep3();
    const saveBtn = screen.getAllByRole("button").find(b => b.textContent === "imap.saveAndTest");
    expect(saveBtn!.hasAttribute("disabled")).toBe(true);
  });

  it("save triggers invoke calls and shows done step", async () => {
    await goToStep3();
    const pwInput = document.querySelector("input[type='password']")!;
    fireEvent.change(pwInput, { target: { value: "secret123" } });

    const saveBtn = screen.getAllByRole("button").find(b => b.textContent === "imap.saveAndTest");
    fireEvent.click(saveBtn!);

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith("save_imap_config", {
        email: "test@gmail.com",
        host: "imap.gmail.com",
        port: 993,
        tls: true,
        password: "secret123",
      });
    });

    expect(await screen.findByText("imap.doneTitle")).toBeDefined();
  });

  it("shows error on save failure", async () => {
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "detect_imap_preset") return { host: "imap.gmail.com", port: 993, tls: true };
      if (cmd === "save_imap_config") throw new Error("Connection refused");
      return {};
    });
    await goToStep3();
    const pwInput = document.querySelector("input[type='password']");
    fireEvent.change(pwInput!, { target: { value: "secret123" } });
    const saveBtn = screen.getAllByRole("button").find(b => b.textContent === "imap.saveAndTest");
    fireEvent.click(saveBtn!);
    expect(await screen.findByText(/Connection refused/)).toBeDefined();
  });

  it("shows summary with email and server info", async () => {
    await goToStep3();
    expect(screen.getByText("imap.summary")).toBeDefined();
    expect(screen.getByText(/test@gmail\.com → imap\.gmail\.com:993/)).toBeDefined();
  });
});
