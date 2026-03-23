import unittest

from app.core.errors.exceptions import ValidationError
from app.services.qr_code_service import generate_qr_bytes, validate_redirect_url


class TestValidateRedirectUrl(unittest.TestCase):
    def test_accepts_https(self) -> None:
        validate_redirect_url("https://example.com/path?x=1")

    def test_rejects_non_http_scheme(self) -> None:
        with self.assertRaises(ValidationError):
            validate_redirect_url("ftp://example.com")

    def test_rejects_empty(self) -> None:
        with self.assertRaises(ValidationError):
            validate_redirect_url("")


class TestGenerateQrBytes(unittest.TestCase):
    def test_generates_three_formats(self) -> None:
        out = generate_qr_bytes(
            redirect_url="https://example.com/venue",
            has_logo=False,
        )
        self.assertIn("svg", out)
        self.assertIn("png", out)
        self.assertIn("jpeg", out)
        self.assertTrue(out["svg"].startswith(b"<?xml"))
        self.assertEqual(out["png"][:8], b"\x89PNG\r\n\x1a\n")
        self.assertTrue(out["jpeg"].startswith(b"\xff\xd8"))


if __name__ == "__main__":
    unittest.main()
