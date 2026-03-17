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
