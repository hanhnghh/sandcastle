---
"@ai-hero/sandcastle": minor
---

Add a guided Claude subscription login. `sandcastle claude-login` (also offered
by `init --agent claude-code`, `--claude-login`) runs `claude setup-token`,
reads the token with masked input and stores it with its issue date in
`.sandcastle/.env` (0600, other entries kept); `--verify` confirms it with one
minimal request using only the token. A local check (declared, `sk-ant-oat`
format, expiry with a 30-day warning, `ANTHROPIC_API_KEY` conflict) feeds a
"Claude subscription" line in the operator preflight, and run admission
refuses a malformed or expired token before any role runs.
