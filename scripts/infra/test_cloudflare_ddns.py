import contextlib
import importlib.util
import io
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.error import HTTPError


spec = importlib.util.spec_from_file_location(
    "cloudflare_ddns", Path(__file__).with_name("cloudflare-ddns.py")
)
ddns = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ddns)


class FakeCloudflare(ddns.Cloudflare):
    def __init__(self):
        super().__init__("test-token", "a" * 32)
        self.records = {
            name: [{"id": str(index) * 32, "type": "A", "name": name,
                    "content": "204.244.186.73", "ttl": 300,
                    "proxied": False, "comment": "keep this", "tags": ["keep"]}]
            for index, name in enumerate(ddns.RECORD_NAMES, 1)
        }
        self.writes = []

    def request(self, method, path, body=None):
        if method == "GET":
            from urllib.parse import parse_qs
            name = parse_qs(path.lstrip("?"))["name"][0]
            return [dict(record) for record in self.records[name]]
        self.writes.append((method, path, body))
        for records in self.records.values():
            for record in records:
                if path == f"/{record['id']}":
                    record.update(body)
                    return dict(record)
        raise AssertionError("Unexpected DNS mutation")


class DdnsTests(unittest.TestCase):
    def setUp(self):
        self.client = FakeCloudflare()
        self.output = contextlib.redirect_stdout(io.StringIO())
        self.output.__enter__()
        self.addCleanup(self.output.__exit__, None, None, None)

    def test_dry_run_has_no_mutations(self):
        ddns.update_records(self.client, "64.72.244.17")
        self.assertEqual(self.client.writes, [])

    def test_update_preserves_other_settings_and_is_idempotent(self):
        ddns.update_records(self.client, "64.72.244.17", apply=True)
        self.assertEqual(len(self.client.writes), 2)
        for method, _, body in self.client.writes:
            self.assertEqual(method, "PATCH")
            self.assertEqual(body, {"content": "64.72.244.17"})
        for records in self.client.records.values():
            self.assertEqual(records[0]["ttl"], 300)
            self.assertFalse(records[0]["proxied"])
            self.assertEqual(records[0]["comment"], "keep this")
            self.assertEqual(records[0]["tags"], ["keep"])
        ddns.update_records(self.client, "64.72.244.17", apply=True)
        self.assertEqual(len(self.client.writes), 2)

    def test_missing_or_duplicate_second_record_prevents_all_writes(self):
        name = ddns.RECORD_NAMES[1]
        original = self.client.records[name]
        for records in ([], original * 2):
            with self.subTest(records=len(records)):
                self.client.records[name] = records
                with self.assertRaisesRegex(RuntimeError, "exactly one"):
                    ddns.update_records(self.client, "64.72.244.17", apply=True)
                self.assertEqual(self.client.writes, [])

    def test_verification_failure_does_not_report_success(self):
        with patch.object(self.client, "request", wraps=self.client.request) as request:
            def ignore_patch(method, path, body=None):
                if method == "PATCH":
                    return {}
                return FakeCloudflare.request(self.client, method, path, body)

            request.side_effect = ignore_patch
            with self.assertRaisesRegex(RuntimeError, "verification failed"):
                ddns.update_records(self.client, "64.72.244.17", apply=True)

    def test_http_errors_do_not_expose_response_or_token(self):
        client = ddns.Cloudflare("sensitive-token", "a" * 32)
        error = HTTPError("https://example.com", 403, "sensitive-token", {},
                          io.BytesIO(b"secret response"))
        with patch.object(ddns, "urlopen", side_effect=error):
            with self.assertRaisesRegex(RuntimeError, "HTTP 403") as raised:
                client.record(ddns.RECORD_NAMES[0])
        self.assertNotIn("sensitive-token", str(raised.exception))
        self.assertNotIn("secret response", str(raised.exception))

    def test_invalid_or_private_ip_is_rejected(self):
        for value in ("192.168.1.1", "127.0.0.1", "999.2.3.4", "::1", "<html>"):
            with self.subTest(value=value):
                result = SimpleNamespace(returncode=0, stdout=value)
                with patch("subprocess.run", return_value=result):
                    with self.assertRaises(RuntimeError):
                        ddns.public_ipv4()


if __name__ == "__main__":
    unittest.main()
