import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { cleanupPilotFixture } from '../../../scripts/pilot-cleanup.mjs';
import { loadEnvFile } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { verifyTestTarget } from '../../../scripts/verify-test-target.mjs';


export function connectedPilotFixture(prefix: string) {
  const origin = 'http://127.0.0.1:3495';
  const suiteLabel = prefix + '-' + randomUUID();
  const runIds: string[] = [];
  const users: Array<{ id: string; role: string }> = [];
  const guides: string[] = [];
  const missions: string[] = [];
  let target: ReturnType<typeof verifyTestTarget>;
  const serviceClient = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } });
  let admin: ReturnType<typeof serviceClient>;
  const roles = ['traveller', 'creator', 'merchant'] as const;

  test.beforeAll(() => {
    loadEnvFile('.env.test');
    target = verifyTestTarget();
    expect(target.projectRef).toBe('kinnsoos-public-it-20261106');
    expect(target.apiOrigin).toBe('http://127.0.0.1:59721');
    expect(target.dbContainer).toBe('supabase_db_kinnsoos-public-it-20261106');
    admin = serviceClient();
  });

  async function signIn(page: Page, role: string, label: string) {
    const email = label + '-' + role + '@example.test';
    const passphrase = 'Local-author!' + randomUUID();
    const result = await admin.auth.admin.createUser({ email, password: passphrase, email_confirm: true });
    if (result.error || !result.data.user) throw Error('Synthetic Auth bootstrap failed: ' + role);
    const id = result.data.user.id;
    users.push({ id, role });
    await page.goto('/en/sign-in?next=%2Fen%2Ftrips');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(passphrase);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(origin + '/en/trips');
    return id;
  }

  async function api(page: Page, path: string, method = 'GET', data?: object) {
    const response = await page.request.fetch(origin + path, { method, data, headers: { Origin: origin }, maxRedirects: 0 });
    const body = await response.json();
    if (!response.ok() || body.ok !== true) {
      throw Error(method + ' ' + path.split('?')[0] + ' ' + (data && 'command' in data ?
        (data.command as { type: string }).type : '') + ': ' + response.status() + ' ' + (body.code ?? 'unknown'));
    }
    return body.data;
  }

  const ops = (page: Page, command: object) => api(page, '/api/ops/pilot', 'POST', { requestId: randomUUID(), command });
  function participant(page: Page, command: object) {
    const requestId = randomUUID();
    return api(page, '/api/pilot', 'POST', { requestId, command: { ...command, requestId } });
  }

  function sql(statement: string) {
        return execFileSync('docker', ['exec', '-i', target.dbContainer, 'psql',
          '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'],
        { input: statement, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  }

  test.afterAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000);
    if (!users.length) return;
    const journal = '.local-private/pilot-cleanup/' + suiteLabel + '.json';
    const count = await cleanupPilotFixture({
      known: { users, runIds, guides, missions },
      save(value: object) {
        mkdirSync('.local-private/pilot-cleanup', { recursive: true });
        writeFileSync(journal + '.tmp', JSON.stringify(value));
        renameSync(journal + '.tmp', journal);
      },
      verifyTarget: verifyTestTarget,
      sql,
      async deleteUser(id: string) {
        const result = await admin.auth.admin.deleteUser(id);
        if (result.error && result.error.status !== 404) throw Error('Synthetic Auth cleanup failed');
      },
    });
    console.log(prefix + ' cleanup verified:', count, 'exact predicates');
  });
  return { origin, suiteLabel, runIds, guides, missions, signIn, api, ops, participant, sql, get admin() { return admin; } };
}
