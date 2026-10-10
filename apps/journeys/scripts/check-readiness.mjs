import {diagnoseReadiness} from '../lib/contracts/readiness.ts';

const report = diagnoseReadiness(process.env);
const args = process.argv.slice(2);
const validOptions = args.length <= 1 && args.every(arg=>/^--require=[a-zA-Z][a-zA-Z,]*$/.test(arg));
const required = validOptions && args[0] ? args[0].slice('--require='.length).split(',') : [];
console.log(JSON.stringify(report));
process.exitCode = validOptions && report.backend==='configured' && report.checks.every(check=>check.status==='pass') &&
  required.every(name=>report.capabilities[name]==='connected') ? 0 : 1;
