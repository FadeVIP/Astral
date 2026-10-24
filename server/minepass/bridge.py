"""MinePass sidecar: authoritative world -> Firebase -> existing Discord bot identity.
No third-party Python dependencies. Secrets stay in a mode-0700 directory on Deck.
"""
from pathlib import Path
import base64,hashlib,json,os,re,subprocess,time,urllib.request,urllib.error,uuid,sys

HOME_DIR=Path(__file__).resolve().parent
def atomic(file,value):
    file.parent.mkdir(parents=True,exist_ok=True)
    tmp=file.with_suffix(file.suffix+'.tmp')
    tmp.write_text(json.dumps(value,ensure_ascii=False),encoding='utf8')
    os.chmod(tmp,0o600);tmp.replace(file)
def b64(data):return base64.urlsafe_b64encode(data).decode().rstrip('=')
def request(url,method='GET',body=None,headers=None):
    headers={'User-Agent':'AstralMinePass/0.2','Content-Type':'application/json',**(headers or {})}
    data=None if body is None else json.dumps(body).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(url,data=data,headers=headers,method=method),timeout=15) as response:
            raw=response.read();return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        # Do not include response bodies/tokens in the service log.
        raise RuntimeError('Remote HTTP '+str(error.code)) from None

class Bridge:
    def __init__(self,discord_enabled=True):
        self.cfg=json.loads((HOME_DIR/'bridge.json').read_text())
        self.world=Path(self.cfg['world']).resolve()
        if str(self.world)!='/home/deck/astral_server/world/astral-minepass':raise ValueError('Unexpected world')
        self.secret=json.loads((HOME_DIR/'service-account.json').read_text())
        if self.secret['project_id']!='astral-524a1':raise ValueError('Unexpected Firebase project')
        self.stateFile=HOME_DIR/'state.json'
        self.state=json.loads(self.stateFile.read_text()) if self.stateFile.exists() else {'seen':{},'links':{},'cursor':None}
        self.access='';self.tokenUntil=0;self.mapping={}
        if discord_enabled:
            self.channel=self.discord('/channels/'+self.cfg['channel'])
            if str(self.channel.get('guild_id'))!=self.cfg['guild']:raise ValueError('Unexpected Discord guild')
            self.me=self.discord('/users/@me')['id']
    def discord(self,path,method='GET',body=None):return request('https://discord.com/api/v10'+path,method,body,{'Authorization':'Bot '+self.cfg['discordToken']})
    def token(self):
        if time.time()<self.tokenUntil:return self.access
        now=int(time.time())
        payload={'iss':self.secret['client_email'],'aud':'astral-sql-realtime','iat':now,'exp':now+60}
        unsigned=b64(json.dumps({'alg':'RS256','typ':'JWT'}).encode())+'.'+b64(json.dumps(payload).encode())
        keyfile=HOME_DIR/'oauth-key.pem'
        if not keyfile.exists():
            fd=os.open(keyfile,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            with os.fdopen(fd,'w') as f:f.write(self.secret['private_key'])
        signed=subprocess.run(['openssl','dgst','-sha256','-sign',str(keyfile)],input=unsigned.encode(),capture_output=True,check=True).stdout
        self.access=unsigned+'.'+b64(signed);self.tokenUntil=now+30;return self.access
    def firebase(self,path,value):return request('https://829504-vds-korolevikh2001vlad.gmhost.pp.ua/api/v1/realtime'+'/'+path+'.json','PUT',value,{'Authorization':'Astral-Service '+self.token()})
    def uid(self,nickname):
        cache=self.mapping.get(nickname)
        if cache and time.time()-cache[1]<60:return cache[0]
        url='https://829504-vds-korolevikh2001vlad.gmhost.pp.ua/api/v1/documents/'
        headers={'Authorization':'Astral-Service '+self.token()}
        record=request(url+'nicknames/'+nickname.lower(),headers=headers)
        identity=record['fields']['uid']['stringValue']
        member=request(url+'members/'+identity,headers=headers)['fields']
        if member['nickname']['stringValue']!=nickname or member['status']['stringValue']!='active':raise ValueError('Inactive or mismatched member')
        self.mapping[nickname]=(identity,time.time());return identity
    def save(self):atomic(self.stateFile,self.state)
    def send(self,text,nonce,embed=None):
        # Check recent messages on retry, including after a process restart.
        marker='MinePass '+nonce
        for msg in self.discord('/channels/'+self.cfg['channel']+'/messages?limit=30'):
            if msg.get('author',{}).get('id')==self.me and any(e.get('footer',{}).get('text')==marker for e in msg.get('embeds',[])):return msg
        display=embed or {'description':text,'color':0x9BF26D}
        display['footer']={'text':marker}
        return self.discord('/channels/'+self.cfg['channel']+'/messages','POST',{'embeds':[display],'allowed_mentions':{'parse':[]},'nonce':nonce,'enforce_nonce':True})
    def sync(self):
        file=self.world/'season.json'
        if not file.exists():return
        season=json.loads(file.read_text());quests={q['id']:q for q in season['quests']}
        for path in sorted((self.world/'progress').glob('*.json')):
            try:
                p=json.loads(path.read_text());name=p['nickname'];player=p['uuid']
                if not re.fullmatch(r'[A-Za-z0-9_]{3,16}',name) or str(uuid.UUID(player))!=path.stem:continue
                expected=str(uuid.UUID(bytes=hashlib.md5(('OfflinePlayer:'+name).encode()).digest(),version=3))
                if p.get('mode')!='DEDICATED' or player!=expected or p['season']!=season['season']:continue
                identity=self.uid(name)
                view={k:p.get(k) for k in ['nickname','uuid','season','points','coins','keys','crates','completed','progress','updatedAt']}
                view['level']=min(season['maxLevel'],p['points']//season['pointsPerLevel']);view['server']='astral'
                self.firebase('minepass/profiles/'+identity,view)
                seenKey=player+':'+p['season'];seen=set(self.state['seen'].get(seenKey,[]))
                for qid in [x for x in p['completed'] if x not in seen][:3]:
                    q=quests.get(qid)
                    if not q:continue
                    nonce=hashlib.sha256((seenKey+':'+qid).encode()).hexdigest()[:24]
                    event={'ts':int(time.time()*1000),'player':name,'title':q['title'],'points':q['points'],'chest':q['key'],'server':'astral','discordManagedExternally':True}
                    self.firebase('minepass/announcements/'+nonce,event)
                    rarity={'common':'обычный','rare':'редкий','epic':'эпический'}[q['key']]
                    self.send('',nonce,{'title':'✦ '+q['title'],'description':name+' выполнил задание.\nНаграда: '+str(q['points'])+' очков и '+rarity+' сундук.','color':{'common':0x72D66A,'rare':0x52B8F2,'epic':0xB96EED}[q['key']]})
                    seen.add(qid);self.state['seen'][seenKey]=sorted(seen);self.save()
            except Exception as error:print('Profile sync deferred: '+type(error).__name__+' '+str(error)[:100],flush=True)
    def administrator(self,author):
        guild=self.discord('/guilds/'+self.cfg['guild'])
        if author==guild['owner_id']:return True
        member=self.discord('/guilds/'+self.cfg['guild']+'/members/'+author)
        roles=set(member.get('roles',[]))|{self.cfg['guild']}
        permissions=0
        for role in self.discord('/guilds/'+self.cfg['guild']+'/roles'):
            if role['id'] in roles:permissions|=int(role['permissions'])
        return bool(permissions&8 or permissions&32)
    def console(self,command):
        result=subprocess.run(['python3','/home/deck/astral_gateway/console.py',command],capture_output=True,text=True,timeout=20,check=True)
        return result.stdout
    def addQuest(self,content):
        fields=[x.strip() for x in content.split('|')]
        if len(fields)!=7:raise ValueError('Формат: !pass add id | Название | kill/craft/fish/dimension | mod:target | количество | очки | common/rare/epic')
        qid,title,kind,target,goal,points,rarity=fields
        if not re.fullmatch(r'[a-z0-9_-]{1,64}',qid) or not 1<=len(title)<=100 or kind not in ['kill','craft','fish','dimension'] or not re.fullmatch(r'[a-z0-9_.-]+:[a-z0-9_./-]+',target) or rarity not in ['common','rare','epic']:raise ValueError('Проверьте id, тип, цель и редкость')
        if not goal.isdigit() or not points.isdigit() or not 1<=int(goal)<=100000 or not 1<=int(points)<=10000:raise ValueError('Некорректное количество или очки')
        file=self.world/'season.json';before=json.loads(file.read_text());updated=json.loads(json.dumps(before))
        if any(q['id']==qid for q in before['quests']):raise ValueError('Такой id уже есть; выполненные задания не перезаписываются')
        if len(before['quests'])>=500:raise ValueError('Достигнут лимит 500 заданий')
        updated['quests'].append({'id':qid,'title':title,'kind':kind,'target':target,'goal':int(goal),'points':int(points),'key':rarity})
        atomic(HOME_DIR/'quest-backups'/('season-'+str(time.time_ns())+'.json'),before);atomic(file,updated)
        try:
            reply=self.console('pass admin reload')
            if 'MINEPASS_RELOADED' not in reply:raise ValueError('Сервер не принял цель задания; проверьте id предмета или моба')
        except Exception:
            atomic(file,before)
            try:self.console('pass admin reload')
            except Exception:pass
            raise
        return 'Задание «'+title+'» добавлено. Оно уже доступно в /pass quests.'
    def handle(self,message):
        content=message.get('content','');author=message['author']['id']
        nonce='cmd'+message['id']
        try:
            if content.startswith('!pass add '):
                if not self.administrator(author):raise ValueError('Добавлять задания может владелец или администратор сервера Discord')
                answer=self.addQuest(content[len('!pass add '):])
            elif content.startswith('!pass link '):
                code=content[len('!pass link '):].strip().lower()
                if not re.fullmatch(r'[a-f0-9]{16}',code):raise ValueError('Получите код командой /pass link в Minecraft')
                file=self.world/'links'/(hashlib.sha256(code.encode()).hexdigest()+'.json')
                if not file.exists():raise ValueError('Код неверен или уже использован')
                proof=json.loads(file.read_text())
                if proof['expiresAt']<time.time()*1000:raise ValueError('Код истёк. Получите новый через /pass link')
                identity=self.uid(proof['nickname'])
                file.rename(file.with_suffix('.used'))
                self.state['links']={k:v for k,v in self.state['links'].items() if v.get('uid')!=identity}
                self.state['links'][author]={'uuid':proof['uuid'],'nickname':proof['nickname'],'uid':identity};self.save()
                answer='Discord связан с аккаунтом '+proof['nickname']+'. Напишите !pass для просмотра прогресса.'
            elif content.strip()=='!pass':
                linked=self.state['links'].get(author)
                if not linked:raise ValueError('Сначала в Minecraft: /pass link. Затем здесь: !pass link КОД')
                p=json.loads((self.world/'progress'/(linked['uuid']+'.json')).read_text())
                season=json.loads((self.world/'season.json').read_text())
                answer=linked['nickname']+' • уровень '+str(min(season['maxLevel'],p['points']//season['pointsPerLevel']))+' • '+str(p['points'])+' очков\n'
                for kind,label in [('common','Обычные'),('rare','Редкие'),('epic','Эпические')]:answer+=label+': '+str(p.get('crates',{}).get(kind,0))+' сундуков, '+str(p['keys'].get(kind,0))+' ключей\n'
            else:answer='MinePass: !pass — ваш прогресс; !pass link КОД — привязка после /pass link в игре.\nАдминистратору: !pass add id | Название | kill/craft/fish/dimension | mod:target | количество | очки | common/rare/epic'
        except ValueError as error:answer=str(error)
        except Exception:answer='Операция пока недоступна. Проверьте, что сервер Minecraft запущен, и повторите команду.'
        self.send(answer,nonce)
    def poll(self):
        base='/channels/'+self.cfg['channel']+'/messages'
        if self.state['cursor'] is None:
            latest=self.discord(base+'?limit=1');self.state['cursor']=latest[0]['id'] if latest else '0';self.save();return
        messages=self.discord(base+'?limit=100&after='+self.state['cursor'])
        for message in sorted(messages,key=lambda m:int(m['id'])):
            if not message['author'].get('bot') and (message.get('content','')=='!pass' or message.get('content','').startswith('!pass ')):self.handle(message)
            self.state['cursor']=message['id'];self.save()
    def run(self):
        print('BRIDGE_READY channel='+self.cfg['channel'],flush=True)
        while True:
            try:self.sync();self.poll()
            except Exception as error:print('Bridge retry: '+type(error).__name__+' '+str(error)[:100],flush=True)
            time.sleep(15)

if __name__=='__main__':
    bridge=Bridge()
    if '--check' in sys.argv:
        bridge.token();print('BRIDGE_CHECK_OK: Discord channel and Firebase authentication')
    elif '--announce-ready' in sys.argv:
        bridge.send('MinePass подключён к этому каналу. В игре: /pass — сундуки и задания, /pass craft — ключи, /pass link — код привязки.\nЗдесь: !pass help — команды и формат добавления заданий администратором.','setup-minepass-020')
        print('Setup message delivered')
    else:bridge.run()
