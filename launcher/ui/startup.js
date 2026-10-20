'use strict';
document.body.dataset.theme=new URLSearchParams(location.search).get('theme')||'star';
window.startup.listen(value=>{
 document.getElementById('message').textContent=value.message||'Подготавливаем лаунчер…';
 const bar=document.getElementById('bar');
 const measured=Number.isFinite(value.percent);
 if(measured)bar.value=Math.min(100,Math.max(0,value.percent));else bar.removeAttribute('value');
 document.getElementById('percent').textContent=measured?Math.round(bar.value)+'%':'';
 document.getElementById('stage').textContent=value.version?'Версия '+value.version:'ASTRAL LAUNCHER';
});
