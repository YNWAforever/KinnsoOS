"""Print an offline Phase B Auth decision worksheet; execution is unsupported."""
import argparse
import json
import os
from pathlib import Path

MANIFEST = (Path(__file__).resolve().parents[1] / 'docs/implementation'
            / 'PHASE_B_SYNTHETIC_COHORT_2026-10-27.json')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', choices=['offline', 'shared-production'], default='offline')
    parser.add_argument('--execute', action='store_true', help='Always refused; no executor exists')
    args = parser.parse_args()
    report = {'target': args.target, 'execution_supported': False,
              'authorized_actions': [], 'role_grants': [], 'runtime_status': 'NOT_RUN'}
    if args.execute:
        report['status'] = 'REFUSED_EXECUTION_UNSUPPORTED'
        code = 3
    elif args.target == 'shared-production' and os.environ.get('PHASE_B_ALLOW_PRODUCTION_PLAN', '0') != '1':
        report['status'] = 'REFUSED_PRODUCTION_PLAN'
        code = 3
    else:
        # Fixed committed input only. No credentials, URL arguments, SDK, SQL,
        # subprocess, environment-file loading, network calls or file writes.
        cohort = json.loads(MANIFEST.read_text(encoding='utf-8'))
        report.update(status='BLOCKED_OWNER_INPUTS', evidence_level='OFFLINE_WORKSHEET_ONLY',
                      hosted_start_gate=cohort['hosted_start_gate'],
                      pending_auth=cohort['pending_auth'],
                      ops='Mod Chan: existing moderator; no new grant')
        code = 2
    print(json.dumps(report, indent=2))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
