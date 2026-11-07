"""Package only the reviewed, explicit corresponding-source manifest."""
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path, PurePosixPath
from zipfile import ZipFile, ZIP_DEFLATED, ZipInfo


def build_archive(root: Path):
    root = root.resolve()
    manifest = json.loads((root / 'scripts/source-manifest.json').read_text(encoding='utf-8'))
    names = manifest['files']
    if manifest.get('version') != 1 or not isinstance(names, list) or len(names) != len(set(names)):
        raise ValueError('Invalid or duplicate source manifest entries')
    contents = {}
    forbidden = {'.git', '.local-private', '.superpowers', 'node_modules', '.next', 'evidence'}
    for name in names:
        if not isinstance(name, str):
            raise ValueError('Manifest entries must be paths')
        path = PurePosixPath(name)
        if (not name or '\\' in name or ':' in name or path.is_absolute() or
                '..' in path.parts or str(path) != name or forbidden.intersection(path.parts) or
                name.startswith('public/source/') or
                any(p.startswith('.env') and p != '.env.example' for p in path.parts)):
            raise ValueError(f'Unsafe manifest path: {name}')
        candidate = root.joinpath(*path.parts)
        if (name == '.gitignore' and os.environ.get('VERCEL') == '1'
                and not candidate.is_file()):
            candidate = root / 'scripts/gitignore.pack'
        if any(parent.is_symlink() for parent in [candidate, *candidate.parents] if parent != root):
            raise ValueError(f'Symlink in source path: {name}')
        if not candidate.resolve().is_relative_to(root) or not candidate.is_file():
            raise ValueError(f'Missing or out-of-root source file: {name}')
        contents[name] = candidate.read_bytes()
    extracted = (root / 'SOURCE_METADATA.json').is_file()
    prior = json.loads((root / 'SOURCE_METADATA.json').read_text(encoding='utf-8')) if extracted else None
    # Reviewed parent inputs only. Tests read tests/contracts after extraction.
    # Never package arbitrary parent files or read a parent after extraction.
    reviewed_inputs = (
        ('repositoryFiles', r'supabase/migrations/[0-9]{14}_[a-z0-9_]+\.sql',
         'Invalid or colliding repository SQL input', 'Repository SQL requires the Journeys Git checkout',
         'Missing or unsafe repository SQL input', 'Archived repository SQL hash mismatch'),
        ('repositoryDocuments',
         r'(?:docs/(?:[A-Za-z0-9._-]+/)*[A-Za-z0-9._-]+\.(?:json|md)|scripts/[A-Za-z0-9._-]+\.mjs)',
         'Invalid or colliding repository document input', 'Repository documents require the Journeys Git checkout',
         'Missing or unsafe repository document input', 'Archived repository document hash mismatch'),
    )
    for key, pattern, invalid, checkout, missing, mismatch in reviewed_inputs:
        mapping = manifest.get(key, {})
        if not isinstance(mapping, dict):
            raise ValueError(invalid)
        for destination, source in mapping.items():
            if (not isinstance(source, str) or not isinstance(destination, str) or
                    not re.fullmatch(pattern, source) or
                    destination != 'tests/contracts/' + PurePosixPath(source).name or destination in contents):
                raise ValueError(invalid)
            input_root = root if extracted else root.parents[1]
            name = destination if extracted else source
            trusted_root = (input_root / '.git').exists() or os.environ.get('VERCEL') == '1'
            if not extracted and (root.parent.name != 'apps' or root.name != 'journeys'
                                  or not trusted_root):
                raise ValueError(checkout)
            candidate = input_root.joinpath(*PurePosixPath(name).parts)
            if (not candidate.resolve().is_relative_to(input_root) or not candidate.is_file() or
                    any(parent.is_symlink() for parent in [candidate, *candidate.parents] if parent != input_root)):
                raise ValueError(missing)
            data = candidate.read_bytes()
            if extracted and prior.get('sha256', {}).get(destination) != hashlib.sha256(data).hexdigest():
                raise ValueError(mismatch)
            contents[destination] = data
    revision = 'UNKNOWN'
    dirty = None
    if (root / 'SOURCE_METADATA.json').exists() and not (root / '.git').exists():
        prior = json.loads((root / 'SOURCE_METADATA.json').read_text(encoding='utf-8'))
        revision, dirty = prior.get('sourceRevision', 'UNKNOWN'), prior.get('dirty')
    elif any((parent / '.git').exists() for parent in [root, *root.parents]):
        revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
        dirty = bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=root, text=True).strip())
    metadata = {'version': 1, 'sourceRevision': revision, 'dirty': dirty,
                'sha256': {name: hashlib.sha256(data).hexdigest() for name, data in sorted(contents.items())}}
    contents['SOURCE_METADATA.json'] = (json.dumps(metadata, sort_keys=True, indent=2) + '\n').encode()
    target = root / 'public/source/kinnsoos-source.zip'
    target.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
        for name, data in sorted(contents.items()):
            info = ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, data)
    return target


if __name__ == '__main__':
    print('Corresponding source:', build_archive(Path(__file__).resolve().parents[1]).name)
