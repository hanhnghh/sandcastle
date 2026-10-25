// @ts-nocheck
// Continuous Sandcastle supervisor.
//
// Runs the workflow (`.sandcastle/main.mts` by default) again and again on an
// integration branch (default `sandcastle/continuous`), waits while nothing is
// ready, hands issues that fail in consecutive runs to the owner with the
// `needs-owner` label, and publishes each gated integration head as one open
// pull request into the base branch. With SANDCASTLE_AUTO_MERGE=on (default) it
// merges that pull request once GitHub reports it clean at the gated head.
//
// The workflow must print `Gated integration head <sha>` after a cumulative gate
// passes; that line is what gets published and merged.
//
// Usage (from the integration worktree): npx tsx .sandcastle/continuous.mts
// launchd install, status and stop: bash .sandcastle/continuous.sh help
//
// Env: SANDCASTLE_BRANCH, SANDCASTLE_BASE, SANDCASTLE_MAIN, SANDCASTLE_IDLE_MINUTES,
// SANDCASTLE_MAX_BACKOFF_MINUTES, SANDCASTLE_PUBLISH (pr|off), SANDCASTLE_AUTO_MERGE (on|off),
// SANDCASTLE_OWNER_AFTER, SANDCASTLE_FOREIGN_LOCKS (colon-separated lock dirs of other orchestrators).

import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { branchSync, classify, issueOutcomes, nextStrikes, delayMinutes, ownerComment, gatedHead, referencedIssues, integrationBody, releaseComment } = require(join(dirname(fileURLToPath(import.meta.url)), 'continuous-core.cjs'));

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(ROOT);

const config = {
  branch: process.env.SANDCASTLE_BRANCH ?? 'sandcastle/continuous',
  base: process.env.SANDCASTLE_BASE ?? 'main',
  idleMinutes: Number(process.env.SANDCASTLE_IDLE_MINUTES ?? 15),
  maxBackoffMinutes: Number(process.env.SANDCASTLE_MAX_BACKOFF_MINUTES ?? 60),
  main: process.env.SANDCASTLE_MAIN ?? '.sandcastle/main.mts',
  publish: process.env.SANDCASTLE_PUBLISH ?? 'pr', // "pr" | "off"
  ownerLabel: 'needs-owner',
  // Task failures in a row before an issue is handed to the owner.
  ownerAfter: Number(process.env.SANDCASTLE_OWNER_AFTER ?? 2),
};
// Sandbox agents read and update issues with gh. Sandcastle forwards keys declared
// in .sandcastle/.env; a declared empty GH_TOKEN falls back to this process, so the
// token comes from the host gh login at startup and is never written to disk.
if (!process.env.GH_TOKEN) {
  try { process.env.GH_TOKEN = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim(); } catch {}
}
const RUNS = '.sandcastle/runs';
const LOGS = '.sandcastle/logs/continuous';
const STATE = join(RUNS, 'continuous.json');
const STOP = join(RUNS, 'continuous.stop');
mkdirSync(RUNS, { recursive: true });
mkdirSync(LOGS, { recursive: true });
rmSync(STOP, { force: true });

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const gh = (args, input) => execFileSync('gh', args, { encoding: 'utf8', input, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] }).trim();
const log = (message) => console.log(`[continuous ${new Date().toISOString()}] ${message}`);

let stopping = false;
let child = null;
let wake = null;
const stop = (signal) => {
  if (stopping) return;
  stopping = true;
  log(`${signal}: stopping after the current step.`);
  child?.kill('SIGINT');
  wake?.();
};
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

const previous = (() => { try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return {}; } })();
const state = { pid: process.pid, branch: config.branch, base: config.base, startedAt: new Date().toISOString(), runs: 0, strikes: previous.strikes ?? {}, published: previous.published ?? null };
function beat(status, extra = {}) {
  Object.assign(state, { status, updatedAt: new Date().toISOString() }, extra);
  writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
}

function notify(title, message) {
  log(`${title}: ${message}`);
  if (process.platform !== 'darwin') return;
  try {
    const quote = (text) => JSON.stringify(String(text).slice(0, 200));
    execFileSync('osascript', ['-e', `display notification ${quote(message)} with title ${quote(title)}`], { stdio: 'ignore' });
  } catch {}
}

function sleep(minutes) {
  if (minutes <= 0 || stopping) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, minutes * 60_000);
    const poll = setInterval(() => existsSync(STOP) && stop('stop file'), 10_000);
    function done() { clearTimeout(timer); clearInterval(poll); wake = null; resolve(); }
    wake = done;
  });
}

const lockDigest = () => {
  try { return createHash('sha256').update(readFileSync('package-lock.json')).digest('hex'); } catch { return null; }
};

/**
 * Reinstall host dependencies when the lockfile changed (for example a new
 * vendored Sandcastle), so main.ts never runs against a stale package.
 */
function installIfLockChanged(before) {
  if (lockDigest() === before) return;
  log('package-lock.json changed; running npm install.');
  // npm keeps an installed file: tarball whose version did not change (the
  // vendored Sandcastle stays 0.12.0), so remove those packages first.
  try {
    const { packages = {} } = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    for (const [path, entry] of Object.entries(packages))
      if (path.startsWith('node_modules/') && String(entry.resolved ?? '').startsWith('file:'))
        rmSync(path, { recursive: true, force: true });
  } catch (error) {
    log(`Could not clear file: dependencies: ${error.message}`);
  }
  execFileSync('npm', ['install', '--no-audit', '--no-fund'], { stdio: 'inherit', timeout: 20 * 60_000 });
  // The host's npm may rewrite the committed lockfile (for example dev →
  // devOptional); readiness then refuses the dirty integration checkout.
  // The lockfile belongs to the repository, so put it back.
  execFileSync('git', ['checkout', '--', 'package-lock.json']);
}

/** Bring the base branch into the integration branch. Throws on a merge conflict. */
function syncBase() {
  const lock = lockDigest();
  try { mergeBase(); } finally { installIfLockChanged(lock); }
}

// The supervisor's own code, as loaded. A base sync that changes it needs a new
// process: exit non-zero so launchd (KeepAlive on failure) starts the new code.
const SELF = ['.sandcastle/continuous.mts', '.sandcastle/continuous-core.cjs'];
const selfDigest = () => createHash('sha256').update(SELF.map((file) => { try { return readFileSync(file, 'utf8'); } catch { return ''; } }).join('\0')).digest('hex');
const loadedSelf = selfDigest();

/** Fast-forward to the remote integration branch when someone else pushed to it. */
function followRemoteBranch(isAncestor) {
  let remoteExists = true;
  try { git('fetch', '--quiet', 'origin', config.branch); } catch { remoteExists = false; }
  const remote = `origin/${config.branch}`;
  const sync = branchSync({ remoteExists, localInRemote: remoteExists && isAncestor('HEAD', remote), remoteInLocal: remoteExists && isAncestor(remote, 'HEAD') });
  if (sync === 'fast-forward') { git('merge', '--quiet', '--ff-only', remote); log(`Fast-forwarded to ${remote}.`); }
  if (sync === 'diverged') throw new Error(`${config.branch} and ${remote} have diverged; reconcile them in this worktree.`);
}

function mergeBase() {
  if (git('branch', '--show-current') !== config.branch)
    throw new Error(`Run the supervisor on branch ${config.branch}.`);
  if (git('status', '--porcelain', '--untracked-files=no')) {
    log('Tracked changes in the working tree; skipping the base sync this round.');
    return;
  }
  const isAncestor = (a, b) => { try { git('merge-base', '--is-ancestor', a, b); return true; } catch { return false; } };
  followRemoteBranch(isAncestor);
  git('fetch', '--quiet', 'origin', config.base);
  const remote = `origin/${config.base}`;
  if (isAncestor(remote, 'HEAD')) return;
  if (isAncestor('HEAD', remote)) { git('merge', '--quiet', '--ff-only', remote); log(`Fast-forwarded to ${remote}.`); return; }
  try {
    git('merge', '--quiet', '--no-edit', remote);
    log(`Merged ${remote} into ${config.branch}.`);
  } catch (error) {
    try { git('merge', '--abort'); } catch {}
    throw new Error(`Merging ${remote} into ${config.branch} conflicts; resolve it in this worktree.`);
  }
}

/** Newest diagnostics.json written by the runtime during this run. */
function readDiagnostic(since) {
  const root = '.sandcastle/runtime';
  if (!existsSync(root)) return null;
  let newest = null;
  for (const id of readdirSync(root)) {
    const file = join(root, id, 'diagnostics.json');
    if (!existsSync(file)) continue;
    const mtime = statSync(file).mtimeMs;
    if (mtime >= since && (!newest || mtime > newest.mtime)) newest = { file, mtime };
  }
  if (!newest) return null;
  try { return JSON.parse(readFileSync(newest.file, 'utf8')).at(-1) ?? null; } catch { return null; }
}

// Other orchestrators on the same repository may hold their own lock dirs
// (SANDCASTLE_FOREIGN_LOCKS). Wait while one of them is alive, and hold the
// shared lock while a continuous run is active so they refuse to start beside it.
const COMMON = git('rev-parse', '--path-format=absolute', '--git-common-dir');
const SHARED_LOCK = join(COMMON, 'sandcastle-run.lock');
const FOREIGN_LOCKS = [SHARED_LOCK, ...(process.env.SANDCASTLE_FOREIGN_LOCKS ?? '').split(':').filter(Boolean)];
const alive = (pid) => { if (!Number.isSafeInteger(pid) || pid < 1) return false; try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; } };
function foreignRun() {
  for (const lock of FOREIGN_LOCKS) {
    if (!existsSync(lock)) continue;
    try {
      const owner = JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8'));
      if (owner.pid !== process.pid && (alive(owner.pid) || alive(owner.childPid))) return lock;
    } catch { return lock; } // initializing or unreadable: treat as held
  }
  return null;
}
function holdSharedLock() {
  mkdirSync(SHARED_LOCK);
  writeFileSync(join(SHARED_LOCK, 'owner.json'), JSON.stringify({ pid: process.pid, source: 'continuous', startedAt: new Date().toISOString() }) + '\n');
  return () => rmSync(SHARED_LOCK, { recursive: true, force: true });
}

function runWorkflow() {
  const startedAt = Date.now();
  const file = join(LOGS, `${new Date(startedAt).toISOString().replace(/[:.]/g, '-')}.log`);
  const out = createWriteStream(file);
  let tail = '';
  return new Promise((resolve) => {
    child = spawn('npx', ['tsx', config.main], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    let pending = '';
    const forward = (chunk) => {
      process.stdout.write(chunk); out.write(chunk); tail = (tail + chunk).slice(-50_000);
      // Publish each gated integration commit as it lands; a rolling run can last
      // many hours and a stopped run never reaches the end-of-run publish.
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop();
      const head = gatedHead(lines.join('\n'));
      if (head) {
        try { publish(head); } catch (error) { notify('Sandcastle publish failed', error.message); }
      }
    };
    child.stdout.on('data', forward);
    child.stderr.on('data', forward);
    child.on('close', (exitCode) => {
      child = null;
      out.end();
      resolve({ exitCode, output: tail, diagnostic: readDiagnostic(startedAt), log: file });
    });
  });
}

function handToOwner(issues, verdict) {
  if (!issues.length) return;
  try { gh(['label', 'create', config.ownerLabel, '--color', 'D93F0B', '--description', 'Sandcastle needs an owner decision']); } catch {}
  for (const number of issues) {
    try {
      const labels = JSON.parse(gh(['issue', 'view', String(number), '--json', 'labels'])).labels.map((label) => label.name);
      if (labels.includes(config.ownerLabel)) continue;
      gh(['issue', 'edit', String(number), '--add-label', config.ownerLabel]);
      gh(['issue', 'comment', String(number), '--body-file', '-'], ownerComment(verdict.kind, verdict.summary, new Date().toISOString()));
      notify('Sandcastle needs you', `Issue #${number}: ${verdict.summary}`);
    } catch (error) {
      log(`Could not hand #${number} to the owner: ${error.message}`);
    }
  }
}

/** When the last integration pull request was merged, leave a release comment on its issues. */
function announceRelease() {
  const last = state.published;
  if (!last) return;
  const pr = JSON.parse(gh(['pr', 'view', String(last.number), '--json', 'state,mergeCommit,mergedAt']));
  if (pr.state === 'OPEN') return;
  if (pr.state === 'MERGED') {
    for (const issue of last.issues) {
      try { gh(['issue', 'comment', String(issue), '--body-file', '-'], releaseComment(last.number, pr.mergeCommit?.oid ?? '', pr.mergedAt ?? new Date().toISOString())); }
      catch (error) { log(`Could not comment the release on #${issue}: ${error.message}`); }
    }
    log(`Released #${last.number}: ${last.issues.map((n) => '#' + n).join(', ') || 'no issues'}.`);
  }
  state.published = null;
  beat(state.status ?? 'idle');
}

/** Push integrated work and keep one open pull request into the base branch. */
/** Push `ref` (default the integration HEAD) and open or update the integration pull request. */
function publish(ref = 'HEAD') {
  if (config.publish !== 'pr') return;
  try { announceRelease(); } catch (error) { log(`Release check failed: ${error.message}`); }
  try { git('fetch', '--quiet', 'origin', config.base); } catch {}
  const ahead = Number(git('rev-list', '--count', `origin/${config.base}..${ref}`));
  if (!ahead) return;
  const issues = referencedIssues(git('log', '--format=%B', `origin/${config.base}..${ref}`));
  const body = integrationBody(config.branch, issues);
  execFileSync('node', ['.sandcastle/closing-keywords.cjs', 'text'], { input: body, stdio: ['pipe', 'ignore', 'inherit'] });
  git('push', '--quiet', 'origin', `${ref}:refs/heads/${config.branch}`);
  const open = JSON.parse(gh(['pr', 'list', '--head', config.branch, '--base', config.base, '--state', 'open', '--json', 'number']));
  let number;
  if (open.length) {
    number = open[0].number;
    gh(['pr', 'edit', String(number), '--body-file', '-'], body);
    log(`Updated pull request #${number} (${ahead} commit(s) ahead; issues ${issues.map((n) => '#' + n).join(', ') || 'none'}).`);
  } else {
    const url = gh(['pr', 'create', '--base', config.base, '--head', config.branch, '--title', 'Sandcastle: continuous integration batch', '--body-file', '-'], body);
    number = Number(url.split('/').pop());
    notify('Sandcastle', `Opened ${url}`);
  }
  state.published = { number, issues };
}

let failures = 0;
beat('starting');
log(`Supervising ${config.branch} → PR into ${config.base}; idle ${config.idleMinutes} min.`);
while (!stopping && !existsSync(STOP)) {
  try {
    syncBase();
  } catch (error) {
    beat('blocked', { lastError: error.message, nextRunAt: new Date(Date.now() + config.idleMinutes * 60_000).toISOString() });
    notify('Sandcastle blocked', error.message);
    await sleep(config.idleMinutes);
    continue;
  }
  if (selfDigest() !== loadedSelf) {
    log('Supervisor code changed in the base sync; exiting so launchd restarts it.');
    beat('restarting');
    process.exit(75);
  }
  const held = foreignRun();
  if (held) {
    beat('locked', { lastError: `Another orchestrator holds ${held}`, nextRunAt: new Date(Date.now() + config.idleMinutes * 60_000).toISOString() });
    log(`Another orchestrator holds ${held}; waiting ${config.idleMinutes} min.`);
    await sleep(config.idleMinutes);
    continue;
  }
  let release;
  try { release = holdSharedLock(); } catch { await sleep(1); continue; }
  state.runs += 1;
  beat('running', { lastError: undefined, nextRunAt: undefined });
  let run;
  try { run = await runWorkflow(); } finally { release(); }
  if (stopping) break;
  const verdict = classify(run);
  let full = run.output;
  try { full = readFileSync(run.log, 'utf8'); } catch {}
  const outcome = nextStrikes(state.strikes, issueOutcomes(full), config.ownerAfter);
  state.strikes = outcome.strikes;
  handToOwner(outcome.ownerIssues, { kind: verdict.kind, summary: `Failed ${config.ownerAfter} runs in a row (${verdict.summary})` });
  try { publish(); } catch (error) { notify('Sandcastle publish failed', error.message); }
  failures = ['failure', 'provider'].includes(verdict.kind) ? failures + 1 : 0;
  const wait = delayMinutes(verdict, failures, config);
  if (verdict.notify) notify('Sandcastle', verdict.summary);
  beat(verdict.kind, {
    lastRun: { exitCode: run.exitCode, kind: verdict.kind, summary: verdict.summary, log: run.log, at: new Date().toISOString() },
    nextRunAt: new Date(Date.now() + wait * 60_000).toISOString(),
  });
  log(`${verdict.summary} Next run in ${wait} min.`);
  await sleep(wait);
}
beat('stopped');
log('Stopped.');
