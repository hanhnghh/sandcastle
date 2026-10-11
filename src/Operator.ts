import { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { Data, Effect } from "effect";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import type { CodexOptions } from "./AgentProvider.js";
import { writePrivateRecord } from "./writePrivateRecord.js";

/** The five roles supported by the Codex operator. */
export const operatorRoles = [
  "planner",
  "implementer",
  "reviewer",
  "merger",
  "readiness",
] as const;
/** A role in the reviewed workflow. */
export type OperatorRole = (typeof operatorRoles)[number];
/** Declared Codex capability; custom model IDs use the same provider options. */
export const codexCapability = {
  models: ["gpt-6.1-sol", "gpt-5.4", "gpt-5.4-mini"],
  efforts: ["low", "medium", "high", "xhigh"],
} as const satisfies {
  models: readonly string[];
  efforts: readonly NonNullable<CodexOptions["effort"]>[];
};
const roleSchema = z
  .object({
    provider: z.literal("codex"),
    model: z
      .string()
      .min(1)
      .max(200)
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/,
        "Use a model ID without whitespace or shell syntax",
      ),
    effort: z.enum(codexCapability.efforts),
  })
  .strict();
/** Internal source-schema validator shared with frozen runtime handoff. */
export const roleConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.string(),
    roles: z
      .object({
        planner: roleSchema,
        implementer: roleSchema,
        reviewer: roleSchema,
        merger: roleSchema,
        readiness: roleSchema,
      })
      .strict(),
  })
  .strict();
/** Versioned, credential-free project configuration. Revision is a content digest. */
export type RoleConfig = z.infer<typeof roleConfigSchema>;
/** Actionable configuration or runtime failure; never includes credential content. */
export class OperatorError extends Data.TaggedError("OperatorError")<{
  /** Safe diagnostic for the operator. */
  message: string;
}> {}

/** Canonical digest of the validated configuration payload. */
export const roleConfigRevision = (
  config: Pick<RoleConfig, "schemaVersion" | "roles">,
) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: config.schemaVersion,
        roles: config.roles,
      }),
    )
    .digest("hex");
const parseConfig = (input: unknown) =>
  Effect.try({
    try: () => {
      const parsed = roleConfigSchema.parse(input);
      return { ...parsed, revision: roleConfigRevision(parsed) };
    },
    catch: (cause) =>
      new OperatorError({
        message:
          cause instanceof z.ZodError
            ? cause.issues
                .map(
                  (issue) =>
                    `${issue.path.join(".") || "config"}: ${issue.message}`,
                )
                .join("; ")
            : "Invalid role configuration",
      }),
  });
/** Default roles preserve the supplied model; absent configuration uses gpt-6.1-sol. */
export const defaultRoleConfig = (model = "gpt-6.1-sol"): RoleConfig => {
  const roles = Object.fromEntries(
    operatorRoles.map((role) => [
      role,
      {
        provider: "codex",
        model,
        effort: role === "planner" || role === "implementer" ? "low" : "high",
      },
    ]),
  ) as RoleConfig["roles"];
  return {
    schemaVersion: 1,
    roles,
    revision: roleConfigRevision({ schemaVersion: 1, roles }),
  };
};
/** Internal Effect entry point for atomic runtime configuration reads. */
export const loadRoleConfigEffect = (cwd: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = join(cwd, ".sandcastle", "roles.json");
    if (!(yield* fs.exists(path))) return defaultRoleConfig();
    const text = yield* fs.readFileString(path);
    const input = yield* Effect.try({
      try: () => JSON.parse(text) as unknown,
      catch: () =>
        new OperatorError({
          message:
            "roles.json: invalid JSON; repair or remove the file to use defaults",
        }),
    });
    const config = yield* parseConfig(input);
    if ((input as RoleConfig).revision !== config.revision)
      return yield* Effect.fail(
        new OperatorError({
          message:
            "roles.json: revision does not match settings; save through the configuration interface",
        }),
      );
    return config;
  }).pipe(
    Effect.mapError((error) =>
      error instanceof OperatorError
        ? error
        : new OperatorError({
            message:
              "Cannot read .sandcastle/roles.json; check project permissions",
          }),
    ),
  );
/** Load validated settings from an explicit host project. Only a missing file uses defaults. */
export const loadRoleConfig = (options: {
  /** Host project directory. */ cwd: string;
}): Promise<RoleConfig> =>
  Effect.runPromise(
    loadRoleConfigEffect(options.cwd).pipe(
      Effect.provide(NodeFileSystem.layer),
    ),
  );
/** Internal validated atomic save used by init and public host APIs. */
export const saveRoleConfigEffect = (options: {
  cwd: string;
  config: unknown;
}) =>
  Effect.gen(function* () {
    const config = yield* parseConfig(options.config);
    const fs = yield* FileSystem.FileSystem;
    const directory = join(options.cwd, ".sandcastle");
    yield* fs.makeDirectory(directory, { recursive: true });
    yield* writePrivateRecord(
      fs,
      join(directory, "roles.json"),
      JSON.stringify(config, null, 2) + "\n",
    );
    return config;
  }).pipe(
    Effect.mapError((error) =>
      error instanceof OperatorError
        ? error
        : new OperatorError({
            message:
              "Cannot save .sandcastle/roles.json; check project permissions",
          }),
    ),
  );
/** Validate the complete document before atomically replacing roles.json. */
export const saveRoleConfig = (options: {
  /** Host project directory. */
  cwd: string;
  /** Complete version-one configuration; unknown fields are rejected. */
  config: unknown;
}): Promise<RoleConfig> =>
  Effect.runPromise(
    saveRoleConfigEffect(options).pipe(Effect.provide(NodeFileSystem.layer)),
  );
