"""Build a Windows-launchable copy from the verified Journeys source archive."""
import hashlib
import json
from pathlib import Path, PurePosixPath
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED


def package():
    root = Path(__file__).resolve().parents[1]
    source = root / 'apps/journeys/public/source/kinnsoos-source.zip'
    templates = root / 'scripts/windows-preview'
    target = root / '.local-private/windows-delivery/KinnsoOS-Windows-Preview.zip'
    contents = {}
    with ZipFile(source) as archive:
        metadata = json.loads(archive.read('SOURCE_METADATA.json'))
        if set(archive.namelist()) != set(metadata['sha256']) | {'SOURCE_METADATA.json'}:
            raise ValueError('Unexpected source archive entries')
        for name in archive.namelist():
            path = PurePosixPath(name)
            if (path.is_absolute() or '..' in path.parts or '\\' in name or ':' in name
                    or any(p in {'.git', '.local-private', 'node_modules', '.next'} for p in path.parts)
                    or any(p.startswith('.env') and p != '.env.example' for p in path.parts)):
                raise ValueError('Unsafe source path: ' + name)
            value = archive.read(name)
            if name != 'SOURCE_METADATA.json' and hashlib.sha256(value).hexdigest() != metadata['sha256'][name]:
                raise ValueError('Source hash mismatch: ' + name)
            contents['app/' + name] = value
    # Keep the original source download functional when the app runs in dev mode.
    contents['app/public/source/kinnsoos-source.zip'] = source.read_bytes()
    for name in ('launcher.mjs', 'Start-Kinnso.cmd', 'README.txt'):
        value = (templates / name).read_bytes()
        if name.endswith('.cmd'):
            value = value.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
        contents[name] = value
    target.parent.mkdir(parents=True, exist_ok=True)
    prefix = 'KinnsoOS-Windows-Preview/'
    with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
        for name, value in sorted(contents.items()):
            info = ZipInfo(prefix + name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, value)
    with ZipFile(target) as archive:
        if set(archive.namelist()) != {prefix + name for name in contents}:
            raise ValueError('Delivery archive entries differ')
        for name, value in contents.items():
            if archive.read(prefix + name) != value:
                raise ValueError('Delivery archive readback mismatch: ' + name)
    print(json.dumps({'path': str(target), 'files': len(contents),
                      'bytes': target.stat().st_size,
                      'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'readback': 'PASS'}))


if __name__ == '__main__':
    package()
