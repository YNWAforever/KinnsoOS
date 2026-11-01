"""Prepare (never execute) the append-only original-writer/read-guard continuation.

Copies the latest definitions from the existing migration history, makes bounded
substitutions, and records their source hashes. Fail if an expected anchor drifts.
"""
import hashlib
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / 'supabase/migrations'
functions = {}
pattern = re.compile(r'create\s+(?:or replace\s+)?function\s+([\w.]+)\s*\([^$]*?(\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$).*?\2;', re.I | re.S)
for path in sorted(MIGRATIONS.glob('*.sql')):
    if path.name >= '20261101100000':
        continue
    for match in pattern.finditer(path.read_text(encoding='utf-8')):
        functions[match[1]] = (path.name, match[0])

parts = ['-- GENERATED SOURCE CANDIDATE ONLY. No SQL executed.\n-- Generator: scripts/prepare-discovery-native-guards.py\n']

def emit(name, transform):
    source, original = functions[name]
    updated = transform(original)
    assert updated != original, name
    updated = re.sub(r'^create (?:or replace )?function', 'create or replace function', updated, flags=re.I)
    parts.append(f'-- Source: {source}; function sha256 {hashlib.sha256(original.encode()).hexdigest()}\n{updated}\n')

def replace(text, before, after):
    assert before in text, before
    return text.replace(before, after)

def adopt(text):
    text = replace(text, 'insert into public.trip_days(id,trip_id,day_offset,title) values(day_id,t.id,base+(d->>\'offset\')::integer,nullif(d->>\'title\',\'\'));',
        'insert into public.trip_days(id,trip_id,day_offset,title,source_guide_id,source_guide_version,source_guide_day_id) values(day_id,t.id,base+(d->>\'offset\')::integer,nullif(d->>\'title\',\'\'),g.id,v.version,(d->>\'id\')::uuid);')
    text = replace(text, 'copied_title,copied_note,adopted_at)', 'copied_title,copied_note,adopted_at,source_guide_stop_id)')
    text = replace(text, "s->>'title',s->>'description',now())", "s->>'title',s->>'description',now(),(s->>'id')::uuid)")
    return replace(text, 'return prior.result;', 'return kinnso_internal.discovery_project_trip(prior.result);')

emit('public.adopt_guide_to_trip', adopt)
emit('public.apply_trip_command', lambda t: replace(t, 'return v_prior.result;', 'return kinnso_internal.discovery_project_trip(v_prior.result);'))

# Definer readers bypass RLS. Filter the exact guide subquery before aggregation.
for name in ['public.creator_insights', 'public.merchant_insights', 'public.admin_creator_detail',
             'public.get_attributed_guides_for_merchant', 'public.kinnso_guide_authoring']:
    def guard(text):
        updated, count = re.subn(r'(from|join)\s+public\.guides\b', r'\1 (select * from public.guides where kinnso_internal.discovery_guide_visible(id))', text, flags=re.I)
        assert count, name
        return updated
    emit(name, guard)

(MIGRATIONS / '20261101100300_discovery_original_writer_guards.sql').write_text('\n'.join(parts), encoding='utf-8')
print('Prepared seven bounded function continuations; no database connection or execution.')

# Keep editing/reordering semantics while markers remain outside original guide content.
parts = ['-- GENERATED, UNAPPLIED field-lineage continuations. See generator and source hashes.\n']

def prepare_markers(text):
    text = replace(text, 'v_artifact_revision integer;', 'v_artifact_revision integer; has_licensed boolean:=false;')
    text = replace(text, "for block in select value from jsonb_array_elements(body->'blocks') where blocks ? (value->>'id') loop", """select exists(select 1 from jsonb_array_elements(body->'blocks') b cross join lateral jsonb_array_elements(b->'sources') r
   join kinnso_internal.discovery_source_provenance sp on sp.source_id=(r->>'sourceId')::uuid where blocks ? (b->>'id')) into has_licensed;
  for block in select value from jsonb_array_elements(body->'blocks') where blocks ? (value->>'id') loop""")
    text = replace(text, "'durationMinutes',null));", "'durationMinutes',null)||case when has_licensed then jsonb_build_object('studioBlockId',block->'id') else '{}'::jsonb end);")
    text = replace(text, 'payload:=d.payload;', 'payload:=kinnso_internal.discovery_restore_markers(v_guide_id,d.payload);')
    return replace(text, 'perform kinnso_internal.assert_studio_refs(refs,p_actor,a.thread_id,true);',
        'perform kinnso_internal.discovery_assert_markers(payload,a.id,v_artifact_revision,blocks);\n perform kinnso_internal.assert_studio_refs(refs,p_actor,a.thread_id,true);')

emit('kinnso_internal.studio_prepare_guide', prepare_markers)
emit('kinnso_internal.creator_draft_snapshot', lambda t: replace(t, 'result:=kinnso_internal.legacy_creator_draft_snapshot(p_id);',
    "result:=kinnso_internal.legacy_creator_draft_snapshot(p_id);\n result:=jsonb_set(result,'{payload}',kinnso_internal.discovery_restore_markers(p_id,result->'payload'));") )

def save_markers(text):
    text = replace(text, 'legacy_save_kinnso_guide_draft(p_draft_id,p_expected_revision,p_request_id,p_payload)',
        'legacy_save_kinnso_guide_draft(p_draft_id,p_expected_revision,p_request_id,kinnso_internal.discovery_strip_markers(p_payload))')
    return replace(text, 'select * into h from kinnso_internal.studio_handoffs where id=h_id;',
        "select * into h from kinnso_internal.studio_handoffs where id=h_id;\n  perform kinnso_internal.discovery_record_markers(p_draft_id,(result->>'revision')::integer,h.payload);\n  result:=jsonb_set(result,'{payload}',h.payload);")

emit('public.save_kinnso_guide_draft', save_markers)
emit('public.publish_kinnso_guide_draft', lambda t: replace(t, 'payload=expected_payload', 'payload=kinnso_internal.discovery_strip_markers(expected_payload)'))
emit('public.publish_guide_version', lambda t: replace(t, "h.payload->'content'=p_content", "kinnso_internal.discovery_strip_markers(h.payload)->'content'=p_content"))
(MIGRATIONS / '20261101100700_discovery_editor_lineage.sql').write_text('\n'.join(parts), encoding='utf-8')
print('Prepared five editor marker continuations; original domain payload schema retained.')
