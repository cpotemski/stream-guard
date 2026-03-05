export function createRuntimeStore({
  getSettings,
  setSettings,
  getRuntimeState,
  setRuntimeState,
  stateCacheTtlMs,
  onStateMutated
}) {
  let cachedSettings = null;
  let cachedSettingsExpiresAt = 0;
  let cachedRuntimeState = null;
  let cachedRuntimeStateExpiresAt = 0;
  let mutateHook = typeof onStateMutated === "function" ? onStateMutated : () => {};

  async function readSettingsFresh() {
    const settings = await getSettings();
    cachedSettings = settings;
    cachedSettingsExpiresAt = Date.now() + stateCacheTtlMs;
    return settings;
  }

  async function readSettingsCached() {
    if (cachedSettings && cachedSettingsExpiresAt > Date.now()) {
      return cachedSettings;
    }
    return readSettingsFresh();
  }

  async function writeSettings(partialSettings) {
    const settings = await setSettings(partialSettings);
    cachedSettings = settings;
    cachedSettingsExpiresAt = Date.now() + stateCacheTtlMs;
    mutateHook();
    return settings;
  }

  async function readRuntimeStateFresh() {
    const runtimeState = await getRuntimeState();
    cachedRuntimeState = runtimeState;
    cachedRuntimeStateExpiresAt = Date.now() + stateCacheTtlMs;
    return runtimeState;
  }

  async function readRuntimeStateCached() {
    if (cachedRuntimeState && cachedRuntimeStateExpiresAt > Date.now()) {
      return cachedRuntimeState;
    }
    return readRuntimeStateFresh();
  }

  async function writeRuntimeState(partialState) {
    const runtimeState = await setRuntimeState(partialState);
    cachedRuntimeState = runtimeState;
    cachedRuntimeStateExpiresAt = Date.now() + stateCacheTtlMs;
    mutateHook();
    return runtimeState;
  }

  function setOnStateMutated(nextHook) {
    mutateHook = typeof nextHook === "function" ? nextHook : () => {};
  }

  return {
    readSettingsFresh,
    readSettingsCached,
    writeSettings,
    readRuntimeStateFresh,
    readRuntimeStateCached,
    writeRuntimeState,
    setOnStateMutated
  };
}
