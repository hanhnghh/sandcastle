import { Cause, Effect, Option, Runtime } from "effect";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { resolve } from "node:path";
import { startDashboard, type DashboardServer } from "./AgentMap.js";
import {
  codexCapability,
  loadRoleConfig,
  OperatorError,
  saveRoleConfig,
} from "./Operator.js";
import {
  createProjectRuntime,
  type ProjectRuntime,
  type ProjectRuntimeOptions,
} from "./OperatorRuntime.js";
import {
  operatorPage,
  operatorScript,
  operatorStyles,
} from "./operatorAssets.js";

/** Project-owned execution policy; HTTP can only request this fixed workflow. */
export interface OperatorProjectAdapter {
  /** Project prompt paths; never supplied by HTTP. */
  promptFiles: ProjectRuntimeOptions["promptFiles"];
  /** Resolve the sandbox identity before admitting the run. */
  sandboxIdentity(): Promise<string>;
  /** Run the project workflow with the already frozen runtime, preserving its gates. */
  run(runtime: ProjectRuntime): Promise<void>;
}
class RequestError extends OperatorError {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super({ message });
  }
}
const requestBody = (request: IncomingMessage) =>
  Effect.tryPromise({
    try: async () => {
      if (request.headers["content-type"] !== "application/json")
        throw new RequestError(415, "Use Content-Type: application/json");
      let body = "";
      for await (const chunk of request) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 16_384)
          throw new RequestError(413, "Request exceeds 16 KiB");
      }
      try {
        return JSON.parse(body) as unknown;
      } catch {
        throw new RequestError(400, "Invalid JSON request");
      }
    },
    catch: (error) =>
      error instanceof RequestError
        ? error
        : new RequestError(400, "Cannot read request body"),
  });
const attempt = <T>(run: () => Promise<T>) =>
  Effect.tryPromise({
    try: run,
    catch: (error) => {
      if (error instanceof OperatorError) return error;
      const failure = Runtime.isFiberFailure(error)
        ? Cause.failureOption(error[Runtime.FiberFailureCauseId])
        : Option.none();
      return Option.isSome(failure) && failure.value instanceof OperatorError
        ? failure.value
        : new OperatorError({
            message:
              "Project operation failed; check project paths, adapter and permissions",
          });
    },
  });
/** Serve an explicit project on loopback with session-protected mutations and read-only run observation. */
export const startOperator = (options: {
  /** Host project directory; requests cannot override it. */
  cwd: string;
  /** Loopback port; zero selects a free port. */
  port: number;
  /** Trusted project adapter, configured by the SDK caller. */
  adapter: OperatorProjectAdapter;
}): Promise<DashboardServer> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const cwd = resolve(options.cwd);
      yield* attempt(() => loadRoleConfig({ cwd }));
      const dashboard = yield* attempt(() => startDashboard({ cwd, port: 0 }));
      const token = randomBytes(32).toString("hex");
      let running = false;
      let current:
        | {
            runtime: ProjectRuntime;
            status: "running" | "completed" | "failed";
          }
        | undefined;
      const lock = yield* Effect.makeSemaphore(1);
      const server = createServer((request, response) => {
        void Effect.runPromise(
          Effect.gen(function* () {
            response.setHeader("Cache-Control", "no-store");
            response.setHeader("X-Content-Type-Options", "nosniff");
            response.setHeader(
              "Content-Security-Policy",
              "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
            );
            response.setHeader(
              "Content-Type",
              "application/json; charset=utf-8",
            );
            const address = server.address();
            const port =
              address && typeof address !== "string" ? address.port : -1;
            const host = request.headers.host;
            if (
              (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) ||
              (request.headers.origin &&
                request.headers.origin !== `http://${host}`)
            )
              return yield* Effect.fail(
                new RequestError(
                  403,
                  "Only the operator's local origin and host are allowed",
                ),
              );
            const url = yield* Effect.try({
              try: () => new URL(request.url ?? "/", "http://127.0.0.1"),
              catch: () => new RequestError(400, "Invalid request URL"),
            });
            if (url.search)
              return yield* Effect.fail(
                new RequestError(
                  400,
                  "Project and command overrides are not accepted",
                ),
              );
            const mutation = request.method !== "GET";
            if (
              mutation &&
              (request.headers.origin !== `http://${host}` ||
                !request.headers.cookie
                  ?.split(";")
                  .some(
                    (cookie) =>
                      cookie.trim() === `sandcastle-session-${port}=${token}`,
                  ))
            )
              return yield* Effect.fail(
                new RequestError(
                  403,
                  "Open the operator UI to establish a local session; send its exact Origin",
                ),
              );
            if (request.method === "GET" && url.pathname === "/") {
              response.setHeader(
                "Set-Cookie",
                `sandcastle-session-${port}=${token}; HttpOnly; SameSite=Strict; Path=/`,
              );
              response.setHeader("Content-Type", "text/html; charset=utf-8");
              response.end(operatorPage);
              return;
            }
            if (
              request.method === "GET" &&
              (url.pathname === "/app.js" || url.pathname === "/style.css")
            ) {
              response.setHeader(
                "Content-Type",
                url.pathname === "/app.js" ? "text/javascript" : "text/css",
              );
              response.end(
                url.pathname === "/app.js" ? operatorScript : operatorStyles,
              );
              return;
            }
            if (request.method === "GET" && url.pathname === "/dashboard") {
              response.writeHead(302, { Location: dashboard.url });
              response.end();
              return;
            }
            if (url.pathname === "/api/config") {
              if (request.method === "GET") {
                const config = yield* attempt(() => loadRoleConfig({ cwd }));
                response.end(
                  JSON.stringify({
                    config,
                    capability: codexCapability,
                    project: cwd,
                  }),
                );
                return;
              }
              if (request.method === "PUT") {
                const body = yield* requestBody(request);
                const config = yield* lock.withPermits(1)(
                  attempt(() => saveRoleConfig({ cwd, config: body })),
                );
                response.end(JSON.stringify({ config }));
                return;
              }
            }
            if (url.pathname === "/api/run") {
              if (request.method === "GET") {
                const record = current?.runtime.record;
                response.end(
                  JSON.stringify({
                    run: record
                      ? {
                          id: record.id,
                          config: record.config,
                          runtimeVersion: record.runtimeVersion,
                          sandboxIdentity: record.sandboxIdentity,
                          status: current!.status,
                        }
                      : null,
                  }),
                );
                return;
              }
              if (request.method === "POST") {
                const body = yield* requestBody(request);
                if (
                  !body ||
                  typeof body !== "object" ||
                  Array.isArray(body) ||
                  Object.keys(body).length
                )
                  return yield* Effect.fail(
                    new RequestError(
                      400,
                      "Run accepts only an empty JSON object; the project owns execution policy",
                    ),
                  );
                if (running)
                  return yield* Effect.fail(
                    new RequestError(409, "A project run is already active"),
                  );
                running = true;
                const runtime = yield* lock
                  .withPermits(1)(
                    Effect.gen(function* () {
                      const sandboxIdentity = yield* attempt(() =>
                        options.adapter.sandboxIdentity(),
                      );
                      return yield* attempt(() =>
                        createProjectRuntime({
                          cwd,
                          promptFiles: options.adapter.promptFiles,
                          sandboxIdentity,
                        }),
                      );
                    }),
                  )
                  .pipe(
                    Effect.tapError(() =>
                      Effect.sync(() => {
                        running = false;
                      }),
                    ),
                  );
                current = { runtime, status: "running" };
                void Effect.runPromise(
                  attempt(() => options.adapter.run(runtime)).pipe(
                    Effect.match({
                      onFailure: () => {
                        current!.status = "failed";
                      },
                      onSuccess: () => {
                        current!.status = "completed";
                      },
                    }),
                    Effect.ensuring(
                      Effect.sync(() => {
                        running = false;
                      }),
                    ),
                  ),
                );
                response.writeHead(202);
                response.end(
                  JSON.stringify({
                    id: runtime.record.id,
                    revision: runtime.record.config.revision,
                  }),
                );
                return;
              }
            }
            return yield* Effect.fail(
              new RequestError(
                mutation ? 405 : 404,
                "Unsupported operator route or method",
              ),
            );
          }).pipe(
            Effect.catchAll((error) =>
              Effect.sync(() => {
                if (!response.headersSent)
                  response.writeHead(
                    error instanceof RequestError ? error.status : 400,
                  );
                response.end(JSON.stringify({ error: error.message }));
              }),
            ),
          ),
        );
      });
      yield* Effect.async<void, OperatorError>((resume) => {
        server.once("error", () =>
          resume(
            Effect.fail(
              new OperatorError({
                message: "Cannot bind operator loopback port",
              }),
            ),
          ),
        );
        server.listen(options.port, "127.0.0.1", () => resume(Effect.void));
      }).pipe(Effect.tapError(() => attempt(() => dashboard.close())));
      const address = server.address();
      if (!address || typeof address === "string")
        return yield* Effect.fail(
          new OperatorError({ message: "Missing operator address" }),
        );
      return {
        url: `http://127.0.0.1:${address.port}`,
        close: () =>
          Effect.runPromise(
            Effect.gen(function* () {
              yield* Effect.async<void>((resume) => {
                server.closeAllConnections();
                server.close(() => resume(Effect.void));
              });
              yield* attempt(() => dashboard.close());
              // The project workflow owns cancellation; closing observation does not stop it.
            }),
          ),
      };
    }),
  );
