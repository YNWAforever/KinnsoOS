import test from 'node:test';
import assert from 'node:assert/strict';

let subject={};
try{subject=await import('../lib/ops/team.ts');}catch{}

test('operations team input validates supported roles, email and audited reason',()=>{
 assert.equal(typeof subject.parseOpsInvite,'function');
 assert.deepEqual(subject.parseOpsInvite({email:'  Analyst@Example.Test ',role:'analyst'}),{email:'analyst@example.test',role:'analyst'});
 assert.equal(subject.parseOpsReason('  Reviewed with the operations owner  '),'Reviewed with the operations owner');
 for(const value of [{email:'',role:'analyst'},{email:'not-an-email',role:'analyst'},{email:'a@example.test',role:'creator'},{email:'a@example.test',role:'analyst',actorId:'foreign'}])assert.throws(()=>subject.parseOpsInvite(value),/INVALID_OPS_TEAM/);
 for(const reason of ['', '   ', 'x'.repeat(501)])assert.throws(()=>subject.parseOpsReason(reason),/INVALID_OPS_TEAM/);
});

test('invite tokens and member mutations reject malformed or injection-shaped values',()=>{
 assert.equal(typeof subject.parseOpsToken,'function');
 const token='a'.repeat(64);assert.equal(subject.parseOpsToken(token),token);
 for(const value of ['a'.repeat(63),'a'.repeat(65),'../token','A'.repeat(64)])assert.throws(()=>subject.parseOpsToken(value),/INVALID_OPS_TEAM/);
 const id='11111111-1111-4111-8111-111111111111';
 assert.deepEqual(subject.parseRoleChange({memberId:id,role:'moderator',reason:'Temporary operations coverage'}),{memberId:id,role:'moderator',reason:'Temporary operations coverage'});
 assert.deepEqual(subject.parseMemberReason({memberId:id,reason:'Scheduled access review'}),{memberId:id,reason:'Scheduled access review'});
 assert.throws(()=>subject.parseRoleChange({memberId:id,role:'traveller',reason:'Invalid role'}),/INVALID_OPS_TEAM/);
});

test('team projections never expose invite tokens through member or pending-invite reads',()=>{
 assert.equal(typeof subject.projectPendingInvite,'function');
 const row={id:'11111111-1111-4111-8111-111111111111',email:'invite@example.test',role:'analyst',status:'pending',created_at:'2026-11-06T00:00:00Z',expires_at:'2026-11-13T00:00:00Z',token:'DO_NOT_EXPOSE'};
 assert.deepEqual(subject.projectPendingInvite(row),{id:row.id,email:row.email,role:row.role,status:row.status,createdAt:row.created_at,expiresAt:row.expires_at});
 assert.equal(subject.projectPendingInvite(row).token,undefined);
});
