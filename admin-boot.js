// Show a recoverable error even when Firebase's module CDN cannot be reached.
const status=document.getElementById('status'),form=document.getElementById('login-form');
const timer=setTimeout(()=>{if(!form.onsubmit)status.textContent='Скрипты входа ещё не загрузились. Проверьте интернет/VPN и обновите страницу.';},15000);
form.querySelector('button').disabled=true;
import('/minepass-admin.js?v=20261020-secret2').then(()=>{clearTimeout(timer);form.querySelector('button').disabled=false;}).catch(()=>{clearTimeout(timer);status.textContent='Не удалось загрузить модуль входа Firebase. Проверьте интернет/VPN и обновите страницу. Пароль не отправлялся.';});
