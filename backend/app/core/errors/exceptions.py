from .app_error import AppError
from .error_category import ErrorCategory


class ValidationError(AppError):
    def __init__(self, code: str, message: str, details: dict | None = None, status_code: int = 400):
        super().__init__(
            category=ErrorCategory.VALIDATION,
            code=code,
            message=message,
            status_code=status_code,
            details=details,
        )


class AuthError(AppError):
    def __init__(self, code: str, message: str, details: dict | None = None):
        super().__init__(
            category=ErrorCategory.AUTH,
            code=code,
            message=message,
            status_code=401,
            details=details,
        )


class PermissionError(AppError):
    def __init__(self, code: str, message: str, details: dict | None = None):
        super().__init__(
            category=ErrorCategory.PERMISSION,
            code=code,
            message=message,
            status_code=403,
            details=details,
        )


class NotFoundError(AppError):
    def __init__(self, code: str, message: str, details: dict | None = None):
        super().__init__(
            category=ErrorCategory.NOT_FOUND,
            code=code,
            message=message,
            status_code=404,
            details=details,
        )


class ConflictError(AppError):
    def __init__(self, code: str, message: str, details: dict | None = None):
        super().__init__(
            category=ErrorCategory.CONFLICT,
            code=code,
            message=message,
            status_code=409,
            details=details,
        )


class ExternalAPIError(AppError):
    """Third-party API failure (e.g. OpenAI timeout or invalid payload)."""

    def __init__(
        self,
        service_name: str,
        error_message: str,
        code: str = "EXTERNAL_API_ERROR",
        status_code: int = 502,
        details: dict | None = None,
    ):
        merged = {"service_name": service_name, "error_message": error_message}
        if details:
            merged.update(details)
        super().__init__(
            category=ErrorCategory.EXTERNAL_API,
            code=code,
            message=error_message,
            status_code=status_code,
            details=merged,
        )


class LogicEvaluationError(AppError):
    def __init__(
        self,
        code: str,
        message: str,
        details: dict | None = None,
        status_code: int = 500,
    ):
        super().__init__(
            category=ErrorCategory.UNKNOWN,
            code=code,
            message=message,
            status_code=status_code,
            details=details,
        )
