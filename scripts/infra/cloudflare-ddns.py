#!/usr/bin/env python3
"""Update the existing Supabase A records. Dry run unless --apply is supplied."""

import argparse
import ipaddress
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


RECORD_NAMES = ("api.dextery.dev", "studio.dextery.dev")
API_URL = "https://api.cloudflare.com/client/v4"


def log(message):
    print(f"{datetime.now(timezone.utc).isoformat()} {message}", flush=True)


def public_ipv4():
    # curl -4 ensures an IPv6-enabled server still reports its IPv4 address.
    import subprocess

    result = subprocess.run(
        ["curl", "-4", "--fail", "--silent", "--show-error", "--max-time", "20",
         "https://api.ipify.org"],
        capture_output=True, text=True, check=False,
    )
    if result.returncode:
        raise RuntimeError("Public IPv4 lookup failed")
    try:
        address = ipaddress.IPv4Address(result.stdout.strip())
    except ipaddress.AddressValueError:
        raise RuntimeError("Public IPv4 lookup returned an invalid address") from None
    if not address.is_global:
        raise RuntimeError("Public IPv4 lookup returned a non-public address")
    return str(address)


class Cloudflare:
    def __init__(self, token, zone_id):
        self.token = token
        self.zone_id = zone_id

    def request(self, method, path, body=None):
        request = Request(
            f"{API_URL}/zones/{self.zone_id}/dns_records{path}",
            data=json.dumps(body).encode() if body is not None else None,
            headers={"Authorization": f"Bearer {self.token}",
                     "Content-Type": "application/json"},
            method=method,
        )
        try:
            with urlopen(request, timeout=30) as response:
                payload = json.load(response)
        except HTTPError as error:
            # Never print headers, tokens, or the raw API response.
            raise RuntimeError(f"Cloudflare {method} failed: HTTP {error.code}") from None
        except (URLError, TimeoutError, ValueError):
            raise RuntimeError(f"Cloudflare {method} request failed") from None
        if payload.get("success") is not True:
            raise RuntimeError(f"Cloudflare {method} reported an API error")
        return payload["result"]

    def record(self, name):
        records = self.request("GET", "?" + urlencode({"type": "A", "name": name}))
        if len(records) != 1:
            raise RuntimeError(f"Expected exactly one existing A record for {name}")
        record = records[0]
        if record.get("type") != "A" or record.get("name") != name:
            raise RuntimeError(f"Unexpected DNS record returned for {name}")
        if not re.fullmatch(r"[a-f0-9]{32}", record.get("id", "")):
            raise RuntimeError(f"Invalid DNS record ID for {name}")
        return record


def update_records(client, current_ip, apply=False):
    # Check both records before making any changes; missing/duplicate records
    # must be resolved by a human, rather than silently created or removed.
    records = [client.record(name) for name in RECORD_NAMES]
    for record in records:
        name = record["name"]
        if record["content"] == current_ip:
            log(f"unchanged {name} A {current_ip}")
            continue
        if not apply:
            log(f"would update {name} A {record['content']} -> {current_ip}")
            continue
        # PATCH only content, preserving proxy status, TTL, comments and tags.
        client.request("PATCH", f"/{record['id']}", {"content": current_ip})
        if client.record(name)["content"] != current_ip:
            raise RuntimeError(f"DNS verification failed for {name}")
        log(f"updated {name} A {record['content']} -> {current_ip}")
    log(f"complete ip={current_ip} mode={'apply' if apply else 'dry-run'}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path,
                        default=Path("/etc/dextery-cloudflare-ddns.json"))
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    token = config.get("token", "")
    zone_id = config.get("zone_id", "")
    if not isinstance(token, str) or not token.strip():
        raise RuntimeError("Missing Cloudflare DNS token in configuration")
    if not isinstance(zone_id, str) or not re.fullmatch(r"[a-f0-9]{32}", zone_id):
        raise RuntimeError("Invalid Cloudflare zone ID in configuration")
    update_records(Cloudflare(token.strip(), zone_id), public_ipv4(), args.apply)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError, TypeError) as error:
        # Configuration parse errors may contain sensitive file contents.
        message = str(error) if isinstance(error, RuntimeError) else "Invalid or unreadable DDNS configuration/API response"
        print(f"DDNS failed: {message}", file=sys.stderr)
        sys.exit(1)
