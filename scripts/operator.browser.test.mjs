import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import {
  startOperator,
  loadRoleConfig,
  run as runAgent,
} from "../dist/index.js";

import { noSandbox } from "../dist/sandboxes/no-sandbox.js";

let browser;
before(async () => {
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
});

async function fixture(t, sharedContext) {
  const cwd = await mkdtemp(join(tmpdir(), "operator-browser-"));
  const bin = join(cwd, "bin");
  await mkdir(bin);
  await mkdir(join(cwd, ".sandcastle"));
  await writeFile(
    join(cwd, ".sandcastle/.gitignore"),
    "runtime/\nruns/\nlogs/\nfixture-gitconfig\n",
  );
  await writeFile(
    join(bin, "codex"),
    `#!/usr/bin/env node
console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: process.argv.slice(2).join(" ") + " <promise>COMPLETE</promise>" } }));
`,
  );
  await chmod(join(bin, "codex"), 0o755);
  for (const args of [
    ["init", "-qb", "main"],
    ["config", "user.name", "Browser fixture"],
    ["config", "user.email", "fixture@example.com"],
    ["add", "."],
    ["commit", "-qm", "fixture"],
  ])
    execFileSync("git", args, { cwd });
  let providerOutput = "";
  let finish, started, completed;
  const wait = new Promise((resolve) => {
    finish = resolve;
  });
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const done = new Promise((resolve) => {
    completed = resolve;
  });
  let didStart = false;
  const server = await startOperator({
    cwd,
    port: 0,
    adapter: {
      promptFiles: {
        planner: null,
        implementer: null,
        reviewer: null,
        merger: null,
        readiness: null,
      },
      sandboxIdentity: async () => "fake-browser-image",
      run: async (runtime) => {
        didStart = true;
        const map = await runtime.createAgentMap("Browser fake provider");
        await map.track(
          { batch: 1, role: "implementer", title: "Fake run", branch: "main" },
          async (logging) => {
            const result = await runAgent({
              cwd,
              agent: runtime.agent("implementer", { captureSessions: false }),
              sandbox: noSandbox({
                env: {
                  PATH: bin + ":" + process.env.PATH,
                  GIT_CONFIG_GLOBAL: join(
                    cwd,
                    ".sandcastle",
                    "fixture-gitconfig",
                  ),
                },
              }),
              prompt: "Observe configured fake provider",
              logging,
            });
            providerOutput = result.stdout;
            started();
            await wait;
            return result;
          },
        );
        await map.finish("completed");
        completed();
      },
    },
  });
  const context = sharedContext ?? (await browser.newContext());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(10000);
  t.after(async () => {
    finish();
    if (didStart) await done;
    if (!sharedContext) await context.close();
    await server.close();
    await rm(cwd, { recursive: true, force: true });
    assert.deepEqual(errors, []);
  });
  await page.goto(server.url);
  await page.getByLabel("Implementer effort").waitFor();
  return {
    page,
    cwd,
    server,
    ready,
    context,
    providerOutput: () => providerOutput,
    release: finish,
  };
}

test("model dropdowns and custom IDs save, reload and route to the selected project", async (t) => {
  const first = await fixture(t);
  const second = await fixture(t, first.context);
  assert.equal(
    await first.page.getByLabel("Implementer effort").inputValue(),
    "low",
  );
  assert.equal(
    await first.page.getByLabel("Reviewer effort").inputValue(),
    "high",
  );
  await first.page
    .getByLabel("Implementer model", { exact: true })
    .selectOption("gpt-5.4");
  await first.page.getByLabel("Implementer effort").selectOption("medium");
  await first.page.getByRole("button", { name: "Save settings" }).click();
  await first.page
    .getByRole("status")
    .filter({ hasText: "Settings saved." })
    .waitFor();
  await first.page.reload();
  assert.equal(
    await first.page
      .getByLabel("Implementer model", { exact: true })
      .inputValue(),
    "gpt-5.4",
  );
  assert.equal(
    await first.page.getByLabel("Implementer effort").inputValue(),
    "medium",
  );
  await first.page
    .getByLabel("Planner model", { exact: true })
    .selectOption("custom");
  await first.page
    .getByLabel("Planner custom model")
    .fill("organization/custom-model");
  await first.page.getByRole("button", { name: "Save settings" }).click();
  await first.page
    .getByRole("status")
    .filter({ hasText: "Settings saved." })
    .waitFor();
  await first.page.reload();
  assert.equal(
    await first.page.getByLabel("Planner custom model").inputValue(),
    "organization/custom-model",
  );
  assert.equal(
    (await loadRoleConfig({ cwd: second.cwd })).roles.implementer.model,
    "gpt-6.1-sol",
  );
  await first.page
    .getByRole("button", { name: "Start run", exact: true })
    .click();
  await first.ready;
  assert.ok(first.providerOutput().includes("-m gpt-5.4"));
  assert.ok(first.providerOutput().includes('model_reasoning_effort="medium"'));
  assert.equal(
    await second.page
      .getByLabel("Implementer model", { exact: true })
      .inputValue(),
    "gpt-6.1-sol",
  );
});

test("keyboard operation and actionable invalid-input feedback preserve durable settings", async (t) => {
  const { page, cwd } = await fixture(t);
  const effort = page.getByLabel("Reviewer effort");
  await effort.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  assert.equal(await effort.inputValue(), "medium");
  await page
    .getByLabel("Reviewer model", { exact: true })
    .selectOption("custom");
  await page.getByLabel("Reviewer custom model").fill("invalid model");
  await page.getByRole("button", { name: "Save settings" }).focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("status")
    .filter({ hasText: "roles.reviewer.model:" })
    .waitFor();
  assert.equal(
    (await loadRoleConfig({ cwd })).roles.reviewer.model,
    "gpt-6.1-sol",
  );
  await page.getByLabel("Reviewer custom model").fill("keyboard-model");
  await page.getByRole("button", { name: "Save settings" }).focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("status")
    .filter({ hasText: "Settings saved." })
    .waitFor();
  assert.equal((await loadRoleConfig({ cwd })).roles.reviewer.effort, "medium");
});

test("saving during a run leaves its displayed settings frozen and opens recorded workflow logs", async (t) => {
  const { page, ready, server, release, providerOutput } = await fixture(t);
  await page.getByRole("button", { name: "Start run", exact: true }).click();
  await ready;
  await page
    .getByRole("status")
    .filter({ hasText: "implementer: gpt-6.1-sol / low" })
    .waitFor();
  await page
    .getByLabel("Implementer model", { exact: true })
    .selectOption("gpt-5.4");
  await page.getByLabel("Implementer effort").selectOption("xhigh");
  await page.getByRole("button", { name: "Save settings" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Settings saved." })
    .waitFor();
  const current = await (await fetch(server.url + "/api/run")).json();
  assert.equal(current.run.config.roles.implementer.model, "gpt-6.1-sol");
  assert.equal(current.run.config.roles.implementer.effort, "low");
  release();
  await page.getByRole("status").filter({ hasText: "· completed ·" }).waitFor();
  await page.getByRole("button", { name: "Start run", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "implementer: gpt-5.4 / xhigh" })
    .waitFor();
  await page.getByRole("status").filter({ hasText: "· completed ·" }).waitFor();
  assert.ok(providerOutput().includes("-m gpt-5.4"));
  assert.ok(providerOutput().includes('model_reasoning_effort="xhigh"'));

  const popup = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Observe runs and logs" }).click();
  const dashboard = await popup;
  await dashboard
    .getByRole("heading", { name: "Browser fake provider", exact: true })
    .waitFor();
  await dashboard
    .getByRole("button", { name: /Fake run/ })
    .first()
    .click();
  await dashboard.getByRole("tab", { name: "Logs", exact: true }).waitFor();
});
