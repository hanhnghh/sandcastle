import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Env key Claude Code reads for a subscription (setup-token) credential. */
export const CLAUDE_TOKEN_KEY = "CLAUDE_CODE_OAUTH_TOKEN";
/** Sandcastle metadata: the day the token was created, for expiry warnings. */
export const CLAUDE_TOKEN_ISSUED_KEY = "CLAUDE_CODE_OAUTH_TOKEN_ISSUED_AT";

/** `claude setup-token` tokens last one year. */
const TOKEN_LIFETIME_DAYS = 365;
const EXPIRY_WARNING_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** True for the shape of a Claude Code OAuth token; does not prove it works. */
export const isClaudeOAuthToken = (value: string): boolean =>
  /^sk-ant-oat\d{2}-[A-Za-z0-9_-]{20,}$/.test(value.trim());

const envPath = (cwd: string) => join(cwd, ".sandcastle", ".env");

const keyLine = (key: string) => new RegExp(`^\\s*${key}\\s*=`);

/** Declared keys of `.sandcastle/.env` (quotes stripped, comments ignored). */
const readEnvFile = (cwd: string): Record<string, string> => {
  let content: string;
  try {
    content = readFileSync(envPath(cwd), "utf8");
  } catch {
    return {};
  }
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2]!.trim();
    if (
      value.length >= 2 &&
      (value[0] === '"' || value[0] === "'") &&
      value.at(-1) === value[0]
    )
      value = value.slice(1, -1);
    vars[match[1]!] = value;
  }
  return vars;
};

export type ClaudeSubscriptionStatus =
  | "ok"
  | "expiring"
  | "api-key-conflict"
  | "missing"
  | "undeclared"
  | "invalid-format"
  | "expired";

export interface ClaudeSubscriptionCheck {
  readonly status: ClaudeSubscriptionStatus;
  /** False for a status that would make a Claude run fail. */
  readonly usable: boolean;
  /** Owner-facing explanation and next step; never contains the token. */
  readonly message: string;
  /** Expiry day (YYYY-MM-DD) when the issue date is recorded. */
  readonly expiresAt?: string;
}

const LOGIN_HINT = "Run `npx sandcastle claude-login`.";

/**
 * Check the Claude subscription credential locally, without a network
 * request: declared in `.sandcastle/.env` (the only keys Sandcastle forwards),
 * well-formed, not expired, and not shadowed by an API key.
 */
export const checkClaudeSubscription = (options: {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: Date;
}): ClaudeSubscriptionCheck => {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const declared = readEnvFile(options.cwd);
  // Same precedence as resolveEnv: .sandcastle/.env, then process.env, for
  // declared keys only.
  const resolve = (key: string) =>
    key in declared ? declared[key] || env[key] || "" : "";
  if (!(CLAUDE_TOKEN_KEY in declared))
    return {
      status: env[CLAUDE_TOKEN_KEY] ? "undeclared" : "missing",
      usable: false,
      message: env[CLAUDE_TOKEN_KEY]
        ? `${CLAUDE_TOKEN_KEY} is set in the shell but not declared in .sandcastle/.env, so it is not forwarded to sandboxes. ${LOGIN_HINT}`
        : `No Claude subscription token. ${LOGIN_HINT}`,
    };
  const token = resolve(CLAUDE_TOKEN_KEY);
  if (!token)
    return {
      status: "missing",
      usable: false,
      message: `${CLAUDE_TOKEN_KEY} is declared but empty. ${LOGIN_HINT}`,
    };
  if (!isClaudeOAuthToken(token))
    return {
      status: "invalid-format",
      usable: false,
      message: `${CLAUDE_TOKEN_KEY} is not a Claude Code OAuth token (expected sk-ant-oat…). ${LOGIN_HINT}`,
    };
  const issued = resolve(CLAUDE_TOKEN_ISSUED_KEY);
  const issuedAt = /^\d{4}-\d{2}-\d{2}$/.test(issued)
    ? new Date(`${issued}T00:00:00Z`)
    : undefined;
  const expires =
    issuedAt && !Number.isNaN(issuedAt.getTime())
      ? new Date(issuedAt.getTime() + TOKEN_LIFETIME_DAYS * DAY_MS)
      : undefined;
  const expiresAt = expires?.toISOString().slice(0, 10);
  if (expires && now >= expires)
    return {
      status: "expired",
      usable: false,
      expiresAt,
      message: `The Claude subscription token expired on ${expiresAt}. ${LOGIN_HINT}`,
    };
  if (resolve("ANTHROPIC_API_KEY"))
    return {
      status: "api-key-conflict",
      usable: true,
      expiresAt,
      message:
        "ANTHROPIC_API_KEY is also set; non-interactive Claude runs may bill the API key instead of the subscription. Remove it from .sandcastle/.env to use the subscription.",
    };
  if (
    expires &&
    expires.getTime() - now.getTime() <= EXPIRY_WARNING_DAYS * DAY_MS
  )
    return {
      status: "expiring",
      usable: true,
      expiresAt,
      message: `The Claude subscription token expires on ${expiresAt}. ${LOGIN_HINT}`,
    };
  return {
    status: "ok",
    usable: true,
    expiresAt,
    message: expiresAt
      ? `Claude subscription token present; expires ${expiresAt}`
      : "Claude subscription token present; issue date not recorded, so expiry is unknown",
  };
};

/**
 * Write the token and its issue date to `.sandcastle/.env`, replacing earlier
 * values and keeping every other line. The file is written privately (0600)
 * and renamed into place.
 */
export const writeClaudeToken = (options: {
  readonly cwd: string;
  readonly token: string;
  readonly now?: Date;
}): void => {
  const token = options.token.trim();
  if (!isClaudeOAuthToken(token))
    throw new Error(
      "That is not a Claude Code OAuth token (expected sk-ant-oat…); nothing was written.",
    );
  const issued = (options.now ?? new Date()).toISOString().slice(0, 10);
  const path = envPath(options.cwd);
  let lines: string[] = [];
  try {
    lines = readFileSync(path, "utf8").split("\n");
  } catch {
    mkdirSync(join(options.cwd, ".sandcastle"), { recursive: true });
  }
  const values: [string, string][] = [
    [CLAUDE_TOKEN_KEY, token],
    [CLAUDE_TOKEN_ISSUED_KEY, issued],
  ];
  for (const [key, value] of values) {
    // One declaration per key, where the first one was.
    const first = lines.findIndex((line) => keyLine(key).test(line));
    lines = lines.filter((line) => !keyLine(key).test(line));
    if (first === -1) {
      while (lines.length && lines.at(-1) === "") lines.pop();
      lines.push(`${key}=${value}`);
    } else lines.splice(first, 0, `${key}=${value}`);
  }
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${lines.join("\n")}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
};

export interface ClaudeCommandOptions {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly stdio: "ignore" | "inherit";
}

export type ClaudeCommandRunner = (
  command: string,
  args: readonly string[],
  options: ClaudeCommandOptions,
) => { readonly status: number | null };

const defaultRunner: ClaudeCommandRunner = (command, args, options) =>
  spawnSync(command, args, options);

/**
 * Confirm a token works with one minimal request. Uses only the token: the
 * API key and the host's Claude login are excluded, and an empty config
 * directory is removed afterwards.
 */
export const verifyClaudeToken = (options: {
  readonly cwd: string;
  readonly token: string;
  readonly run?: ClaudeCommandRunner;
}): boolean => {
  const configDir = mkdtempSync(join(tmpdir(), "sandcastle-claude-verify-"));
  try {
    const {
      ANTHROPIC_API_KEY: _key,
      ANTHROPIC_AUTH_TOKEN: _auth,
      ...env
    } = process.env;
    const result = (options.run ?? defaultRunner)(
      "claude",
      ["-p", "Reply with OK.", "--max-turns", "1", "--model", "haiku"],
      {
        cwd: options.cwd,
        env: {
          ...env,
          CLAUDE_CONFIG_DIR: configDir,
          [CLAUDE_TOKEN_KEY]: options.token,
        },
        stdio: "ignore",
      },
    );
    return result.status === 0;
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
};

export type ClaudeLoginResult = "already-configured" | "configured";

/**
 * Guided subscription login: when no usable token is configured, run
 * `claude setup-token` (browser sign-in), ask for the printed token with
 * masked input, and store it in `.sandcastle/.env`. `force` replaces a
 * working token.
 */
export const ensureClaudeSubscriptionLogin = async (options: {
  readonly cwd: string;
  /** Masked prompt for the token printed by `claude setup-token`. */
  readonly readToken: () => Promise<string | undefined>;
  readonly force?: boolean;
  readonly verify?: boolean;
  readonly run?: ClaudeCommandRunner;
  readonly now?: Date;
}): Promise<ClaudeLoginResult> => {
  const run = options.run ?? defaultRunner;
  const current = checkClaudeSubscription({
    cwd: options.cwd,
    now: options.now,
  });
  if (
    !options.force &&
    (current.status === "ok" || current.status === "api-key-conflict")
  )
    return "already-configured";
  const setup = run("claude", ["setup-token"], {
    cwd: options.cwd,
    env: process.env,
    stdio: "inherit",
  });
  if (setup.status !== 0)
    throw new Error(
      "`claude setup-token` failed. Install Claude Code (https://claude.com/claude-code), sign in with a Claude subscription and retry `npx sandcastle claude-login`.",
    );
  const token = (await options.readToken())?.trim();
  if (!token) throw new Error("No token entered; nothing was written.");
  if (!isClaudeOAuthToken(token))
    throw new Error(
      "That is not a Claude Code OAuth token (expected sk-ant-oat…); nothing was written.",
    );
  if (options.verify && !verifyClaudeToken({ cwd: options.cwd, token, run }))
    throw new Error(
      "The token was rejected by a test request; nothing was written. Run `claude setup-token` again.",
    );
  writeClaudeToken({ cwd: options.cwd, token, now: options.now });
  return "configured";
};

/**
 * Why a Claude Code role cannot run, or null. A malformed or expired token is
 * always a problem. A missing token is one only when `requireCredential` is
 * set (a Docker sandbox, which cannot see the host's Claude login) and no API
 * key is declared in `.sandcastle/.env` as the alternative.
 */
export const claudeCredentialProblem = (options: {
  readonly cwd: string;
  readonly requireCredential?: boolean;
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: Date;
}): string | null => {
  const check = checkClaudeSubscription(options);
  if (check.usable) return null;
  if (check.status === "invalid-format" || check.status === "expired")
    return check.message;
  if (!options.requireCredential) return null;
  const declared = readEnvFile(options.cwd);
  const env = options.env ?? process.env;
  if (
    "ANTHROPIC_API_KEY" in declared &&
    (declared.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY)
  )
    return null;
  return check.message;
};
