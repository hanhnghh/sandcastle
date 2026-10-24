// Tests for the closing-keyword guard shipped in the parallel-planner-with-review template.
// @ts-nocheck -- exercises plain CommonJS template modules.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

const require = createRequire(import.meta.url);
const {
  closingReferences,
  commitClosingReferences,
} = require("./templates/parallel-planner-with-review/closing-keywords.cjs");

test("every GitHub closing keyword form is detected", () => {
  for (const text of [
    "Fix #145 host import compatibility",
    "fixes #1",
    "Fixed: #2",
    "close #3",
    "Closes  #4",
    "closed #5",
    "resolve #6",
    "Resolves: #7",
    "resolved #8",
    "Body line\n\nCloses owner/app#146",
    "Fixes https://github.com/owner/app/issues/146",
    "(fix #9)",
  ])
    assert.equal(closingReferences(text).length, 1, text);
  assert.deepEqual(
    closingReferences("Fix #145 and closes #146").map((row) => row.issue),
    [145, 146],
  );
});

test("references, merge subjects and ordinary words stay allowed", () => {
  for (const text of [
    "Refs #66; does not close it.",
    "Merge pull request #337 from hanhnghh/integration/ui-u3",
    "fix(themes): commit reviewed shared-reference pins",
    "Prefix #12",
    "closest #3 match",
    "fixture #4 baseline",
    "Fixes the observer; see #146",
    "issue #145 was closed automatically",
    "resolver #7 digest",
    "",
  ])
    assert.deepEqual(closingReferences(text), [], text);
});

test("commit range scan reports the offending commit and ignores the base", () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), "closing-keywords-"));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: repo,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@e",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@e",
      },
    }).trim();
  git("init", "-q");
  const commit = (message) => {
    writeFileSync(path.join(repo, "f"), message);
    git("add", "f");
    git("commit", "-q", "-m", message);
    return git("rev-parse", "HEAD");
  };
  const base = commit("Fix #1 before the batch base");
  commit("Refs #2 allowed");
  const bad = commit("docs: record proof\n\nCloses #3");
  assert.deepEqual(
    commitClosingReferences(base, "HEAD", repo).map((row) => [
      row.commit,
      row.issue,
    ]),
    [[bad, 3]],
  );
  assert.deepEqual(commitClosingReferences(bad, "HEAD", repo), []);
});
