import {
  claudeCode,
  codex,
  copilot,
  cursor,
  opencode,
  pi,
  type AgentProvider,
  type ClaudeCodeOptions,
  type CodexOptions,
  type CopilotOptions,
  type CursorOptions,
  type OpenCodeOptions,
  type PiOptions,
} from "./AgentProvider.js";
import { withAgentFallback, type AgentChainEntry } from "./AgentFallback.js";
import { withCredentialScope } from "./CredentialScope.js";
import {
  providerCapabilities,
  type RoleProvider,
  type RoleSetting,
  type RoleTarget,
} from "./Operator.js";

/**
 * Project-owned provider options (sessions, env, permission modes). Top-level
 * fields are Codex options, preserving the original `agent(role, options)`
 * contract; other providers read their own entry under `providers`. Effort is
 * taken from the role configuration unless `effort` raises it for one
 * invocation.
 */
export type RoleAgentOptions = Omit<CodexOptions, "effort"> & {
  /**
   * Effort for this invocation in place of the configured one, applied to the
   * primary target and each fallback whose provider accepts the value.
   */
  readonly effort?: string;
  readonly providers?: {
    readonly claudeCode?: Omit<ClaudeCodeOptions, "effort">;
    readonly pi?: Omit<PiOptions, "thinking">;
    readonly opencode?: Omit<OpenCodeOptions, "variant">;
    readonly copilot?: Omit<CopilotOptions, "effort">;
    readonly cursor?: CursorOptions;
  };
};

const builders: {
  [P in RoleProvider]: (
    target: RoleTarget,
    options: RoleAgentOptions | undefined,
  ) => AgentProvider;
} = {
  codex: (target, options) => {
    const { providers: _ignored, ...codexOptions } = options ?? {};
    return codex(target.model, {
      ...codexOptions,
      effort: target.effort as CodexOptions["effort"],
    });
  },
  claudeCode: (target, options) =>
    claudeCode(target.model, {
      ...options?.providers?.claudeCode,
      effort: target.effort as ClaudeCodeOptions["effort"],
    }),
  pi: (target, options) =>
    pi(target.model, {
      ...options?.providers?.pi,
      thinking: target.effort as PiOptions["thinking"],
    }),
  opencode: (target, options) =>
    opencode(target.model, {
      ...options?.providers?.opencode,
      ...(target.effort === undefined ? {} : { variant: target.effort }),
    }),
  copilot: (target, options) =>
    copilot(target.model, {
      ...options?.providers?.copilot,
      effort: target.effort as CopilotOptions["effort"],
    }),
  cursor: (target, options) => cursor(target.model, options?.providers?.cursor),
};

/** Build the agent provider for one validated role target. */
export const buildRoleAgent = (
  target: RoleTarget,
  options?: RoleAgentOptions,
): AgentProvider => {
  const { effort: _effort, ...providerOptions } = options ?? {};
  return withCredentialScope(
    builders[target.provider](
      withEffort(target, options?.effort),
      providerOptions,
    ),
    target.provider,
  );
};

/** The target with `effort` applied when its provider accepts that value. */
const withEffort = (
  target: RoleTarget,
  effort: string | undefined,
): RoleTarget => {
  const efforts: readonly string[] | null =
    providerCapabilities[target.provider].efforts;
  return effort !== undefined && (efforts === null || efforts.includes(effort))
    ? { ...target, effort }
    : target;
};

const entry = (
  target: RoleTarget,
  options: RoleAgentOptions | undefined,
): AgentChainEntry => {
  const effective = withEffort(target, options?.effort);
  return {
    agent: buildRoleAgent(target, options),
    target: {
      provider: effective.provider,
      model: effective.model,
      ...(effective.effort === undefined ? {} : { effort: effective.effort }),
    },
  };
};

/**
 * Build the role's primary provider with its configured fallback chain
 * attached. Without fallbacks this is exactly `buildRoleAgent(setting)`.
 */
export const buildRoleAgentWithFallback = (
  setting: RoleSetting,
  options?: RoleAgentOptions,
): AgentProvider =>
  withAgentFallback(
    entry(setting, options),
    setting.fallback.map((target) => entry(target, options)),
  );
