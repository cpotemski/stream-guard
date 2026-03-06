export function createWatchStateService({
  readRuntimeStateCached,
  writeRuntimeState,
  closeManagedWatchTabs,
  logWorkerEvent
}) {
  async function resetManagedWatchState() {
    const runtimeState = await readRuntimeStateCached();
    const trackedTabIds = new Set(Object.values(runtimeState.managedTabsByChannel));

    await logWorkerEvent("reset:start", {
      runtimeState,
      trackedTabIds: [...trackedTabIds]
    });
    await closeManagedWatchTabs([...trackedTabIds]);
    await writeRuntimeState({
      managedTabsByChannel: {},
      detachedUntilByChannel: {},
      watchSessionsByChannel: {},
      broadcastSessionsByChannel: {},
      lastBroadcastStatsByChannel: {},
      claimStatsByChannel: {},
      claimAvailabilityByChannel: {},
      playbackStateByChannel: {},
      watchStreakByChannel: {}
    });
    await logWorkerEvent("reset:done", {});
  }

  return {
    resetManagedWatchState
  };
}
