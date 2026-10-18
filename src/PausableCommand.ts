const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";

/**
 * Run `command` in its own process group and record the group id in
 * `pidFile`, so a pause can stop the agent and every child it spawned.
 * Interrupting the exec effect alone does not stop a sandboxed process.
 * Uses `setsid` when present (Linux) and job control otherwise (macOS); stdin
 * is forwarded through fd 3 because background jobs lose it in `dash`.
 * Requires a POSIX shell.
 */
export const pausableCommand = (command: string, pidFile: string): string =>
  [
    "exec 3<&0",
    `if command -v setsid >/dev/null 2>&1; then setsid sh -c ${quote(command)} <&3 3<&- & else set -m; ( ${command} ) <&3 3<&- & fi`,
    "exec 3<&-",
    `echo $! > ${quote(pidFile)}`,
    "wait $!",
    "status=$?",
    `rm -f ${quote(pidFile)}`,
    "exit $status",
  ].join("; ");

/** Stop the process group started by `pausableCommand`: TERM, then KILL. */
export const stopPausableCommand = (pidFile: string): string => {
  const file = quote(pidFile);
  return [
    // The group id is written right after launch; wait briefly for it.
    `[ -s ${file} ] || sleep 1`,
    `[ -s ${file} ] || exit 0`,
    `group=$(cat ${file})`,
    'kill -TERM -"$group" 2>/dev/null',
    'for i in 1 2 3 4 5; do kill -0 -"$group" 2>/dev/null || break; sleep 1; done',
    'kill -KILL -"$group" 2>/dev/null',
    `rm -f ${file}`,
    "exit 0",
  ].join("; ");
};
