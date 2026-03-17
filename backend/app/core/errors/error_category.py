from enum import Enum

class ErrorCategory(str, Enum):
    VALIDATION = "validation"
    AUTH = "auth"
    PERMISSION = "permission"
    NOT_FOUND = "not_found"
    CONFLICT = "conflict"
    RATE_LIMIT = "rate_limit"
    EXTERNAL = "external"
    UNKNOWN = "unknown"
