"""Connection-free checks for the synthetic Phase B planning package."""
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / 'scripts/phase-b-auth-plan.py'
MANIFEST = ROOT / 'docs/implementation/PHASE_B_SYNTHETIC_COHORT_2026-10-27.json'


class PhaseBAuthPlanTests(unittest.TestCase):
    def run_plan(self, *args, flag=None):
        env = dict(os.environ)
        env.pop('PHASE_B_ALLOW_PRODUCTION_PLAN', None)
        if flag is not None:
            env['PHASE_B_ALLOW_PRODUCTION_PLAN'] = flag
        result = subprocess.run([sys.executable, str(CLI), *args], env=env,
                                capture_output=True, text=True, check=False)
        self.assertTrue(result.stdout.strip(), result.stderr)
        return result.returncode, json.loads(result.stdout)

    def test_default_is_offline_blocked_with_eleven_unresolved_auth_slots(self):
        code, report = self.run_plan()
        self.assertEqual(code, 2)
        self.assertEqual(report['target'], 'offline')
        self.assertEqual(report['status'], 'BLOCKED_OWNER_INPUTS')
        self.assertEqual(len(report['pending_auth']), 11)
        self.assertEqual(len([a for a in report['pending_auth'] if a['persona'] == 'merchant']), 8)
        self.assertEqual({a['auth_decision'] for a in report['pending_auth']}, {'OWNER_REQUIRED_CREATE_VS_SKIP'})
        self.assertEqual({a['email'] for a in report['pending_auth']}, {'OWNER_REQUIRED'})
        self.assertEqual(report['authorized_actions'], [])
        self.assertEqual(report['runtime_status'], 'NOT_RUN')

    def test_shared_production_plan_requires_exact_opt_in(self):
        for flag in [None, '', '0', 'true', 'yes']:
            with self.subTest(flag=flag):
                code, report = self.run_plan('--target', 'shared-production', flag=flag)
                self.assertEqual(code, 3)
                self.assertEqual(report['status'], 'REFUSED_PRODUCTION_PLAN')
                self.assertEqual(report['authorized_actions'], [])

    def test_opt_in_only_allows_offline_metadata_and_keeps_auth_blocked(self):
        code, report = self.run_plan('--target', 'shared-production', flag='1')
        self.assertEqual(code, 2)
        self.assertEqual(report['status'], 'BLOCKED_OWNER_INPUTS')
        self.assertEqual(report['execution_supported'], False)
        self.assertEqual(report['authorized_actions'], [])
        self.assertEqual(report['role_grants'], [])
        self.assertEqual(report['hosted_start_gate'], 'NOT_YET')

    def test_execute_is_always_refused_even_with_production_plan_opt_in(self):
        for target in ['offline', 'shared-production']:
            code, report = self.run_plan('--target', target, '--execute', flag='1')
            self.assertEqual(code, 3)
            self.assertEqual(report['status'], 'REFUSED_EXECUTION_UNSUPPORTED')
            self.assertEqual(report['authorized_actions'], [])

    def test_manifest_preserves_owner_bindings_without_invented_auth_or_rights(self):
        data = json.loads(MANIFEST.read_text())
        creators = {a['alias']: a for a in data['creators']}
        self.assertEqual(creators['creator-a']['creator_id'], '8671b8cf-cc59-6b79-48f8-51c463a7eafe')
        self.assertEqual(creators['creator-b']['creator_id'], '2e2dff32-09c2-444d-90f4-20dc4c38e781')
        guide_c = next(g for g in data['guides'] if g['slot'] == 'C')
        self.assertIsNone(guide_c['creator_alias'])
        self.assertEqual(guide_c['creator_id'], '19094b01-0391-35ad-ff48-967a414d32c0')
        self.assertEqual({g['consent'] for g in data['guides']}, {'SYNTHETIC_OWNER_WAIVER'})
        self.assertTrue(all(g['guide_id'] == 'OWNER_REQUIRED' for g in data['guides']))
        self.assertEqual([c['name'] for c in data['companies']], ['Sunrise Stays HK', 'Wanderpack Gear'])
        self.assertTrue(all(c['live_branch_count'] == 0 for c in data['companies']))
        self.assertEqual(data['ops']['name'], 'Mod Chan')
        self.assertEqual(data['ops']['new_grant'], False)
        self.assertEqual(data['cleanup_owner'], 'Willy Lai')
        self.assertEqual(data['public_synthetic_publish'], 'SEPARATE_APPROVE_REQUIRED')
        self.assertEqual(data['decision_provenance'], 'filled_from_owner_synthetic_decision')
        self.assertNotIn('@', MANIFEST.read_text())


if __name__ == '__main__':
    unittest.main()
