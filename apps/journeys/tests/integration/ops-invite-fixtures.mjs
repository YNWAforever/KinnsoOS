import {execFileSync} from 'node:child_process';
import {verifyTestTarget} from '../../scripts/verify-test-target.mjs';

// Only the verified local database superuser can purge synthetic fixtures.
// Never expose this cleanup through an application endpoint or database RPC.
export function cleanOpsInviteFixtures(emails) {
 if(!emails.length)return;
 if(emails.some(email=>!/^[a-z0-9-]+-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}@example\.test$/.test(email))){
  throw Error('Refusing to purge non-fixture invite addresses');
 }
 const {dbContainer}=verifyTestTarget();
 const values=[...new Set(emails)].map(email=>"'"+email+"'").join(',');
 execFileSync('docker',['exec',dbContainer,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres',
  '-c','delete from public.kinnso_ops_invites where email in ('+values+');'],
 {stdio:'ignore',timeout:15000,windowsHide:true});
}
