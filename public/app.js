'use strict';
const socket = io();
const app = document.querySelector('#app');
const toastEl = document.querySelector('#toast');
const ROSTER = ['Żaneta','Łukasz','Maciek','Dominika','Malwina'];
let state=null, mode='team', selected=ROSTER[0], codeField='', busy=false;
const BANK_KEY='pato-familiada-pytania-v2';
let bank=null, editorOpen=false, editorIdx=0, speakerSelected=null;
let recognition=null, listening=false;
const emptyQuestion=()=>({q:'Nowe pytanie PATO FAMILY?',answers:[['Odpowiedź 1',40,[]],['Odpowiedź 2',25,[]],['Odpowiedź 3',18,[]],['Odpowiedź 4',11,[]],['Odpowiedź 5',6,[]]]});
const cleanBank=x=>{
  if(!Array.isArray(x)||!x.length||x.length>150)return null;
  const out=[];
  for(const q of x){
    if(!q || typeof q.q!=='string' || !q.q.trim() || q.q.length>260 || !Array.isArray(q.answers)||q.answers.length!==5)return null;
    const a=q.answers.map(row=>Array.isArray(row)&&typeof row[0]==='string'&&row[0].trim()&&row[0].length<=95&&Number.isInteger(Number(row[1]))&&Number(row[1])>=0&&Number(row[1])<=100?[row[0].trim(),Number(row[1]),Array.isArray(row[2])?row[2].filter(x=>typeof x==='string').slice(0,10):[]]:null);
    if(a.some(z=>!z))return null;
    out.push({q:q.q.trim(),answers:a});
  } return out;
};
function saveBank(){try{localStorage.setItem(BANK_KEY,JSON.stringify(bank));return true}catch{toast('Brak miejsca w pamięci przeglądarki. Wyeksportuj kopię pytań!');return false}}
async function loadBank(){
  try{const res=await fetch('/questions.json');if(!res.ok)throw Error('questions');const fallback=await res.json();
    let saved=null;try{saved=JSON.parse(localStorage.getItem(BANK_KEY)||'null')}catch{}
    bank=cleanBank(saved)||cleanBank(fallback)||[emptyQuestion()];
  }catch{bank=[emptyQuestion()];toast('Nie udało się pobrać pytań startowych. Sprawdź internet.');}
  render();
}
function exportBank(){
  const blob=new Blob([JSON.stringify({format:'PATO FAMILIADA – pytania',version:2,questions:bank},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='pato-familiada-moje-pytania.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
}
async function importBank(file){try{
  if(!file||file.size>1000000)throw Error('Plik jest za duży.');
  const raw=JSON.parse(await file.text());const parsed=cleanBank(Array.isArray(raw)?raw:raw.questions);
  if(!parsed)throw Error('Nieprawidłowy plik: każde pytanie musi mieć 5 odpowiedzi i punkty.');
  bank=parsed;editorIdx=0;saveBank();render();toast(`Zaimportowano ${bank.length} pytań. Kliknij „Zapisz do gry”.`);
}catch(err){toast(err.message||'Nie można wczytać pliku.')}}
function tvUrl(){return `${location.origin}/tv.html?code=${encodeURIComponent(state?.code||'')}`}
function startMic(){
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Speech)return toast('Ta przeglądarka nie obsługuje rozpoznawania mowy. Użyj Safari/Chrome na innym urządzeniu albo oceniaj ręcznie.');
  if(listening){recognition?.stop();return;}
  const rec=new Speech(); recognition=rec;rec.lang='pl-PL';rec.continuous=false;rec.interimResults=false;rec.maxAlternatives=1;
  rec.onstart=()=>{listening=true;toast('🎙️ SŁUCHAM! Powiedz odpowiedź wyraźnie.');const btn=document.querySelector('[data-action="mic"]');if(btn)btn.textContent='🔴 SŁUCHAM… dotknij, aby przerwać';};
  rec.onresult=ev=>{const heard=ev.results?.[0]?.[0]?.transcript?.trim();if(heard){toast('🎧 Usłyszałam: '+heard);call('say',{text:heard},res=>toast(res.outcome==='correct'?'✅ POPRAWNA: '+res.answer:'❌ X! Rozpoznano: '+res.heard));}};
  rec.onerror=ev=>{toast(ev.error==='not-allowed'?'Brak zgody na mikrofon. Zezwól w ustawieniach przeglądarki.':'Mikrofon: '+ev.error+'. Użyj przycisków prowadzącego.');};
  rec.onend=()=>{listening=false;recognition=null;const btn=document.querySelector('[data-action="mic"]');if(btn)btn.textContent='🎙️ POWIEDZ ODPOWIEDŹ';};
  try{rec.start()}catch(e){toast('Nie udało się uruchomić mikrofonu: '+e.message)}
}

const escapeHTML=(str='')=>String(str).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const names=()=>ROSTER.map(n=>`<option ${n===selected?'selected':''} value="${escapeHTML(n)}">${escapeHTML(n)}</option>`).join('');
const byId=id=>state?.players.find(p=>p.id===id);
const teamName=t=>t===0?'🟡 ZŁOTE TACE':'🐀 ŚWIĘTE SZCZURY';
const store=x=>x?localStorage.setItem('pato-familiada-session',JSON.stringify(x)):localStorage.removeItem('pato-familiada-session');
const session=()=>{try{return JSON.parse(localStorage.getItem('pato-familiada-session')||'null')}catch{return null}};
let toastTimeout;
function toast(msg){toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>toastEl.classList.remove('show'),3600)}
function call(event,data={},fn=()=>{}){
  if(!socket.connected)return toast('Brak połączenia. Sprawdź internet i spróbuj ponownie.');
  socket.timeout(8000).emit(event,data,(err,res)=>{
    if(err)return toast('Serwer nie odpowiedział. Spróbuj ponownie.');
    if(!res?.ok)return toast(res?.error||'Wystąpił błąd.');
    fn(res);
  });
}
function shell(content){
  return `<div class="hero"><div class="eyebrow">🐀 PATO FAMILY PRESENTS 🐀</div><h1>PATO<br>FAMILIADA</h1><p class="sub">💎 100 SZCZURÓW ANKIETOWANYCH 💎</p></div>
    <div class="status"><span class="dot ${socket.connected?'':'off'}"></span>${socket.connected?'Online':'Łączenie z serwerem…'}</div>${content}
    <footer class="footer">Wyniki ankiet są humorystycznie wymyślone. Gra to Wasz prywatny imprezowy teleturniej. 🐀</footer>`;
}
function home(){return shell(`<div class="panel">
  <p class="cap">Wybierz gracza</p><div class="field"><label for="who">Kim jesteś?</label><select id="who">${names()}</select></div>
  <p class="cap">Wybierz tryb</p><div class="grid2">
  <button class="choice ${mode==='team'?'selected':''}" data-action="mode" data-mode="team">⚔️ DRUŻYNY<span>Złote Tace kontra Święte Szczury • 2 na 3</span></button>
  <button class="choice ${mode==='solo'?'selected':''}" data-action="mode" data-mode="solo">🏆 KAŻDY NA KAŻDEGO<span>Pięciu graczy, osobne punkty</span></button></div>
  <button class="btn btn-wide" data-action="create">✨ STWÓRZ POKÓJ</button>
  <div class="line"></div><p class="cap">Masz kod od znajomych?</p>
  <div class="field"><label for="code">Kod pokoju</label><input id="code" inputmode="numeric" maxlength="5" autocomplete="off" placeholder="np. 12345" value="${escapeHTML(codeField)}"></div>
  <button class="btn btn-secondary btn-wide" data-action="join">📲 DOŁĄCZ DO GRY</button>
  <div class="line"></div><button class="btn btn-ghost btn-wide" data-action="editor" ${bank?'':'disabled'}>✏️ MOJE PYTANIA – DODAWAJ I EDYTUJ (${bank?.length||'…'})</button>
  </div><div class="helper">Na jednym telefonie tworzysz pokój, a pozostali wchodzą na ten sam link i wpisują kod. Nie trzeba zakładać kont.</div>`)}

function editorScreen(){
  const q=bank[editorIdx]||bank[0];if(!q)return shell('<div class="panel">Trwa ładowanie pytań…</div>');
  return shell(`<div class="panel"><div class="between"><h2>✏️ MOJE PYTANIA</h2><span class="pill gold">${bank.length} kart</span></div>
  <p class="helper">Wpisuj własne pytania, pięć odpowiedzi i punkty. Możesz dodać również inne rozpoznawane słowa. Zmiany zapisują się na tym telefonie.</p>
  <div class="field"><label for="q-picker">Wybierz pytanie do edycji</label><select id="q-picker">${bank.map((x,i)=>`<option value="${i}" ${i===editorIdx?'selected':''}>${i+1}. ${escapeHTML(x.q.slice(0,64))}</option>`).join('')}</select></div>
  <div class="grid2"><button class="btn btn-secondary btn-sm" data-action="newQuestion">➕ Nowe pytanie</button><button class="btn btn-danger btn-sm" data-action="deleteQuestion">🗑️ Usuń kartę</button></div>
  <div class="field separator"><label>Treść pytania</label><textarea data-edit="question" rows="3" maxlength="260">${escapeHTML(q.q)}</textarea></div>
  <p class="cap">5 odpowiedzi – punktacja jest umowna</p>
  ${q.answers.map((a,i)=>`<div class="editor-row"><div class="editor-num">${i+1}</div><div class="editor-fields"><input data-edit="answer" data-i="${i}" maxlength="95" aria-label="Odpowiedź ${i+1}" value="${escapeHTML(a[0])}"><div class="editor-sub"><label>Punkty <input type="number" min="0" max="100" data-edit="points" data-i="${i}" value="${a[1]}"></label><label>Inne hasła (po przecinku)<input data-edit="aliases" data-i="${i}" value="${escapeHTML((a[2]||[]).join(', '))}" placeholder="np. telefon, komórka"></label></div></div></div>`).join('')}
  <div class="grid2"><button class="btn btn-secondary btn-sm" data-action="questionUp">↑ Przesuń kartę</button><button class="btn btn-secondary btn-sm" data-action="questionDown">↓ Przesuń kartę</button></div>
  <button class="btn btn-wide" data-action="editorSave">💾 ZAPISZ DO GRY</button>
  <div class="grid2 separator"><button class="btn btn-ghost btn-sm" data-action="export">📥 Pobierz kopię JSON</button><button class="btn btn-ghost btn-sm" data-action="import">📤 Wgraj pytania JSON</button></div>
  <input type="file" id="bank-import" accept="application/json,.json" hidden>
  <button class="soft-link" data-action="editorClose">← Wróć bez zmiany ekranu gry</button></div>`);
}

function playerList(){return `<div class="list">${state.players.map(p=>`<div class="person"><div><div class="name">${escapeHTML(p.name)} ${p.id===state.hostId?'👑':''} ${p.bot?'🤖':''}</div><div class="meta">${p.bot?'BOT':p.online?'Połączony':'Offline'}</div></div>${state.mode==='team'?`<div class="roster-team"><span class="badge">${p.team===0?'🟡 Złote Tace':'🐀 Święte Szczury'}</span>${state.host?`<button class="team-toggle" data-action="team" data-id="${p.id}" data-team="${p.team===0?1:0}" title="Przenieś do drugiej drużyny">⇄</button>`:''}</div>`:''}</div>`).join('')}</div>`}
function scoreboard(){
  if(state.mode==='team')return `<div class="teams"><div class="team"><b>🟡 ZŁOTE TACE</b><div class="score">${state.teamScores?.[0]??0}</div><div class="muted small">${state.players.filter(p=>p.team===0).map(p=>escapeHTML(p.name)).join(', ')||'–'}</div></div><div class="team"><b>🐀 ŚWIĘTE SZCZURY</b><div class="score">${state.teamScores?.[1]??0}</div><div class="muted small">${state.players.filter(p=>p.team===1).map(p=>escapeHTML(p.name)).join(', ')||'–'}</div></div></div>`;
  return `<div class="scoreline">${state.players.map(p=>`<span class="scorechip">${escapeHTML(p.name)}: <strong>${p.score}</strong></span>`).join('')}</div>`;
}
function lobby(){return shell(`<div class="panel center"><p class="cap">KOD POKOJU</p><div class="code">${state.code}</div><p class="muted small">Wyślij ten kod Pato Rodzinie, a każdy wejdzie ze swojego telefonu.</p><button class="btn btn-secondary btn-sm" data-action="copy">📋 Kopiuj zaproszenie</button></div>
  <div class="panel"><div class="between"><h2>👥 Ekipa (${state.players.length}/5)</h2><span class="pill gold">${state.mode==='team'?'⚔️ Drużyny':'🏆 Solo'}</span></div>${playerList()}
  ${state.host?`<div class="panel-soft separator"><h3>🎬 Prowadzący</h3><p class="muted small">Gra na TV: otwórz specjalny ekran publiczności. Odpowiedzi i ❌ pokazują się tam automatycznie po ocenie.</p><a href="${tvUrl()}" target="_blank" rel="noopener" class="tv-link">📺 OTWÓRZ EKRAN TV</a><button class="btn btn-secondary btn-sm" data-action="copyTV">📋 Kopiuj link do TV</button></div>
  <button class="btn btn-ghost btn-wide" data-action="editor">✏️ EDYTUJ PYTANIA I ODPOWIEDZI</button>
  <div class="panel-soft separator"><h3>⚙️ Ustawienia rozgrywki</h3><div class="grid2"><label class="mini-field">Liczba rund<select id="setting-rounds"><option value="8" ${state.settings.rounds==='8'||state.settings.rounds===8?'selected':''}>8 rund</option><option value="15" ${state.settings.rounds==='15'?'selected':''}>15 rund</option><option value="20" ${state.settings.rounds==='20'?'selected':''}>20 rund</option><option value="all" ${state.settings.rounds==='all'?'selected':''}>Wszystkie</option></select></label><label class="mini-field">Kolejność<select id="setting-order"><option value="sequential" ${state.settings.order==='sequential'?'selected':''}>Po kolei</option><option value="random" ${state.settings.order==='random'?'selected':''}>Losowa</option></select></label></div><p class="muted small">${state.questionCount} pytań w zestawie · ${state.totalRounds} rund w tej grze</p></div>
  <div class="grid2 separator"><button class="btn btn-secondary btn-sm" data-action="bot">🤖 Dodaj bota</button><button class="btn btn-ghost btn-sm" data-action="removeBots">🗑️ Usuń boty</button></div><button class="btn btn-wide" data-action="start">🎬 START GRY!</button><p class="hostnote">Jako Wódz ocenisz odpowiedzi na swoim telefonie. W trybie drużynowym ustaw zespoły przyciskami ⇄.</p>`:`<div class="banner">⏳ Wódz zaraz rozpocznie grę!</div>`}
  </div><div class="center"><button class="soft-link" data-action="leave">Opuść pokój</button></div>`)}
function answerBoard(){return `<div class="board">${state.answers.map((a,i)=>{
  const see=a.text!==undefined;const eligible=state.host && !a.revealed && ['answer','steal'].includes(state.phase);
  return `<button class="answer ${a.revealed?'revealed':'covered'} ${eligible?'eligible':''} answer-button" ${eligible?'':'disabled'} data-action="judge" data-idx="${i}"><span class="num">${i+1}</span><span class="text">${see?escapeHTML(a.text):'▰ ▰ ▰ ▰'}</span><span class="pts">${see?a.points*state.multiplier:'??'}</span></button>`;
}).join('')}</div>`}
function stage(){
  const phase=state.phase;
  const qNum=Math.min(state.round,state.totalRounds);
  const owner=state.currentTeam===null?'Jeszcze nikt':teamName(state.currentTeam);
  const label=phase==='buzz'?'🔴 Kto pierwszy?':phase==='answer'?`🎤 ODPOWIADA: ${escapeHTML(byId(state.activeId)?.name||'gracz')}${state.mode==='team'&&state.currentTeam!==null?' · '+owner:''}`:phase==='steal'?`🚨 KRADZIEŻ: ${teamName(state.stealTeam)}${state.activeId?' · '+escapeHTML(byId(state.activeId)?.name||''):''}`:'🏁 Runda zakończona!';
  return shell(`<div class="panel"><div class="between"><span class="pill gold">RUNDA ${qNum}/${state.totalRounds}</span><span class="pill">PUNKTY x${state.multiplier}</span></div><div class="separator">${scoreboard()}</div><div class="question">${escapeHTML(state.question)}</div>
  ${answerBoard()}
  <div class="strikes">${'❌'.repeat(Math.min(state.strikes,3))}</div>
  <div class="banner">${label}<br><span class="small">${escapeHTML(state.last||'')}</span></div>
  ${phase==='buzz'?`<button class="buzzer" data-action="buzz">🔴<br>ZGŁASZAM<br>SIĘ!</button><p class="center muted small">Wciśnij jako pierwszy. Boty także mogą się zgłosić.</p>`:''}
  ${phase==='answer'||phase==='steal'?`<div class="helper">${state.host?'🎙️ Mikrofon może automatycznie odkryć odpowiedź lub wyświetlić X. Możesz też dotknąć pola albo X ręcznie.':'🎤 Odpowiedz na głos — telefon spróbuje rozpoznać odpowiedź.'}</div>`:''}
  ${(['answer','steal'].includes(phase)&&(state.host||state.activeId===state.you||(phase==='steal'&&state.players.find(p=>p.id===state.you)?.team===state.stealTeam)))?`<button class="btn btn-mic btn-wide" data-action="mic">🎙️ POWIEDZ ODPOWIEDŹ</button><p class="muted small center">Kliknij mikrofon i mów. Rozpoznawanie wymaga zgody przeglądarki i internetu.</p>`:''}
  ${state.host && ['buzz','answer','steal'].includes(phase)?`<div class="panel-soft separator"><label class="mini-field">Kto teraz odpowiada?<select id="speaker-pick">${state.players.filter(p=>phase!=='steal'||p.team===state.stealTeam).map(p=>`<option value="${p.id}" ${p.id===(speakerSelected||state.activeId)?'selected':''}>${escapeHTML(p.name)}</option>`).join('')}</select></label><button class="btn btn-secondary btn-sm btn-wide" data-action="speaker">🎤 USTAW ODPOWIADAJĄCEGO</button></div>`:''}
  ${state.host && state.voiceText?`<p class="muted small center">Ostatnio rozpoznano: „${escapeHTML(state.voiceText)}”</p>`:''}
  ${state.host && ['answer','steal'].includes(phase)?`<button class="btn btn-danger btn-wide" data-action="wrong">❌ ZŁA ODPOWIEDŹ</button>`:''}
  ${state.host && ['answer','steal','buzz','result'].includes(phase)?`<button class="btn btn-ghost btn-wide" data-action="undo">↩️ Cofnij ostatnią ocenę</button>`:''}
  ${state.host && ['answer','steal','buzz'].includes(phase)?`<button class="btn btn-ghost btn-wide" data-action="end">⏩ Zakończ tę rundę</button>`:''}
  </div>${phase==='result'?roundResult():''}`);
}
function roundResult(){const result=state.result;return `<div class="panel center"><div class="confetti">🎉💎🎉</div><h2>Runda ${state.round} zakończona!</h2><p class="muted">Pula odpowiedzi: <span class="stat">${result?.bank??0} pkt</span></p>${state.mode==='team'?`<p class="notice">${result?.awardTeam===null?'Nikt nie zdobył puli':`Punkty dla: ${teamName(result.awardTeam)}`}</p>`:`<p class="muted small">W solo każdy otrzymuje punkty za własne trafienia.</p>`}${state.host?`<button class="btn btn-wide" data-action="next">${state.round>=state.totalRounds?'🏆 POKAŻ WIELKI FINAŁ':'🚀 NASTĘPNA RUNDA'}</button>`:`<div class="banner">⏳ Wódz uruchomi następną rundę</div>`}</div>`;}
function finale(){let scores=[];if(state.mode==='team'){const teamScores=state.teamScores||[0,0];scores=[{name:'🟡 ZŁOTE TACE',score:teamScores[0]},{name:'🐀 ŚWIĘTE SZCZURY',score:teamScores[1]}];}else scores=state.players.map(p=>({name:p.name,score:p.score}));scores.sort((a,b)=>b.score-a.score);
  return shell(`<div class="panel center"><p class="eyebrow">TAJNY SEJF OTWARTY</p><div class="confetti">🏆💎🐀💎🏆</div><h2>WIELKI FINAŁ</h2><p class="cap">ZDOBYWCA DIAMENTU EUFORII</p><div class="big">${escapeHTML(state.winner||'REMIS')}</div><p class="muted">PATO FAMILIADA ukończona!</p></div>
  <div class="panel"><h3>📊 Końcowe wyniki</h3><div class="scorechart">${scores.map((p,i)=>`<div class="bar"><b>${i+1}. ${escapeHTML(p.name)}</b><strong>${p.score} pkt</strong></div>`).join('')}</div>
  ${state.host?`<button class="btn btn-wide" data-action="restart">🔄 JESZCZE JEDNA GRA!</button>`:''}</div>`);
}
function render(){
  const active=document.activeElement?.id;
  const oldCode=active==='code' ? document.querySelector('#code')?.value : null;
  const oldWho=document.querySelector('#who')?.value;
  if(editorOpen)app.innerHTML=editorScreen();
  else if(!state)app.innerHTML=home();
  else if(state.phase==='lobby')app.innerHTML=lobby();
  else if(state.phase==='final')app.innerHTML=finale();
  else app.innerHTML=stage();
  if(oldCode!==null){const el=document.querySelector('#code');if(el)el.value=oldCode;}
  if(oldWho){const el=document.querySelector('#who');if(el)el.value=oldWho;}
}
app.addEventListener('change',e=>{
  if(e.target.id==='who')selected=e.target.value;
  if(e.target.id==='code')codeField=e.target.value.trim();
  if(e.target.id==='q-picker'){editorIdx=Number(e.target.value);render();}
  if(e.target.id==='bank-import')importBank(e.target.files?.[0]);
  if(e.target.id==='speaker-pick')speakerSelected=e.target.value;
  if(['setting-rounds','setting-order'].includes(e.target.id)&&state?.host){call('setSettings',{rounds:document.querySelector('#setting-rounds').value,order:document.querySelector('#setting-order').value});}
});
app.addEventListener('input',e=>{
  if(e.target.id==='code')codeField=e.target.value.replace(/\D/g,'').slice(0,5);
  if(editorOpen&&bank?.[editorIdx]&&e.target.dataset.edit){
    const q=bank[editorIdx],kind=e.target.dataset.edit,i=Number(e.target.dataset.i);
    if(kind==='question')q.q=e.target.value;
    if(kind==='answer')q.answers[i][0]=e.target.value;
    if(kind==='points')q.answers[i][1]=Math.max(0,Math.min(100,Number(e.target.value)||0));
    if(kind==='aliases')q.answers[i][2]=e.target.value.split(',').map(v=>v.trim()).filter(Boolean).slice(0,10);
    saveBank();
  }
});
app.addEventListener('click',e=>{
  const button=e.target.closest('button[data-action]');if(!button||busy)return;
  const action=button.dataset.action;
  if(action==='mode'){mode=button.dataset.mode;render();return;}
  if(action==='editor'){editorOpen=true;editorIdx=0;render();return;}
  if(action==='editorClose'){editorOpen=false;render();return;}
  if(action==='editorSave'){
    const checked=cleanBank(bank);if(!checked)return toast('Popraw puste odpowiedzi, pytania lub punkty.');
    bank=checked;saveBank();
    if(state?.host&&state.phase==='lobby')call('setQuestions',{questions:bank},()=>{editorOpen=false;render();toast('✅ Pytania zapisane w tym pokoju!')});
    else {editorOpen=false;render();toast('✅ Pytania zapisane na tym urządzeniu!');} return;
  }
  if(action==='newQuestion'){if(bank.length>=150)return toast('Maksimum 150 pytań.');bank.unshift(emptyQuestion());editorIdx=0;saveBank();render();return;}
  if(action==='deleteQuestion'){if(bank.length<=1)return toast('Musi zostać co najmniej jedno pytanie.');if(!confirm('Usunąć to pytanie?'))return;bank.splice(editorIdx,1);editorIdx=Math.min(editorIdx,bank.length-1);saveBank();render();return;}
  if(action==='questionUp'||action==='questionDown'){
    const other=editorIdx+(action==='questionUp'?-1:1);if(other<0||other>=bank.length)return toast('To już skrajna pozycja.');
    [bank[editorIdx],bank[other]]=[bank[other],bank[editorIdx]];editorIdx=other;saveBank();render();return;
  }
  if(action==='export'){exportBank();return;}
  if(action==='import'){document.querySelector('#bank-import')?.click();return;}
  if(action==='copyTV'){const msg=tvUrl();if(navigator.clipboard?.writeText)navigator.clipboard.writeText(msg).then(()=>toast('Link do TV skopiowany!')).catch(()=>toast('Link: '+msg));else toast('Link: '+msg);return;}
  if(action==='mic'){startMic();return;}
  if(action==='speaker'){const pid=document.querySelector('#speaker-pick')?.value;if(pid)call('speaker',{pid});return;}

  if(action==='create'){if(!bank)return toast('Poczekaj, aż załadują się pytania.');selected=document.querySelector('#who').value;call('create',{name:selected,mode,questions:bank},res=>{store({code:res.code,token:res.token});toast('Pokój utworzony!');});return;}
  if(action==='join'){selected=document.querySelector('#who').value;codeField=document.querySelector('#code').value.trim();if(!/^\d{5}$/.test(codeField))return toast('Wpisz 5-cyfrowy kod pokoju.');call('join',{code:codeField,name:selected},res=>{store({code:res.code,token:res.token});toast('Dołączono!');});return;}
  if(action==='copy'){const link=location.origin;const msg=`🎮 PATO FAMILIADA! Wejdź: ${link}  •  Kod pokoju: ${state.code}`;if(navigator.clipboard?.writeText){navigator.clipboard.writeText(msg).then(()=>toast('Zaproszenie skopiowane!')).catch(()=>toast('Kod: '+state.code));}else toast('Kod pokoju: '+state.code);return;}
  if(action==='leave'){if(!confirm('Na pewno opuścić pokój?'))return;call('leave',{},()=>{state=null;store(null);render();});return;}
  const events={bot:'addBot',removeBots:'removeBots',start:'start',buzz:'buzz',wrong:'judge',judge:'judge',end:'endRound',next:'advance',restart:'restart',team:'teamOf',undo:'undo'};
  if(!events[action])return;
  const payload=action==='wrong'?{idx:-1}:action==='judge'?{idx:Number(button.dataset.idx)}:action==='team'?{pid:button.dataset.id,team:Number(button.dataset.team)}:{};
  call(events[action],payload);
});
socket.on('state',next=>{state=next;render();});
socket.on('connect',()=>{const old=session();if(old)call('resume',old,()=>{});render();});
socket.on('disconnect',()=>render());
render();

loadBank();
