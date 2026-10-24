// Pure decisions for the continuous supervisor (continuous.mts): how to read a
// finished workflow run and how long to wait before the next one.

const ESCALATED = /Approach escalated for issue #?(\d+)/g;
const PLANNED = /^\s+(\d+): .* → \S+$/gm;
const ATTEMPT = /^\s+! (\d+) attempt \d+ failed \(([^)]+)\)/gm;
const FAILED = /^\s+✗ (\d+) \(\S+\) failed: (.*)$/gm;
const INFRASTRUCTURE = /\b(infrastructure|provider)\b|WorktreeTimeoutError|Provider unavailable/i;

/**
 * Classify one finished `.sandcastle/main.ts` run.
 * @param {{ exitCode: number | null, output: string, diagnostic?: { code: string, issues: number[] } | null }} run
 * @returns {{ kind: string, ownerIssues: number[], notify: boolean, summary: string }}
 */
function classify({ exitCode, output, diagnostic }) {
  const code = diagnostic?.code;
  const result = (kind, summary, extra = {}) => ({
    kind,
    summary,
    notify: false,
    ...extra,
    ownerIssues: [],
  });

  if (exitCode === 0)
    return code === 'qualification-pending'
      ? result('waiting', `Waiting for qualification of ${diagnostic.issues.map((n) => '#' + n).join(', ') || 'remaining issues'}.`)
      : result('idle', 'Backlog finished; waiting for new ready issues.');
  if (/No eligible batch selected while implementation issues remain/.test(output))
    return result('waiting', 'No issue is ready yet (dependencies, holds or qualification).');
  if (code === 'iteration-limit' || /Iteration limit reached/.test(output))
    return result('continue', 'Iteration limit reached with work remaining; starting another run.');
  if (code === 'provider-unavailable' || /Provider unavailable after/.test(output))
    return result('provider', 'Agent provider unavailable (quota, login or outage); backing off.', { notify: true });
  if (code === 'no-progress' || /No verified implementation progress/.test(output))
    return result('no-progress', 'A batch made no verified progress; retrying on the retained branches.');
  if (/already running|runner lock/i.test(output))
    return result('locked', 'Another Sandcastle run holds the lock; waiting.');
  return result('failure', `Run failed with exit code ${exitCode}.`, { notify: true });
}

/**
 * Issues a run worked on, and those that ended failed for a task reason.
 * Infrastructure and provider failures (worktree timeouts, quota, outages) are
 * not the issue's fault and never count.
 * @param {string} output the full run log
 * @returns {{ worked: number[], failed: number[] }}
 */
function issueOutcomes(output) {
  const worked = new Set([...output.matchAll(PLANNED)].map((match) => Number(match[1])));
  const lastAttempt = new Map();
  for (const match of output.matchAll(ATTEMPT)) lastAttempt.set(Number(match[1]), match[2]);
  const failed = new Set([...output.matchAll(ESCALATED)].map((match) => Number(match[1])));
  for (const match of output.matchAll(FAILED)) {
    const issue = Number(match[1]);
    const cause = `${lastAttempt.get(issue) ?? ''} ${match[2]}`;
    if (!INFRASTRUCTURE.test(cause)) failed.add(issue);
  }
  for (const issue of failed) worked.add(issue);
  const sorted = (set) => [...set].sort((a, b) => a - b);
  return { worked: sorted(worked), failed: sorted(failed) };
}

/**
 * Consecutive task-failure counts per issue after one run. An issue that was
 * worked and did not fail starts over; one that was not worked keeps its count.
 * @param {Record<string, number>} strikes counts before this run
 * @param {{ worked: number[], failed: number[] }} outcomes
 * @param {number} threshold failures in a row before the owner is asked
 * @returns {{ strikes: Record<string, number>, ownerIssues: number[] }}
 */
function nextStrikes(strikes, { worked, failed }, threshold) {
  const next = { ...strikes };
  for (const issue of worked) delete next[issue];
  for (const issue of failed) next[issue] = (strikes[issue] ?? 0) + 1;
  const ownerIssues = failed.filter((issue) => next[issue] >= threshold);
  for (const issue of ownerIssues) delete next[issue];
  return { strikes: next, ownerIssues };
}

/**
 * Minutes to wait before the next run.
 * @param {{ kind: string }} verdict
 * @param {number} failures consecutive failure or provider runs, including this one
 * @param {{ idleMinutes: number, maxBackoffMinutes: number }} config
 */
function delayMinutes(verdict, failures, config) {
  switch (verdict.kind) {
    case 'continue':
      return 0;
    case 'idle':
    case 'waiting':
    case 'locked':
    case 'no-progress':
      return config.idleMinutes;
    case 'provider':
      return config.maxBackoffMinutes;
    default:
      return Math.min(config.maxBackoffMinutes, 5 * 2 ** Math.max(0, failures - 1));
  }
}

/** Comment posted when the loop hands an issue to the owner. Contains no closing keywords. */
function ownerComment(kind, summary, when) {
  return [
    `Sandcastle continuous mode stopped on this issue (${kind}, ${when}).`,
    '',
    summary,
    '',
    'Branches and logs are retained. The `needs-owner` label keeps the loop away from this issue;',
    'remove it once the decision or fix is in place and the loop will pick the issue up again.',
  ].join('\n');
}

/** The last integration commit whose cumulative gate passed in this output, or null. */
function gatedHead(output) {
  const heads = [...output.matchAll(/^Gated integration head ([0-9a-f]{40})$/gm)];
  return heads.length ? heads[heads.length - 1][1] : null;
}

/** Issues referenced as `Refs #N` in commit messages, ascending. */
function referencedIssues(log) {
  return [...new Set([...log.matchAll(/\bRefs #(\d+)/g)].map((match) => Number(match[1])))].sort((a, b) => a - b);
}

/** Integration pull request body. Lists issues with Refs only, never a closing keyword. */
function integrationBody(branch, issues) {
  return [
    `Work integrated by Sandcastle continuous mode on \`${branch}\`.`,
    '',
    'Each merged issue went through implementation, review and the cumulative gate inside the sandbox;',
    'the merger closed it after that gate passed on the integration branch. Merging this pull request',
    'releases them to the base branch (and any deploy it triggers); each issue then gets a release comment.',
    '',
    '## Integrated issues',
    '',
    ...(issues.length ? issues.map((n) => `- Refs #${n}`) : ['- None referenced yet']),
    '',
    '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
    '',
  ].join('\n');
}

/** Comment left on an issue when the integration pull request is merged. */
function releaseComment(pr, sha, when) {
  return `Released to the base branch in #${pr} (merge ${sha.slice(0, 12)}, ${when}).`;
}

module.exports = { classify, issueOutcomes, nextStrikes, delayMinutes, ownerComment, gatedHead, referencedIssues, integrationBody, releaseComment };
