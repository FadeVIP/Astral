"""Run on the VPS after copying relay.py and public Firebase config to /tmp/astral-relay-stage."""
from pathlib import Path
import json
import shutil
import subprocess
import datetime

def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout

stage = Path('/tmp/astral-relay-stage')
target = Path('/opt/astral-relay')
configdir = Path('/etc/astral-relay')
backup = Path('/root/astral-backups')/('relay-'+datetime.datetime.utcnow().strftime('%Y%m%dT%H%M%SZ'))
backup.mkdir(parents=True, mode=0o700)
for p in (target, configdir, Path('/etc/systemd/system/astral-relay.service')):
    if p.exists():
        if p.is_dir(): shutil.copytree(p, backup/p.name)
        else: shutil.copy2(p, backup/p.name)
(backup/'iptables.rules').write_text(run('iptables-save'))
try: run('id', 'astral-relay')
except subprocess.CalledProcessError: run('useradd', '--system', '--no-create-home', '--shell', '/usr/sbin/nologin', 'astral-relay')
target.mkdir(exist_ok=True)
configdir.mkdir(exist_ok=True, mode=0o750)
shutil.copy2(stage/'relay.py', target/'relay.py')
cert, key = configdir/'relay.crt', configdir/'relay.key'
if not key.exists():
    run('openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(key),'-out',str(cert),'-days','1825','-subj','/CN=Astral Friends Relay')
config = json.loads((stage/'firebase.json').read_text())
config.update(port=24443, cert=str(cert), key=str(key))
(configdir/'config.json').write_text(json.dumps(config))
run('chown','-R','root:astral-relay',str(configdir))
for p in configdir.iterdir(): p.chmod(0o640)
unit = Path('/etc/systemd/system/astral-relay.service')
unit.write_text('''[Unit]
Description=Astral friends TLS relay
After=network-online.target
Wants=network-online.target
[Service]
User=astral-relay
Group=astral-relay
ExecStart=/usr/bin/python3 /opt/astral-relay/relay.py
Restart=on-failure
RestartSec=5
MemoryMax=128M
TasksMax=32
LimitNOFILE=512
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
UMask=0077
[Install]
WantedBy=multi-user.target
''')
# Add only our TCP rule; never flush existing firewall/VPN rules.
rule = ['INPUT','-p','tcp','--dport','24443','-m','comment','--comment','astral-relay','-j','ACCEPT']
if subprocess.run(['iptables','-C']+rule,capture_output=True).returncode:
    run('iptables','-I',*rule)
firewall = Path('/usr/local/sbin/astral-relay-firewall')
firewall.write_text('#!/bin/sh\niptables -C INPUT -p tcp --dport 24443 -m comment --comment astral-relay -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 24443 -m comment --comment astral-relay -j ACCEPT\n')
firewall.chmod(0o755)
Path('/etc/systemd/system/astral-relay-firewall.service').write_text('''[Unit]
Description=Astral relay firewall rule
Before=astral-relay.service
After=network-pre.target
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/astral-relay-firewall
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
''')
run('systemctl','daemon-reload')
run('systemctl','enable','--now','astral-relay-firewall.service')
run('systemctl','enable','astral-relay.service')
run('systemctl','restart','astral-relay.service')
print(run('systemctl','is-active','astral-relay.service').strip())
print(run('openssl','x509','-in',str(cert),'-noout','-fingerprint','-sha256').strip())
print('BACKUP',backup)
