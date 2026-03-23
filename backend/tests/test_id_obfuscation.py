import unittest

from app.core.id_obfuscation import (
    decode_public_id,
    encode_public_id,
    obfuscate_json_tree,
    reveal_json_tree,
    rewrite_path,
    rewrite_query_string,
)

SECRET = "test-secret-key-for-id-obfuscation-only"


class IdObfuscationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.uuid = "550E8400-E29B-41D4-A716-446655440000"
        self.lower = "550e8400-e29b-41d4-a716-446655440000"

    def test_round_trip_token(self) -> None:
        token = encode_public_id(SECRET, self.uuid)
        self.assertNotEqual(token, self.lower)
        self.assertIsNone(decode_public_id("wrong-secret", token))
        self.assertEqual(decode_public_id(SECRET, token), self.lower)

    def test_json_obfuscate_and_reveal(self) -> None:
        payload = {"id": self.uuid, "nested": {"x": [self.lower]}, "n": 1, "s": "hello"}
        out = obfuscate_json_tree(SECRET, payload)
        self.assertNotEqual(out["id"], self.uuid)
        self.assertEqual(out["n"], 1)
        self.assertEqual(out["s"], "hello")
        back = reveal_json_tree(SECRET, out)
        self.assertEqual(back["id"], self.lower)
        self.assertEqual(back["nested"]["x"][0], self.lower)

    def test_path_rewrite(self) -> None:
        token = encode_public_id(SECRET, self.uuid)
        path = f"/api/v1/items/{token}/edit"
        rewritten = rewrite_path(path, SECRET)
        self.assertEqual(rewritten, f"/api/v1/items/{self.lower}/edit")

    def test_path_preserves_raw_uuid(self) -> None:
        path = f"/api/v1/items/{self.lower}/x"
        self.assertEqual(rewrite_path(path, SECRET), path)

    def test_query_rewrite(self) -> None:
        token = encode_public_id(SECRET, self.uuid)
        qs = f"survey_id={token}&other=1".encode("latin-1")
        out = rewrite_query_string(qs, SECRET).decode("latin-1")
        self.assertIn(f"survey_id={self.lower}", out)
        self.assertIn("other=1", out)


if __name__ == "__main__":
    unittest.main()
