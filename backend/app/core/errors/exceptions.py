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


class StaleObjectError(AppError):
    def __init__(self, entity: str, entity_id: str):
        super().__init__(
            category=ErrorCategory.CONFLICT,
            code="STALE_OBJECT",
            message="This data has been updated by another user. Please refresh.",
            status_code=409,
            details={"entity": entity, "id": entity_id},
        )


class RateLimitExceededError(AppError):
    def __init__(self):
        super().__init__(
            category=ErrorCategory.RATE_LIMIT,
            code="RATE_LIMIT_EXCEEDED",
            message="Too many requests. Please try again later.",
            status_code=429,
        )


class SessionExpiredError(AppError):
    def __init__(self):
        super().__init__(
            category=ErrorCategory.VALIDATION,
            code="SESSION_EXPIRED",
            message="This session has expired. Please restart the survey.",
            status_code=400,
        )


class SuspiciousSubmissionError(AppError):
    def __init__(self):
        super().__init__(
            category=ErrorCategory.VALIDATION,
            code="SUSPICIOUS_ACTIVITY",
            message="Submission rejected due to suspicious activity.",
            status_code=400,
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


class RuleValidationError(AppError):
    """Raised when a rule cannot be saved because it contains broken conditions."""

    def __init__(self, issues: list[dict]):
        super().__init__(
            category=ErrorCategory.VALIDATION,
            code="RULE_INVALID",
            message="Rule contains invalid conditions. Please fix all issues.",
            status_code=400,
            details={"issues": issues},
        )


class RuleBrokenError(AppError):
    """Raised when a broken rule is evaluated at runtime."""

    def __init__(self):
        super().__init__(
            category=ErrorCategory.VALIDATION,
            code="RULE_BROKEN",
            message="This rule is broken and cannot be evaluated.",
            status_code=400,
        )


class FlowExecutionError(AppError):
    """Raised when a flow run fails due to an internal engine error."""

    def __init__(self, code: str, message: str, details: dict | None = None):
        super().__init__(
            category=ErrorCategory.UNKNOWN,
            code=code,
            message=message,
            status_code=500,
            details=details,
        )


_UPGRADE_PATH: dict[str, str | None] = {
    "starter": "growth",
    "growth": "pro",
    "pro": None,
}


def suggest_upgrade_plan(plan_name: str | None) -> str | None:
    """Return the next-tier plan name to suggest when a limit is hit, or None if already on Pro."""
    return _UPGRADE_PATH.get((plan_name or "").strip().lower())


class SubscriptionLimitError(AppError):
    """Raised when creating or enabling a resource would exceed the plan's limit.

    Use ``is_over_limit=True`` when the account already *exceeds* the limit
    (post-downgrade) so the frontend can surface a distinct 'ACCOUNT_OVER_LIMIT'
    error vs a normal 'LIMIT_EXCEEDED' at-cap block.
    """

    def __init__(
        self,
        resource: str,
        limit: int,
        current: int,
        message: str | None = None,
        *,
        is_over_limit: bool = False,
        plan: str | None = None,
        upgrade_to: str | None = None,
        extra_details: dict | None = None,
    ):
        code = "ACCOUNT_OVER_LIMIT" if is_over_limit else "LIMIT_EXCEEDED"
        details: dict = {"resource": resource, "limit": limit, "current": current}
        if plan is not None:
            details["plan"] = plan
        if upgrade_to is not None:
            details["upgrade_to"] = upgrade_to
        elif plan is not None:
            # Auto-populate if caller supplied plan but not upgrade_to
            computed = suggest_upgrade_plan(plan)
            if computed is not None:
                details["upgrade_to"] = computed
        if extra_details:
            details.update(extra_details)
        super().__init__(
            category=ErrorCategory.PERMISSION,
            code=code,
            message=message or f"You have reached the {resource} limit for your current plan.",
            status_code=403,
            details=details,
        )


class SubscriptionFeatureError(AppError):
    """Raised when a feature is not available on the current subscription plan."""

    def __init__(self, feature: str, message: str | None = None):
        super().__init__(
            category=ErrorCategory.PERMISSION,
            code="FEATURE_NOT_AVAILABLE",
            message=message or "This feature is not available on your current plan.",
            status_code=403,
            details={"feature": feature},
        )
