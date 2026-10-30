/** An expected business-rule failure, shown to the user (e.g. "email already used"). */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    /** Form field the error belongs to, when there is one. */
    readonly field?: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError;
}
