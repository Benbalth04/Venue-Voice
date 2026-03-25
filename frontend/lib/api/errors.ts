// ------------------------------------------------------------------
// Centralised error normalisation for the Venue Voice API layer.
//
// Backend contract:
//   { error: { category, code, message, details } }
//
// All API functions throw NormalizedError so callers never need to
// inspect raw response shapes.
// ------------------------------------------------------------------

export interface NormalizedError {
  category: string
  code: string
  message: string
  details?: Record<string, unknown>
}

/**
 * Convert a parsed (but possibly malformed) error response body into a
 * NormalizedError.  Safe to call with any value including null/undefined.
 */
export function normalizeApiError(data: unknown, _status: number): NormalizedError {
  if (
    data != null &&
    typeof data === "object" &&
    "error" in data &&
    data.error != null &&
    typeof data.error === "object"
  ) {
    const e = data.error as Record<string, unknown>
    if (typeof e.message === "string" && e.message.length > 0) {
      return {
        category: typeof e.category === "string" ? e.category : "unknown",
        code: typeof e.code === "string" ? e.code : "UNKNOWN_ERROR",
        message: e.message,
        details:
          e.details != null && typeof e.details === "object"
            ? (e.details as Record<string, unknown>)
            : {},
      }
    }
  }

  return {
    category: "unknown",
    code: "INVALID_ERROR_FORMAT",
    message: "Something went wrong",
    details: {},
  }
}

/**
 * Wrap any thrown value (network errors, runtime exceptions, etc.)
 * into a NormalizedError.  Already-normalized errors are passed through.
 */
export function normalizeUnknownError(err: unknown): NormalizedError {
  // Already normalised – pass through unchanged.
  if (isNormalizedError(err)) return err

  if (err instanceof Error && err.message) {
    return {
      category: "unknown",
      code: "NETWORK_OR_RUNTIME_ERROR",
      message: err.message,
      details: {},
    }
  }

  return {
    category: "unknown",
    code: "NETWORK_OR_RUNTIME_ERROR",
    message: "Something went wrong",
    details: {},
  }
}

/**
 * Type-guard: returns true when the value looks like a NormalizedError.
 */
export function isNormalizedError(err: unknown): err is NormalizedError {
  return (
    err != null &&
    typeof err === "object" &&
    "category" in err &&
    "code" in err &&
    "message" in err &&
    typeof (err as NormalizedError).message === "string"
  )
}

/**
 * Display an error to the user.  Uses alert() as the project has no
 * toast library.  Callers can override this for testing.
 */
export function showError(err: NormalizedError | unknown): void {
  const message = extractErrorMessage(err)
  // eslint-disable-next-line no-alert
  alert(message)
}

/**
 * Extract a human-readable message from any thrown value.
 * Handles NormalizedError, plain Error, and unknown values.
 * Always returns a non-empty string.
 */
export function extractErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (isNormalizedError(err)) return err.message || fallback
  if (err instanceof Error) return err.message || fallback
  return fallback
}

/**
 * Returns true when the error is a stale-object conflict (OCC failure).
 * The backend returns code "STALE_OBJECT" with HTTP 409.
 */
export function isStaleObjectError(err: unknown): boolean {
  return isNormalizedError(err) && err.code === "STALE_OBJECT"
}
