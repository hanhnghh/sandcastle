# 0021: App harness kit, so the next Shopify app starts where kit-demo is now

Status: accepted (owner, 2026-10-24). Phases land in order; each phase is usable on its own.

## Context

kit-demo (Storelume) runs Sandcastle continuously. Over its first weeks, the harness grew four layers:

1. **Orchestrator.** This fork: multi-provider, rolling batches, checkpoints, advisor, and a review loop with round counting, sweeps and owner escalation. It is generic and already lives here.
2. **Project harness.** kit-demo's `.sandcastle/`: the continuous supervisor and launchd job, prompts with learned rules, the cumulative gate, closing-keyword checks and the planner validator. Most of it is generic, but it is copied by hand and drifts.
3. **Quality harness.** Mockup renderer, per-region pixel diff, motion test helper, and a Shopify live runner that drives a signed-in admin. All of it is written against kit-demo's paths and store.
4. **Skills.** `reference-tour`, `reference-parity`, `reference-to-roadmap`, `to-tickets`, `live-runner` and `sandcastle`. They live in `~/.agents/skills` without version control.

On 2026-10-24 several failures had to be caught by a person rather than the harness:

- the design target drifted from the reference app;
- a prompt example disagreed with the verdict schema, and two review rounds were lost;
- a failure that already existed on the base blocked an unrelated ticket's gate;
- integration pull requests waited for someone to merge them.

kit-demo has fixed each of these locally (kit-demo PRs #645–#648, fork #47). A second Shopify app would have to copy all of it again.

## Decision

Make the harness a kit with one home per layer.

| Phase | What                                                                                                                                                                                                                                                                                                                                                                   | Home                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| A     | Continuous supervisor (`continuous.mts`, `continuous-core.cjs`, launchd script), `closing-keywords.cjs`, and the learned prompt rules: whole defect classes, consumers of shared changes, reference parity, gate-blocker tickets, decision placement. All parameterised by env and shipped in the `parallel-planner-with-review` template                              | this fork, `src/templates/parallel-planner-with-review/` |
| B     | Quality packages: `design-harness` (mockup render, reproducibility check, region pixel diff, compare sheets, motion helper that asserts `getAnimations()` timing and reduced motion) and `shopify-live-runner` (CDP-attached signed-in Chrome, admin URL from app handle, journey runner, report). Configured by one file per app (store, app handle, states, regions) | new repo `hanhnghh/app-harness`, `packages/`             |
| C     | Skills under version control, with an install script that links them into `~/.agents/skills` and `~/.claude/skills`                                                                                                                                                                                                                                                    | `hanhnghh/app-harness`, `skills/`                        |
| D     | `app-harness init`: scaffolds a new Shopify app repo with the Sandcastle template, the Phase B config, the design folders (`docs/design/<area>/{mockups,reference}`), the label set (`ready-for-agent`, `kind:*`, `readiness:hold`, `needs-owner`, `priority:gate`) and the AGENTS.md navigation                                                                       | `hanhnghh/app-harness`                                   |
| E     | Metrics: per ticket, record review rounds, wall time per role, gate time, invalid reviews and escalations. One dashboard compares apps                                                                                                                                                                                                                                 | supervisor plus a small report script                    |

## Consequences

- kit-demo keeps working throughout. Each phase is first proved in kit-demo, then generalised. kit-demo moves to the generic copy only once its tests pass there.
- Project-specific lanes (INT-B2, theme qualification) stay in kit-demo.
- The success measure for a second app: on day one, a continuous run plans, implements, reviews and merges a first ticket with pixel and live checks, without hand-copied harness code. Phase E then compares its review rounds and gate time against kit-demo's.
