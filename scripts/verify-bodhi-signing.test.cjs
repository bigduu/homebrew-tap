'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { assertCurrentSigning, verifyUpstreamSigning } = require('./verify-bodhi-signing.cjs');

const ADHOC = 'Signature=adhoc\nTeamIdentifier=not set\n';

test('admits the original ad-hoc signature class used by the existing Bodhi cask', () => {
  assertCurrentSigning(ADHOC);
});

test('rejects Developer ID/certificate signatures, unknown, unsigned and conflicting metadata before postflight', () => {
  for (const display of [
    'Authority=Developer ID Application: Example (ABCDE12345)\nAuthority=Developer ID Certification Authority\nTeamIdentifier=ABCDE12345\n',
    `${ADHOC}Authority=Developer ID Application: Example\n`,
    'code object is not signed at all\n', '', 'Signature=adhoc\n',
    `${ADHOC}Signature=certificate\n`, 'Signature=adhoc\nTeamIdentifier=ABCDE12345\n',
  ]) assert.throws(() => assertCurrentSigning(display), /Migrate the cask/);
});

test('uses read-only verification/display commands and rejects invalid source signatures', () => {
  const calls = [];
  verifyUpstreamSigning('/fixture/Bodhi AI.app', (command, args) => {
    calls.push([command, args]);
    return { status: 0, stdout: '', stderr: args[0] === '--display' ? ADHOC : '' };
  });
  assert.deepEqual(calls, [
    ['/usr/bin/codesign', ['--verify', '--deep', '--strict', '/fixture/Bodhi AI.app']],
    ['/usr/bin/codesign', ['--display', '--verbose=4', '/fixture/Bodhi AI.app']],
  ]);
  assert.throws(() => verifyUpstreamSigning('/fixture/Bodhi AI.app', () => ({ status: 1 })), /Migrate the cask/);
});
