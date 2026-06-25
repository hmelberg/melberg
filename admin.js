const OVERRIDE_KEY = "melberg_admin_override_v1";
const BASE_CONFIG_URL = "projects.config.json";

const editor = document.getElementById("configEditor");
const saveButton = document.getElementById("saveButton");
const clearButton = document.getElementById("clearButton");
const loadBaseButton = document.getElementById("loadBaseButton");
const status = document.getElementById("status");

async function fetchBaseConfig() {
  const response = await fetch(BASE_CONFIG_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load base config (${response.status})`);
  }
  return response.json();
}

function readOverride() {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStatus(message) {
  status.textContent = message;
}

async function loadEditorData() {
  try {
    const override = readOverride();
    if (override) {
      editor.value = JSON.stringify(override, null, 2);
      writeStatus("Loaded saved override from this browser.");
      return;
    }

    const base = await fetchBaseConfig();
    editor.value = JSON.stringify(base, null, 2);
    writeStatus("Loaded base config from projects.config.json.");
  } catch (error) {
    editor.value = "{}";
    writeStatus(String(error.message || error));
  }
}

saveButton.addEventListener("click", () => {
  try {
    const parsed = JSON.parse(editor.value || "{}");
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(parsed));
    writeStatus("Override saved. Open index page and click Refresh now.");
  } catch (error) {
    writeStatus(`Invalid JSON: ${error.message || error}`);
  }
});

clearButton.addEventListener("click", () => {
  localStorage.removeItem(OVERRIDE_KEY);
  writeStatus("Override cleared. Base config will be used.");
});

loadBaseButton.addEventListener("click", async () => {
  try {
    const base = await fetchBaseConfig();
    editor.value = JSON.stringify(base, null, 2);
    writeStatus("Base config loaded into editor.");
  } catch (error) {
    writeStatus(String(error.message || error));
  }
});

loadEditorData();
