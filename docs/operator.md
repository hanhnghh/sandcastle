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
scaffolds consume shared runtime settings. Build the project's Docker/Podman
image and install the workflow's dependencies (including tsx) first. The CLI
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

| Route              | Behavior                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| `GET /api/prompts` | Effective role templates, ownership, default/base contents and versions, changed-default status      |
| `PUT /api/prompts` | Exactly `{ "role": "implementer", "content": "..." }`; null content resets; returns resolved prompts |
| `GET /api/config`  | Validated config, declared model/effort capability and selected project                              |
| `PUT /api/config`  | Complete config document; returns the saved config/revision                                          |
| `POST /api/run`    | Empty JSON object only; freezes settings, invokes the fixed adapter; 202 with ID/revision            |
| `GET /api/run`     | Current operator-session run status and frozen settings/identity, excluding prompt contents          |
| `GET /dashboard`   | Opens the project's read-only Agent Map                                                              |

Mutations require `Content-Type: application/json` and at most 16 KiB.
Invalid config/body returns 400 with actionable diagnostics; invalid session,
origin or host returns 403; wrong content type 415; oversized body 413;
overlapping starts in one operator session 409. Query overrides are rejected.
Execution failures report failed status; inspect workflow logs and host output.
