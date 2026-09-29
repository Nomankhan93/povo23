import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['scripts/test-browser241.mjs'],{stdio:'inherit',env:{...process.env,FIELDLANCE_TEST_ONLINE_ATTENDANCE:'1'}});
