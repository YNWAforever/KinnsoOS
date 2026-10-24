// Test-only coordinator. A failed cleanup stops subsequent writes, never readback.
export async function finishReminderCleanup({scenarioError, removeMission, removeActors, readMissionAbsent, readActorsAbsent}) {
  const report = {status: 'FAIL', missionRemoval: 'NOT_ATTEMPTED', actorRemoval: 'NOT_ATTEMPTED', missionAbsent: null, actorsAbsent: null};
  const failures = [];
  try { await removeMission(); report.missionRemoval = 'PASS'; }
  catch (error) { report.missionRemoval = 'FAIL'; failures.push(error); }
  if (report.missionRemoval === 'PASS') {
    try { await removeActors(); report.actorRemoval = 'PASS'; }
    catch (error) { report.actorRemoval = 'FAIL'; failures.push(error); }
  }
  for (const [key, read] of [['missionAbsent', readMissionAbsent], ['actorsAbsent', readActorsAbsent]]) {
    try {
      const absent = await read();
      if (typeof absent !== 'boolean') throw Error('OWNED_CLEANUP_READBACK_UNKNOWN');
      report[key] = absent;
      if (!absent) throw Error('OWNED_CLEANUP_READBACK_NOT_ABSENT');
    } catch (error) { failures.push(error); }
  }
  if (failures.length) {
    const errors = scenarioError === undefined ? failures : [scenarioError, ...failures];
    const error = new AggregateError(errors, 'OWNED_REMINDER_CLEANUP_FAILED', {cause: scenarioError ?? failures[0]});
    error.cleanupReport = report;
    throw error;
  }
  report.status = 'PASS';
  if (scenarioError !== undefined) throw scenarioError;
  return report;
}
