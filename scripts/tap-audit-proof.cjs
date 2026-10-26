'use strict';

// This verifier is checked out from the PR base. Artifacts and candidate files
// are data: only the already trusted updater performs native installations.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { assertPullRequest, auditLocator, verifyCandidate } = require('./tap-update.cjs');

const REPOSITORY = 'bigduu/homebrew-tap';
const WORKFLOW = '.github/workflows/update-tap.yml';
const TARGETS = ['prepare', 'macos-15', 'macos-15-intel'];
const NATIVE_STEPS = [
  'Require the expected native test architecture', 'Verify prepared candidate before running Homebrew',
  'Register checked-out tap', 'Audit formulae and cask', 'Fetch and verify release assets',
  'Install formula dependencies in both architectures', 'Verify formula dependencies in both architectures',
  'Install magpie', 'Verify cask dependencies',
];
const SHA = /^[a-f0-9]{40}$/;
const command = (program, args) => execFileSync(program, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const api = endpoint => JSON.parse(command('gh', ['api', endpoint]));
const positive = value => Number.isSafeInteger(value) && value > 0;

function parseLocator(body, author) {
  const markers = (body || '').match(/<!-- tap-audit:[\s\S]*?-->/g) || [];
  assert.equal(markers.length, ((body || '').match(/<!-- tap-audit:/g) || []).length, 'Malformed original audit locator');
  if (!markers.length) {
    assert.ok(!(body || '').includes('<!-- tap-audit:'), 'Malformed original audit locator');
    assert.notEqual(author, 'github-actions[bot]', 'Automatic PR is missing its original audit locator');
    return null;
  }
  assert.equal(markers.length, 1, 'Ambiguous original audit locator');
  const match = markers[0].match(/^<!-- tap-audit:v1 run=([1-9]\d*) attempt=([1-9]\d*) -->$/);
  assert.ok(match, 'Malformed original audit locator');
  const claim = { runId: Number(match[1]), runAttempt: Number(match[2]) };
  auditLocator(claim);
  return claim;
}

function assertRun(run, workflow, claim, baseSha) {
  assert.ok(positive(claim.runId) && positive(claim.runAttempt), 'Invalid original audit locator');
  assert.ok(positive(workflow.id), 'Invalid updater workflow identity');
  assert.equal(workflow.path, WORKFLOW, 'Unexpected updater workflow path');
  assert.equal(run.workflow_id, workflow.id, 'Original audit used a different workflow');
  assert.equal(run.path, WORKFLOW, 'Original audit workflow path changed');
  assert.equal(run.id, claim.runId, 'Original audit run changed');
  assert.ok(positive(run.run_attempt) && run.run_attempt >= claim.runAttempt, 'Original audit attempt does not exist');
  assert.equal(run.repository.full_name, REPOSITORY, 'Foreign original audit repository');
  assert.equal(run.head_repository.full_name, REPOSITORY, 'Foreign original audit source');
  assert.equal(run.head_branch, 'main', 'Original audit controller is not main');
  assert.ok(['schedule', 'workflow_dispatch'].includes(run.event), 'Unexpected original audit event');
  assert.match(baseSha, SHA);
  assert.equal(run.head_sha, baseSha, 'Original audit controller/base changed');
}

function jobState(page, run, claim, target) {
  assert.ok(TARGETS.includes(target), 'Unexpected original audit target');
  assert.ok(Number.isSafeInteger(page.total_count) && page.total_count === page.jobs.length && page.total_count <= 100, 'Truncated original audit jobs');
  const name = target === 'prepare' ? target : `audit / audit (${target})`;
  const named = page.jobs.filter(job => job.name === name);
  const latest = jobs => jobs.sort((a, b) => b.run_attempt - a.run_attempt)[0];
  for (const job of page.jobs.filter(job => job.name === 'prepare' || job.name === name)) {
    assert.ok(positive(job.id) && job.run_id === claim.runId, 'Foreign original audit job');
    assert.ok(positive(job.run_attempt) && job.run_attempt <= run.run_attempt, 'Invalid original audit job attempt');
    assert.equal(job.head_sha, run.head_sha, 'Original audit job controller changed');
  }
  if (run.run_attempt > claim.runAttempt && !page.jobs.some(job => job.run_attempt === run.run_attempt)) {
    assert.notEqual(run.status, 'completed', 'Latest updater attempt jobs are missing');
    return { pending: true, reason: 'latest updater attempt jobs are not visible yet' };
  }
  const prepare = latest(page.jobs.filter(job => job.name === 'prepare'));
  if (prepare) assert.equal(prepare.run_attempt, claim.runAttempt, 'A newer prepare replaced the original snapshot; use its locator');
  if (target !== 'prepare') {
    assert.ok(prepare, 'Original prepare proof is missing');
    assert.equal(prepare.status, 'completed', 'Original prepare proof is incomplete');
    assert.equal(prepare.conclusion, 'success', 'Original prepare did not succeed');
  }
  if (!named.length) {
    assert.notEqual(run.status, 'completed', `Original ${name} proof is missing`);
    return { pending: true, reason: `${name} has not started` };
  }
  const job = latest(named);
  assert.ok(job.run_attempt >= claim.runAttempt, 'Original audit job predates the snapshot');
  assert.equal(named.filter(item => item.run_attempt === job.run_attempt).length, 1, 'Ambiguous original audit job attempt');
  if (job.status !== 'completed') {
    assert.notEqual(run.status, 'completed', `Original ${name} proof is incomplete`);
    return { pending: true, reason: `${name} is ${job.status}` };
  }
  assert.equal(job.conclusion, 'success', `Original ${name} did not succeed (${job.conclusion})`);
  const required = target === 'prepare' ? ['Run update contracts', 'Prepare one exact version PR'] : [
    ...NATIVE_STEPS,
    ...(target === 'macos-15' ? ['Fetch and verify ARM Bodhi release', 'Verify original Bodhi signing before the cask modifies the app', 'Check installation plan', 'Install ARM Bodhi in the disposable runner']
      : ['Verify Intel rejects the ARM-only Bodhi cask']),
  ];
  for (const stepName of required) {
    const matches = (job.steps || []).filter(step => step.name === stepName);
    assert.equal(matches.length, 1, `Original ${name} is missing actual step ${stepName}`);
    assert.equal(matches[0].status, 'completed', `Original ${stepName} is incomplete`);
    assert.equal(matches[0].conclusion, 'success', `Original ${stepName} did not succeed`);
  }
  return { pending: false, jobId: job.id, runAttempt: job.run_attempt };
}

function assertSnapshot(snapshot, artifact, claim, run, pr) {
  assert.deepEqual(snapshot.audit, { runId: claim.runId, runAttempt: claim.runAttempt, controllerSha: run.head_sha }, 'Original snapshot run/attempt/controller changed');
  assert.equal(snapshot.baseSha, run.head_sha, 'Snapshot base differs from its trusted controller');
  assert.equal(snapshot.prNumber, pr.number, 'Original snapshot belongs to another PR');
  assertPullRequest(pr, snapshot);
  assert.equal(artifact.name, `tap-snapshot-${claim.runId}-${claim.runAttempt}`, 'Original snapshot artifact name changed');
  assert.equal(artifact.expired, false, 'Original snapshot artifact expired');
  assert.ok(positive(artifact.id), 'Invalid original snapshot artifact');
  assert.equal(artifact.workflow_run.id, claim.runId, 'Foreign snapshot artifact run');
  assert.equal(artifact.workflow_run.head_sha, run.head_sha, 'Snapshot artifact controller changed');
}

function expectedPR(env = process.env) {
  const expected = { number: Number(env.TAP_PR_NUMBER), head: env.TAP_PR_HEAD, base: env.TAP_PR_BASE };
  assert.ok(positive(expected.number), 'Invalid PR number');
  assert.match(expected.head, SHA);
  assert.match(expected.base, SHA);
  return expected;
}

function readPR(expected, request = api) {
  const pr = request(`repos/${REPOSITORY}/pulls/${expected.number}`);
  assert.equal(pr.number, expected.number, 'PR identity changed');
  assert.equal(pr.head.sha, expected.head, 'PR event head is stale');
  assert.equal(pr.base.sha, expected.base, 'PR event base is stale');
  return pr;
}

async function waitForJob(claim, baseSha, target, { request = api, pause = ms => new Promise(resolve => setTimeout(resolve, ms)), timeoutMs = 75 * 60 * 1000, now = Date.now } = {}) {
  const workflow = request(`repos/${REPOSITORY}/actions/workflows/update-tap.yml`);
  const deadline = now() + timeoutMs;
  let previous;
  for (;;) {
    const run = request(`repos/${REPOSITORY}/actions/runs/${claim.runId}`);
    assertRun(run, workflow, claim, baseSha);
    const page = request(`repos/${REPOSITORY}/actions/runs/${claim.runId}/jobs?filter=all&per_page=100`);
    const state = jobState(page, run, claim, target);
    if (!state.pending) return { run, ...state };
    if (state.reason !== previous) console.log(`Waiting for original audit: ${state.reason}`);
    previous = state.reason;
    assert.ok(now() < deadline, `Timed out waiting for original ${target} proof; no acceptance was recorded`);
    await pause(Math.min(30000, Math.max(1, deadline - now())));
  }
}

function readSnapshot(claim, directory, request = api, execute = command) {
  const name = `tap-snapshot-${claim.runId}-${claim.runAttempt}`;
  const page = request(`repos/${REPOSITORY}/actions/runs/${claim.runId}/artifacts?per_page=100`);
  assert.ok(page.total_count === page.artifacts.length && page.total_count <= 100, 'Truncated original snapshot artifacts');
  const matches = page.artifacts.filter(artifact => artifact.name === name);
  assert.equal(matches.length, 1, 'Original snapshot artifact is missing or ambiguous');
  assert.equal(matches[0].expired, false, 'Original snapshot artifact expired');
  fs.mkdirSync(directory, { recursive: true });
  execute('gh', ['run', 'download', String(claim.runId), '--repo', REPOSITORY, '--name', name, '--dir', directory]);
  assert.deepEqual(fs.readdirSync(directory).sort(), ['snapshot.json'], 'Unexpected original snapshot artifact files');
  const file = path.join(directory, 'snapshot.json');
  assert.ok(fs.lstatSync(file).isFile() && fs.statSync(file).size <= 1024 * 1024, 'Invalid original snapshot file');
  return { snapshot: JSON.parse(fs.readFileSync(file, 'utf8')), artifact: matches[0] };
}

function writeOutputs(values) {
  const entries = Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${entries}\n`);
  console.log(JSON.stringify(values));
}

async function select() {
  assert.equal(process.env.GITHUB_REPOSITORY, REPOSITORY);
  assert.equal(process.env.GITHUB_EVENT_NAME, 'pull_request', 'Unexpected PR checker event');
  const expected = expectedPR();
  const pr = readPR(expected);
  const claim = parseLocator(pr.body, pr.user.login);
  if (!claim) return writeOutputs({ mode: 'ordinary', run_id: '', run_attempt: '' });
  const workflow = api(`repos/${REPOSITORY}/actions/workflows/update-tap.yml`);
  assertRun(api(`repos/${REPOSITORY}/actions/runs/${claim.runId}`), workflow, claim, expected.base);
  writeOutputs({ mode: 'reuse', run_id: claim.runId, run_attempt: claim.runAttempt });
}

async function verify(directory, candidate) {
  const expected = expectedPR();
  const claim = { runId: Number(process.env.TAP_AUDIT_RUN_ID), runAttempt: Number(process.env.TAP_AUDIT_RUN_ATTEMPT) };
  auditLocator(claim);
  assert.equal(command('git', ['rev-parse', 'HEAD']), expected.base, 'Verifier must run from the exact trusted PR base');
  const initial = readPR(expected);
  assert.deepEqual(parseLocator(initial.body, initial.user.login), claim, 'PR original audit locator changed');
  const prepared = await waitForJob(claim, expected.base, 'prepare');
  const { snapshot, artifact } = readSnapshot(claim, directory);
  assertSnapshot(snapshot, artifact, claim, prepared.run, initial);
  const original = process.cwd();
  try { process.chdir(candidate); verifyCandidate(snapshot); }
  finally { process.chdir(original); }
  const target = process.env.TAP_AUDIT_TARGET || 'prepare';
  const accepted = target === 'prepare' ? prepared : await waitForJob(claim, expected.base, target);
  // Review/required-check decisions remain with merge. This checks no whole-run
  // conclusion, so a pending or retried merge cannot deadlock its own PR gates.
  const live = readPR(expected);
  assert.deepEqual(parseLocator(live.body, live.user.login), claim, 'PR original audit locator changed during verification');
  assertSnapshot(snapshot, artifact, claim, accepted.run, live);
  assert.equal(api(`repos/${REPOSITORY}/git/ref/heads/main`).object.sha, snapshot.baseSha, 'Main moved after the original audit');
  writeOutputs({ accepted: true, target, original_run: claim.runId, snapshot_attempt: claim.runAttempt, job_id: accepted.jobId, job_attempt: accepted.runAttempt });
}

module.exports = { assertRun, assertSnapshot, jobState, parseLocator, readPR, readSnapshot, waitForJob };
if (require.main === module) {
  const [action, directory, candidate] = process.argv.slice(2);
  const task = action === 'select' ? select()
    : action === 'verify' && directory && candidate ? verify(directory, candidate)
      : Promise.reject(new Error('Usage: tap-audit-proof.cjs select | verify <artifact-directory> <candidate-checkout>'));
  task.catch(error => { console.error(error.message); process.exitCode = 1; });
}
