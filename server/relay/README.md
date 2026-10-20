# Astral friends relay

VPS 91.240.175.14, TCP 24443, systemd `astral-relay.service`.
Python standard library only. Dedicated unprivileged user, 128 MB service limit.
TLS 1.2+; the launcher pins the SHA-256 certificate fingerprint in `relay-config.json` before sending credentials. Certificate rotation requires a launcher update.

The launcher first tries approved direct endpoints (2 seconds each). Only when these fail does it join the relay. Host outbound waiting slots exist after approval, even when direct access works. Game bytes travel through the relay only for relay joins.

Each TLS connection is authenticated by Firebase account lookup, active member and private approved request. Roles cannot be swapped. Approval has a five-minute expiry for new connections. The host additionally checks its in-memory HMAC grant; closing access destroys the sockets. No user-specified forwarding address is accepted by the server. TLS encrypts both legs, but the trusted VPS terminates TLS and is not an end-to-end encryption endpoint.

Capacity bounds: 96 sockets globally, 32 per source IP, 8 concurrent authentication jobs, 120 new handshakes/minute, two waiting slots per approval, 60-second waiting-slot lifetime, 120-second idle stream timeout. These are protective limits, not a measured player capacity guarantee. Initial live test used 1 MiB random data; no load capacity claim.

Deployment: copy relay.py, deploy.py and the public launcher Firebase config as firebase.json to `/tmp/astral-relay-stage`, then run deploy.py with administrator permissions. It backs up prior config/firewall, creates the certificate only if missing, installs a dedicated service and a single persistent TCP firewall rule. It does not change SSH or existing VPN rules. Private material in `.private/` is local-only and excluded from publication.

Status: `systemctl status astral-relay`; logs: `journalctl -u astral-relay`. Logs omit player identifiers, credentials and game payloads.

Stop: `systemctl disable --now astral-relay astral-relay-firewall`; remove only the `astral-relay`-labelled INPUT rule if retiring this service. Do not flush firewall rules. Keep backup and certificate securely outside source control.
