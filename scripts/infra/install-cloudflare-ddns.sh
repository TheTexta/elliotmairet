#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo 'Run this installer with sudo on gmkserver.' >&2
  exit 1
fi

source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
config="${source_dir}/cloudflare-ddns.json"
test -f "${source_dir}/cloudflare-ddns.py"
test -f /etc/systemd/system/dextery-ddns.service
test -f /etc/systemd/system/dextery-ddns.timer

if [[ ! -f "$config" ]]; then
  # A human can enter the scoped token directly over an interactive SSH session.
  # It is never included in command arguments, shell history, or output.
  python3 - "$config" <<'PY'
import getpass
import json
import os
import sys
import warnings

with warnings.catch_warnings():
    warnings.simplefilter("error", getpass.GetPassWarning)
    token = getpass.getpass("Cloudflare DNS token for dextery.dev: ").strip()
if not token:
    raise SystemExit("A DNS token is required")
descriptor = os.open(sys.argv[1], os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(descriptor, "w") as config:
    json.dump({"zone_id": "626cad70f16d48eb7a7115d323ad42b5", "token": token}, config)
PY
fi

# Validate the token, public IP and both records before replacing the service.
python3 "${source_dir}/cloudflare-ddns.py" --config "$config"
backup_dir=$(mktemp -d /etc/dextery-ddns-backup.XXXXXXXX)
chmod 700 "$backup_dir"
cp -p /etc/systemd/system/dextery-ddns.service "$backup_dir/"
cp -p /etc/systemd/system/dextery-ddns.timer "$backup_dir/"
if [[ -f /etc/dextery-cloudflare-ddns.json ]]; then
  cp -p /etc/dextery-cloudflare-ddns.json "$backup_dir/"
fi
if [[ -f /usr/local/sbin/cloudflare-ddns-dextery.py ]]; then
  cp -p /usr/local/sbin/cloudflare-ddns-dextery.py "$backup_dir/"
fi

systemctl stop dextery-ddns.timer dextery-ddns.service
install -o root -g root -m 600 "$config" /etc/dextery-cloudflare-ddns.json
install -o root -g root -m 755 "${source_dir}/cloudflare-ddns.py" /usr/local/sbin/cloudflare-ddns-dextery.py
cat > /etc/systemd/system/dextery-ddns.service <<'UNIT'
[Unit]
Description=Update Cloudflare Supabase DNS A records for dextery.dev
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /usr/local/sbin/cloudflare-ddns-dextery.py --apply
TimeoutStartSec=240
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
UNIT

# Retain the existing five-minute timer and its boot scheduling.
systemctl daemon-reload
systemctl enable --now dextery-ddns.timer
systemctl start dextery-ddns.service
systemctl status dextery-ddns.timer --no-pager
journalctl -u dextery-ddns.service -n 8 --no-pager
rm -- "$config"
printf 'Installed Cloudflare DDNS. Previous service saved in %s\n' "$backup_dir"
