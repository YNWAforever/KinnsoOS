"""Record current deployment eligibility; never run runtime checks or call a target."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
from urllib.parse import urlsplit

POLICIES = {
    "journeys/public-release": {
        "file": "journeys-production.yml",
        "job": "public-release",
        "sha256": "ace38c41f2c825f3df39ac222ae5aaa436f35fb31f8c331445ece86a4834d19d"
    },
    "cutover/parity": {
        "file": "verify.yml",
        "job": "parity",
        "sha256": "5906ce34cec382ace55c9fe988e0b5374d08ce2c7420e1ee7826c8c36c953878"
    },
    "cutover/e2e": {
        "file": "verify.yml",
        "job": "e2e",
        "sha256": "5906ce34cec382ace55c9fe988e0b5374d08ce2c7420e1ee7826c8c36c953878"
    },
    "cutover/preview-smoke": {
        "file": "verify.yml",
        "job": "preview-smoke",
        "sha256": "e602cc5f7a4e608189097d9972c0dde08e3d650acfe98423d67d51f5f058ec6c"
    }
}
MAX_EVENT_BYTES = 1024 * 1024


def condition_hash(path, job):
    lines = path.read_text(encoding='utf-8').splitlines()
    start = lines.index('  ' + job + ':')
    end = next((i for i in range(start + 1, len(lines)) if re.fullmatch(r'  [a-zA-Z0-9_-]+:', lines[i])), len(lines))
    begin = next(i for i in range(start + 1, end) if lines[i] == '    if: >-')
    parts = []
    for line in lines[begin + 1:]:
        if line.strip() and not line.startswith('      '):
            break
        if line.strip():
            parts.append(line.strip())
    # Preserve quoted values; layout whitespace cannot change a condition fingerprint.
    text = re.sub(r"'(?:[^']|'')*'|\s+", lambda m: m[0] if m[0].startswith("'") else '', ' '.join(parts))
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def string(value):
    return value if isinstance(value, str) else ''


def sha(value):
    return value.lower() if isinstance(value, str) and re.fullmatch(r'[0-9a-fA-F]{40}', value) else None


def origin(value):
    try:
        parsed = urlsplit(string(value))
        host = parsed.hostname
        if parsed.scheme not in ['http', 'https'] or not host or not re.fullmatch(r'[a-zA-Z0-9.-]+', host):
            return None
        port = parsed.port
        suffix = ':' + str(port) if port and port not in [80, 443] else ''
        return parsed.scheme.lower() + '://' + host.lower() + suffix
    except ValueError:
        return None


def item(selected, reason):
    return {'selection': 'SELECTED' if selected else 'NOT_APPLICABLE', 'reason': reason}


def selection(event, context):
    status = event.get('deployment_status') or {}
    if not isinstance(status, dict):
        status = {}
    trigger = context['eventName']
    state = string(status.get('state')).lower()
    environment = string(status.get('environment')).lower()
    url = string(status.get('environment_url')).lower()
    if context['repository'].lower() != 'ynwaforever/kinnsoos':
        journey = item(False, 'REPOSITORY_NOT_SELECTED')
    elif trigger == 'workflow_dispatch':
        main = context['ref'].lower() == 'refs/heads/main'
        journey = item(main, 'MANUAL_MAIN' if main else 'MANUAL_REF_NOT_MAIN')
    elif trigger != 'deployment_status':
        journey = item(False, 'UNSUPPORTED_TRIGGER')
    elif state != 'success':
        journey = item(False, 'DEPLOYMENT_NOT_SUCCESSFUL')
    elif environment != 'production':
        journey = item(False, 'ENVIRONMENT_NOT_PRODUCTION')
    elif not (url.startswith('https://kinnso-') and url.endswith('-ynwaforevers-projects.vercel.app')):
        journey = item(False, 'TARGET_NOT_JOURNEYS_DEPLOYMENT')
    else:
        journey = item(True, 'SUCCESSFUL_PRODUCTION_JOURNEYS')

    legacy_target = url.startswith('https://remix-kinnso-') and not url.startswith('https://remix-kinnso-sync-')
    if trigger == 'workflow_dispatch':
        legacy = item(True, 'MANUAL_CUTOVER')
    elif trigger != 'deployment_status':
        legacy = item(False, 'UNSUPPORTED_TRIGGER')
    elif state != 'success':
        legacy = item(False, 'DEPLOYMENT_NOT_SUCCESSFUL')
    elif environment != 'production':
        legacy = item(False, 'ENVIRONMENT_NOT_PRODUCTION')
    elif not legacy_target:
        legacy = item(False, 'SYNC_OR_OTHER_TARGET')
    else:
        legacy = item(True, 'SUCCESSFUL_PRODUCTION_LEGACY_WEB')
    if trigger != 'deployment_status':
        preview = item(False, 'DEPLOYMENT_STATUS_ONLY')
    elif state != 'success':
        preview = item(False, 'DEPLOYMENT_NOT_SUCCESSFUL')
    elif environment != 'preview':
        preview = item(False, 'ENVIRONMENT_NOT_PREVIEW')
    elif not legacy_target:
        preview = item(False, 'SYNC_OR_OTHER_TARGET')
    else:
        preview = item(True, 'SUCCESSFUL_LEGACY_WEB_PREVIEW')
    return {'journeys/public-release': journey, 'cutover/parity': dict(legacy),
            'cutover/e2e': dict(legacy), 'cutover/preview-smoke': preview}


def record_scope(repo_root, event, context):
    record = {'schemaVersion': 1, 'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'recordStatus': 'RECORDED', 'workflowSourceSha': sha(context['sourceSha']),
              'runtimeAcceptance': 'NOT_RUN_METADATA_ONLY', 'signedInAcceptance': 'NOT_RUN',
              'journeysCheckOrigin': 'https://kinnso-os.vercel.app', 'jobs': {}, 'conditionHashes': {}}
    for name, policy in POLICIES.items():
        try:
            digest = condition_hash(repo_root / '.github/workflows' / policy['file'], policy['job'])
        except (OSError, ValueError, StopIteration):
            digest = None
        record['conditionHashes'][name] = digest
        if digest != policy['sha256']:
            record['recordStatus'] = 'UNKNOWN_POLICY'
    if record['recordStatus'] != 'RECORDED':
        record['issue'] = 'WORKFLOW_CONDITION_CHANGED_OR_MISSING'
        return record
    if not record['workflowSourceSha']:
        record.update(recordStatus='INVALID_METADATA', issue='SOURCE_SHA_UNAVAILABLE')
        return record
    deployment = event.get('deployment') or {}
    status = event.get('deployment_status') or {}
    deployment = deployment if isinstance(deployment, dict) else {}
    status = status if isinstance(status, dict) else {}
    record.update(expectedDeploymentSha=sha(deployment.get('sha') or context['eventSha']),
                  deploymentOrigin=origin(status.get('environment_url')), eventName=context['eventName'],
                  jobs=selection(event, context))
    if not record['expectedDeploymentSha'] and any(v['selection'] == 'SELECTED' for v in record['jobs'].values()):
        record.update(recordStatus='INVALID_METADATA', issue='EXPECTED_DEPLOYMENT_SHA_UNAVAILABLE', jobs={})
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo-root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    context = {name: os.environ.get(env, '') for name, env in {
        'eventName': 'GITHUB_EVENT_NAME', 'repository': 'GITHUB_REPOSITORY', 'ref': 'GITHUB_REF',
        'eventSha': 'GITHUB_SHA', 'sourceSha': 'SCOPE_SOURCE_SHA'}.items()}
    try:
        event_file = Path(os.environ['GITHUB_EVENT_PATH'])
        if event_file.stat().st_size > MAX_EVENT_BYTES:
            raise ValueError('oversized event')
        event = json.loads(event_file.read_text(encoding='utf-8'))
        if not isinstance(event, dict):
            raise ValueError('invalid event shape')
        record = record_scope(args.repo_root, event, context)
    except (KeyError, OSError, ValueError):
        record = {'schemaVersion': 1, 'recordStatus': 'INVALID_METADATA', 'jobs': {},
                  'runtimeAcceptance': 'NOT_RUN_METADATA_ONLY', 'signedInAcceptance': 'NOT_RUN', 'issue': 'INVALID_EVENT_METADATA'}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x', encoding='utf-8') as out:
        out.write(json.dumps(record, indent=2) + '\n')
    summary = ['## Deployment eligibility — metadata only', '', 'Record: ' + record['recordStatus'],
               'Issue: ' + record.get('issue', 'NONE'),
               'Runtime acceptance: NOT_RUN_METADATA_ONLY; signed-in acceptance: NOT_RUN.', '',
               'SELECTED means a separate runtime check is required. Original workflow conclusions remain separate.', '',
               '| Job | Eligibility | Reason |', '|---|---|---|']
    summary.extend('| ' + name + ' | ' + value['selection'] + ' | ' + value['reason'] + ' |'
                   for name, value in record['jobs'].items())
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with Path(os.environ['GITHUB_STEP_SUMMARY']).open('a', encoding='utf-8') as out:
            out.write('\n'.join(summary) + '\n')
    print('Metadata record: ' + record['recordStatus'] + '; runtime acceptance NOT_RUN_METADATA_ONLY')
    return 0 if record['recordStatus'] == 'RECORDED' else 1


if __name__ == '__main__':
    raise SystemExit(main())
