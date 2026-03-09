import os from "os";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

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

    // Wait for tauri-driver to start listening on port 4444
    await new Promise((resolve) => setTimeout(resolve, 3000));
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
