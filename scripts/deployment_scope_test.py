"""Exercise the real metadata CLI; fixtures never contact a deployed target."""
from pathlib import Path
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/deployment-scope.py'
SHA = 'a' * 40


def event(url='https://kinnso-example-ynwaforevers-projects.vercel.app', state='success', environment='Production'):
    return {'deployment': {'sha': SHA}, 'deployment_status': {
        'state': state, 'environment': environment, 'environment_url': url}}


class DeploymentScopeTests(unittest.TestCase):
    def invoke(self, payload, *, event_name='deployment_status', ref='refs/heads/main', repo='YNWAforever/KinnsoOS', altered_guard=False, workflow_sha=SHA, invalid_metadata=False):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            input_file = folder / 'event.json'
            input_file.write_text(json.dumps(payload), encoding='utf-8')
            output = folder / 'scope.json'
            summary = folder / 'summary.md'
            repo_root = ROOT
            if altered_guard:
                repo_root = folder / 'repo'
                dest = repo_root / '.github/workflows'
                dest.mkdir(parents=True)
                for name in ['journeys-production.yml', 'verify.yml']:
                    shutil.copyfile(ROOT / '.github/workflows' / name, dest / name)
                path = dest / 'journeys-production.yml'
                if altered_guard == 'remove_parity':
                    path = dest / 'verify.yml'
                    data = path.read_text(encoding='utf-8')
                    start = data.index('    if: >-', data.index('  parity:'))
                    end = data.index('    runs-on:', start)
                    path.write_text(data[:start] + data[end:], encoding='utf-8')
                else:
                    path.write_text(path.read_text(encoding='utf-8').replace("== 'Production'", "== 'Preview'"), encoding='utf-8')
            env = {k: v for k, v in os.environ.items() if k in ['PATH', 'SYSTEMROOT', 'WINDIR']}
            env.update(GITHUB_EVENT_PATH=str(input_file), GITHUB_EVENT_NAME=event_name,
                       GITHUB_REPOSITORY=repo, GITHUB_REF=ref, GITHUB_SHA=SHA,
                       SCOPE_SOURCE_SHA=workflow_sha, GITHUB_STEP_SUMMARY=str(summary), PYTHONUTF8='1')
            result = subprocess.run([sys.executable, str(SCRIPT), '--repo-root', str(repo_root), '--output', str(output)],
                                    cwd=ROOT, env=env, capture_output=True, text=True, encoding='utf-8', timeout=15)
            self.assertEqual(result.returncode, 1 if altered_guard or invalid_metadata else 0, result.stderr)
            self.assertTrue(output.exists(), 'A completed metadata run must retain its selection record')
            record = json.loads(output.read_text(encoding='utf-8'))
            self.assertTrue(summary.exists(), 'Operators need a readable reason even when runtime checks are skipped')
            return record, summary.read_text(encoding='utf-8'), result.stdout

    def journey(self, record):
        return record['jobs']['journeys/public-release']

    def test_selected_production_requires_a_separate_readonly_result(self):
        record, summary, _ = self.invoke(event())
        self.assertEqual(self.journey(record)['selection'], 'SELECTED')
        self.assertEqual(self.journey(record)['reason'], 'SUCCESSFUL_PRODUCTION_JOURNEYS')
        self.assertEqual(record['expectedDeploymentSha'], SHA)
        self.assertEqual(record['workflowSourceSha'], SHA)
        self.assertEqual(record['journeysCheckOrigin'], 'https://kinnso-os.vercel.app')
        self.assertEqual(record['runtimeAcceptance'], 'NOT_RUN_METADATA_ONLY')
        self.assertEqual(record['signedInAcceptance'], 'NOT_RUN')
        self.assertIn('SELECTED', summary)

    def test_preview_is_not_a_production_pass(self):
        record, _, _ = self.invoke(event(environment='Preview'))
        self.assertEqual(self.journey(record), {'selection': 'NOT_APPLICABLE', 'reason': 'ENVIRONMENT_NOT_PRODUCTION'})
        self.assertEqual(record['runtimeAcceptance'], 'NOT_RUN_METADATA_ONLY')

    def test_failed_deployment_retains_failure_reason(self):
        record, _, _ = self.invoke(event(state='failure'))
        self.assertEqual(self.journey(record)['reason'], 'DEPLOYMENT_NOT_SUCCESSFUL')
        self.assertEqual(self.journey(record)['selection'], 'NOT_APPLICABLE')

    def test_pending_deployment_does_not_count_as_runtime_success(self):
        record, _, _ = self.invoke(event(state='pending'))
        self.assertEqual(self.journey(record)['reason'], 'DEPLOYMENT_NOT_SUCCESSFUL')

    def test_legacy_web_uses_its_existing_cutover_jobs(self):
        record, _, _ = self.invoke(event(url='https://remix-kinnso-web-example.vercel.app'))
        self.assertEqual(self.journey(record)['reason'], 'TARGET_NOT_JOURNEYS_DEPLOYMENT')
        self.assertEqual(record['jobs']['cutover/parity']['selection'], 'SELECTED')
        self.assertEqual(record['jobs']['cutover/e2e']['selection'], 'SELECTED')
        self.assertEqual(record['jobs']['cutover/preview-smoke']['selection'], 'NOT_APPLICABLE')

    def test_legacy_sync_never_selects_rendered_web_checks(self):
        record, _, _ = self.invoke(event(url='https://remix-kinnso-sync-example.vercel.app'))
        self.assertTrue(all(v['selection'] == 'NOT_APPLICABLE' for v in record['jobs'].values()))
        self.assertEqual(record['jobs']['cutover/parity']['reason'], 'SYNC_OR_OTHER_TARGET')

    def test_legacy_preview_explains_the_preview_only_selection(self):
        record, _, _ = self.invoke(event(url='https://remix-kinnso-web-example.vercel.app', environment='Preview'))
        self.assertEqual(record['jobs']['cutover/preview-smoke']['selection'], 'SELECTED')
        self.assertEqual(record['jobs']['cutover/parity']['selection'], 'NOT_APPLICABLE')

    def test_dispatch_main_selects_current_manual_checks(self):
        record, _, _ = self.invoke({}, event_name='workflow_dispatch')
        self.assertEqual(self.journey(record)['reason'], 'MANUAL_MAIN')
        self.assertEqual(record['jobs']['cutover/parity']['reason'], 'MANUAL_CUTOVER')
        self.assertEqual(record['jobs']['cutover/preview-smoke']['selection'], 'NOT_APPLICABLE')

    def test_dispatch_review_branch_keeps_journeys_main_restriction(self):
        record, _, _ = self.invoke({}, event_name='workflow_dispatch', ref='refs/heads/codex/review')
        self.assertEqual(self.journey(record)['reason'], 'MANUAL_REF_NOT_MAIN')
        self.assertEqual(record['jobs']['cutover/parity']['selection'], 'SELECTED')

    def test_foreign_repository_cannot_claim_journeys_eligibility(self):
        record, _, _ = self.invoke(event(), repo='example/fork')
        self.assertEqual(self.journey(record)['reason'], 'REPOSITORY_NOT_SELECTED')

    def test_case_insensitive_strings_match_actual_github_conditions(self):
        record, _, _ = self.invoke(event(url='HTTPS://KINNSO-EXAMPLE-YNWAFOREVERS-PROJECTS.VERCEL.APP', environment='production', state='SUCCESS'), repo='ynwaforever/kinnsoos')
        self.assertEqual(self.journey(record)['selection'], 'SELECTED')

    def test_canonical_alias_does_not_broaden_the_existing_event_selector(self):
        record, _, _ = self.invoke(event(url='https://kinnso-os.vercel.app'))
        self.assertEqual(self.journey(record)['reason'], 'TARGET_NOT_JOURNEYS_DEPLOYMENT')

    def test_missing_event_metadata_is_explicitly_non_applicable(self):
        record, _, _ = self.invoke({})
        self.assertEqual(self.journey(record)['reason'], 'DEPLOYMENT_NOT_SUCCESSFUL')

    def test_unknown_trigger_does_not_select_a_runtime_check(self):
        record, _, _ = self.invoke({}, event_name='push')
        self.assertTrue(all(v['selection'] == 'NOT_APPLICABLE' for v in record['jobs'].values()))

    def test_private_payload_and_url_credentials_never_enter_receipts(self):
        payload = event(url='https://name:synthetic-password@other.vercel.app/private?key=synthetic-token#fragment')
        payload['sender'] = {'email': 'private@example.invalid'}
        payload['unused_secret'] = 'synthetic-secret'
        record, summary, stdout = self.invoke(payload)
        text = json.dumps(record) + summary + stdout
        for private in ['synthetic-password', 'synthetic-token', 'synthetic-secret', 'private@example.invalid', '/private', 'fragment']:
            self.assertNotIn(private, text)
        self.assertEqual(record['deploymentOrigin'], 'https://other.vercel.app')

    def test_changed_workflow_guard_is_unknown_instead_of_a_guessed_reason(self):
        record, summary, _ = self.invoke(event(), altered_guard=True)
        self.assertEqual(record['recordStatus'], 'UNKNOWN_POLICY')
        self.assertEqual(record['runtimeAcceptance'], 'NOT_RUN_METADATA_ONLY')
        self.assertEqual(record['jobs'], {})
        self.assertIn('UNKNOWN_POLICY', summary)


    def test_deleted_guard_cannot_borrow_the_next_jobs_condition(self):
        record, _, _ = self.invoke(event(), altered_guard='remove_parity')
        self.assertEqual(record['recordStatus'], 'UNKNOWN_POLICY')
        self.assertEqual(record['jobs'], {})

    def test_missing_workflow_sha_cannot_claim_a_source_bound_record(self):
        record, _, _ = self.invoke(event(), workflow_sha='', invalid_metadata=True)
        self.assertEqual(record['recordStatus'], 'INVALID_METADATA')
        self.assertEqual(record['jobs'], {})

    def test_invalid_selected_deployment_sha_does_not_fall_back_to_another_release(self):
        payload = event()
        payload['deployment']['sha'] = 'invalid-source'
        record, _, _ = self.invoke(payload, invalid_metadata=True)
        self.assertEqual(record['recordStatus'], 'INVALID_METADATA')
        self.assertEqual(record['jobs'], {})

    def test_oversized_event_is_bounded_without_retaining_its_private_payload(self):
        record, _, stdout = self.invoke({'unused': 'private-large-value' * 70000}, invalid_metadata=True)
        self.assertEqual(record['recordStatus'], 'INVALID_METADATA')
        self.assertNotIn('private-large-value', json.dumps(record) + stdout)


if __name__ == '__main__':
    unittest.main()
