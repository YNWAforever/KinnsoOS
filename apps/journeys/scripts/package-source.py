"""Package only the reviewed, explicit corresponding-source manifest."""
import hashlib
import json
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
        if any(parent.is_symlink() for parent in [candidate, *candidate.parents] if parent != root):
            raise ValueError(f'Symlink in source path: {name}')
        if not candidate.resolve().is_relative_to(root) or not candidate.is_file():
            raise ValueError(f'Missing or out-of-root source file: {name}')
        contents[name] = candidate.read_bytes()
    repository_files = manifest.get('repositoryFiles', {})
    if not isinstance(repository_files, dict):
        raise ValueError('Invalid repository source manifest')
    extracted = (root / 'SOURCE_METADATA.json').is_file()
    prior = json.loads((root / 'SOURCE_METADATA.json').read_text(encoding='utf-8')) if extracted else None
    for destination, source in repository_files.items():
        # Only explicitly reviewed migration inputs for source-distributed tests.
        # Never package arbitrary parent files or read a parent after extraction.
        if (not isinstance(source, str) or not isinstance(destination, str) or
                not re.fullmatch(r'supabase/migrations/[0-9]{14}_[a-z0-9_]+\.sql', source) or
                destination != 'tests/contracts/' + PurePosixPath(source).name or destination in contents):
            raise ValueError('Invalid or colliding repository SQL input')
        input_root = root if extracted else root.parents[1]
        name = destination if extracted else source
        if not extracted and (root.parent.name != 'apps' or root.name != 'journeys' or not (input_root / '.git').exists()):
            raise ValueError('Repository SQL requires the Journeys Git checkout')
        candidate = input_root.joinpath(*PurePosixPath(name).parts)
        if (not candidate.resolve().is_relative_to(input_root) or not candidate.is_file() or
                any(parent.is_symlink() for parent in [candidate, *candidate.parents] if parent != input_root)):
            raise ValueError('Missing or unsafe repository SQL input')
        data = candidate.read_bytes()
        if extracted and prior.get('sha256', {}).get(destination) != hashlib.sha256(data).hexdigest():
            raise ValueError('Archived repository SQL hash mismatch')
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
