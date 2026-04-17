import fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const extensionPath = path.join(repoRoot, "extension");
const userDataDir = path.join(repoRoot, ".local", "browser-profile");
const startUrl = process.env.STREAM_GUARD_START_URL || "https://www.twitch.tv/";
const shouldResetProfile = process.argv.includes("--reset-profile");
const explicitBrowserPath = process.env.STREAM_GUARD_BROWSER_PATH;

const preferredBrowserPaths = [
  explicitBrowserPath,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
].filter(Boolean);

const browserExecutablePath =
  preferredBrowserPaths.find((candidate) => fs.existsSync(candidate)) || undefined;

if (!fs.existsSync(extensionPath)) {
  throw new Error(`Extension directory not found: ${extensionPath}`);
}

if (shouldResetProfile) {
  fs.rmSync(userDataDir, { recursive: true, force: true });
}

fs.mkdirSync(userDataDir, { recursive: true });
ensureTwitchSiteMuted(userDataDir);
if (!browserExecutablePath) {
  throw new Error(
    "No supported browser executable found. Install Google Chrome or Brave, or set STREAM_GUARD_BROWSER_PATH."
  );
}

const browserArgs = [
  `--user-data-dir=${userDataDir}`,
  "--no-first-run",
  "--no-default-browser-check",
  startUrl
];

const child = spawn(browserExecutablePath, browserArgs, {
  detached: true,
  stdio: "ignore"
});

child.unref();

console.log(`Stream Guard project browser started.
Profile: ${userDataDir}
Start URL: ${startUrl}
Browser: ${browserExecutablePath}
Twitch audio: site-muted at browser level

The browser now runs independently from this command.
Use npm run browser:session:reset to start from a fresh profile.`);

function ensureTwitchSiteMuted(profileDir) {
  const defaultDir = path.join(profileDir, "Default");
  const preferencesPath = path.join(defaultDir, "Preferences");

  fs.mkdirSync(defaultDir, { recursive: true });

  let preferences = {};
  if (fs.existsSync(preferencesPath)) {
    try {
      preferences = JSON.parse(fs.readFileSync(preferencesPath, "utf8"));
    } catch (_error) {
      preferences = {};
    }
  }

  const profile = preferences.profile && typeof preferences.profile === "object"
    ? preferences.profile
    : {};
  const contentSettings = profile.content_settings && typeof profile.content_settings === "object"
    ? profile.content_settings
    : {};
  const exceptions = contentSettings.exceptions && typeof contentSettings.exceptions === "object"
    ? contentSettings.exceptions
    : {};
  const sound = exceptions.sound && typeof exceptions.sound === "object"
    ? exceptions.sound
    : {};

  sound["https://[*.]twitch.tv,*"] = {
    last_modified: String(Date.now() * 1000),
    setting: 2
  };

  preferences.profile = {
    ...profile,
    content_settings: {
      ...contentSettings,
      exceptions: {
        ...exceptions,
        sound
      }
    }
  };

  fs.writeFileSync(preferencesPath, JSON.stringify(preferences));
}
