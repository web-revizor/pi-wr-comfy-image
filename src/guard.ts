/** Consecutive failures after which a workflow is refused for a while. */
const LIMIT = 2;
/** Long enough to stop a retry loop, short enough to retry after a fix. */
const BLOCK_MS = 120_000;

interface Failures {
  count: number;
  last: string;
  at: number;
}

/** Stops a model from calling a workflow that keeps failing, again and again. */
export class FailureGuard {
  private readonly failures = new Map<string, Failures>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Throws while the workflow is blocked. */
  check(workflow: string): void {
    const f = this.failures.get(workflow);
    if (!f || f.count < LIMIT) return;
    if (this.now() - f.at >= BLOCK_MS) {
      this.failures.delete(workflow);
      return;
    }
    throw new Error(
      `Stop. Tell the user: ${f.last} Do not call the workflow "${workflow}" again.`,
    );
  }

  fail(workflow: string, error: string): void {
    const count = (this.failures.get(workflow)?.count ?? 0) + 1;
    this.failures.set(workflow, { count, last: error, at: this.now() });
  }

  succeed(workflow: string): void {
    this.failures.delete(workflow);
  }
}
