import { loadProjectPromptsEffect } from "./OperatorPrompts.js";
import { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";
import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import {
  codex,
  type AgentProvider,
  type CodexOptions,
} from "./AgentProvider.js";
import { createAgentMap, type AgentMap } from "./AgentMap.js";
import {
  loadRoleConfigEffect,
  operatorRoles,
  OperatorError,
  type RoleConfig,
  type OperatorRole,
} from "./Operator.js";
import { z } from "zod";
import { roleConfigSchema, roleConfigRevision } from "./Operator.js";
import { VERSION } from "./version.js";
import { writePrivateRecord } from "./writePrivateRecord.js";

/** Immutable evidence for one project workflow invocation. Stored privately, not served as raw JSON. */
export interface RuntimeRecord {
  /** Unique workflow identity. */
  readonly id: string;
  /** Effective configuration, including its content revision. */
  readonly config: RoleConfig;
  /** Installed package runtime version. */
  readonly runtimeVersion: string;
  /** Project adapter's resolved sandbox identity (prefer an immutable image digest). */
  readonly sandboxIdentity: string;
  /** Frozen prompt contents and SHA-256 digests; null when a role has no prompt. */
  readonly prompts: Record<
    OperatorRole,
    { content: string; digest: string } | null
  >;
}
/** Frozen project run settings and provider construction. Project gates/sandboxes remain caller-owned. */
export interface ProjectRuntime {
  /** Frozen identity and effective inputs. */
  readonly record: RuntimeRecord;
  /** Build the configured role provider, preserving project-owned session/auth options. */
  agent(
    role: OperatorRole,
    options?: Omit<CodexOptions, "effort">,
  ): AgentProvider;
  /** Absolute host path to the frozen prompt template; expansion semantics are preserved. */
  promptFile(role: OperatorRole): string;
  /** Create an observable workflow map which records the effective role settings on every tracked invocation. */
  createAgentMap(name: string): Promise<AgentMap>;
}
/** Inputs owned by the project adapter, never accepted from editable HTTP configuration. */
export interface ProjectRuntimeOptions {
  /** Explicit host project directory. */
  cwd: string;
  /** Project prompt paths; relative paths resolve against cwd. */
  promptFiles: Record<OperatorRole, string | null>;
  /** Resolved sandbox identity, supplied by the project adapter. */
  sandboxIdentity: string;
}
const frozenPromptSchema = z
  .object({ content: z.string(), digest: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict()
  .nullable();
const runtimeRecordSchema = z
  .object({
    id: z.string().uuid(),
    config: roleConfigSchema,
    runtimeVersion: z.string(),
    sandboxIdentity: z.string().min(1),
    prompts: z
      .object({
        planner: frozenPromptSchema,
        implementer: frozenPromptSchema,
        reviewer: frozenPromptSchema,
        merger: frozenPromptSchema,
        readiness: frozenPromptSchema,
      })
      .strict(),
  })
  .strict();
const freeze = <T>(value: T): T => {
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
};
const hydrate = (cwd: string, record: RuntimeRecord): ProjectRuntime => {
  const projectDirectory = resolve(cwd);
  freeze(record);
  return {
    record,
    agent: (role, options) =>
      codex(record.config.roles[role].model, {
        ...options,
        effort: record.config.roles[role].effort,
      }),
    promptFile: (role) => {
      if (!record.prompts[role])
        throw new OperatorError({
          message: `No prompt configured for ${role}`,
        });
      return join(
        projectDirectory,
        ".sandcastle",
        "runtime",
        record.id,
        `${role}.md`,
      );
    },
    createAgentMap: (name) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const map = yield* Effect.tryPromise({
            try: () =>
              createAgentMap({
                cwd: projectDirectory,
                name,
                runtime: {
                  id: record.id,
                  configRevision: record.config.revision,
                  version: record.runtimeVersion,
                  sandboxIdentity: record.sandboxIdentity,
                },
              }),
            catch: () =>
              new OperatorError({
                message: "Cannot create workflow observation",
              }),
          });
          return {
            ...map,
            track: (task, execute) =>
              map.track(
                {
                  ...task,
                  ...record.config.roles[task.role],
                },
                execute,
              ),
          } satisfies AgentMap;
        }),
      ),
  };
};
/** Freeze an explicit project's effective inputs before invoking any role. */
export const createProjectRuntime = (
  options: ProjectRuntimeOptions,
): Promise<ProjectRuntime> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const config = yield* loadRoleConfigEffect(options.cwd);
      if (!options.sandboxIdentity.trim())
        return yield* Effect.fail(
          new OperatorError({
            message: "Project adapter must supply a sandbox identity",
          }),
        );
      const directory = join(
        resolve(options.cwd),
        ".sandcastle",
        "runtime",
        randomUUID(),
      );
      const selected = yield* loadProjectPromptsEffect(options);
      const prompts = {} as RuntimeRecord["prompts"];
      for (const role of operatorRoles) {
        const path = options.promptFiles[role];
        if (path === null) {
          prompts[role] = null;
          continue;
        }
        const content = selected[role]!.content;
        prompts[role] = {
          content,
          digest: createHash("sha256").update(content).digest("hex"),
        };
      }
      const record: RuntimeRecord = {
        id: directory.split(/[\\/]/).at(-1)!,
        config,
        runtimeVersion: VERSION,
        sandboxIdentity: options.sandboxIdentity,
        prompts,
      };
      yield* fs.makeDirectory(directory, { recursive: true, mode: 0o700 });
      for (const role of operatorRoles) {
        const prompt = prompts[role];
        if (prompt)
          yield* writePrivateRecord(
            fs,
            join(directory, `${role}.md`),
            prompt.content,
          );
      }
      yield* writePrivateRecord(
        fs,
        join(directory, "record.json"),
        JSON.stringify(record, null, 2) + "\n",
      );
      return hydrate(options.cwd, record);
    }).pipe(
      Effect.mapError((error) =>
        error instanceof OperatorError
          ? error
          : new OperatorError({
              message:
                "Cannot freeze project inputs; check prompt paths and permissions",
            }),
      ),
      Effect.provide(NodeFileSystem.layer),
    ),
  );

/** Reopen a frozen invocation in a project-owned child workflow, without reading live settings. */
export const openProjectRuntime = (options: {
  /** Host project directory. */
  cwd: string;
  /** UUID returned by createProjectRuntime; never a path. */
  id: string;
}): Promise<ProjectRuntime> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
          options.id,
        )
      )
        return yield* Effect.fail(
          new OperatorError({ message: "Invalid frozen runtime ID" }),
        );
      const directory = join(
        resolve(options.cwd),
        ".sandcastle",
        "runtime",
        options.id,
      );
      const text = yield* fs.readFileString(join(directory, "record.json"));
      const record = yield* Effect.try({
        try: () => runtimeRecordSchema.parse(JSON.parse(text)),
        catch: () =>
          new OperatorError({
            message: "Unsupported frozen runtime record schema",
          }),
      });
      if (
        record.id !== options.id ||
        record.runtimeVersion !== VERSION ||
        record.config.revision !== roleConfigRevision(record.config)
      )
        return yield* Effect.fail(
          new OperatorError({
            message: "Frozen runtime identity/version/revision mismatch",
          }),
        );
      for (const role of operatorRoles) {
        const prompt = record.prompts[role];
        if (!prompt) continue;
        const content = yield* fs.readFileString(join(directory, `${role}.md`));
        if (
          content !== prompt.content ||
          createHash("sha256").update(content).digest("hex") !== prompt.digest
        )
          return yield* Effect.fail(
            new OperatorError({
              message: `Frozen ${role} prompt integrity mismatch`,
            }),
          );
      }
      return hydrate(options.cwd, record);
    }).pipe(
      Effect.mapError((error) =>
        error instanceof OperatorError
          ? error
          : new OperatorError({
              message: "Cannot reopen frozen project runtime",
            }),
      ),
      Effect.provide(NodeFileSystem.layer),
    ),
  );
