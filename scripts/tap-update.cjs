#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPOSITORY = 'bigduu/homebrew-tap';
const UPSTREAM = 'bigduu/Bodhi-AI';
const CASK = 'Casks/bodhi.rb';
const PRODUCTS = {
  bodhi: { repository: UPSTREAM, path: CASK, prefix: 'app-v' },
  jiandu: { repository: 'bigduu/Jiandu', path: 'Formula/jiandu.rb', prefix: 'v' },
  nova: { repository: 'bigduu/Nova', path: 'Formula/nova.rb', prefix: 'v' },
};
const PATHS = Object.values(PRODUCTS).map(product => product.path).sort();
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const VERSION = /^(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})$/;

function hash(text) {
  return createHash('sha256').update(text).digest('hex');
}

function compareVersions(left, right) {
  assert.match(left, VERSION, 'Invalid stable numeric version');
  assert.match(right, VERSION, 'Invalid stable numeric version');
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return Math.sign(a[i] - b[i]);
  }
  return 0;
}

function readCask(text) {
  const versions = [...text.matchAll(/^  version "([^"]+)"$/gm)];
  const digests = [...text.matchAll(/^  sha256 arm:   "([a-f0-9]{64})",\n         intel: "([a-f0-9]{64})"$/gm)];
  assert.equal(versions.length, 1, 'Expected exactly one Bodhi cask version');
  assert.equal(digests.length, 1, 'Expected exactly one architecture digest pair');
  assert.match(versions[0][1], VERSION);
  assert.ok(text.includes('cask "bodhi" do\n'), 'Unexpected cask identity');
  assert.ok(text.includes('  arch arm: "aarch64", intel: "x64"\n'), 'Unexpected architecture mapping');
  assert.ok(text.includes('  url "https://github.com/bigduu/Bodhi-AI/releases/download/app-v#{version}/Bodhi.AI_#{version}_#{arch}.dmg"\n'), 'Unexpected release URL');
  return { version: versions[0][1], arm: digests[0][1], intel: digests[0][2] };
}

function admitRelease(release) {
  assert.equal(release.draft, false, 'Draft releases cannot update the tap');
  assert.equal(release.prerelease, false, 'Prereleases cannot update the tap');
  assert.ok(Number.isSafeInteger(release.id) && release.id > 0, 'Missing release id');
  assert.equal(typeof release.published_at, 'string', 'Missing publication time');
  assert.ok(Number.isFinite(Date.parse(release.published_at)), 'Invalid publication time');
  assert.match(release.tag_name, /^app-v(.+)$/, 'Unexpected release tag');
  const version = release.tag_name.slice(5);
  assert.match(version, VERSION, 'Release tag must contain a stable numeric version');
  assert.match(release.target_commitish, SHA, 'Release must name an exact source commit');
  assert.equal(release.html_url, `https://github.com/${UPSTREAM}/releases/tag/${release.tag_name}`);
  assert.ok(Array.isArray(release.assets), 'Missing release assets');
  const assets = {};
  for (const [arch, suffix] of [['arm', 'aarch64'], ['intel', 'x64']]) {
    const name = `Bodhi.AI_${version}_${suffix}.dmg`;
    const matches = release.assets.filter(asset => asset.name === name);
    assert.equal(matches.length, 1, `Expected exactly one ${name}`);
    const asset = matches[0];
    assert.ok(Number.isSafeInteger(asset.id) && asset.id > 0, 'Missing asset id');
    assert.equal(asset.state, 'uploaded', 'Release asset is not fully uploaded');
    assert.ok(Number.isSafeInteger(asset.size) && asset.size > 0, 'Invalid asset size');
    assert.equal(typeof asset.updated_at, 'string', 'Missing asset update time');
    assert.ok(Number.isFinite(Date.parse(asset.updated_at)), 'Invalid asset update time');
    assert.match(asset.digest || '', /^sha256:[a-f0-9]{64}$/, 'Missing SHA-256 asset digest');
    assert.equal(asset.browser_download_url, `https://github.com/${UPSTREAM}/releases/download/${release.tag_name}/${name}`);
    assets[arch] = {
      id: asset.id, name, size: asset.size, updatedAt: asset.updated_at,
      url: asset.browser_download_url, sha256: asset.digest.slice(7),
    };
  }
  return {
    id: release.id, version, tag: release.tag_name, sourceSha: release.target_commitish,
    publishedAt: release.published_at, url: release.html_url, assets,
  };
}

function renderCask(text, release) {
  assert.match(release.version, VERSION);
  assert.match(release.assets.arm.sha256, HASH);
  assert.match(release.assets.intel.sha256, HASH);
  const current = readCask(text);
  assert.ok(compareVersions(release.version, current.version) >= 0, 'Refusing to downgrade Bodhi');
  if (release.version === current.version) {
    assert.equal(current.arm, release.assets.arm.sha256, 'Published ARM digest changed at the current version');
    assert.equal(current.intel, release.assets.intel.sha256, 'Published Intel digest changed at the current version');
    return text;
  }
  return text.replace(/^  version "[^"]+"$/m, `  version "${release.version}"`)
    .replace(/^  sha256 arm:   "[a-f0-9]{64}",\n         intel: "[a-f0-9]{64}"$/m,
      `  sha256 arm:   "${release.assets.arm.sha256}",\n         intel: "${release.assets.intel.sha256}"`);
}

async function downloadIdentity(asset, fetcher = fetch) {
  const response = await fetcher(asset.url, { signal: AbortSignal.timeout(120_000) });
  assert.ok(response.ok, `Download failed for ${asset.name}: HTTP ${response.status}`);
  assert.ok(response.body, `Empty response for ${asset.name}`);
  const digest = createHash('sha256');
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (asset.size !== undefined) assert.ok(size <= asset.size, `Asset size changed for ${asset.name}`);
    digest.update(chunk);
  }
  assert.ok(size > 0, `Empty archive for ${asset.name}`);
  if (asset.size !== undefined) assert.equal(size, asset.size, `Asset size mismatch for ${asset.name}`);
  const sha256 = digest.digest('hex');
  if (asset.sha256 !== undefined) assert.equal(sha256, asset.sha256, `Asset digest mismatch for ${asset.name}`);
  return { ...asset, size, sha256 };
}

async function verifyDownload(asset, fetcher = fetch) {
  await downloadIdentity(asset, fetcher);
}

function command(program, args) {
  return execFileSync(program, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
const git = (...args) => command('git', args);
function api(endpoint, method = 'GET', fields) {
  const args = ['api', endpoint, '--method', method];
  for (const [key, value] of Object.entries(fields || {})) args.push('-f', `${key}=${value}`);
  const result = command('gh', args);
  return result ? JSON.parse(result) : null;
}
const mainSha = () => api(`repos/${REPOSITORY}/git/ref/heads/main`).object.sha;
function resolveTag(repository, tag) {
  let target = api(`repos/${repository}/git/ref/tags/${tag}`).object;
  for (let depth = 0; target.type === 'tag' && depth < 5; depth++) {
    assert.match(target.sha, SHA, 'Invalid annotated tag identity');
    target = api(`repos/${repository}/git/tags/${target.sha}`).object;
  }
  assert.equal(target.type, 'commit', 'Release tag does not resolve to a commit');
  assert.match(target.sha, SHA, 'Invalid release tag commit');
  return target.sha;
}

function admitFormulaRelease(raw, key, sourceSha) {
  const product = PRODUCTS[key];
  assert.ok(key === 'jiandu' || key === 'nova');
  assert.equal(raw.draft, false, 'Draft releases cannot update the tap');
  assert.equal(raw.prerelease, false, 'Prereleases cannot update the tap');
  assert.ok(Number.isSafeInteger(raw.id) && raw.id > 0);
  assert.ok(typeof raw.published_at === 'string' && Number.isFinite(Date.parse(raw.published_at)));
  assert.match(raw.tag_name, /^v(.+)$/, 'Unexpected formula release tag');
  const version = raw.tag_name.slice(1);
  assert.match(version, VERSION, 'Formula release must contain a stable numeric version');
  assert.match(sourceSha, SHA, 'Formula tag must resolve to an exact commit');
  assert.equal(raw.html_url, `https://github.com/${product.repository}/releases/tag/${raw.tag_name}`);
  const release = { id: raw.id, version, tag: raw.tag_name, sourceSha, publishedAt: raw.published_at, url: raw.html_url, assets: {} };
  if (key === 'jiandu') {
    release.assets.archive = { name: `Jiandu-${version}.tar.gz`, url: `https://github.com/${product.repository}/archive/refs/tags/${raw.tag_name}.tar.gz` };
  } else {
    const name = `nova-${raw.tag_name}-universal-apple-darwin.tar.gz`;
    const matches = raw.assets.filter(asset => asset.name === name);
    assert.equal(matches.length, 1, `Expected exactly one ${name}`);
    const asset = matches[0];
    assert.ok(Number.isSafeInteger(asset.id) && asset.id > 0);
    assert.equal(asset.state, 'uploaded');
    assert.ok(Number.isSafeInteger(asset.size) && asset.size > 0);
    assert.ok(typeof asset.updated_at === 'string' && Number.isFinite(Date.parse(asset.updated_at)));
    assert.match(asset.digest || '', /^sha256:[a-f0-9]{64}$/, 'Missing Nova archive digest');
    assert.equal(asset.browser_download_url, `https://github.com/${product.repository}/releases/download/${raw.tag_name}/${name}`);
    release.assets.archive = { id: asset.id, name, size: asset.size, updatedAt: asset.updated_at, url: asset.browser_download_url, sha256: asset.digest.slice(7) };
  }
  return release;
}

async function latestReleases() {
  const releases = {};
  for (const [key, product] of Object.entries(PRODUCTS)) {
    const raw = api(`repos/${product.repository}/releases/latest`);
    // Admit the tag syntax before incorporating it in a subsequent API request.
    assert.equal(typeof raw.tag_name, 'string');
    assert.match(raw.tag_name, key === 'bodhi' ? /^app-v\d+\.\d+\.\d+$/ : /^v\d+\.\d+\.\d+$/);
    const sourceSha = resolveTag(product.repository, raw.tag_name);
    const release = key === 'bodhi' ? admitRelease(raw) : admitFormulaRelease(raw, key, sourceSha);
    assert.equal(release.sourceSha, sourceSha, 'Release tag moved away from its exact source');
    if (key === 'jiandu') release.assets.archive = await downloadIdentity(release.assets.archive);
    releases[key] = release;
  }
  return releases;
}

function readFormula(key, text) {
  const urls = [...text.matchAll(/^  url "([^"]+)"$/gm)];
  const hashes = [...text.matchAll(/^  sha256 "([a-f0-9]{64})"$/gm)];
  assert.equal(urls.length, 1, 'Expected exactly one formula archive URL');
  assert.equal(hashes.length, 1, 'Expected exactly one formula archive hash');
  const match = key === 'jiandu'
    ? urls[0][1].match(/^https:\/\/github\.com\/bigduu\/Jiandu\/archive\/refs\/tags\/v([^/]+)\.tar\.gz$/)
    : urls[0][1].match(/^https:\/\/github\.com\/bigduu\/Nova\/releases\/download\/v([^/]+)\/nova-v([^/]+)-universal-apple-darwin\.tar\.gz$/);
  assert.ok(match, 'Unexpected formula archive URL');
  assert.match(match[1], VERSION);
  if (key === 'nova') assert.equal(match[1], match[2], 'Nova archive and release versions disagree');
  return { version: match[1], url: urls[0][1], sha256: hashes[0][1] };
}

function renderPackage(key, text, release) {
  if (key === 'bodhi') return renderCask(text, release);
  const current = readFormula(key, text);
  const asset = release.assets.archive;
  assert.match(release.version, VERSION);
  assert.match(asset.sha256, HASH);
  assert.equal(asset.url, key === 'jiandu'
    ? `https://github.com/bigduu/Jiandu/archive/refs/tags/v${release.version}.tar.gz`
    : `https://github.com/bigduu/Nova/releases/download/v${release.version}/nova-v${release.version}-universal-apple-darwin.tar.gz`);
  assert.ok(compareVersions(release.version, current.version) >= 0, `Refusing to downgrade ${key}`);
  if (release.version === current.version) {
    assert.equal(current.url, asset.url, `Published ${key} URL changed at the current version`);
    assert.equal(current.sha256, asset.sha256, `Published ${key} digest changed at the current version`);
    return text;
  }
  return text.replace(/^  url "[^"]+"$/m, `  url "${asset.url}"`)
    .replace(/^  sha256 "[a-f0-9]{64}"$/m, `  sha256 "${asset.sha256}"`);
}

function renderFiles(baseFiles, releases) {
  assert.deepEqual(Object.keys(baseFiles).sort(), PATHS, 'Unexpected snapshot files');
  assert.deepEqual(Object.keys(releases).sort(), Object.keys(PRODUCTS).sort(), 'Unexpected release set');
  const result = {};
  for (const [key, product] of Object.entries(PRODUCTS)) result[product.path] = renderPackage(key, baseFiles[product.path], releases[key]);
  return result;
}

function branchFor(releases) {
  return `automation/tap-${hash(JSON.stringify(releases)).slice(0, 16)}`;
}

function releaseSummary(releases) {
  return Object.entries(releases).map(([key, release]) => `${key} ${release.version}`).join(', ');
}
function output(values) {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join(''));
  }
  console.log(JSON.stringify(values));
}
function assertMainRun() {
  assert.equal(process.env.GITHUB_REPOSITORY, REPOSITORY, 'Updater may only mutate its own tap');
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main', 'Updater may only run from main');
  assert.ok(['schedule', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME), 'Unexpected update trigger');
}

function openUpdates() {
  return JSON.parse(command('gh', ['pr', 'list', '--repo', REPOSITORY, '--base', 'main', '--state', 'open',
    '--limit', '100', '--json', 'number,url,headRefName,headRefOid,baseRefOid,isDraft']))
    .filter(pr => pr.headRefName.startsWith('automation/tap-'));
}

function assertOpenUpdates(updates, branch) {
  assert.ok(updates.length <= 1, 'Multiple automated tap PRs need review');
  assert.ok(updates.every(pr => pr.headRefName === branch), 'Another tap release PR is still open');
}

function assertReviewClear(reviewState) {
  assert.equal(reviewState.reviewThreads.pageInfo.hasNextPage, false, 'Too many review threads to verify');
  assert.ok(reviewState.reviewThreads.nodes.every(thread => thread.isResolved), 'Version PR has unresolved review threads');
  assert.equal(reviewState.latestReviews.pageInfo.hasNextPage, false, 'Too many reviews to verify');
  assert.ok(reviewState.latestReviews.nodes.every(review => review.state !== 'CHANGES_REQUESTED'), 'Version PR has requested changes');
}

function readReviews(prNumber) {
  const query = `query { repository(owner:"bigduu",name:"homebrew-tap") { pullRequest(number:${prNumber}) { mergeable mergeStateStatus reviewDecision reviewThreads(first:100) { nodes { isResolved } pageInfo { hasNextPage } } latestReviews(first:100) { nodes { state } pageInfo { hasNextPage } } commits(last:1) { nodes { commit { statusCheckRollup { contexts(first:100) { nodes { __typename ... on CheckRun { name status conclusion isRequired(pullRequestNumber:${prNumber}) } ... on StatusContext { context state isRequired(pullRequestNumber:${prNumber}) } } pageInfo { hasNextPage } } } } } } } } }`;
  return api('graphql', 'POST', { query }).data.repository.pullRequest;
}

function assertRefreshable(snapshot, pr, reviews, currentBase) {
  verifyCandidate(snapshot);
  assertPullRequest(pr, { ...snapshot, baseSha: currentBase });
  assert.equal(pr.user.login, 'github-actions[bot]', 'Only the updater bot PR can be refreshed');
  assertReviewClear(reviews);
  const bot = 'github-actions[bot]\n41898282+github-actions[bot]@users.noreply.github.com';
  assert.equal(git('show', '-s', '--format=%an%n%ae%n%cn%n%ce', 'HEAD'), `${bot}\n${bot}`, 'Human-edited candidate must not be rewritten');
  git('merge-base', '--is-ancestor', snapshot.baseSha, currentBase);
}

function commitCandidate(branch, baseSha, candidates) {
  git('checkout', '-B', branch, baseSha);
  for (const [file, text] of Object.entries(candidates)) fs.writeFileSync(file, text);
  git('config', 'user.name', 'github-actions[bot]');
  git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
  git('add', '--', ...PATHS);
  git('commit', '-m', 'chore: update tap stable releases');
}

function verifyCandidate(snapshot) {
  assert.equal(snapshot.schema, 2, 'Unexpected snapshot schema');
  assert.equal(snapshot.repository, REPOSITORY);
  for (const sha of [snapshot.baseSha, snapshot.headSha, snapshot.treeSha]) assert.match(sha, SHA);
  assert.equal(snapshot.branch, branchFor(snapshot.releases));
  assert.ok(Number.isSafeInteger(snapshot.prNumber) && snapshot.prNumber > 0);
  const expected = renderFiles(snapshot.baseFiles, snapshot.releases);
  const changed = PATHS.filter(file => expected[file] !== snapshot.baseFiles[file]);
  assert.ok(changed.length > 0, 'Snapshot must describe a version update');
  for (const file of PATHS) {
    assert.match(snapshot.baseHashes[file], HASH);
    assert.match(snapshot.candidateHashes[file], HASH);
    assert.equal(hash(snapshot.baseFiles[file]), snapshot.baseHashes[file], 'Snapshot base file was changed');
    assert.equal(hash(expected[file]), snapshot.candidateHashes[file], 'Snapshot candidate was changed');
  }
  assert.equal(git('rev-parse', 'HEAD'), snapshot.headSha, 'Audit checkout is not the prepared candidate');
  assert.equal(git('rev-parse', 'HEAD^{tree}'), snapshot.treeSha, 'Candidate tree changed');
  assert.equal(git('rev-list', '--parents', '-n', '1', 'HEAD'), `${snapshot.headSha} ${snapshot.baseSha}`, 'Candidate must be one commit on the prepared base');
  assert.deepEqual(git('diff', '--name-only', snapshot.baseSha, snapshot.headSha).split('\n').sort(), changed, 'Unexpected files in the update');
  for (const file of PATHS) {
    assert.equal(command('git', ['show', `${snapshot.baseSha}:${file}`]) + '\n', snapshot.baseFiles[file], 'Prepared base file changed');
    assert.equal(fs.readFileSync(file, 'utf8'), expected[file], 'Candidate is not the prepared version/hash update');
  }
  assert.equal(git('status', '--porcelain'), '', 'Candidate checkout is dirty');
}

async function prepare(snapshotPath, probe = false) {
  const baseFiles = Object.fromEntries(PATHS.map(file => [file, fs.readFileSync(file, 'utf8')]));
  const releases = await latestReleases();
  const candidates = renderFiles(baseFiles, releases);
  if (PATHS.every(file => candidates[file] === baseFiles[file])) {
    output({ changed: false, versions: releaseSummary(releases), reason: 'All packages match the latest stable releases, asset digests and Jiandu source archive hash' });
    return;
  }
  await verifyAllDownloads(releases);
  assert.deepEqual(await latestReleases(), releases, 'Latest releases changed during asset verification');
  if (probe) {
    output({ changed: true, versions: releaseSummary(releases), reason: 'Read-only probe verified all selected release downloads' });
    return;
  }
  assertMainRun();
  const baseSha = mainSha();
  assert.match(baseSha, SHA);
  assert.equal(git('rev-parse', 'HEAD'), baseSha, 'Prepare checkout is no longer the exact main base');
  assert.equal(git('status', '--porcelain'), '', 'Prepare checkout is dirty');
  const branch = branchFor(releases);
  const updates = openUpdates();
  assertOpenUpdates(updates, branch);
  const remoteBranch = git('ls-remote', '--heads', 'origin', `refs/heads/${branch}`);
  let refreshHead;
  if (remoteBranch) {
    git('fetch', 'origin', `refs/heads/${branch}`);
    git('checkout', '--detach', 'FETCH_HEAD');
    const oldHead = git('rev-parse', 'HEAD');
    const oldBase = git('rev-parse', 'HEAD^');
    if (oldBase !== baseSha) {
      assert.equal(updates.length, 1, 'A stale orphan branch requires maintainer review');
      const oldFiles = Object.fromEntries(PATHS.map(file => [file, command('git', ['show', `${oldBase}:${file}`]) + '\n']));
      const oldSnapshot = snapshotFor(oldBase, releases, oldFiles, updates[0].number);
      assertRefreshable(oldSnapshot, api(`repos/${REPOSITORY}/pulls/${updates[0].number}`), readReviews(updates[0].number), baseSha);
      refreshHead = oldHead;
      commitCandidate(branch, baseSha, candidates);
    }
  } else {
    assert.equal(updates.length, 0, 'Existing PR has no matching branch');
    commitCandidate(branch, baseSha, candidates);
  }
  const headSha = git('rev-parse', 'HEAD');
  const snapshot = snapshotFor(baseSha, releases, baseFiles, 1);
  verifyCandidate(snapshot);
  assert.equal(mainSha(), baseSha, 'Main moved before PR preparation');
  assert.deepEqual(await latestReleases(), releases, 'Latest releases changed before PR preparation');
  if (refreshHead) {
    const pr = api(`repos/${REPOSITORY}/pulls/${updates[0].number}`);
    assertPullRequest(pr, { ...snapshot, headSha: refreshHead });
    assertReviewClear(readReviews(pr.number));
    git('push', `--force-with-lease=refs/heads/${branch}:${refreshHead}`, 'origin', `HEAD:refs/heads/${branch}`);
  } else if (!remoteBranch) {
    git('push', 'origin', `HEAD:refs/heads/${branch}`);
  }
  let pr = updates[0];
  if (!pr) {
    const closed = JSON.parse(command('gh', ['pr', 'list', '--repo', REPOSITORY, '--state', 'closed',
      '--head', branch, '--limit', '1', '--json', 'number']));
    assert.equal(closed.length, 0, 'A closed version PR requires maintainer review before retrying');
    try {
      pr = api(`repos/${REPOSITORY}/pulls`, 'POST', {
        head: branch, base: 'main', title: `chore: update tap releases (${releaseSummary(releases)})`,
        body: `Update the tap to the latest published stable releases:\n\n${Object.entries(releases).map(([key, release]) => `- ${key}: [${release.tag}](${release.url}), source ${release.sourceSha}`).join('\n')}\n\nAll selected downloads are SHA-256 verified. The updater checks this exact candidate on ARM and Intel before merging. Only package URLs, versions and hashes change.\n\nPrepared base: ${baseSha}\nCandidate: ${headSha}\n`,
      });
    } catch (error) {
      // A network failure may follow a successful write; read back before retrying.
      pr = openUpdates().find(item => item.headRefName === branch);
      if (!pr) throw error;
    }
  }
  snapshot.prNumber = pr.number;
  snapshot.prUrl = pr.html_url || pr.url;
  const live = api(`repos/${REPOSITORY}/pulls/${pr.number}`);
  assertPullRequest(live, snapshot);
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  output({ changed: true, candidate: headSha, versions: releaseSummary(releases), pr: pr.number });
}

async function verifyAllDownloads(releases) {
  await Promise.all(Object.values(releases).flatMap(release => Object.values(release.assets)).map(asset => verifyDownload(asset)));
}

function snapshotFor(baseSha, releases, baseFiles, prNumber) {
  const candidates = renderFiles(baseFiles, releases);
  return {
    schema: 2, repository: REPOSITORY, baseSha, headSha: git('rev-parse', 'HEAD'), treeSha: git('rev-parse', 'HEAD^{tree}'),
    branch: branchFor(releases), releases, baseFiles, prNumber,
    baseHashes: Object.fromEntries(PATHS.map(file => [file, hash(baseFiles[file])])),
    candidateHashes: Object.fromEntries(PATHS.map(file => [file, hash(candidates[file])])),
  };
}

function assertPullRequest(pr, snapshot) {
  assert.equal(pr.state, 'open', 'Version PR is no longer open');
  assert.equal(pr.draft, false, 'Version PR must not be a draft');
  assert.equal(pr.head.repo.full_name, REPOSITORY, 'Unexpected head repository');
  assert.equal(pr.base.repo.full_name, REPOSITORY, 'Unexpected base repository');
  assert.equal(pr.head.ref, snapshot.branch, 'Version PR branch changed');
  assert.equal(pr.base.ref, 'main', 'Version PR base branch changed');
  assert.equal(pr.head.sha, snapshot.headSha, 'Version PR head moved');
  assert.equal(pr.base.sha, snapshot.baseSha, 'Version PR base moved');
}

function assertReviews(reviewState) {
  assertReviewClear(reviewState);
  assert.equal(reviewState.mergeable, 'MERGEABLE', 'Version PR is not currently mergeable');
  assert.ok(['CLEAN', 'UNSTABLE', 'BLOCKED'].includes(reviewState.mergeStateStatus), 'Unknown or conflicting version PR merge state');
  if (reviewState.reviewDecision) assert.equal(reviewState.reviewDecision, 'APPROVED', 'Protected PR approval is still required');
  const rollup = reviewState.commits.nodes[0].commit.statusCheckRollup;
  if (rollup) {
    assert.equal(rollup.contexts.pageInfo.hasNextPage, false, 'Too many status checks to verify');
    for (const check of rollup.contexts.nodes.filter(check => check.isRequired)) {
      if (check.__typename === 'CheckRun') {
        assert.equal(check.status, 'COMPLETED', `Required check ${check.name} has not completed`);
        assert.ok(['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(check.conclusion), `Required check ${check.name} did not pass`);
      } else {
        assert.equal(check.state, 'SUCCESS', `Required status ${check.context} did not pass`);
      }
    }
  }
  // Optional PR runs awaiting token approval do not replace this run's matrix gates.
  // GitHub's merge endpoint remains authoritative for all branch protection rules.
}

async function merge(snapshotPath) {
  assertMainRun();
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  verifyCandidate(snapshot);
  assert.deepEqual(await latestReleases(), snapshot.releases, 'Latest stable releases or assets changed after audit');
  // Re-download immediately before merging so an unchanged API digest cannot hide replaced bytes.
  await verifyAllDownloads(snapshot.releases);
  assert.deepEqual(await latestReleases(), snapshot.releases, 'Latest releases changed during final download verification');
  assertReviews(readReviews(snapshot.prNumber));
  assertPullRequest(api(`repos/${REPOSITORY}/pulls/${snapshot.prNumber}`), snapshot);
  assert.equal(mainSha(), snapshot.baseSha, 'Main moved after audit');
  let result;
  try {
    result = api(`repos/${REPOSITORY}/pulls/${snapshot.prNumber}/merge`, 'PUT', {
      sha: snapshot.headSha, merge_method: 'squash', commit_title: `chore: update tap stable releases (#${snapshot.prNumber})`,
    });
  } catch (error) {
    // Never repeat an indeterminate merge: first verify the targeted PR state.
    const live = api(`repos/${REPOSITORY}/pulls/${snapshot.prNumber}`);
    if (!live.merged || live.head.sha !== snapshot.headSha) throw error;
    result = { merged: true, sha: live.merge_commit_sha };
  }
  assert.equal(result.merged, true, 'GitHub did not merge the audited candidate');
  const landed = api(`repos/${REPOSITORY}/git/commits/${result.sha}`);
  assert.equal(landed.tree.sha, snapshot.treeSha, 'Merged tree differs from the audited candidate');
  // Delete only the branch that still names our exact audited head.
  const ref = api(`repos/${REPOSITORY}/git/ref/heads/${snapshot.branch}`);
  if (ref.object.sha === snapshot.headSha) api(`repos/${REPOSITORY}/git/refs/heads/${snapshot.branch}`, 'DELETE');
  output({ merged: true, versions: releaseSummary(snapshot.releases), pr: snapshot.prNumber, commit: result.sha });
}

module.exports = { admitFormulaRelease, admitRelease, assertOpenUpdates, assertPullRequest, assertRefreshable, assertReviews, branchFor, compareVersions, hash, readCask, readFormula, renderCask, renderFiles, renderPackage, verifyCandidate, verifyDownload };
if (require.main === module) {
  const [action, snapshotPath] = process.argv.slice(2);
  const task = action === 'probe' ? prepare('', true)
    : action === 'prepare' && snapshotPath ? prepare(snapshotPath)
      : action === 'verify' && snapshotPath ? Promise.resolve().then(() => verifyCandidate(JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))))
        : action === 'merge' && snapshotPath ? merge(snapshotPath)
          : Promise.reject(new Error('Usage: tap-update.cjs probe | prepare/verify/merge <snapshot-path>'));
  task.catch(error => { console.error(error.message); process.exitCode = 1; });
}
