#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ "${EUID}" -eq 0 ]]; then
  echo 'Run this installer as dextery, without sudo.' >&2
  exit 1
fi

source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ddns_dir="${HOME}/.local/share/dextery-ddns"
test -f "${source_dir}/cloudflare-ddns.json"
test -f "${source_dir}/cloudflare-ddns.py"
command -v crontab >/dev/null
command -v flock >/dev/null
systemctl is-active --quiet cron
python3 "${source_dir}/cloudflare-ddns.py" --config "${source_dir}/cloudflare-ddns.json"

install -d -m 700 "$ddns_dir"
install -m 600 "${source_dir}/cloudflare-ddns.json" "${ddns_dir}/cloudflare-ddns.json"
install -m 700 "${source_dir}/cloudflare-ddns.py" "${ddns_dir}/cloudflare-ddns.py"
/usr/bin/flock -n "${ddns_dir}/update.lock" /usr/bin/python3 "${ddns_dir}/cloudflare-ddns.py" \
  --config "${ddns_dir}/cloudflare-ddns.json" --apply

python3 - "$ddns_dir" <<'PY'
import datetime
import pathlib
import shlex
import subprocess
import sys

directory = pathlib.Path(sys.argv[1])
begin = "# BEGIN dextery-cloudflare-ddns"
end = "# END dextery-cloudflare-ddns"
result = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
if result.returncode != 0 and "no crontab for" not in result.stderr:
    raise SystemExit("Cannot read existing user crontab")
previous = result.stdout
timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
(directory / f"crontab-backup-{timestamp}.txt").write_text(previous)
lines = previous.splitlines()
if begin in lines or end in lines:
    if lines.count(begin) != 1 or lines.count(end) != 1 or lines.index(begin) >= lines.index(end):
        raise SystemExit("Invalid DDNS markers in crontab; refusing to change it")
    lines = lines[:lines.index(begin)] + lines[lines.index(end) + 1:]
args = ["/usr/bin/flock", "-n", str(directory / "update.lock"),
        "/usr/bin/python3", str(directory / "cloudflare-ddns.py"),
        "--config", str(directory / "cloudflare-ddns.json"), "--apply"]
command = shlex.join(args) + " >> " + shlex.quote(str(directory / "update.log")) + " 2>&1"
# crontab treats percent signs specially even inside shell quotes.
command = command.replace("%", "\\%")
lines += [begin, "*/5 * * * * " + command, end]
subprocess.run(["crontab", "-"], input="\n".join(lines) + "\n", text=True, check=True)
PY

rm -- "${source_dir}/cloudflare-ddns.json"
echo "Installed five-minute Cloudflare DDNS job for $(id -un)."
crontab -l
