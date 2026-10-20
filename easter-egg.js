const hero=document.querySelector('#top');
if(hero){
 const star=document.createElement('button');star.className='astral-secret-star';star.type='button';star.setAttribute('aria-label','Исследовать далёкую звезду');star.textContent='✦';hero.append(star);
 const dialog=document.createElement('dialog');dialog.className='astral-secret-dialog';dialog.innerHTML='<button type="button" class="secret-close" aria-label="Закрыть">×</button><span class="secret-symbol">✦</span><h2>Звезда ответила.</h2><p>Ты нашёл тайный сигнал Astral. Первый, кто подтвердит находку, станет победителем. Награду выдаст организатор вручную.</p><form><label>Игровой ник<input name="nickname" minlength="3" maxlength="16" pattern="[A-Za-z0-9_]{3,16}" autocomplete="off" required placeholder="Твой ник в Minecraft"></label><label>Discord или Telegram — необязательно<input name="contact" maxlength="80" autocomplete="off" placeholder="Как с тобой связаться"></label><p>Ник и контакт увидит организатор. Вход в аккаунт не нужен.</p><button class="secret-submit" type="submit">Подтвердить находку</button></form><p class="secret-status" role="status" aria-live="polite"></p>';document.body.append(dialog);

 const status=dialog.querySelector('.secret-status'),form=dialog.querySelector('form');let api,loading,busy=false,won=false;
 const message=t=>status.textContent=t;
 function locked(value){busy=value;for(const el of dialog.querySelectorAll('input,button:not(.secret-close)'))el.disabled=value;}
 async function init(){
  if(api)return api;if(loading)return loading;
  loading=(async()=>{
   const [a,b,c]=await Promise.all([import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-lite.js')]);
   const app=a.getApps().find(x=>x.name==='astral-secret-guest')||a.initializeApp(window.__FROSTBORNE_FIREBASE_CONFIG__,'astral-secret-guest');const auth=b.getAuth(app),db=c.getFirestore(app);api={...b,...c,auth,db};return api;
  })();try{return await loading;}finally{loading=null;}
 }
 async function show(){const a=await init(),state=await a.getDoc(a.doc(a.db,'siteSecrets','first-star'));if(state.exists()){won=true;form.hidden=true;message('Этот сигнал уже найден. Победитель записан — спасибо за исследование!');}else{message('Укажи ник и подтверди находку. Победителя определяет время приёма заявки сервером.');}}
 star.onclick=async()=>{dialog.showModal();message('Расшифровываем сигнал…');locked(true);try{await show();}catch{message('Сигнал пока недоступен. Проверь интернет и открой звезду ещё раз.');}finally{locked(false);}};
 dialog.querySelector('.secret-close').onclick=()=>dialog.close();
 form.onsubmit=async e=>{
  e.preventDefault();if(busy||won)return;
  const nickname=form.elements.nickname.value.trim(),contact=form.elements.contact.value.trim();if(!/^[A-Za-z0-9_]{3,16}$/.test(nickname)){message('Ник: 3–16 латинских букв, цифр или подчёркиваний.');return;}if(/[\x00-\x1f]/.test(contact)){message('Контакт должен быть одной строкой.');return;}
  locked(true);message('Подтверждаем находку…');
  try{
   const a=await init();await a.auth.authStateReady();const user=a.auth.currentUser||(await a.signInAnonymously(a.auth)).user;
   const batch=a.writeBatch(a.db);batch.set(a.doc(a.db,'siteSecretWinners','first-star'),{uid:user.uid,nickname,contact,foundAt:a.serverTimestamp()});batch.set(a.doc(a.db,'siteSecrets','first-star'),{found:true,foundAt:a.serverTimestamp()});
   try{await batch.commit();}catch(e){const own=await a.getDoc(a.doc(a.db,'siteSecretWinners','first-star')).catch(()=>null);if(!own?.exists()||own.data().uid!==user.uid){const state=await a.getDoc(a.doc(a.db,'siteSecrets','first-star'));if(state.exists()){await show();return;}throw e;}}
   won=true;form.hidden=true;message('Ты первый! Ник '+nickname+' записан. Организатор увидит заявку в админке и выдаст награду вручную.');
  }catch{message('Не удалось подтвердить находку. Проверь интернет и повтори — успешная заявка не потеряется.');}finally{locked(false);}
 };
}
