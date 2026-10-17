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
import type { RoleProvider, RoleTarget } from "./Operator.js";

/**
 * Project-owned provider options (sessions, env, permission modes). Top-level
 * fields are Codex options, preserving the original `agent(role, options)`
 * contract; other providers read their own entry under `providers`. Effort is
 * always taken from the role configuration.
 */
export type RoleAgentOptions = Omit<CodexOptions, "effort"> & {
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
): AgentProvider => builders[target.provider](target, options);
