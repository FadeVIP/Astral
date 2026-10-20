'use strict';
(()=>{
 const cards=document.getElementById('packCards');
 const shelf=document.createElement('div');shelf.className='pack-shelf';cards.before(shelf);
 const toolbar=document.createElement('div');toolbar.className='shelf-toolbar';
 const count=document.createElement('span');toolbar.append(count);
 function button(label,title,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.title=title;b.setAttribute('aria-label',title);b.onclick=fn;return b;}
 let pauseUntil=performance.now()+5000,hover=false,drag=null,direction=1,paused=false,last=0,selected=null,travel=0;
 const pause=()=>{pauseUntil=performance.now()+12000;};
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const prev=button('←','Предыдущие сборки',()=>move(-1));
 const next=button('→','Следующие сборки',()=>move(1));
 const toggle=button('Пауза','Остановить автопрокрутку',()=>{paused=!paused;updateControls();});
 const all=button('Все сборки','Открыть все сборки',()=>{populate();dialog.showModal();search.focus();});
 toolbar.append(prev,next,toggle,all);shelf.append(toolbar,cards);
 function move(sign){pause();cards.scrollBy({left:sign*cards.clientWidth*.75,behavior:reduced.matches?'instant':'smooth'});}
 function updateControls(){const overflow=cards.scrollWidth>cards.clientWidth+2;prev.disabled=!overflow;next.disabled=!overflow;toggle.hidden=!overflow||reduced.matches;toggle.textContent=paused?'Автопрокрутка':'Пауза';toggle.setAttribute('aria-label',paused?'Включить автопрокрутку':'Остановить автопрокрутку');toggle.setAttribute('aria-pressed',String(paused));count.textContent=`Сборок: ${cards.children.length}`;}
 cards.addEventListener('mouseenter',()=>hover=true);cards.addEventListener('mouseleave',()=>{hover=false;pause();});
 cards.addEventListener('focusin',pause);cards.addEventListener('keydown',pause);
 cards.addEventListener('wheel',e=>{if(cards.scrollWidth<=cards.clientWidth)return;pause();if(Math.abs(e.deltaY)>Math.abs(e.deltaX)){e.preventDefault();cards.scrollLeft+=e.deltaY;}},{passive:false});
 cards.addEventListener('pointerdown',e=>{pause();if(e.button!==0||e.pointerType==='touch')return;drag={id:e.pointerId,x:e.clientX,scroll:cards.scrollLeft,moved:false};});
 cards.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x;if(Math.abs(dx)>6){drag.moved=true;cards.setPointerCapture(e.pointerId);cards.scrollLeft=drag.scroll-dx;}});
 let suppressClick=false;
 const endDrag=()=>{if(drag){suppressClick=drag.moved;drag=null;setTimeout(()=>suppressClick=false,0);}};
 window.addEventListener('pointerup',endDrag);cards.addEventListener('pointercancel',endDrag);
 cards.addEventListener('click',e=>{pause();if(suppressClick){e.preventDefault();e.stopImmediatePropagation();}},true);
 const dialog=document.createElement('dialog');dialog.className='pack-picker';dialog.setAttribute('aria-label','Все сборки');
 const heading=document.createElement('div');heading.className='pack-picker-heading';const title=document.createElement('h2');title.textContent='Все сборки';heading.append(title,button('Закрыть','Закрыть все сборки',()=>dialog.close()));
 const search=document.createElement('input');search.type='search';search.placeholder='Найти сборку';search.setAttribute('aria-label','Поиск сборок');
 const grid=document.createElement('div');grid.className='pack-picker-grid';dialog.append(heading,search,grid);document.body.append(dialog);
 function populate(){grid.replaceChildren();const query=search.value.trim().toLocaleLowerCase('ru');for(const original of cards.children){const name=original.querySelector('strong')?.textContent||'';if(!name.toLocaleLowerCase('ru').includes(query))continue;const b=button('','Выбрать '+name,()=>{original.click();dialog.close();pause();});b.disabled=original.disabled;b.setAttribute('aria-pressed',original.getAttribute('aria-pressed'));const art=document.createElement('img');const cover=original.dataset.cover;art.src=cover==='forest'?'../assets/cinematic-forest.png':'../assets/cinematic-citadel.png';const custom=original.querySelector('.pack-card-art')?.style.backgroundImage.match(/^url\(["']?(.*?)["']?\)$/);if(custom)art.src=custom[1];art.alt='';const label=document.createElement('strong');label.textContent=name;const meta=document.createElement('small');meta.textContent=original.querySelector('small')?.textContent||'';b.append(art,label,meta);grid.append(b);}if(!grid.children.length)grid.textContent='Сборки не найдены';}
 search.addEventListener('input',populate);
 new MutationObserver(()=>{updateControls();const active=cards.querySelector('.active');const name=active?.querySelector('strong')?.textContent;if(active&&name!==selected){selected=name;pause();cards.scrollLeft=active.offsetLeft-cards.offsetLeft;}if(dialog.open)populate();}).observe(cards,{childList:true});
 new ResizeObserver(updateControls).observe(cards);reduced.addEventListener('change',updateControls);
 function frame(now){const dt=Math.min(now-last,50);last=now;if(!paused&&!hover&&!drag&&!reduced.matches&&!document.hidden&&!document.querySelector('dialog[open]')&&cards.offsetWidth&&performance.now()>pauseUntil&&!cards.contains(document.activeElement)&&!cards.querySelector('button:disabled')){const max=cards.scrollWidth-cards.clientWidth;if(max>2){travel+=dt*.022;const step=Math.floor(travel);travel-=step;cards.scrollLeft+=direction*step;if(cards.scrollLeft>=max-1){direction=-1;pauseUntil=now+2000;}else if(cards.scrollLeft<=1){direction=1;pauseUntil=now+2000;}}}requestAnimationFrame(frame);}
 updateControls();requestAnimationFrame(frame);
})();

