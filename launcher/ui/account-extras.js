'use strict';
const wardrobe=document.getElementById('wardrobe');let selectedSkin=null,previousWallet=null,extrasUid=null,loadingExtras=null,extrasRequest=0;
async function extrasCall(name,input){const r=await window.astral[name](input);if(!r.ok)throw Error(r.error);return r.value;}
let skinAngle=.6;
function skinPreview(png){const canvas=document.getElementById('skinPreview');canvas.width=320;canvas.height=400;const img=new Image();img.onload=()=>{window.astralSkinImage=img;window.astralSkinModel=document.getElementById('skinModel').value;window.dispatchEvent(new Event('astral-skin-ready'));CosmeticArt.draw(canvas,[],skinAngle);};img.src=png||'cosmetic-assets/default-skin.png';let drag=null;canvas.onpointerdown=e=>{drag=e.clientX;canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(drag!==null){skinAngle+=(e.clientX-drag)*.012;drag=e.clientX;CosmeticArt.draw(canvas,[],skinAngle);}};canvas.onpointerup=()=>drag=null;}

async function refreshExtras(){
 const user=state?.user,badge=document.getElementById('acoinBalance'),button=document.getElementById('acoinBadge');
 if(extrasUid!==user?.uid){extrasUid=user?.uid;badge.textContent='—';selectedSkin=null;skinPreview(null);button.title=user?'Обновить баланс Acoin':'Войдите, чтобы увидеть баланс';button.removeAttribute('aria-busy');}
 if(!user||loadingExtras===user.uid)return;
 const uid=user.uid,request=++extrasRequest;loadingExtras=uid;button.setAttribute('aria-busy','true');
 try{const wallet=await extrasCall('accountWallet');if(state?.user?.uid===uid&&request===extrasRequest){badge.textContent=wallet.balance.toLocaleString('ru-RU');button.title='Acoin · баланс аккаунта · нажмите для обновления';}}
 catch{if(state?.user?.uid===uid&&request===extrasRequest){button.title='Не удалось обновить баланс. Показано последнее значение; нажмите для повтора.';}}
 finally{if(request===extrasRequest){loadingExtras=null;button.removeAttribute('aria-busy');}}
}
document.getElementById('acoinBadge').onclick=refreshExtras;
document.getElementById('wardrobeButton').onclick=async()=>{if(!state?.user){document.getElementById('accountButton').click();return;}wardrobe.showModal();document.getElementById('wardrobeStatus').textContent='Загружаем скин…';try{const skin=await extrasCall('accountSkin');selectedSkin=skin?.png||null;document.getElementById('skinModel').value=skin?.model||'classic';skinPreview(selectedSkin);document.getElementById('wardrobeStatus').textContent=skin?'Скин сохранён в аккаунте.':'У вас стандартный скин «Исследователь Astral». Можно загрузить свой.';}catch(e){document.getElementById('wardrobeStatus').textContent=e.message;}};
document.getElementById('wardrobeClose').onclick=()=>wardrobe.close();
document.getElementById('skinChoose').onclick=async()=>{try{const png=await extrasCall('accountSkinChoose');if(png){selectedSkin=png;skinPreview(png);document.getElementById('wardrobeStatus').textContent='Предпросмотр. Нажмите «Сохранить скин».';}}catch(e){document.getElementById('wardrobeStatus').textContent=e.message;}};
document.getElementById('skinModel').onchange=()=>skinPreview(selectedSkin);
document.getElementById('skinSave').onclick=async event=>{event.target.disabled=true;try{if(!selectedSkin)throw Error('Сначала выберите PNG-скин.');await extrasCall('accountSkinSave',{png:selectedSkin,model:document.getElementById('skinModel').value});document.getElementById('wardrobeStatus').textContent='Скин сохранён в аккаунте Astral.';}catch(e){document.getElementById('wardrobeStatus').textContent=e.message;}finally{event.target.disabled=false;}};
setInterval(refreshExtras,60000);window.addEventListener('focus',refreshExtras);window.astral.onCatalogChanged(refreshExtras);setTimeout(refreshExtras,1000);
window.addEventListener('astral-account-render',()=>{if(extrasUid!==state?.user?.uid)refreshExtras();});
