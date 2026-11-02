"""Supplementary corresponding source for the loopback fixture, with repo paths intact.

Run the existing Journeys source pack first. No credentials, evidence, dependencies,
generated app output or database changes are included or executed by this script.
"""
import hashlib
import json
from pathlib import Path, PurePosixPath
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED


def pack():
    here = Path(__file__).resolve().parent
    root = here.parents[2]
    app = root / 'apps/journeys'
    contents = {}
    with ZipFile(app / 'public/source/kinnsoos-source.zip') as archive:
        metadata = json.loads(archive.read('SOURCE_METADATA.json'))
        for name, expected in metadata['sha256'].items():
            value = archive.read(name)
            if hashlib.sha256(value).hexdigest() != expected:
                raise ValueError('App archive hash mismatch: ' + name)
            contents['apps/journeys/' + name] = value
        contents['apps/journeys/SOURCE_METADATA.json'] = archive.read('SOURCE_METADATA.json')
    manifest = json.loads((here / 'local-source-manifest.json').read_text())
    names = manifest['files']
    if manifest.get('version') != 1 or len(names) != len(set(names)):
        raise ValueError('Invalid preview manifest')
    for name in names:
        path = PurePosixPath(name)
        if (not name or path.is_absolute() or str(path) != name or '\\' in name or ':' in name
                or '..' in path.parts or any(p.startswith('.') for p in path.parts)
                or not name.startswith(('docs/prototypes/conversation-studio-local/', 'apps/journeys/tests/', 'contracts/smeassistant/'))
                or path.suffix not in {'.mjs', '.ts', '.tsx', '.css', '.md', '.json', '.py'}):
            raise ValueError('Unsafe preview path: ' + name)
        source = root.joinpath(*path.parts)
        if (not source.resolve().is_relative_to(root) or not source.is_file()
                or any(p.is_symlink() for p in [source, *source.parents] if p != root)):
            raise ValueError('Unsafe preview source: ' + name)
        value = source.read_bytes()
        if name in contents and contents[name] != value:
            raise ValueError('Rebuild stale app archive: ' + name)
        contents[name] = value
    metadata = {'scope': 'local_fixture', 'sourceRevision': metadata['sourceRevision'],
                'sha256': {n: hashlib.sha256(v).hexdigest() for n, v in sorted(contents.items())}}
    contents['LOCAL_SOURCE_METADATA.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
    target = app / 'public/source/kinnsoos-local-discovery-source.zip'
    with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
        for name, value in sorted(contents.items()):
            info = ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, value)
    with ZipFile(target) as archive:
        if set(archive.namelist()) != set(contents):
            raise ValueError('Archive entries differ')
        for name, value in contents.items():
            if archive.read(name) != value:
                raise ValueError('Archive readback differs: ' + name)
    print(json.dumps({'archive': target.name, 'files': len(contents),
                      'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'readback': 'PASS'}))


if __name__ == '__main__':
    pack()
