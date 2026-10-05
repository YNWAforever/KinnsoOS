"""Bounded, credential-free GET checks. Never executes source or business commands."""
import argparse
import hashlib
import io
import json
import re
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener


class CheckFailed(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def require(condition, message):
    if not condition:
        raise CheckFailed(message)


def origin(value):
    parsed = urlsplit(value)
    require(not parsed.username and not parsed.password, 'URL credentials are forbidden')
    return (parsed.scheme, parsed.hostname, parsed.port)


def verify(args, report):
    base = args.base_url.rstrip('/')
    parsed = urlsplit(base)
    allowed = base == 'https://kinnso-os.vercel.app'
    loopback = (args.allow_loopback and parsed.scheme == 'http' and
                parsed.hostname == '127.0.0.1' and parsed.port and parsed.port > 1024)
    require((allowed or loopback) and parsed.path in ('', '/') and not parsed.query and
            not parsed.fragment and not parsed.username and not parsed.password, 'Unapproved target')
    require(re.fullmatch(r'[0-9a-f]{40}', args.expected_sha), 'Expected SHA must be a full commit')
    target_origin = origin(base)
    opener = build_opener(NoRedirect(), ProxyHandler({}))

    def get(path, limit=4 * 1024 * 1024):
        url = urljoin(base + '/', path)
        require(origin(url) == target_origin, 'Cross-origin request is forbidden')
        request = Request(url, headers={'User-Agent': 'KinnsoOS-readonly-check/1', 'Cache-Control': 'no-cache'}, method='GET')
        try:
            response = opener.open(request, timeout=15)
        except HTTPError as error:
            response = error
        except (URLError, TimeoutError, OSError):
            raise CheckFailed('GET transport failed') from None
        with response:
            body = response.read(limit + 1)
            require(len(body) <= limit, 'GET response exceeds size bound')
            return response.code, response.headers, body

    def private(headers):
        directives = {part.strip().lower() for part in headers.get('Cache-Control', '').split(',')}
        require({'private', 'no-store'} <= directives, 'Private response cache fence missing')

    def page(path, locale):
        current = path
        for _ in range(4):
            status, headers, body = get(current)
            if status in (301, 302, 303, 307, 308):
                location = headers.get('Location', '')
                require(bool(location), 'Page redirect has no destination')
                current = urljoin(urljoin(base + '/', current), location)
                require(origin(current) == target_origin, 'Foreign page redirect')
                continue
            text = body.decode('utf-8', errors='replace')
            require(status == 200 and 'text/html' in headers.get('Content-Type', ''), 'Public page is unavailable')
            require(re.search(r'<html\b[^>]*\blang=["\']' + re.escape(locale) + r'["\']', text, re.I) and
                    re.search(r'<title\b[^>]*>[^<]*Kinnso', text, re.I) and
                    re.search(r'<h1\b', text, re.I), 'Expected server-rendered page is missing')
            report['checks'].append({'path': path, 'status': status, 'result': 'PASS'})
            return
        raise CheckFailed('Page redirect limit exceeded')

    # Establish the actual deployed source first; a checkout label alone is not evidence.
    status, _, archive = get('/source/kinnsoos-source.zip', 16 * 1024 * 1024)
    require(status == 200, 'Deployed source archive is unavailable')
    root = Path(args.source_root).resolve()
    prefix = subprocess.check_output(['git', '-C', str(root), 'rev-parse', '--show-prefix'],
                                     stderr=subprocess.DEVNULL, timeout=10).decode().strip()

    def committed(name):
        return subprocess.check_output(['git', '-C', str(root), 'show', args.expected_sha + ':' + prefix + name],
                                       stderr=subprocess.DEVNULL, timeout=10)

    # Commit bytes avoid both uncommitted edits and Windows checkout line-ending transforms.
    manifest = json.loads(committed('scripts/source-manifest.json').decode('utf-8-sig'))['files']
    require(isinstance(manifest, list) and 0 < len(manifest) <= 1000 and
            len(set(manifest)) == len(manifest), 'Invalid source manifest')
    with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
        entries = zipped.infolist()
        names = [entry.filename for entry in entries]
        require(len(names) == len(set(names)) and set(names) == set(manifest) | {'SOURCE_METADATA.json'}, 'Archive entries differ from the explicit manifest')
        require(sum(entry.file_size for entry in entries) <= 32 * 1024 * 1024 and
                all(entry.file_size <= 8 * 1024 * 1024 for entry in entries), 'Archive exceeds size bound')
        metadata = json.loads(zipped.read('SOURCE_METADATA.json'))
        require(isinstance(metadata, dict), 'Invalid source metadata')
        require(metadata.get('sourceRevision') == args.expected_sha, 'Deployed source revision mismatch')
        hashes = metadata.get('sha256', {})
        require(isinstance(hashes, dict) and set(hashes) == set(manifest), 'Source hash manifest mismatch')
        for name in manifest:
            relative = PurePosixPath(name)
            require(not relative.is_absolute() and '..' not in relative.parts and '\\' not in name and
                    ':' not in name and str(relative) == name, 'Unsafe source path')
            source = (root / name).resolve()
            require(source.is_relative_to(root), 'Source path escapes checkout')
            actual = hashlib.sha256(zipped.read(name)).hexdigest()
            require(actual == hashes[name] and actual == hashlib.sha256(committed(name)).hexdigest(), 'Deployed source bytes differ from commit')
        report.update(deployedSourceRevision=metadata['sourceRevision'], sourceFilesVerified=len(manifest),
                      packagingWorkspaceDirty=metadata.get('dirty'), archiveSha256=hashlib.sha256(archive).hexdigest())

    page('/', 'zh-HK')
    page('/en', 'en')
    page('/zh-HK', 'zh-HK')
    for path, accepted in [('/api/trips', (401,)), ('/api/bookmarks', (401,)),
                           ('/api/ops/monitoring', (401, 503)), ('/api/creator/profile', (401, 503)),
                           ('/api/inbox', (401, 503))]:
        status, headers, _ = get(path)
        require(status in accepted, 'Anonymous API fence failed')
        private(headers)
        report['checks'].append({'path': path, 'status': status, 'result': 'PASS'})
    for path in ['/callback?next=https://example.org/evil', '/auth/callback?next=//example.org/evil']:
        status, headers, _ = get(path)
        private(headers)
        location = urljoin(base + '/', headers.get('Location', ''))
        destination = urlsplit(location)
        require(status in (302, 303, 307, 308) and bool(headers.get('Location')) and
                origin(location) == target_origin and destination.path == '/en/sign-in' and
                'error=failed' in destination.query, 'Callback return boundary failed')
        report['checks'].append({'path': path.split('?')[0], 'status': status, 'result': 'PASS'})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='https://kinnso-os.vercel.app')
    parser.add_argument('--expected-sha', required=True)
    parser.add_argument('--source-root', default='apps/journeys')
    parser.add_argument('--allow-loopback', action='store_true', help='Permit a local HTTP fixture on 127.0.0.1 above port 1024')
    args = parser.parse_args()
    report = {'status': 'FAIL', 'observedAt': datetime.now(timezone.utc).isoformat(),
              'scope': 'credential-free public GET / source binding / anonymous fences',
              'signedInAcceptance': 'NOT_RUN', 'checks': []}
    try:
        verify(args, report)
        report['status'] = 'PASS'
    except CheckFailed as error:
        report['failure'] = str(error)
    except (ValueError, KeyError, TypeError, OSError, zipfile.BadZipFile,
            subprocess.CalledProcessError, subprocess.TimeoutExpired):
        report['failure'] = 'Invalid response or source artifact'
    print(json.dumps(report, indent=2))
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
