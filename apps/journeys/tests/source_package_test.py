import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile


class SourcePackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'scripts').mkdir()
        shutil.copyfile(Path(__file__).resolve().parents[1] / 'scripts/package-source.py',
                        self.root / 'scripts/package-source.py')
        (self.root / 'LICENSE').write_text('Synthetic license fixture')
        (self.root / 'package.json').write_text('{}')
        self.manifest(['LICENSE', 'package.json', 'scripts/package-source.py', 'scripts/source-manifest.json'])

    def manifest(self, files):
        (self.root / 'scripts/source-manifest.json').write_text(json.dumps({'version': 1, 'files': files}))

    def run_pack(self):
        return subprocess.run([sys.executable, str(self.root / 'scripts/package-source.py')],
                              cwd=self.root, capture_output=True, text=True)

    def test_exact_manifest_excludes_unlisted_private_files(self):
        for name in ['private-note.txt', 'dump.sql', 'credential.json', '.env.local']:
            (self.root / name).write_text('Must not be distributed')
        result = self.run_pack()
        self.assertEqual(result.returncode, 0, result.stderr)
        with ZipFile(self.root / 'public/source/kinnsoos-source.zip') as archive:
            self.assertEqual(set(archive.namelist()), {'LICENSE', 'package.json',
                'scripts/package-source.py', 'scripts/source-manifest.json', 'SOURCE_METADATA.json'})
            metadata = json.loads(archive.read('SOURCE_METADATA.json'))
            self.assertEqual(set(metadata['sha256']), set(archive.namelist()) - {'SOURCE_METADATA.json'})

    def test_unsafe_paths_and_missing_files_fail(self):
        for name in ['../outside.txt', '/outside.txt', 'C:/secret.txt', '.env.local',
                     '.local-private/audit.md', 'public/source/kinnsoos-source.zip', 'missing.ts']:
            with self.subTest(name=name):
                self.manifest(['LICENSE', name])
                self.assertNotEqual(self.run_pack().returncode, 0)

    def test_duplicate_paths_fail(self):
        self.manifest(['LICENSE', 'LICENSE'])
        self.assertNotEqual(self.run_pack().returncode, 0)

    def test_distributed_metadata_survives_extraction_inside_another_checkout(self):
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        original = self.root
        self.root = original / 'extracted'
        self.root.mkdir()
        for name in ['LICENSE', 'package.json', 'scripts/package-source.py', 'scripts/source-manifest.json']:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(original / name, target)
        revision = 'b' * 40
        (self.root / 'SOURCE_METADATA.json').write_text(json.dumps({'sourceRevision': revision, 'dirty': False}))
        result = self.run_pack()
        self.assertEqual(result.returncode, 0, result.stderr)
        with ZipFile(self.root / 'public/source/kinnsoos-source.zip') as archive:
            self.assertEqual(json.loads(archive.read('SOURCE_METADATA.json'))['sourceRevision'], revision)

    def test_symlink_escape_fails(self):
        with tempfile.TemporaryDirectory() as outside:
            target = Path(outside) / 'outside.txt'
            target.write_text('private')
            try:
                (self.root / 'link.txt').symlink_to(target)
            except OSError:
                self.skipTest('Host does not grant symlink creation; CI runs this case on Linux')
            self.manifest(['LICENSE', 'link.txt'])
            self.assertNotEqual(self.run_pack().returncode, 0)


if __name__ == '__main__':
    unittest.main()
