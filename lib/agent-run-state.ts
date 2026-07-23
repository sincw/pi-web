export type AgentRunReconciliation = "ignore" | "busy" | "finish";

/**
 * Owns the synchronous portion of a prompt run. React state still projects
 * this state for rendering, while the hook uses this object where callbacks
 * need the latest value before React has rendered.
 */
export class AgentRunState {
  #runId = 0;
  #running = false;
  #packReloadPending = false;
  #packReloadPromise: Promise<void> | null = null;

  get runId(): number {
    return this.#runId;
  }

  get running(): boolean {
    return this.#running;
  }

  get hasPendingPackReload(): boolean {
    return this.#packReloadPending;
  }

  start(): number {
    this.#runId += 1;
    this.#running = true;
    return this.#runId;
  }

  ensureRunning(): number {
    return this.#running ? this.#runId : this.start();
  }

  isCurrent(runId: number): boolean {
    return this.#runId === runId;
  }

  finish(runId?: number): boolean {
    if (!this.#running || (runId !== undefined && !this.isCurrent(runId))) return false;
    this.#running = false;
    return true;
  }

  reconcile(runId: number, serverBusy: boolean): AgentRunReconciliation {
    if (!this.#running || !this.isCurrent(runId)) return "ignore";
    return serverBusy ? "busy" : "finish";
  }

  requestPackReload(): "deferred" | "ready" {
    this.#packReloadPending = true;
    return this.#running ? "deferred" : "ready";
  }

  reloadPacks(reload: () => Promise<void>): Promise<void> {
    if (this.#packReloadPromise) return this.#packReloadPromise;
    if (!this.#packReloadPending) return Promise.resolve();

    const task = (async () => {
      do {
        this.#packReloadPending = false;
        await reload();
      } while (this.#packReloadPending);
    })();

    this.#packReloadPromise = task;
    void task.then(
      () => {
        this.#packReloadPromise = null;
      },
      () => {
        this.#packReloadPending = true;
        this.#packReloadPromise = null;
      },
    );
    return task;
  }
}
