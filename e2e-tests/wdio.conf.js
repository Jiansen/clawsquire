import os from "os";
import path from "path";
import fs from "fs";
import { spawn, spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SCREENSHOTS_DIR = path.resolve(__dirname, "screenshots");

let tauriDriver;
let exit = false;

function appBinaryPath() {
  const platform = os.platform();
  const base = path.resolve(__dirname, "../src-tauri/target/debug");
  if (platform === "win32") return path.join(base, "ClawSquire.exe");
  return path.join(base, "clawsquire");
}

export const config = {
  host: "127.0.0.1",
  port: 4444,

  specs: ["./test/specs/**/*.js"],
  maxInstances: 1,

  capabilities: [
    {
      maxInstances: 1,
      browserName: "wry",
      "tauri:options": {
        application: appBinaryPath(),
      },
    },
  ],

  reporters: ["spec"],
  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    timeout: 120_000,
  },

  onPrepare: () => {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

    const binPath = appBinaryPath();
    if (fs.existsSync(binPath)) {
      console.log(`[e2e] Binary already exists at ${binPath}, skipping build`);
      return;
    }

    const npm = os.platform() === "win32" ? "npm.cmd" : "npm";
    spawnSync(npm, ["run", "tauri", "build", "--", "--debug", "--no-bundle"], {
      cwd: path.resolve(__dirname, ".."),
      stdio: "inherit",
      shell: true,
    });
  },

  beforeSession: async () => {
    const driverBin = path.resolve(
      os.homedir(),
      ".cargo",
      "bin",
      os.platform() === "win32" ? "tauri-driver.exe" : "tauri-driver"
    );
    tauriDriver = spawn(driverBin, [], {
      stdio: [null, process.stdout, process.stderr],
    });

    tauriDriver.on("error", (error) => {
      console.error("tauri-driver error:", error);
      process.exit(1);
    });

    tauriDriver.on("exit", (code) => {
      if (!exit) {
        console.error("tauri-driver exited with code:", code);
        process.exit(1);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 3000));
  },

  before: async () => {
    // Wait for the Tauri app to navigate away from about:blank.
    // WebView2 starts at about:blank; localStorage is inaccessible there.
    await browser.waitUntil(
      async () => {
        const url = await browser.getUrl();
        return url && url !== "about:blank";
      },
      { timeout: 30_000, interval: 500, timeoutMsg: "App never left about:blank" }
    );
    // Extra pause for React to mount and IPC calls to settle
    await browser.pause(3000);
  },

  afterTest: async function (test, _context, { error, passed }) {
    const slug = `${test.parent}-${test.title}`.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 80);
    const status = passed ? "pass" : "fail";
    const filename = `${status}--${slug}.png`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);

    try {
      await browser.saveScreenshot(filepath);
      if (!passed) {
        console.log(`[e2e] Screenshot saved: ${filepath}`);
      }
    } catch (e) {
      console.warn(`[e2e] Could not save screenshot: ${e.message}`);
    }

    if (error) {
      try {
        const html = await browser.getPageSource();
        const htmlPath = filepath.replace(".png", ".html");
        fs.writeFileSync(htmlPath, html, "utf-8");
        console.log(`[e2e] Page source saved: ${htmlPath}`);
      } catch (_) {}
    }
  },

  afterSession: () => {
    closeTauriDriver();
  },
};

function closeTauriDriver() {
  exit = true;
  tauriDriver?.kill();
}

function onShutdown(fn) {
  const cleanup = () => {
    try {
      fn();
    } finally {
      process.exit();
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("SIGHUP", cleanup);
  process.on("SIGBREAK", cleanup);
}

onShutdown(() => closeTauriDriver());
