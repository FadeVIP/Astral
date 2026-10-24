"""Astral authenticated TLS transport. No Firebase admin credentials required."""
import asyncio, json, ssl, struct, urllib.request, os, re, time, collections
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT / 'gateway.json').read_text()) if (ROOT / 'gateway.json').exists() else {}

def request_json(url, data=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token: headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request(url, data=json.dumps(data).encode() if data else None, headers=headers)
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response)

def verify(token):
    if not isinstance(token, str) or not 100 < len(token) < 8192: raise ValueError('token')
    account = request_json('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + CONFIG['apiKey'], {'idToken': token})['users'][0]
    if account.get('disabled') or not account.get('email') or not any(p.get('providerId') == 'password' for p in account.get('providerUserInfo', [])): raise ValueError('account')
    uid = account['localId']
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', uid): raise ValueError('uid')
    fields = request_json('https://829504-vds-korolevikh2001vlad.gmhost.pp.ua/api/v1/documents/members/' + uid, token=token)['fields']
    if fields['status']['stringValue'] != 'active' or fields['email']['stringValue'] != account['email']: raise ValueError('member')
    nickname = fields['nickname']['stringValue']
    if not re.fullmatch(r'[A-Za-z0-9_]{3,16}', nickname): raise ValueError('nickname')
    privileged = CONFIG.get('privilegedMembers', {})
    if nickname.lower() in privileged and privileged[nickname.lower()] != uid: raise ValueError('administrator identity')
    return uid, nickname

def varint(data, offset=0):
    value = 0
    for i in range(5):
        b = data[offset+i]; value |= (b & 127) << (i*7)
        if not b & 128: return value, offset+i+1
    raise ValueError('varint')

async def packet(reader, maximum=4096):
    prefix = bytearray()
    for _ in range(5):
        b = (await reader.readexactly(1))[0]; prefix.append(b)
        if not b & 128: break
    else: raise ValueError('length')
    length, _ = varint(prefix)
    if not 1 <= length <= maximum: raise ValueError('packet size')
    payload = await reader.readexactly(length)
    return bytes(prefix) + payload, payload

def handshake(payload):
    pid, pos = varint(payload)
    protocol, pos = varint(payload, pos)
    size, pos = varint(payload, pos)
    pos += size + 2
    state, end = varint(payload, pos)
    if pid != 0 or protocol != 763 or size > 1024 or end != len(payload) or state not in (1, 2): raise ValueError('handshake')
    return state

def login_name(payload):
    pid, pos = varint(payload)
    size, pos = varint(payload, pos)
    if pid != 0 or not 3 <= size <= 16 or pos + size > len(payload): raise ValueError('login')
    name = payload[pos:pos+size].decode('ascii')
    if not re.fullmatch(r'[A-Za-z0-9_]{3,16}', name): raise ValueError('name')
    return name

active = set()
status_cache = None
status_task = None
def encode_varint(value):
    out = bytearray()
    while True:
        part = value & 127; value >>= 7
        out.append(part | (128 if value else 0))
        if not value: return bytes(out)

async def read_status():
    backend = None
    try:
        async with asyncio.timeout(5):
            reader, backend = await asyncio.open_connection('127.0.0.1', CONFIG.get('backendPort', 25566))
            hello = b'\x00' + encode_varint(763) + b'\x09localhost' + struct.pack('!H', CONFIG.get('backendPort',25566)) + b'\x01'
            backend.write(encode_varint(len(hello)) + hello + b'\x01\x00'); await backend.drain()
            _, response = await packet(reader, 1048576)
            pid, offset = varint(response); size, offset = varint(response, offset)
            if pid != 0 or size > 1048576 or offset + size != len(response): raise ValueError('status')
            players = json.loads(response[offset:offset+size])['players']
            count, maximum = players['online'], players['max']
            if type(count) is not int or type(maximum) is not int or not 0 <= count <= 100000 or not 1 <= maximum <= 100000: raise ValueError('counts')
            return {'state':'online','online':count,'max':maximum,'checkedAt':int(time.time()*1000)}
    except Exception:
        return {'state':'offline','checkedAt':int(time.time()*1000)}
    finally:
        if backend: backend.close()

async def public_status():
    global status_cache, status_task
    if status_cache and time.time()*1000 - status_cache['checkedAt'] < 10000: return status_cache
    if status_task is None or status_task.done(): status_task = asyncio.create_task(read_status())
    status_cache = await asyncio.shield(status_task)
    return status_cache

attempts = collections.deque()
connections = 0
async def handle(reader, writer):
    global connections
    connections += 1
    backend = None; uid = None; tasks = []
    try:
        if connections > 80: return
        # Global bound also covers traffic forwarded through the same VPS IP.
        now = time.monotonic()
        while attempts and attempts[0] < now - 60: attempts.popleft()
        if len(attempts) >= 600: return
        attempts.append(now)
        async with asyncio.timeout(40):
            size = struct.unpack('!I', await reader.readexactly(4))[0]
            if not 2 <= size <= 9000: raise ValueError('header')
            header = json.loads(await reader.readexactly(size))
            if header == {'kind':'status'}:
                body = json.dumps(await public_status()).encode()
                writer.write(struct.pack('!I',len(body)) + body); await writer.drain()
                return
            token = header.get('token')
            account_uid, nickname = await asyncio.to_thread(verify, token)
            writer.write(b'\x01'); await writer.drain()
            raw_handshake, payload = await packet(reader)
            state = handshake(payload)
            raw_login = b''
            if state == 2:
                raw_login, payload = await packet(reader)
                if login_name(payload) != nickname or account_uid in active: raise ValueError('login denied')
                uid = account_uid; active.add(uid)
            source, backend = await asyncio.open_connection('127.0.0.1', CONFIG.get('backendPort', 25566))
            backend.write(raw_handshake + raw_login); await backend.drain()
        async def pipe(r, w):
            while data := await r.read(65536):
                w.write(data); await w.drain()
        tasks = [asyncio.create_task(pipe(reader, backend)), asyncio.create_task(pipe(source, writer))]
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done: task.result()
    except Exception:
        # Never log tokens, credential-bearing request objects, or player addresses.
        pass
    finally:
        for task in tasks: task.cancel()
        if tasks: await asyncio.gather(*tasks, return_exceptions=True)
        if uid: active.discard(uid)
        if backend: backend.close()
        writer.close()
        connections -= 1

async def main():
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(ROOT / 'server.crt', ROOT / 'server.key')
    server = await asyncio.start_server(handle, '0.0.0.0', CONFIG.get('port', 25565), ssl=context, ssl_handshake_timeout=10, limit=16384)
    print('Astral gateway ready', flush=True)
    async with server: await server.serve_forever()

if __name__ == '__main__': asyncio.run(main())
