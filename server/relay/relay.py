"""Bounded TLS rendezvous for approved Astral friends. No arbitrary forwarding."""
import asyncio
import collections
import hmac
import json
import os
import re
import ssl
import time
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor


def fetch(url, token, body=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer '+token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Log only status and operation category, without URL/token/user data.
        category = 'identity' if 'accounts:lookup' in url else ('member' if '/members/' in url else 'approval')
        print('Auth denied: '+category+' '+str(error.code), flush=True)
        raise


def verify(header, config):
    role, request_id, token, grant = (header.get(k) for k in ('role', 'request', 'auth', 'grant'))
    if role not in ('host', 'guest') or not isinstance(request_id, str) or not re.fullmatch(r'[a-z0-9_]{3,16}~[a-z0-9_]{3,16}', request_id):
        raise ValueError('request')
    if not isinstance(token, str) or not 100 < len(token) < 8192 or not isinstance(grant, str) or not re.fullmatch('[a-f0-9]{64}', grant):
        raise ValueError('credentials')
    account = fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+config['apiKey'], None, {'idToken': token})['users'][0]
    uid = account['localId']
    if account.get('disabled') or not re.fullmatch('[A-Za-z0-9_-]{1,128}', uid):
        raise ValueError('account')
    base = config.get('dataApiUrl') or 'https://829504-vds-korolevikh2001vlad.gmhost.pp.ua/api/v1/documents/'
    parsed = urllib.parse.urlsplit(base)
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('data API configuration')
    base = base.rstrip('/')+'/'
    member = fetch(base+'members/'+uid, token)['fields']
    if member['status']['stringValue'] != 'active':
        raise ValueError('member')
    row = fetch(base+'directPlayRequests/'+request_id, token)['fields']
    if row['status']['stringValue'] != 'approved' or member['nickname']['stringValue'].lower() != row[role]['stringValue']:
        raise ValueError('permission')
    expires = int(row['expires']['integerValue'])/1000
    if expires <= time.time() or not hmac.compare_digest(row['token']['stringValue'], grant):
        raise ValueError('expired')
    # The document API permits only the two participants to read an approval. The host
    # still enforces its in-memory admission grant before any game bytes pass.
    return request_id+':'+grant, role, expires


class Relay:
    def __init__(self, verifier):
        self.verifier = verifier
        self.waiting = {}
        self.connections = 0
        self.per_ip = collections.Counter()
        self.attempts = collections.deque()
        self.verifying = 0

    async def handle(self, reader, writer):
        ip = writer.get_extra_info('peername')[0]
        self.connections += 1
        self.per_ip[ip] += 1
        entry = None
        key = None
        try:
            now = time.monotonic()
            while self.attempts and self.attempts[0] < now-60:
                self.attempts.popleft()
            if self.connections > 96 or self.per_ip[ip] > 32 or len(self.attempts) >= 120 or self.verifying >= 8:
                return
            self.attempts.append(now)
            header = json.loads(await asyncio.wait_for(reader.readline(), 10))
            self.verifying += 1
            try:
                key, role, expires = await asyncio.get_running_loop().run_in_executor(None, self.verifier, header)
            finally:
                self.verifying -= 1
            if role == 'host':
                queue = self.waiting.setdefault(key, [])
                if len(queue) >= 2:
                    return
                entry = {'reader': reader, 'writer': writer, 'done': asyncio.get_running_loop().create_future(), 'expires': expires}
                queue.append(entry)
                writer.write(b'READY\n')
                await writer.drain()
                # Waiting slots are short-lived; paired streams live until close.
                await asyncio.wait_for(asyncio.shield(entry['done']), min(60, max(1, expires-time.time())))
                if entry.get('paired'):
                    await entry['closed']
            else:
                queue = self.waiting.get(key, [])
                deadline = time.monotonic()+8
                while not queue and time.monotonic() < deadline and time.time() < expires:
                    await asyncio.sleep(0.1)
                    queue = self.waiting.get(key, [])
                while queue and (queue[0]['writer'].is_closing() or queue[0]['reader'].at_eof() or queue[0]['expires'] <= time.time()):
                    stale = queue.pop(0)
                    if not stale['done'].done():
                        stale['done'].set_result(None)
                if not queue:
                    return
                host = queue.pop(0)
                host['paired'] = True
                host['closed'] = asyncio.get_running_loop().create_future()
                host['done'].set_result(None)
                tasks = []
                try:
                    writer.write(b'PAIRED\n')
                    host['writer'].write(b'PAIRED\n')
                    await writer.drain()
                    await host['writer'].drain()
                    async def pipe(source, dest):
                        while True:
                            data = await asyncio.wait_for(source.read(32768), 120)
                            if not data:
                                return
                            dest.write(data)
                            await dest.drain()
                    tasks = [asyncio.create_task(pipe(reader, host['writer'])), asyncio.create_task(pipe(host['reader'], writer))]
                    await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                finally:
                    for task in tasks:
                        task.cancel()
                    if tasks:
                        await asyncio.gather(*tasks, return_exceptions=True)
                    if not host['closed'].done():
                        host['closed'].set_result(None)
        except Exception as error:
            # Only an exception class, never headers, tokens or player addresses.
            print('Connection ended: '+type(error).__name__, flush=True)
        finally:
            if entry and key in self.waiting and entry in self.waiting[key]:
                self.waiting[key].remove(entry)
            if key in self.waiting and not self.waiting[key]:
                self.waiting.pop(key, None)
            writer.close()
            try:
                await asyncio.wait_for(writer.wait_closed(), 3)
            except Exception:
                pass
            self.connections -= 1
            self.per_ip[ip] -= 1
            if not self.per_ip[ip]:
                del self.per_ip[ip]


async def main():
    config = json.load(open(os.environ.get('ASTRAL_RELAY_CONFIG', '/etc/astral-relay/config.json')))
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(config['cert'], config['key'])
    asyncio.get_running_loop().set_default_executor(ThreadPoolExecutor(max_workers=8))
    relay = Relay(lambda header: verify(header, config))
    server = await asyncio.start_server(relay.handle, '0.0.0.0', config.get('port', 24443), ssl=context, limit=10000, ssl_handshake_timeout=10)
    print('Astral relay ready', flush=True)
    async with server:
        await server.serve_forever()


if __name__ == '__main__':
    asyncio.run(main())
