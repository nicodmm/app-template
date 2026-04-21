export class CrmApiError extends Error {
  constructor(
    public code: number,
    public provider: string,
    message: string,
    public raw?: unknown
  ) {
    super(message);
    this.name = "CrmApiError";
  }

  isAuthError(): boolean {
    return this.code === 401;
  }

  isRateLimit(): boolean {
    return this.code === 429;
  }
}
