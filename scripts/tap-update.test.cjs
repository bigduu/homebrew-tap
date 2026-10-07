'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  admitFormulaRelease, admitRelease, assertOpenUpdates, assertPullRequest, assertRefreshable, assertReviews, branchFor, compareVersions,
  hash, readCask, readFormula, renderCask, renderFiles, renderPackage, verifyCandidate, verifyDownload,
} = require('./tap-update.cjs');

const SOURCE = 'a'.repeat(40);
const ARM = 'a'.repeat(64);
const INTEL = 'b'.repeat(64);
// Keep version fixtures stable after the real cask advances automatically.
const currentCask = fs.readFileSync(path.join(__dirname, '../Casks/bodhi.rb'), 'utf8')
  .replace(/^  version "[^"]+"$/m, '  version "2026.9.20"');
const baseFiles = {
  'Casks/bodhi.rb': currentCask,
  'Formula/jiandu.rb': fs.readFileSync(path.join(__dirname, '../Formula/jiandu.rb'), 'utf8')
    .replace(/^  url .+$/m, '  url "https://github.com/bigduu/Jiandu/archive/refs/tags/v0.3.0.tar.gz"'),
  'Formula/nova.rb': fs.readFileSync(path.join(__dirname, '../Formula/nova.rb'), 'utf8')
    .replace(/^  url .+$/m, '  url "https://github.com/bigduu/Nova/releases/download/v0.3.0/nova-v0.3.0-universal-apple-darwin.tar.gz"'),
};

function formulaFixture(key, version = '0.3.0') {
  const repository = key === 'jiandu' ? 'bigduu/Jiandu' : 'bigduu/Nova';
  const tag = `v${version}`;
  const name = `nova-${tag}-universal-apple-darwin.tar.gz`;
  return {
    id: key === 'jiandu' ? 124 : 125, draft: false, prerelease: false, tag_name: tag,
    target_commitish: key === 'jiandu' ? 'main' : 'master', published_at: '2026-10-07T00:00:00Z',
    html_url: `https://github.com/${repository}/releases/tag/${tag}`,
    assets: key === 'jiandu' ? [] : [{ id: 20, name, state: 'uploaded', size: 3,
      updated_at: '2026-10-07T00:00:00Z', digest: `sha256:${readFormula('nova', baseFiles['Formula/nova.rb']).sha256}`,
      browser_download_url: `https://github.com/${repository}/releases/download/${tag}/${name}` }],
  };
}

function releasesFixture() {
  const jiandu = admitFormulaRelease(formulaFixture('jiandu'), 'jiandu', SOURCE);
  jiandu.assets.archive = { ...jiandu.assets.archive, size: 3, sha256: readFormula('jiandu', baseFiles['Formula/jiandu.rb']).sha256 };
  return { bodhi: admitRelease(fixture()), jiandu, nova: admitFormulaRelease(formulaFixture('nova'), 'nova', SOURCE) };
}

function fixture(version = '2026.10.7') {
  const tag = `app-v${version}`;
  return {
    id: 123, draft: false, prerelease: false, tag_name: tag, target_commitish: SOURCE,
    published_at: '2026-10-07T00:00:00Z', html_url: `https://github.com/bigduu/Bodhi-AI/releases/tag/${tag}`,
    assets: ['aarch64', 'x64'].map((suffix, index) => {
      const name = `Bodhi.AI_${version}_${suffix}.dmg`;
      return {
        id: 10 + index, name, state: 'uploaded', size: 3, updated_at: '2026-10-07T00:00:00Z',
        digest: `sha256:${index ? INTEL : ARM}`,
        browser_download_url: `https://github.com/bigduu/Bodhi-AI/releases/download/${tag}/${name}`,
      };
    }),
  };
}

test('admits one fully uploaded stable release with exact source and both architecture assets', () => {
  const release = admitRelease(fixture());
  assert.equal(release.version, '2026.10.7');
  assert.equal(release.assets.arm.sha256, ARM);
  assert.equal(release.assets.intel.sha256, INTEL);
});

test('rejects draft, prerelease, moving source, malformed tags and missing/duplicate DMGs', () => {
  for (const alter of [
    r => { r.draft = true; }, r => { r.prerelease = true; },
    r => { r.target_commitish = 'main'; }, r => { r.tag_name = 'v2026.10.7'; },
    r => { r.tag_name = 'app-v2026.10.7-rc.1'; }, r => { r.assets.pop(); },
    r => { r.assets.push(r.assets[0]); }, r => { r.assets[0].state = 'new'; },
    r => { r.assets[0].digest = null; }, r => { r.assets[0].size = 0; },
    r => { r.assets[0].browser_download_url = 'https://example.com/bodhi.dmg'; },
  ]) {
    const release = fixture();
    alter(release);
    assert.throws(() => admitRelease(release));
  }
});

test('compares numeric versions across months and refuses a downgrade', () => {
  assert.equal(compareVersions('2026.10.1', '2026.9.30'), 1);
  assert.equal(compareVersions('2026.9.20', '2026.9.20'), 0);
  assert.throws(() => compareVersions('2026.09.20', '2026.9.20'));
  assert.throws(() => renderCask(currentCask, admitRelease(fixture('2026.1.1'))), /downgrade/);
});

test('changes only the cask version and two digests while preserving install behavior', () => {
  const next = renderCask(currentCask, admitRelease(fixture()));
  assert.deepEqual(readCask(next), { version: '2026.10.7', arm: ARM, intel: INTEL });
  const redact = value => value.replace(/^  version .+$/m, '').replace(/^  sha256 arm:.+\n         intel:.+$/m, '');
  assert.equal(redact(next), redact(currentCask));
  assert.throws(() => readCask(`${currentCask}\n  version "2026.1.1"\n`));
});

test('same version is a no-op only when both digests still match', () => {
  const current = readCask(currentCask);
  const raw = fixture(current.version);
  raw.assets[0].digest = `sha256:${current.arm}`;
  raw.assets[1].digest = `sha256:${current.intel}`;
  assert.equal(renderCask(currentCask, admitRelease(raw)), currentCask);
  raw.assets[0].digest = `sha256:${ARM}`;
  assert.throws(() => renderCask(currentCask, admitRelease(raw)), /digest changed/);
});

test('formula releases use resolved tags even when target_commitish names a moving branch', () => {
  for (const key of ['jiandu', 'nova']) {
    const release = admitFormulaRelease(formulaFixture(key), key, SOURCE);
    assert.equal(release.sourceSha, SOURCE);
    assert.equal(release.version, '0.3.0');
    assert.throws(() => admitFormulaRelease(formulaFixture(key), key, 'main'));
    assert.throws(() => admitFormulaRelease({ ...formulaFixture(key), prerelease: true }, key, SOURCE));
  }
  const raw = formulaFixture('nova');
  raw.assets[0].name = 'nova-development-app.zip';
  assert.throws(() => admitFormulaRelease(raw, 'nova', SOURCE), /Expected exactly one/);
});

test('formula updates change only archive URL/hash and preserve all dependencies and install behavior', () => {
  for (const key of ['jiandu', 'nova']) {
    const text = baseFiles[`Formula/${key}.rb`];
    const nextRelease = admitFormulaRelease(formulaFixture(key, '0.4.0'), key, SOURCE);
    if (key === 'jiandu') nextRelease.assets.archive.sha256 = ARM;
    const next = renderPackage(key, text, nextRelease);
    assert.equal(readFormula(key, next).version, '0.4.0');
    const redact = value => value.replace(/^  url .+$/m, '').replace(/^  sha256 .+$/m, '');
    assert.equal(redact(text), redact(next));
    assert.throws(() => renderPackage(key, text, { ...nextRelease, version: '0.2.0' }));
    const existing = releasesFixture()[key];
    assert.equal(renderPackage(key, text, existing), text);
    existing.assets.archive.sha256 = 'f'.repeat(64);
    assert.throws(() => renderPackage(key, text, existing), /digest changed/);
  }
});

test('verifies downloaded bytes and refuses digest/size/HTTP failures', async () => {
  const asset = { name: 'fixture.dmg', url: 'https://example.invalid/fixture', size: 3, sha256: hash('abc') };
  await verifyDownload(asset, async () => new Response('abc'));
  await assert.rejects(verifyDownload(asset, async () => new Response('abd')), /digest mismatch/);
  await assert.rejects(verifyDownload(asset, async () => new Response('abcd')), /size changed/);
  await assert.rejects(verifyDownload(asset, async () => new Response('ab')), /size mismatch/);
  await assert.rejects(verifyDownload(asset, async () => new Response('', { status: 404 })), /HTTP 404/);
});

test('permits one matching retry PR but rejects duplicate or competing version PRs', () => {
  assertOpenUpdates([], 'automation/bodhi-2026.10.7');
  const pr = { headRefName: 'automation/bodhi-2026.10.7' };
  assertOpenUpdates([pr], pr.headRefName);
  assert.throws(() => assertOpenUpdates([pr, pr], pr.headRefName), /Multiple/);
  assert.throws(() => assertOpenUpdates([{ headRefName: 'automation/bodhi-2026.10.8' }], pr.headRefName), /Another/);
});

test('merge gate rejects changed head/base, draft, closed and foreign PRs', () => {
  const snapshot = { branch: 'automation/bodhi-2026.10.7', headSha: SOURCE, baseSha: 'b'.repeat(40) };
  const pr = {
    state: 'open', draft: false,
    head: { ref: snapshot.branch, sha: snapshot.headSha, repo: { full_name: 'bigduu/homebrew-tap' } },
    base: { ref: 'main', sha: snapshot.baseSha, repo: { full_name: 'bigduu/homebrew-tap' } },
  };
  assertPullRequest(pr, snapshot);
  for (const alter of [
    p => { p.head.sha = p.base.sha; }, p => { p.base.sha = p.head.sha; },
    p => { p.state = 'closed'; }, p => { p.draft = true; },
    p => { p.head.repo.full_name = 'other/tap'; }, p => { p.base.ref = 'dev'; },
  ]) {
    const changed = structuredClone(pr);
    alter(changed);
    assert.throws(() => assertPullRequest(changed, snapshot));
  }
});

test('merge gate rejects requested changes, unresolved or truncated threads, and non-clean states', () => {
  const reviews = {
    mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN',
    reviewThreads: { nodes: [{ isResolved: true }], pageInfo: { hasNextPage: false } },
    latestReviews: { nodes: [{ state: 'APPROVED' }], pageInfo: { hasNextPage: false } },
    commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
  };
  assertReviews(reviews);
  for (const alter of [
    r => { r.reviewThreads.nodes[0].isResolved = false; },
    r => { r.latestReviews.nodes[0].state = 'CHANGES_REQUESTED'; },
    r => { r.reviewThreads.pageInfo.hasNextPage = true; },
    r => { r.latestReviews.pageInfo.hasNextPage = true; },
    r => { r.mergeable = 'UNKNOWN'; }, r => { r.mergeStateStatus = 'UNKNOWN'; },
    r => { r.reviewDecision = 'REVIEW_REQUIRED'; },
  ]) {
    const changed = structuredClone(reviews);
    alter(changed);
    assert.throws(() => assertReviews(changed));
  }
});

test('inline matrix can merge past optional approval-waiting PR checks but required checks remain blocking', () => {
  const optional = { __typename: 'CheckRun', name: 'Check tap', status: 'QUEUED', conclusion: null, isRequired: false };
  const reviews = {
    mergeable: 'MERGEABLE', mergeStateStatus: 'BLOCKED', reviewDecision: null,
    reviewThreads: { nodes: [], pageInfo: { hasNextPage: false } },
    latestReviews: { nodes: [], pageInfo: { hasNextPage: false } },
    commits: { nodes: [{ commit: { statusCheckRollup: { contexts: { nodes: [optional], pageInfo: { hasNextPage: false } } } } }] },
  };
  assertReviews(reviews);
  optional.isRequired = true;
  assert.throws(() => assertReviews(reviews), /has not completed/);
  optional.status = 'COMPLETED'; optional.conclusion = 'FAILURE';
  assert.throws(() => assertReviews(reviews), /did not pass/);
  optional.conclusion = 'SUCCESS';
  assertReviews(reviews);
});

test('candidate gate checks the exact one-commit cask update and detects unrelated changes', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bodhi-candidate-test-'));
  const original = process.cwd();
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init', '-q');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.invalid');
    fs.mkdirSync(path.join(directory, 'Casks'));
    fs.mkdirSync(path.join(directory, 'Formula'));
    for (const [file, text] of Object.entries(baseFiles)) fs.writeFileSync(path.join(directory, file), text);
    git('add', '.'); git('commit', '-qm', 'base');
    const baseSha = git('rev-parse', 'HEAD');
    const releases = releasesFixture();
    const nextFiles = renderFiles(baseFiles, releases);
    for (const [file, text] of Object.entries(nextFiles)) fs.writeFileSync(path.join(directory, file), text);
    git('config', 'user.name', 'github-actions[bot]');
    git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
    git('add', '.'); git('commit', '-qm', 'candidate');
    const snapshot = {
      schema: 2, repository: 'bigduu/homebrew-tap', baseSha, headSha: git('rev-parse', 'HEAD'),
      treeSha: git('rev-parse', 'HEAD^{tree}'), releases, branch: branchFor(releases), prNumber: 1, baseFiles,
      baseHashes: Object.fromEntries(Object.entries(baseFiles).map(([file, text]) => [file, hash(text)])),
      candidateHashes: Object.fromEntries(Object.entries(nextFiles).map(([file, text]) => [file, hash(text)])),
    };
    process.chdir(directory);
    verifyCandidate(snapshot);
    assert.throws(() => verifyCandidate({ ...snapshot, headSha: baseSha }), /prepared candidate/);
    git('checkout', '--detach', baseSha);
    fs.writeFileSync(path.join(directory, 'README.md'), 'Another main update');
    git('add', '.'); git('commit', '-qm', 'advance main');
    const currentBase = git('rev-parse', 'HEAD');
    git('checkout', '--detach', snapshot.headSha);
    const live = {
      number: 1, state: 'open', draft: false, user: { login: 'github-actions[bot]' },
      head: { ref: snapshot.branch, sha: snapshot.headSha, repo: { full_name: 'bigduu/homebrew-tap' } },
      base: { ref: 'main', sha: currentBase, repo: { full_name: 'bigduu/homebrew-tap' } },
    };
    const reviews = { reviewThreads: { nodes: [], pageInfo: { hasNextPage: false } }, latestReviews: { nodes: [], pageInfo: { hasNextPage: false } } };
    assertRefreshable(snapshot, live, reviews, currentBase);
    assert.throws(() => assertRefreshable(snapshot, { ...live, user: { login: 'human' } }, reviews, currentBase), /bot PR/);
    assert.throws(() => assertRefreshable(snapshot, live, { ...reviews, latestReviews: { nodes: [{ state: 'CHANGES_REQUESTED' }], pageInfo: { hasNextPage: false } } }, currentBase), /requested changes/);
    git('config', 'user.name', 'Human'); git('config', 'user.email', 'human@example.invalid');
    git('commit', '--amend', '--no-edit', '--reset-author', '-q');
    const humanSnapshot = { ...snapshot, headSha: git('rev-parse', 'HEAD') };
    assert.throws(() => assertRefreshable(humanSnapshot, { ...live, head: { ...live.head, sha: humanSnapshot.headSha } }, reviews, currentBase), /Human-edited/);
    git('checkout', '--detach', snapshot.headSha);
    fs.writeFileSync(path.join(directory, 'unrelated.txt'), 'not part of the update');
    git('add', '.'); git('commit', '--amend', '--no-edit', '-q');
    const changed = { ...snapshot, headSha: git('rev-parse', 'HEAD'), treeSha: git('rev-parse', 'HEAD^{tree}') };
    assert.throws(() => verifyCandidate(changed), /Unexpected files/);
  } finally {
    process.chdir(original);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('matching three releases prepare is read-only and verifies Jiandu source bytes without a PR', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bodhi-noop-test-'));
  try {
    fs.mkdirSync(path.join(directory, 'Casks'));
    fs.mkdirSync(path.join(directory, 'Formula'));
    const files = { ...baseFiles, 'Formula/jiandu.rb': baseFiles['Formula/jiandu.rb'].replace(/^  sha256 .+$/m, `  sha256 "${hash('abc')}"`) };
    for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(directory, file), text);
    const current = readCask(currentCask);
    const raw = fixture(current.version);
    raw.assets[0].digest = `sha256:${current.arm}`;
    raw.assets[1].digest = `sha256:${current.intel}`;
    const fakeGh = path.join(directory, 'gh');
    fs.writeFileSync(fakeGh, '#!/usr/bin/env node\nconst fs = require("node:fs");\nfs.appendFileSync(process.env.TAP_TEST_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");\nconst releases = JSON.parse(process.env.TAP_TEST_RELEASES);\nconst endpoint = process.argv[3];\nconsole.log(JSON.stringify(endpoint.includes("/git/ref/tags/") ? {object:{type:"commit",sha:process.env.TAP_TEST_TAG_SHA || "a".repeat(40)}} : releases[endpoint.split("/")[2]]));\n');
    fs.chmodSync(fakeGh, 0o755);
    const snapshot = path.join(directory, 'snapshot.json');
    const log = path.join(directory, 'calls.jsonl');
    const preload = path.join(directory, 'fetch-mock.cjs');
    fs.writeFileSync(preload, 'globalThis.fetch = async url => { require("node:fs").appendFileSync(process.env.TAP_TEST_LOG, JSON.stringify(["download",url])+"\\n"); return new Response("abc"); };\n');
    const options = { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: {
      ...process.env, PATH: `${directory}${path.delimiter}${process.env.PATH}`, GITHUB_OUTPUT: '',
      TAP_TEST_RELEASES: JSON.stringify({ 'Bodhi-AI': raw, Jiandu: formulaFixture('jiandu'), Nova: formulaFixture('nova') }),
      TAP_TEST_LOG: log, NODE_OPTIONS: `--require=${preload}`,
    } };
    const args = [path.join(__dirname, 'tap-update.cjs'), 'prepare', snapshot];
    const output = execFileSync(process.execPath, args, options);
    assert.equal(JSON.parse(output).changed, false);
    assert.equal(fs.existsSync(snapshot), false);
    const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(calls.filter(call => call[0] === 'api').length, 6);
    assert.ok(calls.filter(call => call[0] === 'api').every(call => call.at(-1) === 'GET'));
    assert.deepEqual(calls.filter(call => call[0] === 'download'), [['download', 'https://github.com/bigduu/Jiandu/archive/refs/tags/v0.3.0.tar.gz']]);
    for (const [file, text] of Object.entries(files)) assert.equal(fs.readFileSync(path.join(directory, file), 'utf8'), text);
    assert.throws(() => execFileSync(process.execPath, args, { ...options, env: { ...options.env, TAP_TEST_TAG_SHA: 'c'.repeat(40) } }), /exact source/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('prepare creates one PR, reuses it, safely refreshes a bot candidate, and preserves a human-edited stale head', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tap-prepare-test-'));
  const worktree = path.join(directory, 'worktree');
  const remote = path.join(directory, 'remote.git');
  const bin = path.join(directory, 'bin');
  const snapshotPath = path.join(directory, 'snapshot.json');
  const prFile = path.join(directory, 'pr.json');
  const logFile = path.join(directory, 'calls.jsonl');
  const git = (...args) => execFileSync('git', args, { cwd: worktree, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    fs.mkdirSync(worktree); fs.mkdirSync(bin);
    execFileSync('git', ['init', '--bare', '-q', remote]);
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
    const files = { ...baseFiles };
    for (const key of ['jiandu', 'nova']) files[`Formula/${key}.rb`] = files[`Formula/${key}.rb`].replace(/^  sha256 .+$/m, `  sha256 "${hash('abc')}"`);
    for (const [file, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(worktree, file)), { recursive: true });
      fs.writeFileSync(path.join(worktree, file), text);
    }
    git('add', '.'); git('commit', '-qm', 'base');
    git('remote', 'add', 'origin', remote); git('push', '-q', 'origin', 'main');
    const bodhi = fixture();
    for (const asset of bodhi.assets) asset.digest = `sha256:${hash('abc')}`;
    const nova = formulaFixture('nova'); nova.assets[0].digest = `sha256:${hash('abc')}`;
    const fakeGh = path.join(bin, 'gh');
    fs.writeFileSync(fakeGh, [
      '#!/usr/bin/env node', 'const fs=require("node:fs"); const {execFileSync}=require("node:child_process");',
      'const a=process.argv.slice(2); fs.appendFileSync(process.env.TAP_TEST_LOG,JSON.stringify(a)+"\\n");',
      'const value=flag=>a[a.indexOf(flag)+1]; const field=name=>a.find(x=>x.startsWith(name+"="))?.slice(name.length+1);',
      'const state=fs.existsSync(process.env.TAP_TEST_PR)?JSON.parse(fs.readFileSync(process.env.TAP_TEST_PR)):null;',
      'const head=branch=>execFileSync("git",["--git-dir",process.env.TAP_TEST_REMOTE,"rev-parse","refs/heads/"+branch],{encoding:"utf8"}).trim();',
      'const pr=branch=>({number:1,state:"open",draft:false,user:{login:"github-actions[bot]"},html_url:"https://github.com/bigduu/homebrew-tap/pull/1",head:{ref:branch,sha:head(branch),repo:{full_name:"bigduu/homebrew-tap"}},base:{ref:"main",sha:process.env.TAP_TEST_BASE,repo:{full_name:"bigduu/homebrew-tap"}}});',
      'let result; if(a[0]==="pr"){result=value("--state")==="open"&&state?[{number:1,url:state.html_url,headRefName:state.head.ref,headRefOid:head(state.head.ref),baseRefOid:process.env.TAP_TEST_BASE,isDraft:false}]:[];}',
      'else if(a[1]==="graphql"){result={data:{repository:{pullRequest:{reviewThreads:{nodes:[],pageInfo:{hasNextPage:false}},latestReviews:{nodes:[],pageInfo:{hasNextPage:false}}}}}};}',
      'else if(a[1].includes("/git/ref/tags/")){result={object:{type:"commit",sha:"a".repeat(40)}};}',
      'else if(a[1].endsWith("/releases/latest")){result=JSON.parse(process.env.TAP_TEST_RELEASES)[a[1].split("/")[2]];}',
      'else if(a[1].endsWith("/git/ref/heads/main")){result={object:{sha:process.env.TAP_TEST_BASE}};}',
      'else if(a[1].endsWith("/pulls")&&value("--method")==="POST"){result=pr(field("head"));fs.writeFileSync(process.env.TAP_TEST_PR,JSON.stringify(result));}',
      'else if(a[1].endsWith("/pulls/1")&&state){result=pr(state.head.ref);}',
      'else{throw Error("Unexpected fake gh call: "+JSON.stringify(a));} console.log(JSON.stringify(result));',
    ].join('\n'));
    fs.chmodSync(fakeGh, 0o755);
    const preload = path.join(directory, 'fetch.cjs');
    fs.writeFileSync(preload, 'globalThis.fetch=async()=>new Response("abc");\n');
    const env = {
      ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, NODE_OPTIONS: `--require=${preload}`,
      GITHUB_REPOSITORY: 'bigduu/homebrew-tap', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_OUTPUT: '',
      TAP_TEST_REMOTE: remote, TAP_TEST_BASE: git('rev-parse', 'main'), TAP_TEST_PR: prFile, TAP_TEST_LOG: logFile,
      TAP_TEST_RELEASES: JSON.stringify({ 'Bodhi-AI': bodhi, Jiandu: formulaFixture('jiandu'), Nova: nova }),
    };
    const prepare = () => JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'tap-update.cjs'), 'prepare', snapshotPath], {
      cwd: worktree, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env,
    }));
    const initial = prepare();
    assert.equal(initial.changed, true);
    const first = JSON.parse(fs.readFileSync(snapshotPath));
    assert.equal(git('rev-parse', 'HEAD^'), env.TAP_TEST_BASE);
    git('checkout', '-q', 'main');
    assert.equal(prepare().candidate, first.headSha);
    git('checkout', '-q', 'main');
    fs.writeFileSync(path.join(worktree, 'README.md'), 'Another tap change');
    git('add', '.'); git('commit', '-qm', 'advance main'); git('push', '-q', 'origin', 'main');
    env.TAP_TEST_BASE = git('rev-parse', 'main');
    const refreshed = prepare();
    assert.notEqual(refreshed.candidate, first.headSha);
    assert.equal(git('rev-parse', 'HEAD^'), env.TAP_TEST_BASE);
    assert.equal(git('ls-remote', '--heads', 'origin', first.branch).split('\t')[0], refreshed.candidate);
    assert.equal(fs.readFileSync(logFile, 'utf8').trim().split('\n').map(JSON.parse).filter(a => a[0] === 'api' && a[1].endsWith('/pulls') && a.includes('POST')).length, 1);
    git('config', 'user.name', 'Human'); git('config', 'user.email', 'human@example.invalid');
    git('commit', '--amend', '--no-edit', '--reset-author', '-q');
    const humanHead = git('rev-parse', 'HEAD'); git('push', '-q', '--force', 'origin', `HEAD:refs/heads/${first.branch}`);
    git('checkout', '-q', 'main');
    fs.writeFileSync(path.join(worktree, 'README.md'), 'Main advanced again');
    git('add', '.'); git('commit', '-qm', 'advance main again'); git('push', '-q', 'origin', 'main');
    env.TAP_TEST_BASE = git('rev-parse', 'main');
    assert.throws(prepare, /Human-edited/);
    assert.equal(git('ls-remote', '--heads', 'origin', first.branch).split('\t')[0], humanHead);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
