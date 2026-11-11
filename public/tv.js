'use strict';
const s=io();
const root=document.getElementById('tv-root');
const flashEl=document.getElementById('tv-flash');
let roomCode=new URLSearchParams(location.search).get('code')||'', state=null, lastFlash=0, joined=false, flashTimer=null;
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tn=t=>t===0?'🟡 ZŁOTE TACE':'🐀 ŚWIĘTE SZCZURY';
function display(msg=''){
  if(!state){root.innerHTML=`<main class="tv-wrap tv-intro"><div class="tv-kicker">🎬 STUDIO PATO FAMILY</div><h1>PATO<br>FAMILIADA</h1><p>100 SZCZURÓW ANKIETOWANYCH 🐀</p><form id="tv-join"><label>Wpisz kod pokoju</label><input id="tv-code" maxlength="5" inputmode="numeric" value="${safe(roomCode)}" placeholder="12345" required><button type="submit">📺 POKAŻ PLANSZĘ</button></form><p class="tv-error">${safe(msg)}</p><p class="tv-small">To ekran widzów. Prowadzący steruje grą z telefonu.</p></main>`;return;}
  const phase=state.phase;
  if(phase==='lobby'){
    root.innerHTML=`<main class="tv-wrap tv-intro"><div class="tv-kicker">GOTOWI NA PATO FAMILIADĘ?</div><h1>PATO<br>FAMILIADA</h1><p>100 SZCZURÓW ANKIETOWANYCH</p><div class="tv-code">KOD POKOJU: <strong>${safe(state.code)}</strong></div><p class="tv-names">${state.players.map(p=>safe(p.name)+(p.bot?' 🤖':'')).join(' • ')}</p><div class="tv-small">Czekamy na start prowadzącego…</div></main>`;return;
  }
  const q=state.question||'Wielki Finał';
  const who=state.players.find(p=>p.id===state.activeId)?.name;
  const responder=phase==='answer'&&who?`🎤 ODPOWIADA: <b>${safe(who)}</b>`:phase==='steal'?`🚨 KRADZIEŻ PUNKTÓW! ${who?'ODPOWIADA '+safe(who):''}`:phase==='buzz'?'🔴 KTO PIERWSZY ZGŁOSI SIĘ DO ODPOWIEDZI?':phase==='result'?'🎉 RUNDA ZAKOŃCZONA':'🏆 WIELKI FINAŁ';
  const scores=state.mode==='team'?`<div class="tv-scores"><div>🟡 ZŁOTE TACE <b>${state.teamScores[0]}</b></div><div>🐀 ŚWIĘTE SZCZURY <b>${state.teamScores[1]}</b></div></div>`:`<div class="tv-scores solo">${state.players.map(p=>`<div>${safe(p.name)} <b>${p.score}</b></div>`).join('')}</div>`;
  const slots=(state.answers||[]).map((a,i)=>`<div class="tv-answer ${a.revealed?'on':''} ${state.effect?.type==='correct'&&state.effect.answer===a.text?'just-revealed':''}"><div class="tv-answer-num">${i+1}</div><div class="tv-answer-text">${a.revealed?safe(a.text):'• • • • • • • •'}</div><div class="tv-answer-points">${a.revealed?a.points*state.multiplier:'?'}</div></div>`).join('');
  if(phase==='final'){
    root.innerHTML=`<main class="tv-wrap"><div class="tv-kicker">🐀 PATO FAMILY PRESENTS</div><h1 class="tv-logo">PATO FAMILIADA</h1><div class="tv-victory">🏆 💎 🏆<h2>DIAMENT EUFORII DLA</h2><strong>${safe(state.winner)}</strong></div>${scores}<div class="tv-bottom">KÓŁECZKO ZWYCIĘZCÓW! 🎊</div></main>`;return;
  }
  root.innerHTML=`<main class="tv-wrap"><header class="tv-head"><div><div class="tv-kicker">🐀 100 SZCZURÓW ANKIETOWANYCH</div><h1 class="tv-logo">PATO FAMILIADA</h1></div><div class="tv-round">RUNDA <b>${Math.min(state.round,state.totalRounds)}/${state.totalRounds}</b><span>PUNKTY x${state.multiplier}</span></div></header>${scores}<section class="tv-panel"><h2>${safe(q)}</h2><div class="tv-board">${slots}</div><div class="tv-strikes">${'❌'.repeat(state.strikes)}<span>${'✕ '.repeat(Math.max(0,3-state.strikes))}</span></div></section><div class="tv-responder">${responder}</div><div class="tv-bottom">${phase==='result'?'Prowadzący uruchomi kolejną rundę':safe(state.last||'')} · KOD: ${safe(state.code)}</div></main>`;
}
function join(){
  if(!/^\d{5}$/.test(roomCode))return display('Kod pokoju powinien mieć 5 cyfr.');
  s.timeout(8000).emit('watch',{code:roomCode},(err,res)=>{
    if(err||!res?.ok){joined=false;state=null;display(res?.error||'Brak połączenia z pokojem. Spróbuj ponownie.');return;}
    joined=true;
  });
}
function showFlash(f){
  if(!f){clearTimeout(flashTimer);flashEl.className='tv-flash';flashEl.replaceChildren();return;}
  if(f.id===lastFlash)return;lastFlash=f.id;
  clearTimeout(flashTimer);
  const good=f.type==='correct';
  flashEl.className='tv-flash visible '+(good?'correct':'wrong');
  flashEl.innerHTML=`<div class="tv-flash-card"><div class="tv-flash-icon">${good?'✅':'❌'}</div><div class="tv-flash-label">${good?'DOBRA ODPOWIEDŹ!':'PUDŁO!'}</div><div class="tv-flash-name">${safe(f.by||'')}</div>${good?`<div class="tv-flash-answer">${safe(f.answer||'')}</div>`:''}</div>`;
  flashTimer=setTimeout(()=>{flashEl.className='tv-flash';flashEl.replaceChildren();},1900);
}
root.addEventListener('submit',ev=>{if(ev.target.id!=='tv-join')return;ev.preventDefault();roomCode=document.querySelector('#tv-code').value.trim();history.replaceState(null,'','?code='+encodeURIComponent(roomCode));join();});
s.on('state',data=>{state=data;display();showFlash(data.effect);});
s.on('connect',()=>{if(roomCode)join();else display();});
s.on('disconnect',()=>{joined=false;if(!state)display('Połączenie przerwane. Łączenie…');});
display();
