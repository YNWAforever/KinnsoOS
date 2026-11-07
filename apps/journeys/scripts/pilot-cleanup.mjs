/** All callbacks are exact-scope and safe to repeat. Run independent steps even after failures. */
export async function runPilotCleanup(steps, verify, attempts = 3) {
  let pending = [...steps];
  for (let attempt = 0; attempt < attempts && pending.length; attempt++) {
    const failed = [];
    for (const step of pending) {
      try { await step.run(); } catch { failed.push(step); }
    }
    pending = failed;
  }
  const failures = pending.map(step => step.label);
  for (const check of verify) {
    try { await check.run(); } catch { failures.push('residue: ' + check.label); }
  }
  if (failures.length) throw new Error('Pilot cleanup incomplete: ' + failures.join(', '));
}
