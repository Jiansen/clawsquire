import "@testing-library/jest-dom/vitest";

// Mock @tauri-apps/api/core for tests that don't need real IPC
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue({}),
}));

// Mock @tauri-apps/api/window
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn().mockReturnValue({
    setTitle: vi.fn(),
    onCloseRequested: vi.fn(),
  }),
}));
