// 4xx problem with a fixed message — mirrors FastAPI's HTTPException.
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Returns {"detail": "..."} for ApiError, like FastAPI.
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ detail: err.message });
  }
  console.error("unhandled error:", err);
  return res.status(500).json({ detail: "internal error" });
}
