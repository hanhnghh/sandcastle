#!/usr/bin/env bash
# Continuous Sandcastle: one dedicated worktree on an integration branch,
# supervised by .sandcastle/continuous.mts, optionally kept alive by launchd.
#
#   bash .sandcastle/continuous.sh setup      create/refresh the worktree, link credentials, npm ci
#   bash .sandcastle/continuous.sh start      run the supervisor in the foreground
#   bash .sandcastle/continuous.sh install    keep it running in the background (macOS launchd)
#   bash .sandcastle/continuous.sh uninstall  remove the launchd agent
#   bash .sandcastle/continuous.sh stop       ask the supervisor to stop after the current step
#   bash .sandcastle/continuous.sh status     show the supervisor state
set -euo pipefail

cmd="${1:-help}"
common="$(git rev-parse --path-format=absolute --git-common-dir)"
main="$(dirname "$common")"
wt="${SANDCASTLE_CONTINUOUS_DIR:-$(dirname "$main")/$(basename "$main")-continuous}"
branch="${SANDCASTLE_BRANCH:-sandcastle/continuous}"
base="${SANDCASTLE_BASE:-main}"
label="${SANDCASTLE_LAUNCHD_LABEL:-com.sandcastle.continuous}"
plist="$HOME/Library/LaunchAgents/$label.plist"

case "$cmd" in
  setup)
    git -C "$main" fetch --quiet origin "$base"
    if [ ! -d "$wt" ]; then
      if git -C "$main" show-ref --verify --quiet "refs/heads/$branch"; then
        git -C "$main" worktree add "$wt" "$branch"
      else
        git -C "$main" worktree add -b "$branch" "$wt" "origin/$base"
      fi
    fi
    # Credentials stay in the main checkout (ignored by Git); the worktree links to them.
    for path in .sandcastle/codex-home .sandcastle/.env; do
      if [ -e "$main/$path" ] && [ ! -e "$wt/$path" ]; then ln -s "$main/$path" "$wt/$path"; fi
    done
    # Declare GH_TOKEN without a value; continuous.mts supplies it from `gh auth token`.
    if [ ! -e "$wt/.sandcastle/.env" ]; then printf 'GH_TOKEN=\n' > "$wt/.sandcastle/.env"; chmod 600 "$wt/.sandcastle/.env"; fi
    (cd "$wt" && npm ci --no-audit --no-fund)
    # tsx runs the supervisor and the workflow; keep it as a dev dependency.
    echo "Continuous worktree ready: $wt ($branch)"
    ;;
  start)
    cd "$wt"
    exec npx tsx .sandcastle/continuous.mts
    ;;
  install)
    mkdir -p "$(dirname "$plist")" "$wt/.sandcastle/logs"
    cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$wt/.sandcastle/continuous.sh</string><string>start</string></array>
  <key>WorkingDirectory</key><string>$wt</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$PATH</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>300</integer>
  <key>StandardOutPath</key><string>$wt/.sandcastle/logs/continuous-launchd.log</string>
  <key>StandardErrorPath</key><string>$wt/.sandcastle/logs/continuous-launchd.log</string>
</dict>
</plist>
PLIST
    launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$plist"
    echo "Installed $label; logs in $wt/.sandcastle/logs/"
    ;;
  uninstall)
    launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
    rm -f "$plist"
    echo "Removed $label"
    ;;
  stop)
    mkdir -p "$wt/.sandcastle/runs"
    touch "$wt/.sandcastle/runs/continuous.stop"
    echo "Stop requested; the supervisor exits after the current step."
    ;;
  status)
    cat "$wt/.sandcastle/runs/continuous.json" 2>/dev/null || echo "No supervisor state in $wt"
    launchctl print "gui/$(id -u)/$label" 2>/dev/null | grep -E '^\s*(state|pid|last exit code)' || echo "launchd agent not loaded"
    ;;
  *)
    sed -n '2,10p' "$0"
    ;;
esac
