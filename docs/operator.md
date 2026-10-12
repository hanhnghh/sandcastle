# Local operator

Start the operator for an explicit host project:

```sh
npx sandcastle operator --cwd /path/to/project --port 4319
```

Open the printed loopback URL. Choose each role's suggested model or **Custom
model ID**, choose effort, and press **Save settings**. Native form controls
support keyboard navigation. Reloading reads the project's saved configuration.
The operator supports Codex's declared efforts: low, medium, high and xhigh.
Suggestions are convenience values, not a remote model availability check.
Authentication remains project-owned; the operator neither edits nor returns
credential values.

**Start run** launches the project's existing reviewed workflow. New
`parallel-planner-with-review` scaffolds selected with Codex and all `codex-afk`
scaffolds consume shared runtime settings. Use **Environment** to select/build
a Docker image and run preflight. Podman images still use the existing CLI
build command. Install the workflow's dependencies (including tsx) first. The CLI
adapter resolves the image to its immutable ID and passes that frozen runtime
to the one `.sandcastle/main.ts` or `main.mts`. It rejects legacy workflows
that do not consume frozen configuration; it does not rewrite existing copied
workflows. Adopt the SDK below for a customized project adapter.

**Observe runs and logs** opens Agent Map. `sandcastle dashboard` remains
read-only and retains its existing CLI and HTTP contracts. Closing the operator
closes observation; SDK project adapters own workflow cancellation. The CLI
terminates its owned child workflow when the CLI process shuts down.

## Configuration contract

The common CLI/web/SDK source is `.sandcastle/roles.json`:

```json
{
  "schemaVersion": 1,
  "revision": "<computed SHA-256 content revision>",
  "roles": {
    "planner": { "provider": "codex", "model": "gpt-6.1-sol", "effort": "low" },
    "implementer": {
      "provider": "codex",
      "model": "gpt-6.1-sol",
      "effort": "low"
    },
    "reviewer": {
      "provider": "codex",
      "model": "gpt-6.1-sol",
      "effort": "high"
    },
    "merger": { "provider": "codex", "model": "gpt-6.1-sol", "effort": "high" },
    "readiness": {
      "provider": "codex",
      "model": "gpt-6.1-sol",
      "effort": "high"
    }
  }
}
```

Init preserves its selected model for all five roles. A missing file uses
gpt-6.1-sol with the efforts shown above. An existing invalid file fails closed.
Schema version 1 requires exactly all five roles and their model/provider/effort
fields. Unknown fields, schema versions, providers and efforts are rejected.
Model IDs are 1–200 characters: letters, digits, dots, underscores, colons,
slashes or hyphens, beginning with a letter or digit. Config has no auth, prompt
paths, sandbox commands or executable fields.

Use `loadRoleConfig({ cwd })` and `saveRoleConfig({ cwd, config })` to edit from
host automation. Save validates the entire document, computes the revision,
writes a private temporary file, syncs it and atomically renames it. Validation
failure preserves the last durable configuration. Revision is a digest, not a
counter or concurrency token; competing saves use last successful write wins.
Reads verify the stored revision. Pass the current loaded document to save
rather than hand-writing a revision.

## Workflow limits, tracker and feedback gates

**Workflow** edits `.sandcastle/workflow.json` through the same validated
`loadWorkflowConfig({ cwd })` / `saveWorkflowConfig({ cwd, config })` host API
used by the CLI child runtime. Choose the explicit GitHub `owner/repository`,
scope label, ready/blocked state labels, and hold labels (one per line). New
reviewed Codex workflows require an explicit repository before tracker or agent
execution; they never fall back to an upstream remote. Custom SDK adapters
continue to own their tracker boundary. Existing copied workflows need explicit
adoption of the runtime methods below; the operator does not rewrite them.

```json
{
  "schemaVersion": 1,
  "revision": "<computed SHA-256 content revision>",
  "repository": "owner/project",
  "scopeLabel": "Sandcastle",
  "readyLabel": "ready-for-agent",
  "blockedLabel": "blocked",
  "holdLabels": ["readiness:hold"],
  "limits": { "cycles": 10, "concurrency": 100, "plannerAttempts": 3 },
  "readiness": { "mode": "report-only", "verifier": null, "gates": [] }
}
```

Cycle limits count plan/execute/review/merge rounds, not individual agent
invocations. Cycles accept integers 1–1000, concurrent issue pipelines 1–100,
and planner validation attempts 1–10. Review and merge completion guards and
existing per-role invocation limits stay authoritative. Bounded scheduling
settles every pipeline in input order, including failures, before integration.
No-progress stops immediately; reaching the cycle limit with remaining work
fails the run. Qualification-only backlogs report pending external qualification
and leave their issues open.

Labels accept 1–50 letters/digits, spaces, dots, underscores, colons, slashes
or hyphens, starting with a letter/digit; surrounding whitespace is trimmed.
Scope, state, project qualification and effective hold labels must be distinct;
collisions with project-required holds are rejected before saving. Duplicate
holds/gates are rejected. Repository owners accept up to 39 letters/digits with
single interior hyphens; repository names accept up to 100 letters/digits, dots,
underscores or hyphens, including `.github`, but not `.` or `..`.
Reference names accept letters/digits, dots, underscores and hyphens, starting
with a letter/digit (maximum 100 characters). Unknown fields, repositories,
limits or references fail atomically with safe errors. Configuration files and
the configuration directory cannot redirect writes through symlinks.

A missing workflow file derives tracker defaults from project-owned
`.sandcastle/readiness.json`; a missing readiness file uses the example's labels,
null repository and report-only mode. Existing project apply mode is retained
only with its declared verifier. The shared runtime uses report-only for legacy
disabled readiness when an explicit repository is configured, preserving the
host admission checks. A saved workflow file becomes the editable source;
changes to trusted project policy are separate from saving its settings.
Malformed files and mismatched revisions fail closed. Save recomputes the digest
and uses the same private atomic persistence as role configuration. Competing
saves use the last successful complete write.

Commands remain host-owned. The existing `readiness.json.verifyCommand` argv
is exposed only as the reserved verifier reference **readiness**. Projects can
also declare references by creating `.sandcastle/feedback-gates.json` through
trusted host automation:

```json
{
  "verifiers": { "project": ["node", ".sandcastle/verify-readiness.mjs"] },
  "gates": { "tests": ["npm", "test", "--", "--run"] },
  "requiredGates": ["tests"]
}
```

The web lists names and selects references; it cannot accept executable text,
auth values, or edit these declarations. Declared argv runs on the selected host
project, without an implicit shell, with a five-minute timeout per command.
Each gate must exit successfully; then the selected verifier receives the full
readiness input as JSON on stdin and must return the existing readiness
verification JSON contract. Gates/verifiers are trusted host programs with the
host's environment. Keep authentication in project-owned environment/auth
references. Their output is not returned to the operator; failures produce safe
status diagnostics. A passing feedback command does not approve an agent's
proposal: the existing full-contract, source freshness, dependency completion
and integration, review, publication and readback checks still apply.

Project-required gates always run even if unchecked in the editable form.
Project-owned hold labels are unioned with editable holds; removing an editable
hold never removes a project hold. Qualification labels, parent context,
publication policy, standards and qualification adapters remain project-owned.
Readiness defaults to **report-only**. **Apply** requires an explicit repository
and a selected trusted project verifier. The form explains missing verifier
requirements; the run view reports feedback failures, no-progress, cycle limits
and pending qualification beside **Observe runs and logs**.

`inspectWorkflow({ cwd })` exposes only config, declared reference names,
required holds/gates and safe configuration diagnostics. At runtime:

- `runtime.workflow` exposes the frozen snapshot to trusted SDK callers.
- `runtime.readiness` supplies frozen effective tracker/readiness options.
- `runtime.settleIssues(issues, execute)` applies frozen issue concurrency.
- `runtime.verifyReadiness(input)` executes frozen required/selected gates and
  verifier; pass it to the existing readiness API's trusted `verify` callback.
- `runtime.reportOutcome({ code, issues })` records safe outcome codes
  `qualification-pending`, `no-progress`, `iteration-limit` or `feedback-failed`.
  `runtime.diagnostics()` reads them across the child-process boundary.

Settings and declaration argv are frozen privately at run start, with a digest
checked when reopening. Editing settings or declarations affects a later run.
Host command files remain project-owned programs; changing their contents can
change those programs, so do not modify gates during a run. Legacy role-only runtime records still reopen for their original role/prompt
operations. Workflow operations require the new frozen snapshot and fail with
an actionable message on those legacy records; start a new run rather than
inventing policy from live settings.

## Docker environment and jobs

**Environment** shows the configured name, installed host images, availability
and resolved SHA-256 identity. Select an installed image or **Custom image name**,
then press **Save environment**. Custom names may be unavailable until explicitly
built or installed outside the operator. Saves persist to private, atomic
`.sandcastle/environment.json`, isolated to the selected host project:

```json
{
  "schemaVersion": 1,
  "image": "sandcastle:my-project",
  "dockerfile": ".sandcastle/Dockerfile",
  "buildArgs": { "AGENT_UID": "1000" }
}
```

`loadEnvironmentConfig({ cwd })` and `saveEnvironmentConfig({ cwd, config })`
provide the same host automation interface. Missing settings use the project's
existing default image name and `.sandcastle/Dockerfile`. Corrupt settings and
configuration symlinks fail closed. Image names support repository/tag and
SHA-256 digest references. Dockerfiles must be existing files inside the
project: absolute paths, traversal, escaped symlinks, backslashes and shell
syntax are rejected. Build argument keys are identifiers; values are literal
letters/digits or `._/:@,+-`, up to 1,000 characters. The form accepts one
`KEY=value` per line. Arguments are passed directly, without a host shell.
Keep credentials in project-owned auth references rather than build arguments.
Build context is the selected project root, with the configured Dockerfile.
As with CLI builds, `AGENT_UID`/`AGENT_GID` default to the host UID/GID where
available; explicitly saved arguments override those defaults.

**Build image** and **Run preflight** start explicit asynchronous jobs using a
snapshot of saved settings. Output streams into a keyboard-focusable log viewer;
completed, failed and cancelled results remain visible across page reloads.
The operator retains the last 20 jobs and up to 65,536 UTF-16 code units of
output per job in this server session. Restarting the server starts a new job
history; saved settings remain durable. Build output redacts declared secret
environment values, including output split across chunks. Preflight discards
raw diagnostic output and reports only safe prerequisite summaries.

A build uses an owned temporary image tag and promotes the resolved image only
after success. Failure/cancellation preserves the previously usable image and
saved configuration. Cancel terminates the owned Docker process, escalating
if necessary, and removes only owned temporary tags/preflight sandboxes. Once
promotion starts, cancellation returns 409; wait for its terminal result.
Closing the operator cancels its environment jobs and waits for cleanup.
Ordinary Docker operations have a 30-second limit; builds have 30 minutes.
Save never builds, removes images, publishes images, or changes project gates,
bootstrap, branch-isolated caches or authentication mounts. Only an explicit
build changes image contents. Role/prompt/image edits apply to the next run;
active sandboxes use the frozen immutable image identity.

Preflight checks Docker daemon access, selected image identity, actual image
UID against the host UID, and required executable versions in ephemeral,
network-disabled sandboxes without project/cache/auth mounts. Default tools
are `git`, `gh`, `codex`; generated Node/npm profiles add `node`, `npm`, and
Android profiles add `java`, `sdkmanager`. Project profiles declare isolated
Codex auth at `.sandcastle/codex-home/auth.json`; an existing codex-home also
declares it. Secret environment keys declared in `.sandcastle/.env` are checked
using the existing environment resolver. Auth results explicitly mean file/value
presence, not verified remote login. Missing declarations are reported as such;
no credential contents are returned. Follow the project's existing login/setup
instructions (for isolated Codex, `CODEX_HOME=.sandcastle/codex-home codex login`).

Custom SDK adapters can declare `environment: { uid, tools, authFiles }`, using
executable names and a mapping of safe status labels to trusted host credential
file paths. HTTP cannot edit this policy. Custom adapters continue to own
`sandboxIdentity()` and sandbox construction: resolve
`(await loadEnvironmentConfig({ cwd })).image` through their Docker boundary
and use `runtime.record.sandboxIdentity` while retaining project-owned options.
The CLI adapter and new reviewed Docker scaffolds already do this. Existing
copied workflows require explicit adoption; the operator does not rewrite them.
Docker environment jobs do not alter existing Podman/provider contracts.

## Prompt customization and upgrades

Open **Prompts** to edit any configured role. Each editor shows default/override
ownership, content-addressed default/base versions, a text diff against the
current default and a separate changed-default diff. **Save** stores a private,
atomic project override in `.sandcastle/prompts/<role>.json`. **Reset** selects
the current default; it does not rewrite the project source file. Native forms
support keyboard save/reset. Saving or resetting one role preserves other roles'
unsaved drafts. Reloads and operator restarts retain saved overrides.

`loadProjectPrompts({ cwd, promptFiles })` exposes the same resolution used by
CLI, web and `createProjectRuntime`. `saveProjectPrompt({ cwd, promptFiles,
role, content })` saves a template; pass `content: null` to reset. The adapter's
trusted `promptFiles` remain source defaults unless the project explicitly
adopts packaged defaults. Null source paths disable a role. Existing custom
adapters and copied prompts keep their project ownership.

To use the installed package's `parallel-planner-with-review` defaults, run this
once from trusted host automation, supplying the project's tracker commands:

```ts
import { usePackagedPromptDefaults } from "@ai-hero/sandcastle";

await usePackagedPromptDefaults({
  cwd: "/path/to/project",
  templateArgs: {
    VIEW_TASK_COMMAND: "gh issue view <ID>",
    CLOSE_TASK_COMMAND: "gh issue close <ID>",
  },
});
```

This records selection and original defaults in
`.sandcastle/prompts/defaults.json`. It preserves existing copied files that
differ from the packaged defaults as overrides, including project-specific
Codex AFK guidance. It never migrates the workflow, standards, gates or auth.
Review compatibility before explicitly resetting a customized role. Untouched
copies (or missing source files) receive current installed defaults. Customized
roles retain their original base and selected content after package updates;
the editor shows changed-default diffs. Package updates and project migration
remain separate operations. The base version is a SHA-256 of rendered default
text; runtime evidence additionally records the installed package version and
exact selected content/digest. Keep prompt configuration and override files in
project version control as appropriate for their sensitivity; keep runtime
snapshots private.

Saves preserve required placeholders from the customization's base, reject
unknown or malformed placeholders, and preserve completion signals and output
tag literals present in that base. Placeholder syntax matches runtime
substitution, including whitespace and mixed-case names. Errors identify the
role and missing contract; rejected saves leave the durable prompt intact.
New shell expressions and control markers are rejected: executable expansion
policy belongs in trusted source defaults. Existing source shell expressions
can be retained. Prompt text and diffs render as data. Templates are limited to
1,048,576 UTF-16 code units; the HTTP request limit below also applies.
Settings and prompt edits during a run apply only to the next frozen runtime.

## Shared runtime SDK and project adapter

`createProjectRuntime({ cwd, promptFiles, sandboxIdentity })` freezes effective
settings before any role runs. Supply all five prompt paths (relative to cwd or
absolute), using null for roles without a prompt, and the resolved sandbox
identity. `runtime.agent(role, options?)` builds the configured Codex provider
while allowing project-owned session storage/environment/approval options.
Effort comes from the frozen configuration.

The runtime resolves its project directory when created or reopened. Later host
working-directory changes keep prompt access and observations in that project.

`runtime.promptFile(role)` returns an absolute host path to the frozen template;
existing prompt arguments and sandbox shell expansion still apply.
`runtime.createAgentMap(name)` records the runtime ID, config revision, version
and sandbox identity, and attaches the effective model/provider/effort to each
tracked role invocation. Use that same runtime's agent for the invocation.

Private `.sandcastle/runtime/<UUID>/record.json` records the package runtime
version, effective settings, image identity and all prompt contents/digests.
Frozen prompt copies are private too. New scaffolds ignore this directory.
Keep these files private: prompts can contain project-sensitive content.
A save or prompt edit while running affects the next runtime only.
`openProjectRuntime({ cwd, id })` reopens that frozen invocation for a
project-owned child process. It checks runtime version, identity, configuration
revision and prompt integrity; incompatible source records fail closed.
The CLI passes only the UUID using `SANDCASTLE_RUNTIME_ID`.

```ts
import { startOperator } from "@ai-hero/sandcastle";

const server = await startOperator({
  cwd: "/path/to/project",
  port: 0,
  adapter: {
    promptFiles: {
      planner: ".sandcastle/plan-prompt.md",
      implementer: ".sandcastle/implement-prompt.md",
      reviewer: ".sandcastle/review-prompt.md",
      merger: ".sandcastle/merge-prompt.md",
      readiness: ".sandcastle/readiness-prompt.md",
    },
    sandboxIdentity: async () => projectImageDigest,
    run: async (runtime) => {
      // Invoke your existing project workflow with this runtime.
      // Keep its sandbox, admission, review, completion, merge and readiness gates.
      await projectWorkflow(runtime);
    },
  },
});
console.log(server.url);
// await server.close() when observation should finish.
```

The adapter is trusted host code. HTTP cannot supply commands, change the
selected project or bypass the adapter's gates. Existing `run()`, providers
and `createAgentMap()` calls remain compatible.

## HTTP interface

The operator binds only to 127.0.0.1. Host must match its loopback authority.
Any supplied Origin must exactly match that host/port. All mutations additionally
require that Origin and the HttpOnly, SameSite=Strict local session cookie
established by opening `GET /`. There are no credential-valued APIs.

| Route                                      | Behavior                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/environment`                     | Saved environment config, installed images, availability and resolved identity                                                  |
| `PUT /api/environment`                     | Complete validated environment document; atomic save only                                                                       |
| `POST /api/environment/jobs`               | Exactly `{ "kind": "build" }` or `{ "kind": "preflight" }`; 202 with job snapshot                                               |
| `GET /api/environment/jobs`                | Last 20 operator-session jobs, including latest logs/results                                                                    |
| `GET /api/environment/jobs/<UUID>`         | Project-session job snapshot and terminal result                                                                                |
| `GET /api/environment/jobs/<UUID>/events`  | SSE `data` messages containing snapshots; bounded log replay, then live updates; closes at terminal status                      |
| `POST /api/environment/jobs/<UUID>/cancel` | Empty object; 202 after requesting cancellation, 409 during promotion                                                           |
| `GET /api/prompts`                         | Effective role templates, ownership, default/base contents and versions, changed-default status                                 |
| `PUT /api/prompts`                         | Exactly `{ "role": "implementer", "content": "..." }`; null content resets; returns resolved prompts                            |
| `GET /api/workflow`                        | Workflow settings, trusted reference names, required holds/gates and safe diagnostics                                           |
| `PUT /api/workflow`                        | Complete validated reference-only workflow document; atomic save                                                                |
| `GET /api/config`                          | Validated config, declared model/effort capability and selected project                                                         |
| `PUT /api/config`                          | Complete config document; returns the saved config/revision                                                                     |
| `POST /api/run`                            | Empty JSON object only; freezes settings, invokes the fixed adapter; 202 with ID/revision                                       |
| `GET /api/run`                             | Current operator-session status, frozen role/workflow settings and safe workflow diagnostics, excluding prompt/command contents |
| `GET /dashboard`                           | Opens the project's read-only Agent Map                                                                                         |

Mutations require `Content-Type: application/json` and at most 16 KiB.
Invalid config/body returns 400 with actionable diagnostics; invalid session,
origin or host returns 403; wrong content type 415; oversized body 413;
overlapping starts in one operator session 409. Query overrides are rejected.
Execution failures report failed status; inspect workflow logs and host output.

## Runtime Updates

Create the project-owned `.sandcastle/updates.json` before using **Updates**:

```json
{
  "schemaVersion": 1,
  "package": "@your-org/sandcastle-fork",
  "dependency": "@ai-hero/sandcastle",
  "registry": "https://registry.npmjs.org",
  "channel": "latest",
  "manifest": ".sandcastle/package.json",
  "source": { "kind": "registry" }
}
```

Replace the example identity with your maintainer's actual fork name. The
`dependency` key preserves existing workflow imports through an npm alias.
Registry, package, channel, destination and source are explicit; the operator
never tries the upstream namespace when fork resolution fails. The configured
fork registry takes precedence over npm scope mappings. Registry URLs use HTTPS
(HTTP is allowed for loopback test registries) without embedded
credentials. Keep npm authentication in your own `.npmrc` or npm environment;
status/errors never return tokens or raw npm output. The trusted project config
is edited on the host, not through browser input.

Use `.sandcastle/package.json` for isolated automation, including a fresh
consumer. Choose `package.json` only for an existing declared runtime dependency
in `dependencies` or `devDependencies`. Installation preserves that section and
pins the resolved exact fork version. It updates the selected manifest,
`package-lock.json` and `node_modules` together after staging and verification.
Use npm-managed manifests; workspace/link dependencies or installations needing
lifecycle scripts may need project-owned installation outside this facility.
Other package managers and copied workflow migrations are separate operations.

```sh
sandcastle updates --cwd /path/to/project --dry-run
sandcastle updates --cwd /path/to/project --version '^0.13.0' --dry-run
sandcastle updates --cwd /path/to/project --version 0.13.0-fork.123 --install
sandcastle updates --cwd /path/to/project --install
sandcastle updates --cwd /path/to/project --rollback
```

Without an action flag the CLI prints a plan. Dry-run resolves metadata without
changing the consumer manifest, lock or installation. Version constraints select
the highest matching release regardless of registry metadata order. Plans include
installed version/archive/integrity/source, selected exact version, release notes,
destination and a content revision. Legacy installed archives without release
provenance are identified explicitly and can be replaced by the selected fork;
they are not misrepresented as source-qualified releases. Plans label a runtime
as current only when its package, version, integrity and source
provenance match the candidate. Malformed installation evidence requires host
reconciliation before preview or installation. CLI phase progress
goes to stderr and the result is printed as JSON on stdout. Select one action
flag at a time.

For a development archive, change `source` to:

```json
{
  "kind": "archive",
  "path": "releases/your-org-sandcastle-fork-0.13.0-fork.123.tgz"
}
```

Paths resolve against the selected project, or may be absolute host paths.
The archive's embedded package identity must match the configured fork. Its
SHA-512 integrity and provenance are displayed. This source is **pinned**:
it never follows npm latest and rejects version selection; choose a new archive
path explicitly. Old upstream development archives are supported as existing
installations, while new install candidates must carry fork release metadata.

The Updates form previews the same plan and has an explicit **Install/update
runtime** action and **Roll back runtime** action. A browser install is bound
to the reviewed revision; changed candidate/manifest/lock requires another
preview. Progress and failures are polled asynchronously, keeping run observation
responsive. Active operator runs, running Agent Map recordings (including stale
unreconciled runs), and Git recovery ownership block install/rollback. A project
execution claim also excludes a second operator instance or CLI update when a custom adapter does not record Agent Map sessions. There is
no force override. Starting an operator run during its update job is rejected.
Restart the operator after success to load the new runtime.

Relaunch using the selected manifest's installed CLI. For the isolated manifest
and the dependency alias shown above:

```sh
node /path/to/project/.sandcastle/node_modules/@ai-hero/sandcastle/dist/main.js operator --cwd /path/to/project
```

For a root manifest, use `/path/to/project/node_modules/` instead. Adjust the
dependency path if configured differently. A global CLI installation is a
separate installation; restarting that executable keeps its own runtime version.

Installs disable lifecycle scripts, stage dependencies away from the active
installation, verify installed package exports/version, source and integrity,
and preserve workflows, prompts, standards, configuration, gates and auth.
Host manifest/lock or runtime-identity edits during staging reject promotion and
retain those edits. The managed evidence directory writes its own ignore rule so
private staging/rollback files stay out of consumer Git status.
An install does not adopt or rewrite copied workflows/defaults; use the explicit
SDK/default-adoption procedures above when needed. Root dependency installations
replace the selected manifest's complete dependency tree with npm's verified
staged result, so review compatibility and stop all project execution first.

Private `.sandcastle/updates/<UUID>/record.json` retains target/previous evidence,
original-file backups and phase state. The latest successful install retains
rollback access even after a later attempt fails. Failures before promotion
leave the active installation intact; promotion failures restore its backups.
After a process interruption, stop/reconcile the recorded npm/host processes,
inspect the private record and operation lock, then remove the stale
`.sandcastle/updates/operation.lock` only after proving its owner has stopped.
Run `--rollback` to restore a staging/promoting attempt before starting another
install. Never expire or steal a lock by age. Keep this entire directory private
and ignored: staging may contain copies of npm auth references and dependencies.

The host SDK exports `runtimeVersion`, `planRuntimeUpdate({ cwd, version })`,
`installRuntimeUpdate({ cwd, version, expectedRevision, onProgress })` and
`rollbackRuntimeUpdate({ cwd })`. Pass `null` for the configured channel (or
archive), and the plan revision for a reviewed install. Trusted CLI-style
automation may use `expectedRevision: null` to resolve immediately.

| Updates route                | Contract                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `GET /api/updates`           | Configured-channel/pinned-source plan                                              |
| `POST /api/updates/plan`     | Exactly `{ "version": null }` or a string tag/version/constraint; same plan        |
| `POST /api/updates/install`  | Exactly `{ "version": null, "revision": "<plan revision>" }`; 202 asynchronous job |
| `POST /api/updates/rollback` | Empty object; 202 asynchronous job                                                 |
| `GET /api/updates/job`       | Latest operator-session job, safe phase progress and terminal failure/result       |

All existing session, origin, host, content-type and project-scope protections
apply. Runtime installation is a maintainer-trusted package operation; the web
cannot change package identity, registry, source paths or host command policy.

## Preparing a fork release candidate

Build and check the reviewed source first. Then prepare a distinct fork package
without changing the source package identity or publishing anything:

```sh
npm ci
npm run typecheck
npm run build
node scripts/pack-fork.mjs --name @your-org/sandcastle-fork --out /tmp/fork-candidates
# Optional: --version 0.13.0-fork.20261012.1 --notes /path/to/release-notes.md
```

The default version includes the source version, timestamp and Git commit.
An explicit version must be a unique prerelease; an existing candidate filename
in the destination is rejected. Use a clean reviewed checkout and a fresh build.
The artifact includes all built public exports, CLI and operator UI, default
templates, MIT license, README, release notes, and `runtime-source.json`.
The package manifest embeds `sandcastleRuntime` with schema version 1, repository,
40-character source commit and the exact package version. `sandcastleChangelog`
contains release notes. A sibling `.tgz.json` receipt records source, file
inventory and independently calculated SHA-512 archive integrity.

Test the archive in a temporary consumer and exercise the same registry contract
with the loopback fake registry/real npm browser suite:

```sh
node --test scripts/operator-updates.browser.test.mjs
```

Registry candidates must expose the same embedded metadata through npm's
version metadata and use a tarball from the configured registry origin. Real
registry publication, registry accounts and channel promotion remain
maintainer-owned. This preparation command only packs a candidate; it does not
publish, run npm lifecycle scripts, change accounts or edit consumer projects.
