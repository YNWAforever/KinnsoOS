import hashlib
import json
import re
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

    def test_source_archive_preserves_active_integration_cases(self):
        source_root = Path(__file__).resolve().parents[1]
        source_manifest = json.loads((source_root / 'scripts/source-manifest.json').read_text(encoding='utf-8'))
        cases = {path.relative_to(source_root).as_posix(): path
                 for path in (source_root / 'tests/integration').glob('*.test.mjs')}
        self.assertTrue(cases, 'The integration runner must have distributable cases')
        cases.update({path.relative_to(source_root).as_posix(): path
                      for path in (source_root / 'tests').glob('*.test.mjs')})
        fixture_config = (source_root / 'playwright.service-state.config.ts').read_text(encoding='utf-8')
        fixture_names = re.findall(r"['\"]([^'\"]+\.spec\.ts)['\"]", fixture_config)
        self.assertTrue(fixture_names, 'The no-database fixture gate must have distributable cases')
        for name in fixture_names:
            path = source_root / 'tests/e2e' / name
            self.assertTrue(path.is_file(), name)
            cases[path.relative_to(source_root).as_posix()] = path
        for name in source_manifest['files']:
            source = source_root / name
            target = self.root / name
            self.assertTrue(source.resolve().is_relative_to(source_root), name)
            self.assertTrue(target.resolve().is_relative_to(self.root), name)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
        # Mapped SQL is inside standalone distribution metadata. This fixture
        # never reads a temporary parent's migration when it is repackaged.
        hashes = {}
        for destination, source in source_manifest.get('repositoryFiles', {}).items():
            canonical = source_root / destination if (source_root / 'SOURCE_METADATA.json').is_file() else source_root.parents[1] / source
            target = self.root / destination
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(canonical, target)
            hashes[destination] = hashlib.sha256(target.read_bytes()).hexdigest()
        (self.root / 'SOURCE_METADATA.json').write_text(json.dumps({'sourceRevision': 'b' * 40, 'dirty': False, 'sha256': hashes}))
        result = self.run_pack()
        self.assertEqual(result.returncode, 0, result.stderr)
        with ZipFile(self.root / 'public/source/kinnsoos-source.zip') as archive:
            missing = set(cases) - set(archive.namelist())
            self.assertFalse(missing, f'Active runner cases missing from source archive: {sorted(missing)}')
            for name, source in cases.items():
                self.assertEqual(archive.read(name), source.read_bytes(), name)

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

    def test_canonical_repository_sql_input_survives_standalone_repack(self):
        repository = self.root
        app = repository / 'apps/journeys'
        app.mkdir(parents=True)
        for name in ['LICENSE', 'package.json', 'scripts/package-source.py', 'scripts/source-manifest.json']:
            target = app / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(repository / name, target)
        subprocess.run(['git', 'init', '-q', str(repository)], check=True)
        subprocess.run(['git', 'add', '.'], cwd=repository, check=True)
        subprocess.run(['git', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'synthetic fixture'], cwd=repository, check=True)
        source = 'supabase/migrations/20261011004000_kinnso_merchant_insights.sql'
        destination = 'tests/contracts/20261011004000_kinnso_merchant_insights.sql'
        sql = b'-- Synthetic canonical SQL contract input, never executed.\nselect 1;\n'
        original = repository / source
        original.parent.mkdir(parents=True)
        original.write_bytes(sql)
        self.root = app
        manifest = json.loads((app / 'scripts/source-manifest.json').read_text())
        manifest['repositoryFiles'] = {destination: source}
        (app / 'scripts/source-manifest.json').write_text(json.dumps(manifest))
        result = self.run_pack()
        self.assertEqual(result.returncode, 0, result.stderr)
        with ZipFile(app / 'public/source/kinnsoos-source.zip') as archive:
            self.assertEqual(archive.read(destination), sql)
            metadata = json.loads(archive.read('SOURCE_METADATA.json'))
            self.assertIn(destination, metadata['sha256'])
            extracted = repository / 'unrelated-checkout/extracted'
            archive.extractall(extracted)
        original.write_bytes(b'UNRELATED_PARENT_SQL_MUST_NOT_BE_USED')
        self.root = extracted
        result = self.run_pack()
        self.assertEqual(result.returncode, 0, result.stderr)
        with ZipFile(extracted / 'public/source/kinnsoos-source.zip') as archive:
            self.assertEqual(archive.read(destination), sql)
            self.assertEqual(json.loads(archive.read('SOURCE_METADATA.json'))['sha256'][destination], metadata['sha256'][destination])
        subprocess.run(['git', 'init', '-q', str(extracted)], check=True)
        subprocess.run(['git', 'add', '.'], cwd=extracted, check=True)
        subprocess.run(['git', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'synthetic initialized extraction'], cwd=extracted, check=True)
        result = self.run_pack()
        self.assertEqual(result.returncode, 0, result.stderr)
        with ZipFile(extracted / 'public/source/kinnsoos-source.zip') as archive:
            self.assertEqual(archive.read(destination), sql, 'Ordinary initialized extraction keeps its own SQL')

    def test_initialized_distribution_keeps_internal_sql_in_another_repository(self):
        repository = self.root
        app = repository / 'apps/journeys'
        app.mkdir(parents=True)
        for name in ['LICENSE', 'package.json', 'scripts/package-source.py', 'scripts/source-manifest.json']:
            target = app / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(repository / name, target)
        source = 'supabase/migrations/20261011004000_kinnso_merchant_insights.sql'
        destination = 'tests/contracts/20261011004000_kinnso_merchant_insights.sql'
        foreign = repository / source
        foreign.parent.mkdir(parents=True)
        foreign.write_bytes(b'-- Unrelated parent SQL must never substitute for distributed bytes')
        subprocess.run(['git', 'init', '-q', str(repository)], check=True)
        internal = app / destination
        internal.parent.mkdir(parents=True)
        sql = b'-- Archived reviewed SQL input, never executed.\nselect 1;\n'
        internal.write_bytes(sql)
        manifest = json.loads((app / 'scripts/source-manifest.json').read_text())
        manifest['repositoryFiles'] = {destination: source}
        (app / 'scripts/source-manifest.json').write_text(json.dumps(manifest))
        (app / 'SOURCE_METADATA.json').write_text(json.dumps({'sourceRevision': 'b' * 40, 'dirty': False, 'sha256': {destination: hashlib.sha256(sql).hexdigest()}}))
        subprocess.run(['git', 'init', '-q', str(app)], check=True)
        subprocess.run(['git', 'add', '.'], cwd=app, check=True)
        subprocess.run(['git', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'synthetic extracted input'], cwd=app, check=True)
        self.root = app
        result = self.run_pack()
        self.assertEqual(result.returncode, 0, result.stderr)
        with ZipFile(app / 'public/source/kinnsoos-source.zip') as archive:
            self.assertEqual(archive.read(destination), sql, 'Own Git must not select parent SQL')
        foreign.unlink()
        result = self.run_pack()
        self.assertEqual(result.returncode, 0, result.stderr)
        foreign.write_bytes(b'-- Parent input still must not be selected')
        internal.unlink()
        self.assertNotEqual(self.run_pack().returncode, 0, 'Own Git never fills a missing internal input from its parent')
        internal.write_bytes(b'-- Modified unapproved input')
        self.assertNotEqual(self.run_pack().returncode, 0, 'Own Git must not disable the archived hash check')

    def test_repository_sql_input_rejects_unsafe_or_missing_sources(self):
        destination = 'tests/contracts/20261011004000_kinnso_merchant_insights.sql'
        for source in ['../private.sql', '.env.local', 'supabase/migrations/missing.sql',
                       '/outside.sql', 'C:/private.sql']:
            with self.subTest(source=source):
                manifest = json.loads((self.root / 'scripts/source-manifest.json').read_text())
                manifest['repositoryFiles'] = {destination: source}
                (self.root / 'scripts/source-manifest.json').write_text(json.dumps(manifest))
                self.assertNotEqual(self.run_pack().returncode, 0)

    def test_extracted_sql_input_cannot_fall_back_to_parent_or_ignore_hash(self):
        destination = 'tests/contracts/20261011004000_kinnso_merchant_insights.sql'
        manifest = json.loads((self.root / 'scripts/source-manifest.json').read_text())
        manifest['repositoryFiles'] = {destination: 'supabase/migrations/20261011004000_kinnso_merchant_insights.sql'}
        (self.root / 'scripts/source-manifest.json').write_text(json.dumps(manifest))
        (self.root / 'SOURCE_METADATA.json').write_text(json.dumps({'sourceRevision': 'b' * 40, 'dirty': False, 'sha256': {destination: 'a' * 64}}))
        self.assertNotEqual(self.run_pack().returncode, 0, 'Missing archived SQL must fail closed')
        target = self.root / destination
        target.parent.mkdir(parents=True)
        target.write_text('-- Wrong SQL input')
        self.assertNotEqual(self.run_pack().returncode, 0, 'Hash mismatch must fail closed')

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
