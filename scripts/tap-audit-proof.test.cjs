'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { assertRun, assertSnapshot, jobState, parseLocator, readPR, readSnapshot, waitForJob } = require('./tap-audit-proof.cjs');
const { auditLocator, branchFor, hash, readCask, readFormula, renderFiles } = require('./tap-update.cjs');

const REPOSITORY = 'bigduu/homebrew-tap';
const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const claim = { runId: 42, runAttempt: 1 };
const workflow = { id: 7, path: '.github/workflows/update-tap.yml' };
const run = {
  id: 42, run_attempt: 1, workflow_id: 7, path: workflow.path, event: 'schedule', head_branch: 'main', head_sha: BASE,
  repository: { full_name: REPOSITORY }, head_repository: { full_name: REPOSITORY }, status: 'in_progress', conclusion: null,
};
const pr = {
  number: 9, state: 'open', draft: false, body: auditLocator(claim), user: { login: 'github-actions[bot]' },
  head: { ref: 'automation/tap-example', sha: HEAD, repo: { full_name: REPOSITORY } },
  base: { ref: 'main', sha: BASE, repo: { full_name: REPOSITORY } },
};
const snapshot = {
  schema: 2, repository: REPOSITORY, baseSha: BASE, headSha: HEAD, branch: pr.head.ref, prNumber: pr.number,
  audit: { ...claim, controllerSha: BASE },
};
const artifact = { id: 8, name: 'tap-snapshot-42-1', expired: false, workflow_run: { id: 42, head_sha: BASE } };
const nativeSteps = ['Require the expected native test architecture', 'Verify prepared candidate before running Homebrew', 'Register checked-out tap', 'Audit formulae and cask', 'Fetch and verify release assets', 'Install formula dependencies in both architectures', 'Verify formula dependencies in both architectures', 'Install magpie', 'Verify cask dependencies'];
const job = (name, id, attempt = 1, status = 'completed', conclusion = 'success') => ({
  id, name, run_id: 42, run_attempt: attempt, head_sha: BASE, status, conclusion,
  steps: (name === 'prepare' ? ['Run update contracts', 'Prepare one exact version PR']
    : name === 'audit / audit (macos-15)' ? [...nativeSteps, 'Fetch and verify ARM Bodhi release', 'Verify original Bodhi signing before the cask modifies the app', 'Check installation plan', 'Install ARM Bodhi in the disposable runner']
      : name === 'audit / audit (macos-15-intel)' ? [...nativeSteps, 'Verify Intel rejects the ARM-only Bodhi cask'] : []).map(step => ({ name: step, status: 'completed', conclusion: 'success' })),
});
const jobs = [job('prepare', 1), job('audit / audit (macos-15)', 2), job('audit / audit (macos-15-intel)', 3), job('merge', 4, 1, 'queued', null)];
const page = values => ({ total_count: values.length, jobs: structuredClone(values) });

test('locator is untrusted discovery; missing bot, malformed or ambiguous claims fail closed', () => {
  assert.deepEqual(parseLocator(pr.body, 'human'), claim);
  assert.equal(parseLocator('ordinary PR, automation/tap-spoofed branch', 'human'), null);
  assert.throws(() => parseLocator('', 'github-actions[bot]'), /missing/);
  for (const body of [
    '<!-- tap-audit:v1 run=other attempt=1 -->', '<!-- tap-audit:v1 run=0 attempt=1 -->',
    '<!-- tap-audit:v1 run=42 attempt=-1 -->', '<!-- tap-audit:v2 run=42 attempt=1 -->',
    '<!-- tap-audit:v1 run=42 attempt=1', `${pr.body}\n${pr.body}`, `${pr.body}\n<!-- tap-audit:`,
    '<!-- tap-audit:v1 run=9007199254740992 attempt=1 -->',
  ]) assert.throws(() => parseLocator(body, 'human'));
});

test('only the canonical scheduled/manual main controller at the exact base is admitted', () => {
  assertRun(run, workflow, claim, BASE);
  assertRun({ ...run, event: 'workflow_dispatch', conclusion: 'failure' }, workflow, claim, BASE);
  for (const change of [
    r => { r.id++; }, r => { r.run_attempt = 0; }, r => { r.workflow_id++; },
    r => { r.path = '.github/workflows/check.yml'; }, r => { r.head_branch = 'automation/spoof'; },
    r => { r.head_sha = HEAD; }, r => { r.event = 'pull_request'; },
    r => { r.repository.full_name = 'foreign/tap'; }, r => { r.head_repository.full_name = 'foreign/tap'; },
  ]) {
    const changed = structuredClone(run); change(changed);
    assert.throws(() => assertRun(changed, workflow, claim, BASE));
  }
  assert.throws(() => assertRun(run, { ...workflow, path: 'other.yml' }, claim, BASE));
  assert.throws(() => assertRun(run, workflow, { ...claim, runAttempt: 2 }, BASE));
});

test('native success does not wait for the updater merge or whole-run conclusion', () => {
  for (const state of [run, { ...run, status: 'completed', conclusion: 'failure' }]) {
    for (const target of ['prepare', 'macos-15', 'macos-15-intel']) assert.equal(jobState(page(jobs), state, claim, target).pending, false);
  }
  for (const conclusion of ['failure', 'skipped', 'cancelled', 'neutral', 'timed_out', null]) {
    const changed = structuredClone(jobs); changed[2].conclusion = conclusion;
    assert.throws(() => jobState(page(changed), run, claim, 'macos-15-intel'), /did not succeed/);
  }
  const pending = structuredClone(jobs); pending[2].status = 'in_progress'; pending[2].conclusion = null;
  assert.equal(jobState(page(pending), run, claim, 'macos-15-intel').pending, true);
  assert.throws(() => jobState(page(pending), { ...run, status: 'completed' }, claim, 'macos-15-intel'), /incomplete/);
  assert.equal(jobState(page([jobs[0]]), run, claim, 'macos-15').pending, true);
  assert.throws(() => jobState(page([jobs[0]]), { ...run, status: 'completed' }, claim, 'macos-15'), /missing/);
});

test('merge-only and failed-target reruns retain the original snapshot and successful siblings', () => {
  const rerun = { ...run, run_attempt: 2 };
  assert.equal(jobState(page(jobs), rerun, claim, 'macos-15').pending, true);
  assert.equal(jobState(page([...jobs, job('merge', 7, 2, 'queued', null)]), rerun, claim, 'macos-15').runAttempt, 1);
  const retried = [...jobs, job('audit / audit (macos-15-intel)', 5, 2)];
  assert.equal(jobState(page(retried), rerun, claim, 'macos-15-intel').runAttempt, 2);
  assert.equal(jobState(page(retried), rerun, claim, 'macos-15').runAttempt, 1);
  retried[4].conclusion = 'failure';
  assert.throws(() => jobState(page(retried), rerun, claim, 'macos-15-intel'), /did not succeed/);
  retried[4].conclusion = 'skipped';
  assert.throws(() => jobState(page(retried), rerun, claim, 'macos-15-intel'), /did not succeed/);
  assert.throws(() => jobState(page([...jobs, job('prepare', 6, 2)]), rerun, claim, 'macos-15'), /newer prepare/);
});

test('foreign, stale, ambiguous and truncated job evidence cannot pass', () => {
  for (const change of [
    p => { p.total_count++; }, p => { p.jobs[1].run_id++; }, p => { p.jobs[1].head_sha = HEAD; },
    p => { p.jobs[1].run_attempt = 2; }, p => { p.jobs[1].run_attempt = 0; },
    p => { p.jobs.push({ ...p.jobs[1], id: 88 }); p.total_count++; },
  ]) {
    const changed = page(jobs); change(changed);
    assert.throws(() => jobState(changed, run, claim, 'macos-15'));
  }
  assert.throws(() => jobState(page(jobs), run, claim, 'merge'), /Unexpected/);
});

test('a green wrapper cannot replace missing or skipped actual Unit, installation or signing steps', () => {
  for (const [index, target] of [[0, 'prepare'], [1, 'macos-15'], [2, 'macos-15-intel']]) {
    for (const step of jobs[index].steps) {
      const changed = page(jobs);
      changed.jobs[index].steps.find(value => value.name === step.name).conclusion = 'skipped';
      assert.throws(() => jobState(changed, run, claim, target), /did not succeed/);
    }
    const changed = page(jobs); delete changed.jobs[index].steps;
    assert.throws(() => jobState(changed, run, claim, target), /missing actual step/);
  }
});

test('snapshot binds the immutable artifact, original attempt, controller and exact live PR', () => {
  assertSnapshot(snapshot, artifact, claim, run, pr);
  for (const change of [
    s => { s.audit.runId++; }, s => { s.audit.runAttempt++; }, s => { s.audit.controllerSha = HEAD; },
    s => { s.baseSha = HEAD; }, s => { s.headSha = BASE; }, s => { s.prNumber++; },
  ]) {
    const changed = structuredClone(snapshot); change(changed);
    assert.throws(() => assertSnapshot(changed, artifact, claim, run, pr));
  }
  for (const change of [
    a => { a.name = 'tap-snapshot-42-2'; }, a => { a.id = 0; }, a => { a.expired = true; },
    a => { a.workflow_run.id++; }, a => { a.workflow_run.head_sha = HEAD; },
  ]) {
    const changed = structuredClone(artifact); change(changed);
    assert.throws(() => assertSnapshot(snapshot, changed, claim, run, pr));
  }
  for (const change of [
    p => { p.base.sha = HEAD; }, p => { p.head.sha = BASE; }, p => { p.head.repo.full_name = 'foreign/tap'; },
    p => { p.draft = true; }, p => { p.state = 'closed'; },
  ]) {
    const changed = structuredClone(pr); change(changed);
    assert.throws(() => assertSnapshot(snapshot, artifact, claim, run, changed));
  }
  const expected = { number: pr.number, head: HEAD, base: BASE };
  assert.deepEqual(readPR(expected, () => pr), pr);
  assert.throws(() => readPR({ ...expected, head: BASE }, () => pr), /stale/);
  assert.throws(() => readPR({ ...expected, base: HEAD }, () => pr), /stale/);
});

test('bounded polling accepts only selected producer success and never asks for merge completion', async () => {
  let now = 0; let polls = 0;
  const request = endpoint => {
    if (endpoint.endsWith('/actions/workflows/update-tap.yml')) return workflow;
    if (endpoint.endsWith('/actions/runs/42')) return run;
    assert.equal(endpoint, 'repos/bigduu/homebrew-tap/actions/runs/42/jobs?filter=all&per_page=100');
    polls++;
    return page(polls === 1 ? [jobs[0]] : jobs);
  };
  const accepted = await waitForJob(claim, BASE, 'macos-15', { request, now: () => now, pause: async ms => { now += ms; }, timeoutMs: 100 });
  assert.equal(accepted.jobId, 2);
  assert.equal(polls, 2);
  now = 0;
  await assert.rejects(waitForJob(claim, BASE, 'macos-15', {
    request: endpoint => endpoint.includes('/jobs?') ? page([jobs[0]]) : request(endpoint),
    now: () => now, pause: async ms => { now += ms; }, timeoutMs: 10,
  }), /Timed out/);
});

test('artifact download admits one plain snapshot file and rejects missing/expired/extra data', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tap-proof-artifact-'));
  try {
    const request = () => ({ total_count: 1, artifacts: [artifact] });
    const execute = (program, args) => {
      assert.equal(program, 'gh');
      assert.deepEqual(args.slice(0, 7), ['run', 'download', '42', '--repo', REPOSITORY, '--name', artifact.name]);
      fs.writeFileSync(path.join(directory, 'snapshot.json'), JSON.stringify(snapshot));
    };
    assert.deepEqual(readSnapshot(claim, directory, request, execute).snapshot, snapshot);
    assert.throws(() => readSnapshot(claim, directory, () => ({ total_count: 0, artifacts: [] }), execute), /missing/);
    assert.throws(() => readSnapshot(claim, directory, () => ({ total_count: 1, artifacts: [{ ...artifact, expired: true }] }), execute), /expired/);
    fs.writeFileSync(path.join(directory, 'untrusted.cjs'), 'throw Error("must never execute");');
    assert.throws(() => readSnapshot(claim, directory, request, execute), /Unexpected/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('reusable audit PR number is explicitly formatted for its string input contract', () => {
  const caller = fs.readFileSync(path.join(__dirname, '../.github/workflows/check.yml'), 'utf8');
  const callee = fs.readFileSync(path.join(__dirname, '../.github/workflows/check-tap.yml'), 'utf8');
  assert.match(caller, /reuse_pr_number: \$\{\{ format\('\{0\}', github\.event\.pull_request\.number\) \}\}/);
  assert.match(callee, /reuse_pr_number:\n        default: ''\n        type: string/);
});

test('first-landing route runs real ordinary checks and cannot turn a claim into a bootstrap success', () => {
  const source = fs.readFileSync(path.join(__dirname, '../.github/workflows/check.yml'), 'utf8');
  const script = source.match(/id: select\n        run: \|\n([\s\S]*?)\n      - uses:/)[1].replace(/^ {10}/gm, '');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tap-proof-bootstrap-'));
  const output = path.join(directory, 'output');
  const sentinel = path.join(directory, 'must-not-execute');
  try {
    fs.writeFileSync(path.join(directory, 'gh'), '#!/usr/bin/env node\nconsole.log(process.env.TAP_PROOF_BOOTSTRAP_PR);\n');
    fs.chmodSync(path.join(directory, 'gh'), 0o755);
    const env = { ...process.env, PATH: `${directory}${path.delimiter}${process.env.PATH}`, GITHUB_OUTPUT: output,
      GITHUB_REPOSITORY: REPOSITORY, TAP_PR_NUMBER: '9', TAP_PR_HEAD: HEAD, TAP_PR_BASE: BASE };
    const execute = value => {
      fs.writeFileSync(output, '');
      execFileSync('bash', ['-e', '-o', 'pipefail', '-c', script], { cwd: directory, env: { ...env, TAP_PROOF_BOOTSTRAP_PR: JSON.stringify(value) }, stdio: ['ignore', 'pipe', 'pipe'] });
      return fs.readFileSync(output, 'utf8');
    };
    const ordinary = { ...pr, user: { login: 'human' }, body: `Quoted PR data: $(touch ${sentinel}); \`touch ${sentinel}\`` };
    assert.equal(execute(ordinary), 'mode=ordinary\nrun_id=\nrun_attempt=\n');
    assert.equal(fs.existsSync(sentinel), false);
    assert.throws(() => execute({ ...ordinary, body: auditLocator(claim) }), /requires the trusted verifier/);
    assert.throws(() => execute({ ...ordinary, user: pr.user }), /requires the trusted verifier/);
    assert.throws(() => execute({ ...ordinary, head: { ...pr.head, sha: BASE } }));
    assert.match(source, /if: needs\.route\.outputs\.mode == 'ordinary'\n        run: node --test scripts\/\*\.test\.cjs/);
    assert.match(source, /name: Tap Acceptance[\s\S]*?needs: \[route, update-tests, audit\][\s\S]*?if: always\(\)/);
    assert.doesNotMatch(source, /^  push:/m);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('real verifier CLI checks a rendered Git candidate while final merge is pending', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tap-proof-cli-'));
  const controller = path.join(directory, 'controller');
  const candidate = path.join(directory, 'candidate');
  const bin = path.join(directory, 'bin');
  const data = path.join(directory, 'data.json');
  const git = (...args) => execFileSync('git', args, { cwd: controller, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    fs.mkdirSync(controller); fs.mkdirSync(bin);
    const files = Object.fromEntries(['Casks/bodhi.rb', 'Formula/jiandu.rb', 'Formula/nova.rb'].map(file => [file, fs.readFileSync(path.join(__dirname, '..', file), 'utf8')]));
    git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
    for (const [file, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(controller, file)), { recursive: true }); fs.writeFileSync(path.join(controller, file), text);
    }
    git('add', '.'); git('commit', '-qm', 'trusted base');
    const baseSha = git('rev-parse', 'HEAD');
    const releases = {
      bodhi: { version: '2027.1.1', assets: { arm: { sha256: readCask(files['Casks/bodhi.rb']).arm } } },
      ...Object.fromEntries(['jiandu', 'nova'].map(key => [key, { version: readFormula(key, files[`Formula/${key}.rb`]).version, assets: { archive: { ...readFormula(key, files[`Formula/${key}.rb`]) } } }])),
    };
    const rendered = renderFiles(files, releases);
    for (const [file, text] of Object.entries(rendered)) fs.writeFileSync(path.join(controller, file), text);
    git('add', '.'); git('commit', '-qm', 'candidate');
    const headSha = git('rev-parse', 'HEAD');
    const currentSnapshot = { ...snapshot, baseSha, headSha, treeSha: git('rev-parse', 'HEAD^{tree}'), branch: branchFor(releases), releases, baseFiles: files,
      baseHashes: Object.fromEntries(Object.entries(files).map(([file, text]) => [file, hash(text)])), candidateHashes: Object.fromEntries(Object.entries(rendered).map(([file, text]) => [file, hash(text)])), audit: { ...claim, controllerSha: baseSha } };
    git('worktree', 'add', '-q', '--detach', candidate, headSha); git('checkout', '-q', '--detach', baseSha);
    const currentPR = { ...pr, head: { ...pr.head, sha: headSha, ref: currentSnapshot.branch }, base: { ...pr.base, sha: baseSha } };
    const currentRun = { ...run, head_sha: baseSha };
    const evidence = { snapshot: currentSnapshot, pr: currentPR, run: currentRun, workflow, jobs: page(jobs.map(item => ({ ...item, head_sha: baseSha }))), artifact: { ...artifact, workflow_run: { id: 42, head_sha: baseSha } } };
    fs.writeFileSync(data, JSON.stringify(evidence));
    fs.writeFileSync(path.join(bin, 'gh'), [
      '#!/usr/bin/env node', 'const fs=require("node:fs"),path=require("node:path"); const d=JSON.parse(fs.readFileSync(process.env.TAP_PROOF_TEST_DATA)); const a=process.argv.slice(2);',
      'if(a[0]==="run"){fs.writeFileSync(path.join(a[a.indexOf("--dir")+1],"snapshot.json"),JSON.stringify(d.snapshot));process.exit(0);}',
      'const p=a[1]; let v;',
      'if(p.endsWith("/workflows/update-tap.yml"))v=d.workflow;else if(p.includes("/jobs?"))v=d.jobs;else if(p.includes("/artifacts?"))v={total_count:1,artifacts:[d.artifact]};else if(p.endsWith("/actions/runs/42"))v=d.run;else if(p.endsWith("/pulls/9"))v=d.pr;else if(p.endsWith("/git/ref/heads/main"))v={object:{sha:d.snapshot.baseSha}};else throw Error(p); console.log(JSON.stringify(v));',
    ].join('\n'));
    fs.chmodSync(path.join(bin, 'gh'), 0o755);
    const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, GITHUB_OUTPUT: '', TAP_PROOF_TEST_DATA: data,
      GITHUB_REPOSITORY: REPOSITORY, GITHUB_EVENT_NAME: 'pull_request', TAP_PR_NUMBER: '9', TAP_PR_HEAD: headSha, TAP_PR_BASE: baseSha,
      TAP_AUDIT_RUN_ID: '42', TAP_AUDIT_RUN_ATTEMPT: '1', TAP_AUDIT_TARGET: 'macos-15' };
    const script = path.join(__dirname, 'tap-audit-proof.cjs');
    const execute = (action, target = 'proof') => JSON.parse(execFileSync(process.execPath, [script, action, path.join(directory, target), candidate], { cwd: controller, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    assert.equal(execute('select').mode, 'reuse');
    assert.equal(execute('verify').job_id, 2);
    evidence.run.run_attempt = 2; evidence.run.status = 'completed'; evidence.run.conclusion = 'failure';
    evidence.jobs = page([...evidence.jobs.jobs, { ...job('merge', 7, 2, 'completed', 'failure'), head_sha: baseSha }]);
    fs.writeFileSync(data, JSON.stringify(evidence));
    assert.equal(execute('verify', 'merge-retry-proof').snapshot_attempt, 1);
    evidence.snapshot.candidateHashes['Casks/bodhi.rb'] = 'f'.repeat(64);
    fs.writeFileSync(data, JSON.stringify(evidence));
    assert.throws(() => execute('verify', 'tampered-proof'), /candidate was changed/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
