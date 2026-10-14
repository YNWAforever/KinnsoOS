"""Real read-only verifier against an owned HTTP/Git/archive fixture; no SQL execution."""
import hashlib
import importlib.util
import io
import json
import pathlib
import subprocess
import tempfile
import threading
import types
import unittest
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

spec=importlib.util.spec_from_file_location('production_verifier',pathlib.Path(__file__).with_name('verify-journeys-production.py'))
verifier=importlib.util.module_from_spec(spec);spec.loader.exec_module(verifier)

class ArchiveContract(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='kinnso-readonly-archive-')
  self.root=pathlib.Path(self.temp.name).resolve();assert self.root.is_relative_to(pathlib.Path(tempfile.gettempdir()).resolve())
  self.app=self.root/'apps/journeys';self.app.mkdir(parents=True);(self.app/'scripts').mkdir()
  self.contents={'README.md':b'Fixture source only\n','index.ts':b'export const fixture = true;\n'}
  self.mapping={f'tests/contracts/2026101400000{i}_fixture.sql':f'supabase/migrations/2026101400000{i}_fixture.sql' for i in range(3)}
  self.repoContents={name:f'-- static source input{i}\nSELECT {i};\n'.encode() for i,name in enumerate(self.mapping.values())}
  for name,value in self.contents.items():(self.app/name).write_bytes(value)
  for name,value in self.repoContents.items():f=self.root/name;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(value)
  self.git('init','-q');self.git('config','core.autocrlf','false');self.git('config','user.email','fixture@example.test');self.git('config','user.name','Owned fixture')
  self.requests=[];outer=self
  class Handler(BaseHTTPRequestHandler):
   def log_message(self,*args):pass
   def do_GET(self):
    outer.requests.append(('GET',self.path));path=self.path.split('?')[0]
    if path=='/source/kinnsoos-source.zip':self.send_response(200);self.end_headers();self.wfile.write(outer.archive);return
    if path in ['/','/en','/zh-HK']:
     locale='en' if path=='/en' else 'zh-HK';self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(f'<html lang="{locale}"><title>Kinnso fixture</title><h1>Explore</h1><form action="/{locale}/explore"><input name="q"></form></html>'.encode());return
    if path in ['/callback','/auth/callback']:
     self.send_response(303);self.send_header('Cache-Control','private, no-store');self.send_header('Location','/en/sign-in?error=failed&next=%2Fen%2Ftrips');self.end_headers();return
    self.send_response(401 if path in ['/api/trips','/api/bookmarks'] else 503);self.send_header('Cache-Control','private, no-store');self.end_headers()
  self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler);self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
 def tearDown(self):
  self.server.shutdown();self.server.server_close();self.thread.join();assert self.root.is_relative_to(pathlib.Path(tempfile.gettempdir()).resolve());self.temp.cleanup()
 def git(self,*args):return subprocess.check_output(['git','-C',str(self.root),'-c','core.hooksPath='+str(self.root/'empty-hooks'),*args],stderr=subprocess.DEVNULL)
 def prepare(self,mapping=None,omit=(),extra=None,tamper=False,revision=None,version=1):
  mapping=self.mapping if mapping is None else mapping
  manifest={'version':version,'files':[*self.contents,'scripts/source-manifest.json'],'repositoryFiles':mapping}
  if version is None:manifest.pop('version')
  (self.app/'scripts/source-manifest.json').write_text(json.dumps(manifest),encoding='utf8');self.git('add','.');self.git('commit','-qm','Owned fixture');self.sha=self.git('rev-parse','HEAD').decode().strip()
  contents={name:(self.app/name).read_bytes() for name in manifest['files']}
  for destination,source in mapping.items():
   if source in self.repoContents:contents[destination]=self.repoContents[source]
  for name in omit:contents.pop(name,None)
  if extra:contents.update(extra)
  if tamper:contents[next(iter(self.mapping))]=b'-- changed but internally self-consistent hash\n'
  metadata={'version':1,'sourceRevision':revision or self.sha,'dirty':False,'sha256':{name:hashlib.sha256(value).hexdigest() for name,value in contents.items()}}
  output=io.BytesIO()
  with zipfile.ZipFile(output,'w') as z:
   for name,value in contents.items():z.writestr(name,value)
   z.writestr('SOURCE_METADATA.json',json.dumps(metadata))
  self.archive=output.getvalue()
 def verify(self):
  report={'checks':[]};args=types.SimpleNamespace(base_url=f'http://127.0.0.1:{self.server.server_port}',allow_loopback=True,expected_sha=self.sha,source_root=str(self.app));verifier.verify(args,report);return report
 def blocked(self):
  with self.assertRaises(verifier.CheckFailed):self.verify()
  self.assertEqual(self.requests,[('GET','/source/kinnsoos-source.zip')])
 def test_legacy_exact_source_archive_and_anonymous_fences_stay_valid(self):
  self.prepare({});r=self.verify();self.assertEqual(r['deployedSourceRevision'],self.sha);self.assertEqual(len(r['checks']),10);self.assertTrue(all(method=='GET' for method,path in self.requests))
 def test_legacy_files_only_manifest_without_version_remains_valid(self):
  self.prepare({},version=None);r=self.verify();self.assertEqual(r['deployedSourceRevision'],self.sha);self.assertEqual(r['repositoryInputsVerified'],0);self.assertEqual(len(r['checks']),10)
 def test_declared_three_repository_sql_inputs_are_verified_against_the_commit(self):
  self.prepare();r=self.verify();self.assertEqual(r['deployedSourceRevision'],self.sha);self.assertEqual(r['repositoryInputsVerified'],3);self.assertEqual(len(r['checks']),10)
 def test_missing_declared_input_fails_before_any_page_or_actor_read(self):
  self.prepare(omit=[next(iter(self.mapping))]);self.blocked()
 def test_self_consistent_tampered_sql_cannot_replace_canonical_commit_bytes(self):
  self.prepare(tamper=True);self.blocked()
 def test_unlisted_archive_entry_is_still_forbidden(self):
  self.prepare({},extra={'tests/contracts/unlisted.sql':b'not declared'});self.blocked()
 def test_wrong_source_revision_still_fails(self):
  self.prepare({},revision='0'*40);self.blocked()
 def test_repository_input_source_cannot_escape_the_canonical_migration_contract(self):
  self.prepare({'tests/contracts/20261014000000_fixture.sql':'../../secrets'});self.blocked()
 def test_repository_destination_cannot_be_renamed_or_collide_with_app_source(self):
  for destination in ['tests/contracts/renamed.sql','README.md']:
   with self.subTest(destination=destination):
    self.requests.clear();self.prepare({destination:next(iter(self.mapping.values()))},omit=[destination] if destination!='README.md' else []);self.blocked()
 def test_invalid_repository_mapping_type_fails_as_a_contract_error(self):
  self.prepare({});manifest=json.loads((self.app/'scripts/source-manifest.json').read_text());manifest['repositoryFiles']=[];(self.app/'scripts/source-manifest.json').write_text(json.dumps(manifest),encoding='utf8');self.git('add','.');self.git('commit','-qm','Invalid fixture map');self.sha=self.git('rev-parse','HEAD').decode().strip()
  contents={name:(self.app/name).read_bytes() for name in manifest['files']};metadata={'sourceRevision':self.sha,'sha256':{name:hashlib.sha256(value).hexdigest() for name,value in contents.items()}};output=io.BytesIO()
  with zipfile.ZipFile(output,'w') as z:
   for name,value in contents.items():z.writestr(name,value)
   z.writestr('SOURCE_METADATA.json',json.dumps(metadata))
  self.archive=output.getvalue()
  # The committed manifest governs; a malformed mapping is rejected before archive reads can conceal it.
  self.blocked()

if __name__=='__main__':unittest.main()
