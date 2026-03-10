import "@testing-library/jest-dom/vitest";

// Build-time constants for tests
globalThis.__APP_VERSION__ = "0.0.0-test";
globalThis.__TAURI_VERSION__ = "2";
globalThis.__REACT_VERSION__ = "19";

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
