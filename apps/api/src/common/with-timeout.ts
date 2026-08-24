export class OperationTimeoutError extends Error {
  constructor(label: string) {
    super(`Operation timed out: ${label}`);
  }
}

/**
 * Races `promise` against a timer. Used to bound calls to dependencies
 * (Redis, in particular) whose client libraries default to retrying
 * indefinitely rather than failing fast — without this, a Redis outage
 * would make a request hang forever instead of returning a clear error.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new OperationTimeoutError(label)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolvePromise(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
