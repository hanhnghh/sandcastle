import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  checkClaudeSubscription,
  ensureClaudeSubscriptionLogin,
  isClaudeOAuthToken,
  verifyClaudeToken,
  writeClaudeToken,
  type ClaudeCommandRunner,
} from "./ClaudeSubscription.js";

const TOKEN = `sk-ant-oat01-${"a".repeat(40)}`;
const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true });
});

const project = async (env?: string) => {
  const cwd = await mkdtemp(join(tmpdir(), "claude-sub-"));
  dirs.push(cwd);
  await mkdir(join(cwd, ".sandcastle"));
  if (env !== undefined) await writeFile(join(cwd, ".sandcastle/.env"), env);
  return cwd;
};

const now = new Date("2026-10-18T00:00:00Z");

it("recognises the OAuth token shape only", () => {
  expect(isClaudeOAuthToken(TOKEN)).toBe(true);
  expect(isClaudeOAuthToken(` ${TOKEN}\n`)).toBe(true);
  expect(isClaudeOAuthToken("sk-ant-api03-" + "a".repeat(40))).toBe(false);
  expect(isClaudeOAuthToken("sk-ant-oat01-short")).toBe(false);
});

it("reports each credential state without a network request", async () => {
  const check = async (
    env: string | undefined,
    shell: NodeJS.ProcessEnv = {},
  ) => checkClaudeSubscription({ cwd: await project(env), env: shell, now });
  expect(await check(undefined)).toMatchObject({
    status: "missing",
    usable: false,
  });
  expect(await check("", { CLAUDE_CODE_OAUTH_TOKEN: TOKEN })).toMatchObject({
    status: "undeclared",
    usable: false,
  });
  // A declared but empty key falls back to the shell, like resolveEnv.
  expect(
    await check("CLAUDE_CODE_OAUTH_TOKEN=\n", {
      CLAUDE_CODE_OAUTH_TOKEN: TOKEN,
    }),
  ).toMatchObject({ status: "ok", usable: true });
  expect(await check("CLAUDE_CODE_OAUTH_TOKEN=\n")).toMatchObject({
    status: "missing",
  });
  expect(await check("CLAUDE_CODE_OAUTH_TOKEN=not-a-token\n")).toMatchObject({
    status: "invalid-format",
    usable: false,
  });
  expect(await check(`CLAUDE_CODE_OAUTH_TOKEN="${TOKEN}"\n`)).toMatchObject({
    status: "ok",
    message: expect.stringContaining("expiry is unknown"),
  });
  expect(
    await check(
      `CLAUDE_CODE_OAUTH_TOKEN=${TOKEN}\nCLAUDE_CODE_OAUTH_TOKEN_ISSUED_AT=2026-01-01\n`,
    ),
  ).toMatchObject({ status: "ok", expiresAt: "2027-01-01" });
  expect(
    await check(
      `CLAUDE_CODE_OAUTH_TOKEN=${TOKEN}\nCLAUDE_CODE_OAUTH_TOKEN_ISSUED_AT=2025-11-01\n`,
    ),
  ).toMatchObject({
    status: "expiring",
    usable: true,
    expiresAt: "2026-11-01",
  });
  expect(
    await check(
      `CLAUDE_CODE_OAUTH_TOKEN=${TOKEN}\nCLAUDE_CODE_OAUTH_TOKEN_ISSUED_AT=2025-10-01\n`,
    ),
  ).toMatchObject({ status: "expired", usable: false });
  expect(
    await check(
      `CLAUDE_CODE_OAUTH_TOKEN=${TOKEN}\nANTHROPIC_API_KEY=sk-ant-api03-x\n`,
    ),
  ).toMatchObject({ status: "api-key-conflict", usable: true });
});

it("never puts the token in a message", async () => {
  for (const env of [
    `CLAUDE_CODE_OAUTH_TOKEN=${TOKEN}\n`,
    `CLAUDE_CODE_OAUTH_TOKEN=${TOKEN}x!\n`,
    `CLAUDE_CODE_OAUTH_TOKEN=${TOKEN}\nCLAUDE_CODE_OAUTH_TOKEN_ISSUED_AT=2020-01-01\n`,
  ])
    expect(
      checkClaudeSubscription({ cwd: await project(env), env: {}, now })
        .message,
    ).not.toContain("aaaaaaaa");
});

it("writes the token privately and keeps other entries", async () => {
  const cwd = await project(
    "# GitHub\nGH_TOKEN=gh-1\nCLAUDE_CODE_OAUTH_TOKEN=old\nOTHER=1\nCLAUDE_CODE_OAUTH_TOKEN=dup\n",
  );
  writeClaudeToken({ cwd, token: ` ${TOKEN}\n`, now });
  const content = await readFile(join(cwd, ".sandcastle/.env"), "utf8");
  expect(content).toBe(
    `# GitHub\nGH_TOKEN=gh-1\nCLAUDE_CODE_OAUTH_TOKEN=${TOKEN}\nOTHER=1\nCLAUDE_CODE_OAUTH_TOKEN_ISSUED_AT=2026-10-18\n`,
  );
  expect((await stat(join(cwd, ".sandcastle/.env"))).mode & 0o777).toBe(0o600);
  expect(checkClaudeSubscription({ cwd, env: {}, now })).toMatchObject({
    status: "ok",
    expiresAt: "2027-10-18",
  });
  expect(() => writeClaudeToken({ cwd, token: "nope" })).toThrow(
    /nothing was written/,
  );
});

it("creates .sandcastle/.env when it does not exist", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "claude-sub-"));
  dirs.push(cwd);
  writeClaudeToken({ cwd, token: TOKEN, now });
  expect(await readFile(join(cwd, ".sandcastle/.env"), "utf8")).toBe(
    `CLAUDE_CODE_OAUTH_TOKEN=${TOKEN}\nCLAUDE_CODE_OAUTH_TOKEN_ISSUED_AT=2026-10-18\n`,
  );
});

const recorder = (status: Record<string, number> = {}) => {
  const calls: { args: readonly string[]; env: NodeJS.ProcessEnv }[] = [];
  const run: ClaudeCommandRunner = (_command, args, options) => {
    calls.push({ args, env: options.env });
    return { status: status[args[0]!] ?? 0 };
  };
  return { calls, run };
};

it("guided login runs setup-token, stores the pasted token and skips when configured", async () => {
  const cwd = await project("");
  const { calls, run } = recorder();
  expect(
    await ensureClaudeSubscriptionLogin({
      cwd,
      run,
      now,
      readToken: async () => TOKEN,
    }),
  ).toBe("configured");
  expect(calls.map((call) => call.args[0])).toEqual(["setup-token"]);
  expect(checkClaudeSubscription({ cwd, env: {}, now }).status).toBe("ok");
  expect(
    await ensureClaudeSubscriptionLogin({
      cwd,
      run,
      now,
      readToken: async () => {
        throw new Error("not asked");
      },
    }),
  ).toBe("already-configured");
  expect(calls).toHaveLength(1);
});

it("guided login fails without writing on a failed setup, empty input, a bad token or a rejected verification", async () => {
  for (const [status, input, verify, message] of [
    [{ "setup-token": 1 }, TOKEN, false, /setup-token` failed/],
    [{}, "", false, /No token entered/],
    [
      {},
      "sk-ant-api03-" + "a".repeat(40),
      false,
      /not a Claude Code OAuth token/,
    ],
    [{ "-p": 1 }, TOKEN, true, /rejected by a test request/],
  ] as const) {
    const cwd = await project("GH_TOKEN=x\n");
    const { run } = recorder(status);
    await expect(
      ensureClaudeSubscriptionLogin({
        cwd,
        run,
        now,
        verify,
        readToken: async () => input,
      }),
    ).rejects.toThrow(message);
    expect(await readFile(join(cwd, ".sandcastle/.env"), "utf8")).toBe(
      "GH_TOKEN=x\n",
    );
  }
});

it("verification uses only the token in an isolated, removed config directory", async () => {
  const previous = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "sk-ant-api03-host";
  try {
    const { calls, run } = recorder();
    expect(verifyClaudeToken({ cwd: tmpdir(), token: TOKEN, run })).toBe(true);
    const env = calls[0]!.env;
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe(TOKEN);
    expect(env.CLAUDE_CONFIG_DIR).toMatch(/sandcastle-claude-verify-/);
    await expect(stat(env.CLAUDE_CONFIG_DIR!)).rejects.toThrow();
  } finally {
    if (previous === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previous;
  }
});

it("credential problems: broken tokens always, a missing one only when required and without an API key", async () => {
  const { claudeCredentialProblem } = await import("./ClaudeSubscription.js");
  const problem = async (env: string, requireCredential: boolean) =>
    claudeCredentialProblem({
      cwd: await project(env),
      env: {},
      now,
      requireCredential,
    });
  expect(await problem("CLAUDE_CODE_OAUTH_TOKEN=bad\n", false)).toMatch(
    /not a Claude Code OAuth token/,
  );
  expect(await problem("", false)).toBeNull();
  expect(await problem("", true)).toMatch(/No Claude subscription token/);
  expect(await problem("ANTHROPIC_API_KEY=sk-ant-api03-x\n", true)).toBeNull();
  expect(await problem(`CLAUDE_CODE_OAUTH_TOKEN=${TOKEN}\n`, true)).toBeNull();
});
