"""Regression: GoTrue GET /admin/users/:id returns the user at JSON root, not under "user"."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

UID = "fbdf5a53-161e-4460-98ad-0e39408d8689"


def _mock_client_for_json(payload: dict):
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.json.return_value = payload

    mock_client = MagicMock()
    mock_client.get.return_value = mock_response

    mock_cm = MagicMock()
    mock_cm.__enter__.return_value = mock_client
    mock_cm.__exit__.return_value = None
    return mock_cm


@patch("app.integrations.supabase_admin.httpx.Client")
def test_get_last_sign_in_map_accepts_flat_gotrue_user(mock_client_class):
    """Matches auth-js _userResponse: data.user ?? data."""
    from app.integrations.supabase_admin import get_last_sign_in_map

    mock_client_class.return_value = _mock_client_for_json(
        {
            "id": UID,
            "email": "a@b.com",
            "last_sign_in_at": "2024-01-15T12:00:00Z",
        }
    )

    result = get_last_sign_in_map([UID])
    assert result[UID] == "2024-01-15T12:00:00Z"


@patch("app.integrations.supabase_admin.httpx.Client")
def test_get_last_sign_in_map_accepts_nested_user_key(mock_client_class):
    from app.integrations.supabase_admin import get_last_sign_in_map

    mock_client_class.return_value = _mock_client_for_json(
        {
            "user": {
                "id": UID,
                "last_sign_in_at": "2024-02-01T00:00:00Z",
            }
        }
    )

    result = get_last_sign_in_map([UID])
    assert result[UID] == "2024-02-01T00:00:00Z"
