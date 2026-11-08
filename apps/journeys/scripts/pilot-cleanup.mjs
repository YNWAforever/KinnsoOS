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

const uuidArray = values => 'array[' + values.map(value => {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value)) throw Error('Unsafe cleanup identifier');
  return "'" + value + "'";
}).join(',') + ']::uuid[]';
const exact = (column, values) => column + ' = any(' + uuidArray(values) + ')';

/** Capture and journal all recovery paths before any mutation on the verified target. */
export async function cleanupPilotFixture({ known, save, verifyTarget, sql, deleteUser }) {
  await save(known);
  await verifyTarget();
  const { users, runIds, missions, guides } = known;
  const byUser = column => exact(column, users.map(user => user.id));
  const byRun = exact('run_id', runIds);
  const byMission = exact('mission_id', missions);
  const byGuide = column => exact(column, guides);
  const captures = [];
  const retainTables = new Set();
  const retainRoles = new Set();
  function capture(table, where, column, parents, roles) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const found = sql('select id from ' + table + ' where ' + where);
        const ids = found ? found.split(/\r?\n/) : [];
        const selector = exact(column, ids);
        captures.push({ table, where, column, status: 'captured', ids });
        return selector;
      } catch { /* Retry the bounded exact lookup before any deletion. */ }
    }
    captures.push({ table, where, column, status: 'failed', parents, roles });
    for (const parent of parents) retainTables.add(parent);
    for (const role of roles) retainRoles.add(role);
    return null;
  }
  const slot = capture('kinnso_internal.pilot_participants', byRun, 'participant_id',
    ['kinnso_internal.pilot_participants', 'kinnso_internal.pilot_runs', 'public.kinnso_ops_members'], ['operator']);
  const submission = capture('public.mission_participants', byMission, 'mission_participant_id',
    ['public.mission_participants', 'public.missions', 'public.merchant_profiles'], ['creator', 'merchant']);
  const support = capture('kinnso_internal.support_cases', byUser('recipient_id'), 'case_id',
    ['kinnso_internal.support_cases'], ['traveller']);
  const trip = capture('public.trips', byUser('owner_user_id'), 'trip_id', ['public.trips'], ['traveller']);
  const merchant = capture('public.merchant_profiles', byUser('user_id'), 'merchant_id',
    ['public.merchant_profiles'], ['merchant']);
  const audit = capture('public.kinnso_ops_members', byUser('user_id'), 'actor_ops_member_id',
    ['public.kinnso_ops_members'], ['operator']);
  const filters = [
    ['kinnso_internal.pilot_invites', slot],
    ...['pilot_evidence', 'pilot_participant_audit', 'pilot_checks', 'pilot_collaborations',
      'pilot_content_intakes', 'pilot_participants'].map(table => ['kinnso_internal.' + table, byRun]),
    ['kinnso_internal.pilot_runs', exact('id', runIds)],
    ['public.ops_audit_log', audit],
    ['kinnso_internal.requests', byUser('actor_id')],
    ['kinnso_internal.creator_requests', byUser('actor_id')],
    ['kinnso_internal.workspace_requests', byUser('actor_id')],
    ['kinnso_internal.trip_requests', byUser('actor_id')],
    ['kinnso_internal.pilot_events', byGuide('guide_id')],
    ['public.guide_saves', byUser('traveler_user_id')],
    ['kinnso_internal.guide_drafts', byGuide('guide_id')],
    ['public.guide_versions', byGuide('guide_id')],
    ['public.trips', byUser('owner_user_id')],
    ['public.guides', byGuide('id') + ' and ' + byUser('creator_id')],
    ['kinnso_internal.inbox_events', byUser('recipient_id')],
    ['kinnso_internal.support_messages', support],
    ['kinnso_internal.support_audit', support],
    ['kinnso_internal.support_cases', byUser('recipient_id')],
    ['kinnso_internal.notification_outbox', byUser('recipient_id')],
    ['public.notifications', byUser('creator_id')],
    ['public.mission_verification_jobs', byUser('creator_id')],
    ['public.mission_milestone_submissions', submission],
    ['public.mission_participants', byMission],
    ['public.missions', exact('id', missions)],
    ['kinnso_internal.merchant_audit', merchant],
    ['kinnso_internal.merchant_members', merchant],
    ['kinnso_internal.merchant_branches', merchant],
    ['public.merchant_applications', byUser('user_id')],
    ['public.merchant_profiles', byUser('user_id')],
    ['public.kinnso_ops_members', byUser('user_id')],
  ];
  const auth = users.filter(({ role }) => !retainRoles.has(role));
  const deletes = filters.filter(([table, where]) => where !== null && !retainTables.has(table));
  const checks = [...filters,
    ...['trip_revisions', 'trip_stops', 'trip_days'].map(table => ['public.' + table, trip]),
    ['public.mission_milestones', byMission],
    ...[['auth.users', 'id'], ['auth.sessions', 'user_id'], ['auth.identities', 'user_id'],
      ['public.creators', 'id']].map(([table, key]) => [table, byUser(key)]),
  ].filter(([, where]) => where !== null);
  // Leave the initial journal intact if the richer plan cannot be written.
  await save({ ...known, captures, deletes, checks, deferredTables: [...retainTables],
    deferredUsers: users.filter(({ role }) => retainRoles.has(role)).map(({ id }) => id) });
  await runPilotCleanup([
    ...deletes.map(([table, where]) => ({ label: table, run() { sql('delete from ' + table + ' where ' + where); } })),
    ...auth.map(({ id }, index) => ({ label: 'Auth user ' + index, run: () => deleteUser(id) })),
  ], [
    ...checks.map(([table, where]) => ({ label: table, run() {
      if (sql('select count(*) from ' + table + ' where ' + where) !== '0') throw Error('Nonzero residue');
    } })),
    ...captures.filter(({ status }) => status === 'failed').map(({ table }) => ({
      label: 'uncaptured ' + table, run() { throw Error('Incomplete identifiers'); },
    })),
  ]);
  return checks.length;
}
