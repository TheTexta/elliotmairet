# Backend DNS and changing public IPs

This is a production-operations runbook, not local application setup.
Confirm Tailscale/target reachability and obtain approval for the exact DNS or
scheduler change before proceeding. Do not change routing/firewalls/public
exposure to bypass connectivity problems.

The repository's backend notes identify self-hosted Supabase on
`gmkserver.tail077753.ts.net`, with `api.dextery.dev` and `studio.dextery.dev`
public endpoints. Verify current infrastructure before applying these procedures.
Cloudflare is authoritative for `dextery.dev`; both existing A records must
follow a changed public IPv4. The former Vercel DDNS updater targets an inactive
DNS provider and cannot repair these Cloudflare records.

## Updater and credentials

[`scripts/infra/cloudflare-ddns.py`](../scripts/infra/cloudflare-ddns.py) requires
Python 3 and curl. It checks both records before writes, changes only their IP
content, preserves TTL/proxy settings and verifies each update. It defaults to
dry run; `--apply` changes records. Failed/partial updates exit nonzero and can
be rerun after inspecting results.

Use a separate Cloudflare token with **Zone → DNS → Edit**, scoped to
`dextery.dev`. Store JSON outside the repository:

```json
{"zone_id": "626cad70f16d48eb7a7115d323ad42b5", "token": "YOUR_DNS_TOKEN"}
```

Never add the DNS token to Vercel or expose it through `NEXT_PUBLIC_*`.

## System installer

Stage `cloudflare-ddns.json`, the updater and
[`install-cloudflare-ddns.sh`](../scripts/infra/install-cloudflare-ddns.sh)
together in a private server directory (directory mode `700`, config `600`).
After approval, run the installer with sudo. If the staged config is absent,
it prompts securely and creates it there.

The installer first dry-runs, backs up the existing systemd service/timer,
replaces `dextery-ddns.service` and retains its five-minute timer. Installed
config is root-owned `/etc/dextery-cloudflare-ddns.json`, mode `600`; staged
config is removed after success. The old Vercel script/credentials remain for
rollback. Installer success is not a general authorization to retire them.

Inspect `journalctl -u dextery-ddns.service` and authoritative DNS with
`dig @dahlia.ns.cloudflare.com api.dextery.dev A`.

## User installer alternative

When sudo is unavailable, stage
[`install-cloudflare-ddns-user.sh`](../scripts/infra/install-cloudflare-ddns-user.sh)
with the updater/private config and, after approval, run as `dextery`.
It installs under `~/.local/share/dextery-ddns`, protects files, backs up/preserves
existing user cron entries and adds a five-minute job with an overlap lock.
Inspect `crontab -l` and `~/.local/share/dextery-ddns/update.log`. It runs after
reboot without interactive login.

The old root-owned Vercel timer stays enabled until a sudo-capable operator
disables it; it does not update authoritative Cloudflare records. Use only one
Cloudflare scheduler at a time.

## Offline safeguards

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/infra -v
```

These tests are not a check of live DNS, scheduler installation or token scope.
