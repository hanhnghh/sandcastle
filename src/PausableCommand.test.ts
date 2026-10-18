import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { pausableCommand, stopPausableCommand } from "./PausableCommand.js";

const run = promisify(execFile);
const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true });
});

const start = (command: string, stdin: string) => {
  const proc = spawn("sh", ["-c", command], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  proc.stdout.on("data", (chunk) => (stdout += chunk));
  proc.stdin.end(stdin);
  const exited = new Promise<number | null>((resolve) =>
    proc.on("close", (code, signal) => resolve(code ?? (signal ? 143 : null))),
  );
  return { exited, stdout: () => stdout };
};

it.skipIf(process.platform === "win32")(
  "forwards stdin and the exit code when the command finishes",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "pausable-"));
    dirs.push(dir);
    const pidFile = join(dir, "agent.pid");
    const child = start(
      pausableCommand('read line; echo "got:$line"; exit 7', pidFile),
      "hello\n",
    );
    expect(await child.exited).toBe(7);
    expect(child.stdout()).toContain("got:hello");
    await expect(readFile(pidFile)).rejects.toThrow();
  },
);

it.skipIf(process.platform === "win32")(
  "stops the command and every child it spawned",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "pausable-"));
    dirs.push(dir);
    const pidFile = join(dir, "agent.pid");
    const marker = join(dir, "survived.txt");
    await writeFile(marker, "");
    const child = start(
      pausableCommand(
        `read line; echo "got:$line"; sh -c 'sleep 5; echo child >> ${marker}' & sleep 5; echo parent >> ${marker}`,
        pidFile,
      ),
      "hello\n",
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    await run("sh", ["-c", stopPausableCommand(pidFile)]);
    expect(await child.exited).not.toBe(0);
    expect(child.stdout()).toContain("got:hello");
    await new Promise((resolve) => setTimeout(resolve, 5_500));
    expect(await readFile(marker, "utf8")).toBe("");
    await expect(readFile(pidFile)).rejects.toThrow();
  },
  20_000,
);

it.skipIf(process.platform === "win32")(
  "stopping without a started command is a no-op",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "pausable-"));
    dirs.push(dir);
    const started = Date.now();
    await run("sh", ["-c", stopPausableCommand(join(dir, "missing.pid"))]);
    expect(Date.now() - started).toBeLessThan(10_000);
  },
  20_000,
);
