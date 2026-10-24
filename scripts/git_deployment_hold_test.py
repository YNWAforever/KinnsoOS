"""Source-only merge hold: no network, secrets, provider or database access."""
from pathlib import Path
import json
import unittest

ROOT = Path(__file__).resolve().parents[1]
BRANCHES = ['main', 'dependabot/github_actions/actions/setup-node-7.1.0', 'codex/audit-entry-recovery-20261022', 'codex/mobile-saved-entry-20261020', 'codex/pd-public-entry-20261022', 'codex/pd-pilot-workflows-20261022', 'codex/pd-policy-staging-preparation-20261023', 'codex/pd05-pd13-workflow-completion-20261023', 'codex/pd06-durable-share-recovery-20261023', 'codex/pd05-pd13-a0-followup-20261023', 'codex/pd16-pd17-a0-rehearsal-20261024']
CONFIGS = ['vercel.json', 'apps/journeys/vercel.json', 'apps/web/vercel.json']


class GitDeploymentHoldTests(unittest.TestCase):
    def test_merge_and_exact_review_branches_cannot_trigger_git_deployments(self):
        for name in CONFIGS:
            with self.subTest(config=name):
                config = json.loads((ROOT / name).read_text(encoding='utf-8'))
                enabled = config.get('git', {}).get('deploymentEnabled')
                self.assertIsInstance(enabled, dict)
                self.assertEqual(set(enabled), set(BRANCHES))
                for branch in BRANCHES:
                    self.assertIs(enabled[branch], False, f'{name}: {branch}')

    def test_hold_keeps_build_and_existing_schedules(self):
        journeys = json.loads((ROOT / CONFIGS[1]).read_text(encoding='utf-8'))
        self.assertEqual(journeys['buildCommand'], 'npm run build')
        self.assertEqual(journeys['installCommand'], 'npx --yes pnpm@11.6.0 install --frozen-lockfile')
        web = json.loads((ROOT / CONFIGS[2]).read_text(encoding='utf-8'))
        self.assertEqual(web['framework'], 'nextjs')
        self.assertEqual(web['regions'], ['hkg1'])
        self.assertEqual(web['crons'], [
            {'path': '/api/cron/travelpayouts-sync', 'schedule': '0 3 * * *'},
            {'path': '/api/cron/traveller-analytics-retention', 'schedule': '0 4 * * *'}])

    def test_hold_inputs_are_explicit_source_manifest_members(self):
        manifest = json.loads((ROOT / 'docs/implementation/PR_INTEGRATION_SOURCE_MANIFEST.json').read_text(encoding='utf-8'))
        for name in [*CONFIGS, 'scripts/git_deployment_hold_test.py',
                     'docs/implementation/PR_INTEGRATION_SOURCE_MANIFEST.json']:
            self.assertIn(name, manifest['files'])
            self.assertTrue((ROOT / name).is_file(), name)
        app = json.loads((ROOT / 'apps/journeys/scripts/source-manifest.json').read_text(encoding='utf-8'))
        self.assertIn('vercel.json', app['files'])


if __name__ == '__main__':
    unittest.main()
