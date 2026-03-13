/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __TAURI_VERSION__: string;
declare const __REACT_VERSION__: string;

interface Window {
  __TAURI_INTERNALS__?: unknown;
}
