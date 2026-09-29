import {execFileSync} from 'node:child_process';
// Run the same complete acceptance flow after reproducing the reported mismatch.
execFileSync(process.execPath,['scripts/test-browser241.mjs'],{
  stdio:'inherit',env:{...process.env,FIELDLANCE_TEST_NETWORK_MISMATCH:'1'},
});
