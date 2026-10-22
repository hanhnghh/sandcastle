import { NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";
import { execFileSync } from "node:child_process";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { afterEach, expect, it } from "vitest";
import { getAgent, scaffold } from "./InitService.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

// These executables stand in for GitHub and the model process. Sandcastle's
// orchestration, worktrees, signals, verification, and map persistence are real.
const fakeGh = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2), rows = JSON.parse(fs.readFileSync(process.env.READINESS_FIXTURE_STATE, 'utf8'));
if(args[0] === 'issue') {
  if(process.env.GH_REPO !== 'owner/project') throw Error('Task command routed to wrong repository');
  const issue = rows.find(i=>i.number===Number(args[2]));
  if(args[1] === 'close') {issue.state='closed';issue.state_reason='completed';fs.writeFileSync(process.env.READINESS_FIXTURE_STATE,JSON.stringify(rows));}
  console.log(JSON.stringify(issue));process.exit(0);
}
if(args[0] !== 'api') throw Error('Only REST API expected: '+args);
const endpoint = args[1];
const number = Number(endpoint.split('/issues/')[1]?.split('/')[0]);
const issue = rows.find(i=>i.number===number);
if(args.includes('POST') || args.includes('DELETE')) {
  if(args.includes('POST')) for(const arg of args.filter(a=>a.startsWith('labels[]='))) issue.labels.push({name:arg.slice(9)});
  else issue.labels=issue.labels.filter(l=>!endpoint.endsWith('/'+encodeURIComponent(l.name)));
  fs.writeFileSync(process.env.READINESS_FIXTURE_STATE,JSON.stringify(rows)); console.log('[]');
} else if(endpoint.includes('/comments?') || endpoint.includes('/dependencies/')) console.log('[[]]');
else if(endpoint.includes('/issues?')) console.log(JSON.stringify([rows.filter(i=>i.state==='open')]));
else if(issue) console.log(JSON.stringify(issue));
else throw Error('Unexpected GitHub request '+endpoint);
`;

const fakeAgent = `
import fs from 'node:fs'; import {execFileSync} from 'node:child_process';
const prompt=fs.readFileSync(0,'utf8');
if(process.env.READINESS_FIXTURE_CODEX==='1') {
  const rawLog=console.log, messages=[];
  console.log=text=>messages.push(text);
  process.on('exit',()=>rawLog(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:messages.join(String.fromCharCode(10))}})));
}
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const record=(value)=>fs.appendFileSync(process.env.READINESS_FIXTURE_TRACE,value+'\\n');
if(prompt.includes('MISSION — READINESS ASSESSMENT')) {
  if(process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_ENTERPRISE_TOKEN || process.env.GITHUB_ENTERPRISE_TOKEN) throw Error('Tracker credential leaked');
  const {snapshot,trigger}=JSON.parse(prompt.match(/<readiness-input>([\\s\\S]*?)<\\/readiness-input>/)[1]);
  record('readiness:'+trigger.kind);
  if(process.env.READINESS_FIXTURE_DIRTY==='1') fs.writeFileSync('unauthorized.txt','dirty');
  console.log('<readiness>'+JSON.stringify({head:snapshot.head,decisions:snapshot.issues.map(i=>({number:i.number,status:i.body.includes('**Kind:** live-validation')?'not-implementation':i.dependencies.some(d=>d.state!=='closed')?'blocked':'ready-for-agent',reason:'fixture contract',evidence:[{path:'host:integration',claim:'Host gate'}],gates:[{id:'integration',status:'satisfied',reason:'Host gate',evidence:[{path:'host:integration',claim:'Host gate'}]}]}))})+'</readiness>');
} else if(prompt.includes('# CANDIDATE INVENTORY')) {
  const issues=JSON.parse(prompt.match(/<issues-json>([\\s\\S]*?)<\\/issues-json>/)[1]); record('plan:'+issues.map(i=>i.number).join(','));
  if(process.env.READINESS_FIXTURE_INVALID_PLAN==='1' && fs.readFileSync(process.env.READINESS_FIXTURE_TRACE,'utf8').split('plan:22').length===2) { console.log('<plan>'+JSON.stringify({issues:[],decisions:[]})+'</plan>'); console.log('<promise>COMPLETE</promise>'); process.exit(0); }
  if(process.env.READINESS_FIXTURE_STALE_PLAN==='1') { const state=JSON.parse(fs.readFileSync(process.env.READINESS_FIXTURE_STATE,'utf8'));state.find(i=>i.number===22).labels.push({name:'blocked'});fs.writeFileSync(process.env.READINESS_FIXTURE_STATE,JSON.stringify(state)); }
  if(prompt.includes('Rolling refill')) record('refill:'+issues.map(i=>i.number).join(',')+':'+([...(prompt.match(/In progress \\(not in the inventory\\): ([^\\n]*?)\\. Select/)?.[1]??'').matchAll(/#(\\d+)/g)].map(m=>m[1]).join('+')||'none'));
  const chosen=issues.slice(0,Number(process.env.READINESS_FIXTURE_PLAN_LIMIT||issues.length));
  console.log('<plan>'+JSON.stringify({issues:chosen.map(i=>({id:String(i.number),title:i.title,branch:'sandcastle/issue-'+i.number})),decisions:issues.map(i=>chosen.includes(i)?{id:String(i.number),disposition:'selected',reason:'independent',likelyAreas:['task-'+i.number]}:{id:String(i.number),disposition:'unresolved-decision',reason:'next batch',likelyAreas:['task-'+i.number]})})+'</plan>');
} else if(prompt.includes('Integrate the following completed branches')) {
  const branches=[...new Set(prompt.match(/sandcastle\\/issue-\\d+/g))];
  if(process.env.READINESS_FIXTURE_INDEPENDENT==='1') record('merger:'+branches.map(b=>b.split('-').at(-1)).sort().join('+'));
  if(process.env.READINESS_FIXTURE_GATE_ENV==='1') record('merger-workers:'+(process.env.SANDCASTLE_TEST_WORKERS??'unset'));
  // Hold the first merger so later approvals queue up behind it.
  if(process.env.READINESS_FIXTURE_MERGE_SLOW==='1' && fs.readFileSync(process.env.READINESS_FIXTURE_TRACE,'utf8').split('merger:').length===2) await new Promise(r=>setTimeout(r,6000));
  if(branches.some(b=>b.endsWith('-'+process.env.READINESS_FIXTURE_MERGE_BLOCKED_ISSUE))) {console.log('<promise>BLOCKED</promise>');process.exit(0);}
  for(const branch of branches) { const number=Number(branch.split('-').at(-1)); record('merge:'+number); git('merge',branch,'--no-edit'); execFileSync('gh',['issue','close',String(number)]); }
  if(process.env.READINESS_FIXTURE_MERGE_BLOCKED==='1') {console.log('<promise>BLOCKED</promise>');process.exit(0);}
} else if(prompt.includes('has stalled')) {
  const number=prompt.match(/implementation of task (\\d+)/)[1];const trigger=prompt.match(/stalled\\s*\\(.(\\S+?).\\)/)[1];record('stuck-advisor:'+number+':'+trigger);
  if(process.env.GH_TOKEN || process.env.GITHUB_TOKEN) throw Error('Tracker credential leaked to advisor');
  const mode=process.env.READINESS_FIXTURE_STUCK||'fix';
  if(mode==='malformed') console.log('Cannot tell.');
  else console.log('<stuck-advice>'+JSON.stringify({diagnosis:'The task file is missing a required line.',cause:mode==='environment'?'environment':'wrong-approach',nextSteps:['Write the required line','Commit it'],confidence:'high',escalate:mode==='escalate'})+'</stuck-advice>');
} else if(prompt.includes('is paused at progress')) {
  const number=prompt.match(/implementer of task (\\d+)/)[1];const signal=prompt.match(/because .([a-z-]+):/)[1];record('checkpoint:'+number+':'+signal);
  if(process.env.GH_TOKEN || process.env.GITHUB_TOKEN) throw Error('Tracker credential leaked to advisor');
  if(prompt.includes('?? task-'+number+'.txt')) record('advisor-saw-work:'+number);
  const mode=process.env.READINESS_FIXTURE_CHECKPOINT||'continue';
  if(mode==='malformed') console.log('Looks fine.');
  else {
    if(mode==='dirty') fs.writeFileSync('advisor-note.txt','x');
    console.log('<progress-check>'+JSON.stringify({verdict:mode==='dirty'?'continue':mode,assessment:'Half way: the task file is partial',direction:mode==='redirect'?'Finish the task file':'',remainingBudget:5})+'</progress-check>');
  }
} else if(prompt.includes('Critique the implementation approach for task')) {
  const number=prompt.match(/approach for task (\\d+)/)[1];record('advisor:'+number);
  if(process.env.GH_TOKEN || process.env.GITHUB_TOKEN) throw Error('Tracker credential leaked to advisor');
  const mode=process.env.READINESS_FIXTURE_ADVISOR||'proceed';const round=Number(prompt.match(/\\(round (\\d+)\\)/)[1]);
  if(mode==='malformed') console.log('No critique today.');
  else {
    if(mode==='dirty') fs.writeFileSync('advisor-note.txt','x');
    const verdict=mode==='escalate'?'escalate':((mode==='revise'&&round===1)||mode==='always-revise')?'revise':'proceed';
    console.log('<approach-critique>'+JSON.stringify({verdict,summary:'Checked round '+round,concerns:verdict==='revise'?[{id:'C1',severity:'major',point:'Missing idempotency',suggestion:'Add a request key'}]:[]})+'</approach-critique>');
  }
} else if(prompt.includes('Review task ')) {
  const number=prompt.match(/Review task (\\d+)/)[1];execFileSync('gh',['issue','view',number]);record('review:'+number);
  if(process.env.READINESS_FIXTURE_REVIEW_BLOCKED==='1') {console.log('<promise>BLOCKED</promise>');process.exit(0);}
  const repaired=fs.readFileSync(process.env.READINESS_FIXTURE_TRACE,'utf8').includes('repair:'+number);
  const advised=fs.readFileSync(process.env.READINESS_FIXTURE_TRACE,'utf8').includes('advised:'+number);
  const changes=(process.env.READINESS_FIXTURE_REVIEW_CHANGES==='1' && !repaired) || process.env.READINESS_FIXTURE_REVIEW_ALWAYS_CHANGES==='1' || (process.env.READINESS_FIXTURE_REVIEW_UNTIL_ADVISED==='1' && !advised);
  console.log('<review-verdict>'+JSON.stringify(changes?{verdict:'changes-requested',findings:[{id:'F1',severity:'major',file:'task-'+number+'.txt',change:'Add a repair note'}]}:{verdict:'approve',findings:[]})+'</review-verdict>');
}
else if(prompt.includes('Implement task ')) {
  const number=prompt.match(/Implement task (\\d+)/)[1];execFileSync('gh',['issue','view',number]);
  if(prompt.includes('Mode: '+String.fromCharCode(96)+'plan')) {
    const revising=prompt.includes('Verdict: revise');record((revising?'approach-revise:':'approach:')+number);
    const plan={goal:'Implement '+number,size:'S',estimate:{minutes:5,iterations:1},files:['task-'+number+'.txt'],steps:['Write the file'],tests:['The file exists'],risks:[]};
    if(revising) plan.dispositions=[{concern:'C1',decision:process.env.READINESS_FIXTURE_DISPUTE==='1'?'disputed':'accepted',reason:'Handled in the brief'}];
    console.log('<approach-plan>'+JSON.stringify(plan)+'</approach-plan>');console.log('<promise>COMPLETE</promise>');process.exit(0);
  }
  if(prompt.includes('Verdict: proceed. Checked')) record('critique-received:'+number);
  const providerFailed=fs.readFileSync(process.env.READINESS_FIXTURE_TRACE,'utf8').includes('provider-fail:'+number);
  if(process.env.READINESS_FIXTURE_PROVIDER_FAIL==='always' || (process.env.READINESS_FIXTURE_PROVIDER_FAIL==='once' && !providerFailed)) {record('provider-fail:'+number);console.error('HTTP 429 Too Many Requests: rate limit');process.exit(1);}
  if(prompt.includes('Diagnosis (wrong-approach')) {record('advised:'+number);fs.appendFileSync('advised-'+number+'.txt','advised\\n');git('add','.');git('commit','-m','Advised '+number);console.log('<promise>COMPLETE</promise>');process.exit(0);}
  if(prompt.includes('- [F1] (major)')) {record('repair:'+number);fs.appendFileSync('repair-'+number+'.txt','repaired\\n');git('add','.');git('commit','-m','Repair '+number);console.log('<promise>COMPLETE</promise>');process.exit(0);}
  const checkpointImpl=number==='22'?process.env.READINESS_FIXTURE_CHECKPOINT_IMPL:undefined;
  if(checkpointImpl) {
    const check=prompt.match(/Verdict: (continue|redirect)\\./);
    if(check) {
      record('checkpoint-resumed:'+number+':'+check[1]);
      if(fs.existsSync('task-'+number+'.txt') && fs.readFileSync('task-'+number+'.txt','utf8')==='partial') record('kept-work:'+number);
      fs.writeFileSync('task-'+number+'.txt','implemented');git('add','.');git('commit','-m','Implement '+number);console.log('<promise>COMPLETE</promise>');process.exit(0);
    }
    record('implement:'+number);fs.writeFileSync('task-'+number+'.txt','partial');
    if(checkpointImpl==='outside') fs.writeFileSync('outside-'+number+'.txt','x');
    if(checkpointImpl==='errors') for(let i=0;i<3;i++) {console.log('Error: fixture build failed at step '+i);await new Promise(r=>setTimeout(r,150));}
    // Runs until paused; a survivor records itself after the pause.
    await new Promise(r=>setTimeout(r,4000));record('implementer-survived:'+number);process.exit(0);
  }
  record('implement:'+number);
  if(process.env.READINESS_FIXTURE_GATE_ENV==='1') record('implementer-workers:'+(process.env.SANDCASTLE_TEST_WORKERS??'unset'));
  if(process.env.READINESS_FIXTURE_SLOW===number) {
    // Hold this pipeline until another issue starts (bounded), so a refill can only be observed while it runs.
    const until=Date.now()+40000, other='implement:'+process.env.READINESS_FIXTURE_SLOW_UNTIL;
    while(Date.now()<until && !fs.readFileSync(process.env.READINESS_FIXTURE_TRACE,'utf8').split('\\n').includes(other)) await new Promise(r=>setTimeout(r,100));
    record('slow-released:'+number);
  }
  if(process.env.READINESS_FIXTURE_NO_PROGRESS!=='1' && !(number==='22' && process.env.READINESS_FIXTURE_RETAINED==='1')) {fs.writeFileSync('task-'+number+'.txt','implemented');git('add','.');git('commit','-m','Implement '+number);}
  if(process.env.READINESS_FIXTURE_BLOCKED==='1' || process.env.READINESS_FIXTURE_IMPL_STALL==='1') {console.log('<promise>BLOCKED</promise>');process.exit(0);}
}
else throw Error('Unknown agent task');
console.log('<promise>COMPLETE</promise>');
`;

const verifier = `
import fs from 'node:fs'; import {execFileSync} from 'node:child_process';
import {verifyReadinessPolicy} from ${JSON.stringify(new URL("./index.ts", import.meta.url).href)};
const {snapshot,assessment,trigger}=JSON.parse(fs.readFileSync(0,'utf8'));
if(trigger.kind==='post-merge' && process.env.READINESS_FIXTURE_FAIL_VERIFY==='1') throw Error('project gate failed');
const policy=JSON.parse(fs.readFileSync(process.env.READINESS_FIXTURE_POLICY,'utf8'));
console.log(JSON.stringify(await verifyReadinessPolicy({cwd:process.cwd(),input:{snapshot,assessment,trigger},policy,
  verifyGate:async id=>{if(id!=='integration') throw Error('Unknown gate');execFileSync(process.execPath,['-e','process.exit(0)']);return {head:snapshot.head,passed:true,reference:'host:integration'};},
})));
`;

async function execute(
  extraEnv: Record<string, string> = {},
  templateName = "parallel-planner-with-review",
) {
  const root = await mkdtemp(join(tmpdir(), "readiness-workflow-"));
  roots.push(root);
  const cwd = join(root, "project");
  await mkdir(cwd);
  await symlink(
    fileURLToPath(new URL("../node_modules", import.meta.url)),
    join(root, "node_modules"),
    "dir",
  );
  const bin = join(root, "bin");
  await mkdir(bin);
  const state = join(root, "github.json"),
    trace = join(root, "trace.txt");
  await writeFile(
    state,
    JSON.stringify(
      (extraEnv.READINESS_FIXTURE_QUALIFICATION_ONLY === "1"
        ? [22]
        : (extraEnv.READINESS_FIXTURE_ISSUES?.split(",").map(Number) ?? [
            20, 22,
          ])
      ).map((number) => ({
        number,
        title: `Task ${number}`,
        body:
          extraEnv.READINESS_FIXTURE_META === "1"
            ? "**Kind:** meta\nParent tracking task"
            : extraEnv.READINESS_FIXTURE_QUALIFICATION_ONLY === "1"
              ? "**Kind:** live-validation\nLive protocol still required"
              : extraEnv.READINESS_FIXTURE_INDEPENDENT !== "1" && number === 20
                ? "## Dependencies\n- #22"
                : "Implement slice",
        state: "open",
        state_reason: null,
        updated_at: "now",
        labels: [
          { name: "Sandcastle" },
          {
            name:
              extraEnv.READINESS_FIXTURE_INDEPENDENT !== "1" && number === 20
                ? "blocked"
                : "ready-for-agent",
          },
          ...(extraEnv.READINESS_FIXTURE_HOLD === "1"
            ? [{ name: "readiness:hold" }]
            : []),
        ],
      })),
    ),
  );
  await writeFile(trace, "");
  const { readinessContractHash } = await import("./index.js");
  const approvedRows = JSON.parse(await readFile(state, "utf8")) as {
    number: number;
    title: string;
    body: string;
  }[];
  const policyPath = join(root, "policy.json");
  await writeFile(
    policyPath,
    JSON.stringify({
      repository: "owner/project",
      issues: Object.fromEntries(
        approvedRows.map((i) => [
          String(i.number),
          {
            contractHash: readinessContractHash({
              ...i,
              comments: [],
              dependencies:
                extraEnv.READINESS_FIXTURE_INDEPENDENT !== "1" &&
                i.number === 20
                  ? [
                      {
                        repository: "owner/project",
                        number: 22,
                        state: "open",
                        stateReason: null,
                      },
                    ]
                  : [],
            }),
            kind: i.body.includes("live-validation")
              ? "qualification"
              : "implementation",
            gates: ["integration"],
            dependencies:
              extraEnv.READINESS_FIXTURE_INDEPENDENT !== "1" && i.number === 20
                ? { "owner/project#22": "refs/heads/sandcastle/issue-22" }
                : {},
          },
        ]),
      ),
    }),
  );
  await writeFile(join(bin, "gh"), fakeGh);
  await chmod(join(bin, "gh"), 0o755);
  await writeFile(join(root, "agent.mjs"), fakeAgent);
  if (extraEnv.READINESS_FIXTURE_CODEX === "1") {
    await writeFile(
      join(bin, "codex"),
      `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(process.env.READINESS_FIXTURE_MODELS, JSON.stringify(process.argv.slice(2)) + String.fromCharCode(10));
import(${JSON.stringify(pathToFileURL(join(root, "agent.mjs")).href)});
`,
    );
    await chmod(join(bin, "codex"), 0o755);
    await writeFile(
      join(bin, "docker"),
      "#!/usr/bin/env sh\nprintf 'sha256:fixture-image\\n'\n",
    );
    await chmod(join(bin, "docker"), 0o755);
    await writeFile(join(bin, "codegraph"), "#!/usr/bin/env sh\nexit 0\n");
    await chmod(join(bin, "codegraph"), 0o755);
    await writeFile(join(root, "models.jsonl"), "");
  }
  await writeFile(join(root, "verify.mjs"), verifier);
  await Effect.runPromise(
    scaffold(cwd, {
      agent: getAgent(
        extraEnv.READINESS_FIXTURE_CODEX === "1" ? "codex" : "claude-code",
      )!,
      model: "fixture",
      templateName,
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );
  if (extraEnv.READINESS_FIXTURE_CODEX === "1") {
    const { loadRoleConfig, saveRoleConfig } = await import("./index.js");
    const config = await loadRoleConfig({ cwd });
    for (const [role, value] of Object.entries(config.roles)) {
      value.model = "configured-" + role;
      value.effort =
        role === "implementer"
          ? "medium"
          : role === "merger"
            ? "xhigh"
            : value.effort;
    }
    await saveRoleConfig({ cwd, config });
    if (extraEnv.READINESS_FIXTURE_ADVISOR_ROLE === "1") {
      const { migrateRoleConfig } = await import("./index.js");
      const v2 = migrateRoleConfig(await loadRoleConfig({ cwd })) as Extract<
        Awaited<ReturnType<typeof loadRoleConfig>>,
        { schemaVersion: 2 }
      >;
      await saveRoleConfig({
        cwd,
        config: {
          ...v2,
          roles: {
            ...v2.roles,
            advisor: {
              provider: "codex",
              model: "configured-advisor",
              effort: "high",
            },
          },
        },
      });
    }
  }
  const mainPath = join(cwd, ".sandcastle/main.mts");
  let main = await readFile(mainPath, "utf8");
  main = main
    .replace("const MAX_ITERATIONS = 10;", "const MAX_ITERATIONS = 3;")
    .replace(
      'const MERGE_MODE: "batch" | "per-branch" = "batch";',
      `const MERGE_MODE: "batch" | "per-branch" = ${JSON.stringify(extraEnv.READINESS_FIXTURE_MERGE_MODE ?? "batch")};`,
    )
    .replace(
      'const ADVISOR_STUCK: "off" | "on" = "off";',
      `const ADVISOR_STUCK: "off" | "on" = ${JSON.stringify(extraEnv.READINESS_FIXTURE_STUCK_MODE ?? "off")};`,
    )
    .replace(
      'const ADVISOR_CHECKPOINT: sandcastle.CheckpointPolicy = { mode: "off" };',
      `const ADVISOR_CHECKPOINT: sandcastle.CheckpointPolicy = ${extraEnv.READINESS_FIXTURE_CHECKPOINT_POLICY ?? '{ mode: "off" }'};`,
    )
    // Checkpoint budgets in fixture time: one budget minute is 100 ms.
    .replace(
      "budgetMinutes: budget.budgetMinutes,",
      `budgetMinutes: budget.budgetMinutes, pollMs: 50, minuteMs: ${extraEnv.READINESS_FIXTURE_CHECKPOINT_MINUTE_MS ?? 100},`,
    )
    .replace(
      'const ADVISOR_APPROACH: "off" | "high-risk" | "all" = "off";',
      `const ADVISOR_APPROACH: "off" | "high-risk" | "all" = ${JSON.stringify(extraEnv.READINESS_FIXTURE_APPROACH ?? "off")};`,
    )
    .replace(
      "const PROVIDER_FAILURE_THRESHOLD = 3;",
      `const PROVIDER_FAILURE_THRESHOLD = ${extraEnv.READINESS_FIXTURE_BREAKER ?? 3};`,
    )
    .replace(
      '"@ai-hero/sandcastle"',
      JSON.stringify(new URL("./index.ts", import.meta.url).href),
    )
    .replace(
      'import { docker } from "@ai-hero/sandcastle/sandboxes/docker";',
      `import { noSandbox as docker } from ${JSON.stringify(new URL("./sandboxes/no-sandbox.ts", import.meta.url).href)};`,
    )
    .replace(/sandcastle\.claudeCode\([^)]+\)/g, "scriptedAgent()")
    .replace(
      'const hooks = {\n  sandbox: { onSandboxReady: [{ command: "npm install" }] },\n};',
      "const hooks = {};",
    )
    .replace(
      'const hooks = {\n  sandbox: {\n    onSandboxReady: [\n      { command: "bash .sandcastle/scripts/ready.sh", timeoutMs: 180_000 },\n    ],\n  },\n};',
      "const hooks = {};",
    )
    .replace(
      'const copyToWorktree = ["node_modules"];',
      "const copyToWorktree: string[] = [];",
    );
  if (extraEnv.READINESS_FIXTURE_CODEX === "1") {
    main = main.replace(
      'import { docker, defaultImageName } from "@ai-hero/sandcastle/sandboxes/docker";',
      `import { noSandbox as docker } from ${JSON.stringify(new URL("./sandboxes/no-sandbox.ts", import.meta.url).href)};
const defaultImageName = () => "fixture-image";`,
    );
  }
  main =
    `const scriptedAgent = () => ({ name: "fixture", env: {}, captureSessions: false, buildPrintCommand: ({prompt}) => ({command: ${JSON.stringify(`${process.execPath} ${JSON.stringify(join(root, "agent.mjs"))}`)}, stdin: prompt}), parseStreamLine: text => [{type: "text", text}] });\n` +
    main;
  await writeFile(mainPath, main);
  const configPath = join(cwd, ".sandcastle/readiness.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  await writeFile(
    configPath,
    JSON.stringify({
      ...config,
      repository: "owner/project",
      mode: "apply",
      verifyCommand: [
        process.execPath,
        "--import",
        createRequire(import.meta.url).resolve("tsx"),
        join(root, "verify.mjs"),
      ],
    }),
  );
  if (
    extraEnv.READINESS_FIXTURE_CYCLES ||
    extraEnv.READINESS_FIXTURE_CODEX === "1"
  ) {
    const { loadWorkflowConfig, saveWorkflowConfig } =
      await import("./index.js");
    const config = await loadWorkflowConfig({ cwd });
    await saveWorkflowConfig({
      cwd,
      config: {
        ...config,
        limits: {
          ...config.limits,
          cycles: Number(extraEnv.READINESS_FIXTURE_CYCLES ?? 3),
          concurrency: Number(extraEnv.READINESS_FIXTURE_CONCURRENCY ?? 1),
          plannerAttempts: Number(
            extraEnv.READINESS_FIXTURE_PLANNER_ATTEMPTS ??
              config.limits.plannerAttempts,
          ),
        },
        ...(extraEnv.READINESS_FIXTURE_APPROACH ||
        extraEnv.READINESS_FIXTURE_STUCK_MODE ||
        extraEnv.READINESS_FIXTURE_CHECKPOINT_POLICY
          ? {
              advisor: {
                ...(extraEnv.READINESS_FIXTURE_CHECKPOINT_POLICY
                  ? {
                      checkpoint: JSON.parse(
                        extraEnv.READINESS_FIXTURE_CHECKPOINT_POLICY,
                      ),
                    }
                  : {}),
                ...(extraEnv.READINESS_FIXTURE_APPROACH
                  ? {
                      approach: extraEnv.READINESS_FIXTURE_APPROACH as
                        | "off"
                        | "high-risk"
                        | "all",
                    }
                  : {}),
                ...(extraEnv.READINESS_FIXTURE_STUCK_MODE
                  ? {
                      stuck: extraEnv.READINESS_FIXTURE_STUCK_MODE as
                        | "off"
                        | "on",
                    }
                  : {}),
              },
            }
          : {}),
        ...(extraEnv.READINESS_FIXTURE_MERGE_MODE
          ? {
              merge: {
                mode: extraEnv.READINESS_FIXTURE_MERGE_MODE as
                  | "batch"
                  | "per-branch",
                ...(extraEnv.READINESS_FIXTURE_COALESCE === "1"
                  ? { coalesce: true }
                  : {}),
                ...(extraEnv.READINESS_FIXTURE_TEST_WORKERS
                  ? {
                      testWorkers: Number(
                        extraEnv.READINESS_FIXTURE_TEST_WORKERS,
                      ),
                    }
                  : {}),
              },
            }
          : {}),
        ...(extraEnv.READINESS_FIXTURE_SCHEDULE
          ? {
              schedule: extraEnv.READINESS_FIXTURE_SCHEDULE as
                | "batch"
                | "rolling",
            }
          : {}),
        ...(extraEnv.READINESS_FIXTURE_REPAIR_ROUNDS
          ? {
              review: {
                maxRepairRounds: Number(
                  extraEnv.READINESS_FIXTURE_REPAIR_ROUNDS,
                ),
              },
            }
          : {}),
      },
    });
  }
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({ type: "module" }),
  );
  if (extraEnv.READINESS_FIXTURE_GATE_ENV === "1") {
    await mkdir(join(cwd, ".sandcastle/scripts"), { recursive: true });
    await writeFile(
      join(cwd, ".sandcastle/scripts/test-isolation.sh"),
      'echo "isolation:$1" >> "$READINESS_FIXTURE_TRACE"\n',
    );
  }
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8" });
  git("init", "-qb", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.com");
  git("add", ".");
  git("commit", "-qm", "fixture");
  if (extraEnv.READINESS_FIXTURE_RETAINED === "1") {
    git("switch", "-qc", "sandcastle/issue-22");
    await writeFile(join(cwd, "task-22.txt"), "retained implementation");
    git("add", ".");
    git("commit", "-qm", "retained implementation");
    git("switch", "main");
  }
  git(
    "remote",
    "add",
    "origin",
    "https://github.com/upstream/not-the-target.git",
  );
  let error: unknown;
  let stdout = "";
  try {
    stdout = execFileSync(
      process.execPath,
      ["--import", createRequire(import.meta.url).resolve("tsx"), mainPath],
      {
        cwd,
        encoding: "utf8",
        timeout: 60_000,
        stdio: "pipe",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          GIT_CONFIG_GLOBAL: join(root, "fixture-gitconfig"),
          GH_TOKEN: "fake-host-token",
          READINESS_FIXTURE_STATE: state,
          READINESS_FIXTURE_POLICY: policyPath,
          READINESS_FIXTURE_TRACE: trace,
          READINESS_FIXTURE_MODELS: join(root, "models.jsonl"),
          ...extraEnv,
        },
      },
    );
  } catch (failure) {
    error = failure;
  }
  const runDir = join(cwd, ".sandcastle/runs");
  const files = await readdir(runDir).catch((failure) => {
    throw error ?? failure;
  });
  const snapshots = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map(async (file) =>
        JSON.parse(await readFile(join(runDir, file), "utf8")),
      ),
  );
  return {
    error,
    stdout,
    tracePath: trace,
    modelArgs:
      extraEnv.READINESS_FIXTURE_CODEX === "1"
        ? (await readFile(join(root, "models.jsonl"), "utf8"))
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line) as string[])
        : [],
    trace: (await readFile(trace, "utf8")).trim().split("\n"),
    issues: JSON.parse(await readFile(state, "utf8")),
    snapshots,
    diagnostics:
      extraEnv.READINESS_FIXTURE_CODEX === "1"
        ? await (
            await (
              await import("./index.js")
            ).openProjectRuntime({ cwd, id: snapshots[0].runtime.id })
          ).diagnostics()
        : [],
  };
}

it("runs the generated two-batch workflow through real orchestration and unlocks the next issue after merge", async () => {
  const result = await execute();
  expect(result.error).toBeUndefined();
  expect(result.trace).toEqual([
    "readiness:startup",
    "plan:22",
    "implement:22",
    "review:22",
    "merge:22",
    "readiness:post-merge",
    "plan:20",
    "implement:20",
    "review:20",
    "merge:20",
    "plan:",
  ]);
  expect(
    result.issues.every((issue: { state: string }) => issue.state === "closed"),
  ).toBe(true);
  expect(result.snapshots).toEqual([
    expect.objectContaining({
      status: "completed",
      nodes: expect.arrayContaining([
        expect.objectContaining({ role: "readiness", status: "completed" }),
      ]),
    }),
  ]);
}, 90_000);

it("repairs changes-requested findings through the implementer and merges only after approval", async () => {
  const result = await execute({ READINESS_FIXTURE_REVIEW_CHANGES: "1" });
  expect(result.error).toBeUndefined();
  const forTask = result.trace.filter(
    (value: string) => value.endsWith(":22") && !value.startsWith("plan:"),
  );
  expect(forTask).toEqual([
    "implement:22",
    "review:22",
    "repair:22",
    "review:22",
    "merge:22",
  ]);
}, 90_000);

it("retains the branch without merging when review findings exhaust the repair budget", async () => {
  const result = await execute({
    READINESS_FIXTURE_REVIEW_ALWAYS_CHANGES: "1",
  });
  expect(result.error).toBeDefined();
  const forTask = result.trace.filter(
    (value: string) => value.endsWith(":22") && !value.startsWith("plan:"),
  );
  expect(forTask.filter((value: string) => value === "repair:22")).toHaveLength(
    2,
  );
  expect(forTask.filter((value: string) => value === "review:22")).toHaveLength(
    3,
  );
  expect(result.trace).not.toContain("merge:22");
}, 90_000);

it("the configured Codex runtime applies the saved review repair budget", async () => {
  const result = await execute({
    READINESS_FIXTURE_CODEX: "1",
    READINESS_FIXTURE_REPAIR_ROUNDS: "1",
    READINESS_FIXTURE_REVIEW_ALWAYS_CHANGES: "1",
  });
  expect(result.error).toBeDefined();
  const forTask = result.trace.filter(
    (value: string) => value.endsWith(":22") && !value.startsWith("plan:"),
  );
  expect(forTask).toEqual([
    "implement:22",
    "review:22",
    "repair:22",
    "review:22",
  ]);
}, 90_000);

it("retries a provider-failed pipeline on the retained branch and then merges", async () => {
  const result = await execute({ READINESS_FIXTURE_PROVIDER_FAIL: "once" });
  expect(result.error).toBeUndefined();
  const forTask = result.trace.filter(
    (value: string) => value.endsWith(":22") && !value.startsWith("plan:"),
  );
  expect(forTask).toEqual([
    "provider-fail:22",
    "implement:22",
    "review:22",
    "merge:22",
  ]);
}, 90_000);

it("opens the circuit breaker after consecutive provider failures and stops without merging", async () => {
  const result = await execute({
    READINESS_FIXTURE_PROVIDER_FAIL: "always",
    READINESS_FIXTURE_BREAKER: "2",
  });
  expect(String(result.error)).toMatch(
    /Provider unavailable after 2 consecutive provider failures/,
  );
  expect(
    result.trace.filter((value: string) => value === "provider-fail:22"),
  ).toHaveLength(2);
  expect(result.trace).not.toContain("review:22");
  expect(result.trace).not.toContain("merge:22");
  expect(result.trace).not.toContain("plan:20");
}, 90_000);

it("batch mode integrates independent approved branches with one merger after the batch", async () => {
  const result = await execute({
    READINESS_FIXTURE_INDEPENDENT: "1",
    READINESS_FIXTURE_CODEX: "1",
  });
  expect(result.error).toBeUndefined();
  const mergers = result.trace.filter((value: string) =>
    value.startsWith("merger:"),
  );
  expect(mergers).toHaveLength(1);
  expect(mergers[0]!.split(":")[1]!.split("+").sort()).toEqual(["20", "22"]);
}, 90_000);

it("per-branch mode integrates each approved branch as soon as it is approved", async () => {
  const result = await execute({
    READINESS_FIXTURE_INDEPENDENT: "1",
    READINESS_FIXTURE_CODEX: "1",
    READINESS_FIXTURE_MERGE_MODE: "per-branch",
  });
  expect(result.error).toBeUndefined();
  const mergers = result.trace.filter((value: string) =>
    value.startsWith("merger:"),
  );
  expect(mergers.sort()).toEqual(["merger:20", "merger:22"]);
  // Streaming: the first approved branch merges while the other pipeline runs.
  expect(result.trace.indexOf("merger:20")).toBeLessThan(
    result.trace.indexOf("review:22"),
  );
  // Post-merge readiness is incremental: the issues are independent and the
  // merges touch no file either mentions, so no post-merge assessment is
  // needed (a dependent issue is covered by the readiness tests).
  expect(
    result.trace.filter((value: string) => value === "readiness:post-merge"),
  ).toHaveLength(0);
  expect(
    result.issues.every((issue: { state: string }) => issue.state === "closed"),
  ).toBe(true);
}, 90_000);

it("rolling schedule starts a new issue in a freed slot while a slow pipeline still runs", async () => {
  const result = await execute({
    READINESS_FIXTURE_INDEPENDENT: "1",
    READINESS_FIXTURE_CODEX: "1",
    READINESS_FIXTURE_MERGE_MODE: "per-branch",
    READINESS_FIXTURE_SCHEDULE: "rolling",
    READINESS_FIXTURE_CONCURRENCY: "2",
    READINESS_FIXTURE_ISSUES: "20,22,24",
    READINESS_FIXTURE_PLAN_LIMIT: "2",
    READINESS_FIXTURE_SLOW: "22",
    READINESS_FIXTURE_SLOW_UNTIL: "24",
  });
  expect(result.error).toBeUndefined();
  const at = (value: string) => result.trace.indexOf(value);
  // 20 and 22 start; 20 merges; the refill plans 24 with 22 still running.
  expect(result.trace).toContain("refill:24:22");
  expect(at("merger:20")).toBeLessThan(at("refill:24:22"));
  expect(at("implement:24")).toBeGreaterThan(at("merger:20"));
  expect(at("implement:24")).toBeLessThan(at("slow-released:22"));
  expect(at("implement:24")).toBeLessThan(at("merger:22"));
  // The first plan and one refill; refills with no candidates skip the planner.
  expect(
    result.trace.filter((value: string) => /^plan:\d/.test(value)),
  ).toEqual(["plan:20,22,24", "plan:24"]);
  expect(
    result.trace.filter((value: string) => value.startsWith("refill:")),
  ).toEqual(["refill:24:22"]);
  expect(result.stdout).toMatch(/Refill: 1 issue\(s\) start from/);
  expect(
    result.issues.every((issue: { state: string }) => issue.state === "closed"),
  ).toBe(true);
}, 90_000);

it("rolling schedule requires per-branch merge", async () => {
  const { workflowConfigSchema } = await import("./OperatorWorkflow.js");
  const base = {
    schemaVersion: 1,
    revision: "",
    repository: "owner/project",
    scopeLabel: "Sandcastle",
    readyLabel: "ready-for-agent",
    blockedLabel: "blocked",
    holdLabels: [],
    limits: { cycles: 3, concurrency: 2, plannerAttempts: 3 },
    readiness: { mode: "report-only", verifier: null, gates: [] },
  };
  expect(
    workflowConfigSchema.safeParse({ ...base, schedule: "rolling" }).success,
  ).toBe(false);
  expect(
    workflowConfigSchema.safeParse({
      ...base,
      schedule: "rolling",
      merge: { mode: "per-branch" },
    }).success,
  ).toBe(true);
});

it("coalesced per-branch merge integrates branches approved during a merge with one merger", async () => {
  const result = await execute({
    READINESS_FIXTURE_INDEPENDENT: "1",
    READINESS_FIXTURE_CODEX: "1",
    READINESS_FIXTURE_MERGE_MODE: "per-branch",
    READINESS_FIXTURE_COALESCE: "1",
    READINESS_FIXTURE_CONCURRENCY: "3",
    READINESS_FIXTURE_ISSUES: "20,22,24",
    READINESS_FIXTURE_MERGE_SLOW: "1",
  });
  expect(result.error).toBeUndefined();
  const mergers = result.trace.filter((value: string) =>
    value.startsWith("merger:"),
  );
  // The first approved branch merges alone; the two approved while it ran
  // share the next merger and its single gate.
  expect(mergers).toHaveLength(2);
  expect(mergers[0]!.split("+")).toHaveLength(1);
  expect(mergers[1]!.split("+")).toHaveLength(2);
  expect(
    result.issues.every((issue: { state: string }) => issue.state === "closed"),
  ).toBe(true);
}, 90_000);

it("coalesced merge retries a blocked group in halves and retains only the failing branch", async () => {
  const result = await execute({
    READINESS_FIXTURE_INDEPENDENT: "1",
    READINESS_FIXTURE_CODEX: "1",
    READINESS_FIXTURE_MERGE_MODE: "per-branch",
    READINESS_FIXTURE_COALESCE: "1",
    READINESS_FIXTURE_CONCURRENCY: "3",
    READINESS_FIXTURE_ISSUES: "20,22,24",
    READINESS_FIXTURE_MERGE_SLOW: "1",
    READINESS_FIXTURE_MERGE_BLOCKED_ISSUE: "24",
  });
  const mergers = result.trace.filter((value: string) =>
    value.startsWith("merger:"),
  );
  // A group with 24 is blocked untouched, then split until 24 stands alone.
  expect(
    mergers.some((value: string) => /\+/.test(value) && value.includes("24")),
  ).toBe(true);
  expect(mergers).toContain("merger:24");
  const state = (n: number) =>
    result.issues.find((issue: { number: number }) => issue.number === n).state;
  expect(state(24)).toBe("open");
  expect([state(20), state(22)]).toEqual(["closed", "closed"]);
}, 120_000);

it("the merger gate gets the configured test workers and isolation hook; implementers keep their default", async () => {
  const result = await execute({
    READINESS_FIXTURE_INDEPENDENT: "1",
    READINESS_FIXTURE_CODEX: "1",
    READINESS_FIXTURE_MERGE_MODE: "per-branch",
    READINESS_FIXTURE_TEST_WORKERS: "3",
    READINESS_FIXTURE_GATE_ENV: "1",
  });
  expect(result.error).toBeUndefined();
  expect(result.trace).toContain("merger-workers:3");
  expect(result.trace).toContain("isolation:3");
  expect(
    result.trace.filter((value: string) =>
      value.startsWith("implementer-workers:"),
    ),
  ).toEqual(["implementer-workers:unset", "implementer-workers:unset"]);
}, 90_000);

it("per-branch mode retains a branch whose merge is blocked without stopping the other merge", async () => {
  const result = await execute({
    READINESS_FIXTURE_INDEPENDENT: "1",
    READINESS_FIXTURE_CODEX: "1",
    READINESS_FIXTURE_MERGE_MODE: "per-branch",
    READINESS_FIXTURE_MERGE_BLOCKED_ISSUE: "20",
  });
  expect(result.trace).toContain("merge:22");
  expect(result.trace).not.toContain("merge:20");
  expect(
    result.issues.find((issue: { number: number }) => issue.number === 22)
      .state,
  ).toBe("closed");
  expect(
    result.issues.find((issue: { number: number }) => issue.number === 20)
      .state,
  ).toBe("open");
}, 90_000);

const approachTrace = (trace: string[]) =>
  trace.filter(
    (value) =>
      value.endsWith(":22") &&
      !value.startsWith("plan:") &&
      !value.startsWith("merger:"),
  );

it("approach critique: proceed passes the critique to implementation", async () => {
  const result = await execute({ READINESS_FIXTURE_APPROACH: "all" });
  expect(result.error).toBeUndefined();
  expect(approachTrace(result.trace)).toEqual([
    "approach:22",
    "advisor:22",
    "critique-received:22",
    "implement:22",
    "review:22",
    "merge:22",
  ]);
}, 90_000);

it("approach critique: revise requires an answered revised brief before implementation", async () => {
  const result = await execute({
    READINESS_FIXTURE_APPROACH: "all",
    READINESS_FIXTURE_ADVISOR: "revise",
  });
  expect(result.error).toBeUndefined();
  expect(approachTrace(result.trace).slice(0, 5)).toEqual([
    "approach:22",
    "advisor:22",
    "approach-revise:22",
    "advisor:22",
    "critique-received:22",
  ]);
  expect(result.trace).toContain("merge:22");
}, 90_000);

for (const [mode, extra] of [
  ["escalate", {}],
  ["malformed", {}],
  ["dirty", {}],
  ["always-revise", { READINESS_FIXTURE_DISPUTE: "1" }],
] as const)
  it(`approach critique: ${mode} escalates without implementing or merging`, async () => {
    const result = await execute({
      READINESS_FIXTURE_APPROACH: "all",
      READINESS_FIXTURE_ADVISOR: mode,
      ...extra,
    });
    expect(result.error).toBeDefined();
    expect(result.trace).toContain("advisor:22");
    expect(result.trace).not.toContain("implement:22");
    expect(result.trace).not.toContain("merge:22");
  }, 90_000);

it("Codex runtime refuses an enabled approach critique without an advisor role", async () => {
  // Admission fails before any agent or Agent Map run exists.
  await expect(
    execute({
      READINESS_FIXTURE_CODEX: "1",
      READINESS_FIXTURE_APPROACH: "all",
    }),
  ).rejects.toThrow(/no advisor role is configured/);
}, 90_000);

it("Codex runtime runs the configured advisor model and keeps the five role models", async () => {
  const result = await execute({
    READINESS_FIXTURE_CODEX: "1",
    READINESS_FIXTURE_APPROACH: "all",
    READINESS_FIXTURE_ADVISOR_ROLE: "1",
  });
  expect(result.error).toBeUndefined();
  expect(result.trace).toContain("advisor:22");
  expect(result.trace).toContain("merge:22");
  const models = result.modelArgs.map(
    (args: string[]) => args[args.indexOf("-m") + 1],
  );
  expect(models).toContain("configured-advisor");
  expect(models).toContain("configured-implementer");
  expect(models).toContain("configured-reviewer");
}, 90_000);

it("approach critique in high-risk mode skips issues without the high-risk label", async () => {
  const result = await execute({ READINESS_FIXTURE_APPROACH: "high-risk" });
  expect(result.error).toBeUndefined();
  expect(
    result.trace.some((value: string) => value.startsWith("advisor:")),
  ).toBe(false);
  expect(result.trace).toContain("merge:22");
}, 90_000);

const stuckTrace = (trace: string[]) =>
  trace.filter(
    (value) =>
      value.includes(":22") &&
      !value.startsWith("plan:") &&
      !value.startsWith("merger:"),
  );

it("stuck advisor: an incomplete implementation is diagnosed and an advised attempt continues to merge", async () => {
  const result = await execute({
    READINESS_FIXTURE_STUCK_MODE: "on",
    READINESS_FIXTURE_IMPL_STALL: "1",
  });
  expect(result.error).toBeUndefined();
  expect(stuckTrace(result.trace)).toEqual([
    "implement:22",
    "stuck-advisor:22:implementation-incomplete",
    "advised:22",
    "review:22",
    "merge:22",
  ]);
}, 90_000);

for (const mode of ["escalate", "environment", "malformed"] as const)
  it(`stuck advisor: ${mode} advice hands the stall to the owner without another attempt`, async () => {
    const result = await execute({
      READINESS_FIXTURE_STUCK_MODE: "on",
      READINESS_FIXTURE_IMPL_STALL: "1",
      READINESS_FIXTURE_STUCK: mode,
    });
    expect(result.error).toBeDefined();
    expect(result.trace).toContain(
      "stuck-advisor:22:implementation-incomplete",
    );
    expect(result.trace).not.toContain("advised:22");
    expect(result.trace).not.toContain("merge:22");
    if (mode !== "malformed")
      expect(result.stdout + String(result.error)).toMatch(/Advisor diagnosis/);
  }, 90_000);

it("stuck advisor: an exhausted review budget gets an advised repair and a fresh review loop", async () => {
  const result = await execute({
    READINESS_FIXTURE_STUCK_MODE: "on",
    READINESS_FIXTURE_REVIEW_UNTIL_ADVISED: "1",
  });
  expect(result.error).toBeUndefined();
  const forTask = stuckTrace(result.trace);
  expect(forTask.filter((value) => value === "repair:22")).toHaveLength(2);
  expect(
    forTask.slice(forTask.indexOf("stuck-advisor:22:review-budget-exhausted")),
  ).toEqual([
    "stuck-advisor:22:review-budget-exhausted",
    "advised:22",
    "review:22",
    "merge:22",
  ]);
}, 90_000);

it("Codex runtime applies the saved stuck-advisor policy with the configured advisor model", async () => {
  const result = await execute({
    READINESS_FIXTURE_CODEX: "1",
    READINESS_FIXTURE_STUCK_MODE: "on",
    READINESS_FIXTURE_ADVISOR_ROLE: "1",
    READINESS_FIXTURE_IMPL_STALL: "1",
  });
  expect(result.error).toBeUndefined();
  expect(result.trace).toContain("stuck-advisor:22:implementation-incomplete");
  expect(result.trace).toContain("advised:22");
  expect(result.trace).toContain("merge:22");
  expect(
    result.modelArgs.map((args: string[]) => args[args.indexOf("-m") + 1]),
  ).toContain("configured-advisor");
}, 90_000);

it("stuck advisor off keeps the blocked implementation behaviour", async () => {
  const result = await execute({ READINESS_FIXTURE_IMPL_STALL: "1" });
  expect(result.error).toBeDefined();
  expect(
    result.trace.some((value: string) => value.startsWith("stuck-advisor:")),
  ).toBe(false);
  expect(
    result.trace.filter((value: string) => value === "implement:22"),
  ).toHaveLength(1);
}, 90_000);

const checkpointPolicy = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    mode: "on",
    defaults: { "*": { minutes: 4, size: "S" } },
    ...extra,
  });

/** Wait until a paused implementer would have recorded itself, then reread. */
const survivors = async (tracePath: string) => {
  await new Promise((resolve) => setTimeout(resolve, 4_500));
  return (await readFile(tracePath, "utf8"))
    .split("\n")
    .filter((value) => value.startsWith("implementer-survived:"));
};

const nodesOf = (result: { snapshots: { nodes: unknown[] }[] }) =>
  result.snapshots.flatMap((snapshot) => snapshot.nodes) as {
    role: string;
    issueId?: string;
    status: string;
    checkpoint?: { verdict: string; signal: string };
    progress?: Record<string, unknown>;
  }[];

it("progress checkpoint: a time checkpoint pauses the implementer, the advisor sees its uncommitted work, and it continues to merge", async () => {
  const result = await execute({
    READINESS_FIXTURE_CHECKPOINT_POLICY: checkpointPolicy(),
    READINESS_FIXTURE_CHECKPOINT_IMPL: "slow",
  });
  expect(result.error).toBeUndefined();
  expect(stuckTrace(result.trace)).toEqual([
    "implement:22",
    "checkpoint:22:time",
    "advisor-saw-work:22",
    "checkpoint-resumed:22:continue",
    "kept-work:22",
    "review:22",
    "merge:22",
  ]);
  // The paused process was stopped, not left running beside the resume.
  expect(await survivors(result.tracePath)).toEqual([]);
  const nodes = nodesOf(result);
  expect(
    nodes.find((node) => node.role === "advisor" && node.issueId === "22"),
  ).toMatchObject({
    status: "completed",
    checkpoint: { verdict: "continue", signal: "time" },
  });
  expect(
    nodes.find((node) => node.role === "implementer" && node.issueId === "22")
      ?.progress,
  ).toMatchObject({
    estimateMinutes: 4,
    budgetMinutes: 6,
    source: "default",
    outcome: "completed",
    // The scripted agent has no session storage: the fallback is recorded.
    checkpoints: [{ signal: "time", verdict: "continue", resumed: "fresh" }],
  });
  expect(result.stdout).toMatch(
    /22 checkpoints completed: estimate 4 min \(default\), budget 6, actual/,
  );
}, 90_000);

for (const [mode, outcome] of [
  ["stop", "stopped"],
  ["malformed", "invalid-check"],
  ["dirty", "invalid-check"],
] as const)
  it(`progress checkpoint: ${mode} advice retains the branch and reports to the owner`, async () => {
    const result = await execute({
      READINESS_FIXTURE_CHECKPOINT_POLICY: checkpointPolicy(),
      READINESS_FIXTURE_CHECKPOINT_IMPL: "slow",
      READINESS_FIXTURE_CHECKPOINT: mode,
    });
    expect(result.error).toBeDefined();
    const trace = stuckTrace(result.trace);
    expect(trace).toContain("checkpoint:22:time");
    expect(trace.some((value) => value.startsWith("checkpoint-resumed:"))).toBe(
      false,
    );
    expect(trace).not.toContain("merge:22");
    const report = result.stdout + String(result.error);
    expect(report).toContain(`Progress checkpoint ${outcome} for issue 22`);
    if (mode === "stop") expect(report).toContain("Advisor assessment");
    if (mode === "dirty") expect(report).toContain("changed the repository");
    expect(await survivors(result.tracePath)).toEqual([]);
  }, 90_000);

it("progress checkpoint: the checkpoint cap stops the implementer without consulting the advisor", async () => {
  const result = await execute({
    READINESS_FIXTURE_CHECKPOINT_POLICY: checkpointPolicy({ max: 0 }),
    READINESS_FIXTURE_CHECKPOINT_IMPL: "slow",
  });
  expect(result.error).toBeDefined();
  expect(
    result.trace.some((value: string) => value.startsWith("checkpoint:")),
  ).toBe(false);
  expect(result.stdout + String(result.error)).toContain(
    "Progress checkpoint cap-reached for issue 22",
  );
  expect(await survivors(result.tracePath)).toEqual([]);
}, 90_000);

it("progress checkpoint: a repeated error fires an early checkpoint before the time budget", async () => {
  const result = await execute({
    READINESS_FIXTURE_CHECKPOINT_POLICY: checkpointPolicy(),
    READINESS_FIXTURE_CHECKPOINT_IMPL: "errors",
    // One budget minute is 10 s: no time checkpoint within the test.
    READINESS_FIXTURE_CHECKPOINT_MINUTE_MS: "10000",
    READINESS_FIXTURE_CHECKPOINT: "redirect",
  });
  expect(result.error).toBeUndefined();
  expect(stuckTrace(result.trace)).toEqual([
    "implement:22",
    "checkpoint:22:repeated-error",
    "advisor-saw-work:22",
    "checkpoint-resumed:22:redirect",
    "kept-work:22",
    "review:22",
    "merge:22",
  ]);
}, 90_000);

it("progress checkpoint: a file outside the approach brief fires an early checkpoint and the brief sets the budget", async () => {
  const result = await execute({
    READINESS_FIXTURE_APPROACH: "all",
    READINESS_FIXTURE_CHECKPOINT_POLICY: checkpointPolicy(),
    READINESS_FIXTURE_CHECKPOINT_IMPL: "outside",
    READINESS_FIXTURE_CHECKPOINT_MINUTE_MS: "10000",
  });
  expect(result.error).toBeUndefined();
  const trace = stuckTrace(result.trace);
  expect(trace.slice(trace.indexOf("implement:22"))).toEqual([
    "implement:22",
    "checkpoint:22:outside-brief",
    "advisor-saw-work:22",
    // The fresh attempt keeps the accepted approach critique as input.
    "critique-received:22",
    "checkpoint-resumed:22:continue",
    "kept-work:22",
    "review:22",
    "merge:22",
  ]);
  expect(
    nodesOf(result).find((node) => node.role === "implementer" && node.progress)
      ?.progress,
  ).toMatchObject({ estimateMinutes: 5, source: "brief" });
}, 90_000);

it("Codex runtime applies the saved progress-checkpoint policy with the configured advisor model", async () => {
  const result = await execute({
    READINESS_FIXTURE_CODEX: "1",
    READINESS_FIXTURE_ADVISOR_ROLE: "1",
    READINESS_FIXTURE_CHECKPOINT_POLICY: checkpointPolicy(),
    READINESS_FIXTURE_CHECKPOINT_IMPL: "slow",
  });
  expect(result.error).toBeUndefined();
  expect(result.trace).toContain("checkpoint:22:time");
  expect(result.trace).toContain("checkpoint-resumed:22:continue");
  expect(result.trace).toContain("merge:22");
  expect(
    result.modelArgs.map((args: string[]) => args[args.indexOf("-m") + 1]),
  ).toContain("configured-advisor");
  expect(await survivors(result.tracePath)).toEqual([]);
}, 90_000);

it("progress checkpoints off keep the implementer unpaused", async () => {
  const result = await execute();
  expect(result.error).toBeUndefined();
  expect(
    result.trace.some((value: string) => value.startsWith("checkpoint")),
  ).toBe(false);
  expect(nodesOf(result).some((node) => node.progress || node.checkpoint)).toBe(
    false,
  );
}, 90_000);

it("stops before the next planner when post-merge project verification fails", async () => {
  const result = await execute({ READINESS_FIXTURE_FAIL_VERIFY: "1" });
  expect(result.error).toBeDefined();
  expect(result.trace).toContain("merge:22");
  expect(result.trace).not.toContain("plan:20");
  expect(
    result.issues.find((issue: { number: number }) => issue.number === 20)
      .labels,
  ).toContainEqual({ name: "blocked" });
  expect(result.snapshots).toEqual([
    expect.objectContaining({
      status: "failed",
      nodes: expect.arrayContaining([
        expect.objectContaining({ role: "readiness", status: "failed" }),
      ]),
    }),
  ]);
}, 90_000);

it("rejects an assessor's uncommitted edits before starting the planner", async () => {
  const result = await execute({ READINESS_FIXTURE_DIRTY: "1" });
  expect(result.error).toBeDefined();
  expect(result.trace).toEqual(["readiness:startup"]);
  expect(result.snapshots).toEqual([
    expect.objectContaining({ status: "failed" }),
  ]);
}, 90_000);

it("refreshes tracker eligibility before creating any selected worktree", async () => {
  const result = await execute({ READINESS_FIXTURE_STALE_PLAN: "1" });
  expect(result.error).toBeDefined();
  expect(result.trace).not.toContain("implement:22");
  expect(
    result.issues.find((issue: { number: number }) => issue.number === 22)
      .state,
  ).toBe("open");
}, 90_000);

it("does not review or merge a blocked implementation that produced commits", async () => {
  const result = await execute({ READINESS_FIXTURE_BLOCKED: "1" });
  expect(result.error).toBeDefined();
  // A blocked implementation is a task failure and is never retried.
  expect(
    result.trace.filter((value: string) => value === "implement:22"),
  ).toHaveLength(1);
  expect(result.trace).not.toContain("review:22");
  expect(result.trace).not.toContain("merge:22");
  expect(
    result.issues.every((issue: { state: string }) => issue.state === "open"),
  ).toBe(true);
}, 90_000);

it("stops a no-progress batch after one implementation attempt", async () => {
  const result = await execute({ READINESS_FIXTURE_NO_PROGRESS: "1" });
  expect(result.error).toBeDefined();
  expect(result.trace.filter((value) => value === "implement:22")).toHaveLength(
    1,
  );
  expect(result.trace).not.toContain("merge:22");
}, 90_000);

it("reviews retained branch commits before integration when the resumed implementer adds none", async () => {
  const result = await execute({ READINESS_FIXTURE_RETAINED: "1" });
  expect(result.error).toBeUndefined();
  expect(result.trace).toContain("review:22");
  expect(result.trace.indexOf("review:22")).toBeLessThan(
    result.trace.indexOf("merge:22"),
  );
  expect(
    result.issues.every((issue: { state: string }) => issue.state === "closed"),
  ).toBe(true);
}, 90_000);

it("reports pending external qualification without implementing or closing its issue", async () => {
  const result = await execute({ READINESS_FIXTURE_QUALIFICATION_ONLY: "1" });
  expect(result.error).toBeUndefined();
  expect(result.stdout).toContain(
    "external qualification remains pending for: 22",
  );
  expect(result.trace).toEqual(["readiness:startup", "plan:"]);
  expect(result.issues[0].state).toBe("open");
  expect(result.snapshots[0].status).toBe("completed");
}, 90_000);

it.each(["parallel-planner-with-review", "codex-afk"])(
  "generated %s Codex workflow consumes saved models and effort for all roles through real provider commands and records",
  async (templateName) => {
    const result = await execute(
      { READINESS_FIXTURE_CODEX: "1" },
      templateName,
    );
    expect(result.error).toBeUndefined();
    for (const [role, effort] of [
      ["planner", "low"],
      ["implementer", "medium"],
      ["reviewer", "high"],
      ["merger", "xhigh"],
      ["readiness", "high"],
    ]) {
      const args = result.modelArgs.find((args) =>
        args.includes("configured-" + role),
      );
      expect(args).toBeDefined();
      expect(args).toContain('model_reasoning_effort="' + effort + '"');
      const nodes = result.snapshots.flatMap((snapshot) => snapshot.nodes);
      expect(
        nodes.find((node) => node.role === role && node.status === "completed"),
      ).toMatchObject({
        model: "configured-" + role,
        effort,
        provider: "codex",
      });
    }
    expect(result.snapshots[0].runtime.configRevision).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(result.snapshots[0].runtime.version).toMatch(/^0\./);
  },
  60_000,
);

it.each([
  {
    scenario: "fresh admission",
    flag: "READINESS_FIXTURE_STALE_PLAN",
    forbidden: ["implement:22"],
  },
  {
    scenario: "blocked completion",
    flag: "READINESS_FIXTURE_BLOCKED",
    forbidden: ["review:22", "merge:22"],
  },
  {
    scenario: "blocked review",
    flag: "READINESS_FIXTURE_REVIEW_BLOCKED",
    forbidden: ["merge:22", "readiness:post-merge"],
  },
  {
    scenario: "merger completion",
    flag: "READINESS_FIXTURE_MERGE_BLOCKED",
    forbidden: ["readiness:post-merge", "plan:20", "implement:20"],
  },
  {
    scenario: "readiness checkout integrity",
    flag: "READINESS_FIXTURE_DIRTY",
    forbidden: ["plan:22"],
  },
  {
    scenario: "post-merge verification",
    flag: "READINESS_FIXTURE_FAIL_VERIFY",
    forbidden: ["plan:20", "implement:20"],
  },
])(
  "shared Codex runtime preserves $scenario guards",
  async ({ flag, forbidden }) => {
    const result = await execute({ READINESS_FIXTURE_CODEX: "1", [flag]: "1" });
    expect(result.error).toBeDefined();
    for (const event of forbidden) expect(result.trace).not.toContain(event);
    expect(result.snapshots[0].status).toBe("failed");
  },
  90_000,
);

it.each(["parallel-planner-with-review", "codex-afk"])(
  "generated %s stops at the saved cycle limit without starting a later task",
  async (template) => {
    const result = await execute(
      { READINESS_FIXTURE_CODEX: "1", READINESS_FIXTURE_CYCLES: "1" },
      template,
    );
    expect(result.error).toBeDefined();
    expect(result.trace).toContain("merge:22");
    expect(result.trace).not.toContain("plan:20");
    expect(result.diagnostics).toEqual([
      { code: "iteration-limit", issues: [] },
    ]);
    expect(
      result.issues.find((issue: { number: number }) => issue.number === 20)
        .state,
    ).toBe("open");
    expect(result.snapshots[0].status).toBe("failed");
  },
  90000,
);

it.each([
  { flag: "READINESS_FIXTURE_NO_PROGRESS", code: "no-progress", failed: true },
  {
    flag: "READINESS_FIXTURE_QUALIFICATION_ONLY",
    code: "qualification-pending",
    failed: false,
  },
])(
  "configured Codex workflow records $code without closing unfinished issues",
  async ({ flag, code, failed }) => {
    const result = await execute({ READINESS_FIXTURE_CODEX: "1", [flag]: "1" });
    expect(Boolean(result.error)).toBe(failed);
    expect(result.diagnostics).toEqual([{ code, issues: [22] }]);
    expect(result.trace).not.toContain("merge:22");
    expect(
      result.issues.every((issue: { state: string }) => issue.state === "open"),
    ).toBe(true);
  },
  90000,
);
it.each(["READINESS_FIXTURE_HOLD", "READINESS_FIXTURE_META"])(
  "configured Codex workflow cannot implement held or meta tasks: %s",
  async (flag) => {
    const result = await execute({ READINESS_FIXTURE_CODEX: "1", [flag]: "1" });
    expect(result.trace).not.toContain("implement:22");
    expect(result.trace).not.toContain("implement:20");
    expect(
      result.issues.every((issue: { state: string }) => issue.state === "open"),
    ).toBe(true);
  },
  90000,
);

it.each([1, 2])(
  "configured Codex workflow enforces %s planner attempts before implementation",
  async (attempts) => {
    const result = await execute({
      READINESS_FIXTURE_CODEX: "1",
      READINESS_FIXTURE_INVALID_PLAN: "1",
      READINESS_FIXTURE_PLANNER_ATTEMPTS: String(attempts),
    });
    expect(result.trace.filter((event) => event === "plan:22")).toHaveLength(
      attempts,
    );
    if (attempts === 1) {
      expect(result.error).toBeDefined();
      expect(result.trace).not.toContain("implement:22");
      expect(
        result.issues.every(
          (issue: { state: string }) => issue.state === "open",
        ),
      ).toBe(true);
    } else {
      expect(result.error).toBeUndefined();
      expect(result.trace).toContain("implement:22");
      expect(
        result.issues.every(
          (issue: { state: string }) => issue.state === "closed",
        ),
      ).toBe(true);
    }
  },
  90000,
);
