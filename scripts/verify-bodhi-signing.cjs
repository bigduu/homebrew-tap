'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const MIGRATION = 'Bodhi upstream signing changed or is unverified. Migrate the cask quarantine/ad-hoc-signing workaround before accepting this release.';

function assertCurrentSigning(display) {
  const lines = display.split(/\r?\n/).map(line => line.trim());
  assert.deepEqual(lines.filter(line => line.startsWith('Signature=')), ['Signature=adhoc'], MIGRATION);
  assert.deepEqual(lines.filter(line => line.startsWith('TeamIdentifier=')), ['TeamIdentifier=not set'], MIGRATION);
  assert.ok(!lines.some(line => line.startsWith('Authority=')), MIGRATION);
}

function verifyUpstreamSigning(app, execute = spawnSync) {
  const options = { encoding: 'utf8', maxBuffer: 1024 * 1024 };
  const verified = execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], options);
  assert.equal(verified.status, 0, MIGRATION);
  const displayed = execute('/usr/bin/codesign', ['--display', '--verbose=4', app], options);
  assert.equal(displayed.status, 0, MIGRATION);
  assertCurrentSigning(`${displayed.stdout || ''}\n${displayed.stderr || ''}`);
}

module.exports = { assertCurrentSigning, verifyUpstreamSigning };
if (require.main === module) {
  try {
    assert.equal(process.argv.length, 3, 'Usage: verify-bodhi-signing.cjs <original-dmg-app>');
    verifyUpstreamSigning(process.argv[2]);
    console.log('Original Bodhi app has a valid ad-hoc signature; the current cask workaround is compatible.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
