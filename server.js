'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingTimeout: 25000 });
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));
const questions = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));
app.get('/questions.json', (_req,res)=>res.json(questions));
const ROSTER = ['Żaneta', 'Łukasz', 'Maciek', 'Dominika', 'Malwina'];
const rooms = new Map();
const genId = () => crypto.randomBytes(12).toString('hex');
const shuffle = arr => arr.slice().sort(() => Math.random() - 0.5);
const send = (cb, ok, error, extra={}) => typeof cb === 'function' && cb({ ok, ...(error ? {error} : {}), ...extra });
const roomOf = s => rooms.get(s.data.room);
const playerOf = (r,s) => r?.players.find(p => p.id === s.data.pid && p.socketId === s.id);
const hostOf = (r,s) => playerOf(r,s)?.id === r.hostId;
const teamOf = (r,id) => r.players.find(p => p.id === id)?.team;
const botCount = r => r.players.filter(p => p.bot).length;
const sameTeam = (r, t) => r.players.filter(p => p.team === t);
const norm = v => String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
function cleanQuestions(raw){
  if(!Array.isArray(raw)||raw.length<1||raw.length>150)return null;
  const out=[];
  for(const q of raw){
    if(!q||typeof q.q!=='string'||!q.q.trim()||q.q.length>260||!Array.isArray(q.answers)||q.answers.length!==5)return null;
    const answers=[];
    for(const a of q.answers){
      if(!Array.isArray(a)||typeof a[0]!=='string'||!a[0].trim()||a[0].length>95||!Number.isInteger(Number(a[1]))||Number(a[1])<0||Number(a[1])>100)return null;
      const aliases=Array.isArray(a[2])?a[2].filter(x=>typeof x==='string').slice(0,10).map(x=>x.trim().slice(0,100)).filter(Boolean):[];
      answers.push([a[0].trim(),Number(a[1]),aliases]);
    }
    out.push({q:q.q.trim(),answers});
  }
  return out;
}
function makeRoundList(r){
  const list=r.settings.order==='random'?shuffle(r.allQuestions):r.allQuestions.slice();
  return list.slice(0,r.settings.rounds==='all'?list.length:Math.max(1,Math.min(Number(r.settings.rounds)||8,list.length)));
}
function matchSpeech(q,speech,used){
  const heard=norm(speech); if(heard.length<2)return -1;
  let best=-1, score=0;
  q.answers.forEach((a,i)=>{
    if(used.includes(i))return;
    for(const phrase of [a[0],...(a[2]||[])]){
      const target=norm(phrase);if(!target)continue;
      let val=0;
      if(heard===target)val=1000+target.length;
      else if(target.length>=4 && (' '+heard+' ').includes(' '+target+' '))val=700+target.length;
      else if(heard.length>=4 && (' '+target+' ').includes(' '+heard+' '))val=300+heard.length;
      if(val>score){score=val;best=i;}
    }
  });
  return best;
}
function saveUndo(r){r.undo={phase:r.phase, revealed:r.revealed.slice(),strikes:r.strikes,bank:r.bank,activeId:r.activeId,currentTeam:r.currentTeam,stealTeam:r.stealTeam,teamScores:r.teamScores.slice(),scores:r.players.map(p=>({id:p.id,score:p.score})),result:r.result?JSON.parse(JSON.stringify(r.result)):null,last:r.last,effect:r.effect};}
function flash(r,type,answer){r.effectId=(r.effectId||0)+1;r.effect={id:r.effectId,type,answer:answer||'',by:r.activeId?r.players.find(p=>p.id===r.activeId)?.name||'':r.phase==='steal'?'Drużyna':'PATO FAMILY'};}

function createCode() { let c; do { c=String(10000 + Math.floor(Math.random()*90000)); } while(rooms.has(c)); return c; }
function publicState(r, pid) {
  const host = r.hostId===pid;
  const q = r.questions[r.qidx];
  const canSee = host || r.phase==='result' || r.phase==='final';
  const ans = q ? q.answers.map((a,i) => r.revealed.includes(i) || canSee ? ({ text:a[0], points:a[1], index:i, revealed:r.revealed.includes(i) }) : ({index:i, revealed:false})) : [];
  return {
    code:r.code, phase:r.phase, mode:r.mode, players:r.players.map(p=>({id:p.id,name:p.name,bot:p.bot,online:p.online,team:p.team,score:p.score})),
    hostId:r.hostId, you:pid, host, teamScores:r.teamScores.slice(), totalRounds:r.totalRounds, round:r.qidx+1, question:q?.q || null,
    answers:ans, answered:r.revealed.length, strikes:r.strikes, bank:r.bank, currentTeam:r.currentTeam,
    activeId:r.activeId, stealTeam:r.stealTeam, last:r.last, multiplier:r.multiplier,
    winner:r.winner, result:r.result, boardOwner:r.boardOwner, botCount:botCount(r), effect:r.effect||null, settings:r.settings, questionCount:r.allQuestions.length, voiceText:r.voiceText||'',
  };
}
function broadcast(r) { for (const p of r.players) if(p.socketId) io.to(p.socketId).emit('state', publicState(r,p.id)); io.to('tv:'+r.code).emit('state',publicState(r,null)); }
function validRoom(s,cb,hostRequired=false) {
  const r=roomOf(s);
  if(!r || !playerOf(r,s)){send(cb,false,'Nie jesteś w pokoju.'); return null;}
  if(hostRequired && !hostOf(r,s)){send(cb,false,'Tylko prowadzący może to zrobić.'); return null;}
  return r;
}
function clearBot(r) { if(r.botTimer) clearTimeout(r.botTimer); r.botTimer=null; }
function nextBot(r) {
  clearBot(r);
  if(r.phase==='buzz') {
    const bots=r.players.filter(p=>p.bot);
    if(bots.length) r.botTimer=setTimeout(()=>{
      if(r.phase!=='buzz'||!rooms.has(r.code))return;
      const p=shuffle(bots)[0]; doBuzz(r,p);
    }, 2400+Math.random()*2300);
  } else if(r.phase==='answer' && r.activeId) {
    const p=r.players.find(p=>p.id===r.activeId);
    if(p?.bot) r.botTimer=setTimeout(()=>{ if(r.phase!=='answer' || r.activeId!==p.id)return;
      const rem=r.questions[r.qidx].answers.map((_,i)=>i).filter(i=>!r.revealed.includes(i));
      if(rem.length && Math.random()<0.72) judge(r,rem[Math.floor(Math.random()*rem.length)],true);
      else judge(r,-1,true);
    }, 1500);
  } else if(r.phase==='steal') {
    const opponent=sameTeam(r,r.stealTeam);
    if(opponent.length && opponent.every(p=>p.bot)) r.botTimer=setTimeout(()=>{
      if(r.phase!=='steal')return;
      const rem=r.questions[r.qidx].answers.map((_,i)=>i).filter(i=>!r.revealed.includes(i));
      judge(r,rem.length && Math.random()<0.6?rem[Math.floor(Math.random()*rem.length)]:-1,true);
    },2400);
  }
}
function issueState(r,msg) { if(msg)r.last=msg; broadcast(r); nextBot(r); }
function doBuzz(r,p) {
  if(r.phase!=='buzz' || !p)return;
  r.activeId=p.id;
  r.phase='answer';
  r.last=`🔴 ${p.name} pierwszy przy przycisku!`;
  issueState(r);
}
function roundWinner(r, winTeam=null) {
  if(r.mode==='team') {
    const dest = winTeam ?? r.currentTeam;
    if(dest!==null) r.teamScores[dest]+=r.bank;
  }
  r.result = {bank:r.bank,teamScores:r.teamScores.slice(),soloScores:r.players.map(p=>({name:p.name,score:p.score})),awardTeam:winTeam??r.currentTeam};
  r.phase='result'; r.activeId=null; r.last='📣 Koniec rundy!';
  issueState(r);
  return true;
}
function judge(r,idx,fromBot=false) {
  const q=r.questions[r.qidx];
  if(!q)return false;
  if(r.phase!=='answer'&&r.phase!=='steal')return false;
  const wasSteal=r.phase==='steal';
  if(idx>=0 && (idx>=q.answers.length || r.revealed.includes(idx)))return false;
  saveUndo(r);
  if(idx>=0) {
    r.revealed.push(idx);
    const [word,base]=q.answers[idx];
    flash(r,'correct',word);
    const pts=base*r.multiplier;
    if(r.mode==='solo') {
      const p=r.players.find(p=>p.id===r.activeId);
      if(p)p.score+=pts;
      r.last=`✅ ${word}: +${pts} pkt dla ${p?.name||'gracza'}`;
      r.phase='buzz'; r.activeId=null;
      if(r.revealed.length===q.answers.length) return roundWinner(r);
      issueState(r);return true;
    }
    r.bank+=pts;
    if(wasSteal) {
      r.last=`💰 Udana kradzież! +${r.bank} pkt dla ${r.stealTeam===0?'Złotych Tac':'Świętych Szczurów'}!`;
      return roundWinner(r,r.stealTeam);
    }
    if(r.currentTeam===null)r.currentTeam=teamOf(r,r.activeId);
    r.last=`✅ ${word}! +${pts} pkt do puli.`;
    if(r.revealed.length===q.answers.length) return roundWinner(r);
    r.phase='answer';
    // Bot controlling team continues to play; human controlling team answers verbally.
    issueState(r);return true;
  }
  flash(r,'wrong');
  r.strikes++;
  r.last=`❌ PUDŁO! ${r.strikes}/3`;
  if(wasSteal){ r.last='❌ Kradzież nieudana!';return roundWinner(r,r.currentTeam); }
  if(r.mode==='solo') {
    r.activeId=null;
    if(r.strikes>=3)return roundWinner(r);
    r.phase='buzz';issueState(r);return true;
  }
  if(r.currentTeam===null) { r.activeId=null;r.phase='buzz';r.strikes=Math.min(r.strikes,2);issueState(r);return true; }
  if(r.strikes>=3){r.stealTeam=1-r.currentTeam;r.phase='steal';r.activeId=null;r.last='🚨 Trzy pudła! Przeciwnicy mogą ukraść punkty!';issueState(r);return true;}
  issueState(r);return true;
}
function beginRound(r) {
  r.phase='buzz';r.revealed=[];r.strikes=0;r.bank=0;r.activeId=null;r.currentTeam=null;r.stealTeam=null;r.result=null;r.effect=null;r.voiceText='';r.undo=null;
  r.multiplier=r.qidx>=6?3:r.qidx>=4?2:1;
  r.last=`🎤 Runda ${r.qidx+1} z ${r.totalRounds}. Punkty x${r.multiplier}.`;
  issueState(r);
}
function afterRound(r) {
  if(r.phase!=='result')return;
  r.qidx++;
  if(r.qidx>=r.totalRounds) {
    r.phase='final';
    if(r.mode==='team')r.winner=r.teamScores[0]===r.teamScores[1]?'REMIS':r.teamScores[0]>r.teamScores[1]?'ZŁOTE TACE':'ŚWIĘTE SZCZURY';
    else {const max=Math.max(...r.players.map(p=>p.score));r.winner=r.players.filter(p=>p.score===max).map(p=>p.name).join(' i ');}
    r.last='🏆 FINAŁ! Diament Euforii czeka na zwycięzców!';issueState(r);
  } else beginRound(r);
}
function assignTeams(r) {
  if(r.mode!=='team')return;
  // 2 on Złote Tace / 3 on Święte Szczury when full roster.
  r.players.forEach((p,i)=>{p.team=r.players.length===5?(i<2?0:1):(i%2);});
}
function addPlayer(r,s,name,bot=false) {
  const p={id:genId(),name,bot,team:null,score:0,online:true,socketId:bot?null:s.id,token:genId()};
  r.players.push(p);if(!bot){s.data.room=r.code;s.data.pid=p.id;s.join(r.code);}
  assignTeams(r);return p;
}
function removePlayer(r,p) {r.players=r.players.filter(x=>x.id!==p.id);if(r.hostId===p.id)r.hostId=r.players.find(x=>!x.bot)?.id||null;assignTeams(r);}
function replyState(r,s,cb,p) {send(cb,true,null,{code:r.code,token:p.token});broadcast(r);}
io.on('connection', s=>{
  s.on('create', (payload={},cb)=>{
    const name=String(payload.name||'').trim();
    if(!ROSTER.includes(name))return send(cb,false,'Wybierz swoje imię z listy.');
    const code=createCode();
    const own=payload.questions===undefined?questions:cleanQuestions(payload.questions);
    if(!own)return send(cb,false,'Błędny zestaw pytań (5 odpowiedzi na pytanie).');
    const r={code,mode:payload.mode==='solo'?'solo':'team',players:[],hostId:null,phase:'lobby',qidx:0,totalRounds:8,allQuestions:own,settings:{rounds:8,order:'sequential'},questions:[],teamScores:[0,0],revealed:[],strikes:0,bank:0,activeId:null,currentTeam:null,stealTeam:null,last:'Pokój gotowy. Zaproś ekipę!',multiplier:1,winner:null,result:null,botTimer:null,effect:null,effectId:0,voiceText:'',undo:null};
    r.questions=makeRoundList(r);r.totalRounds=r.questions.length;
    rooms.set(code,r);const p=addPlayer(r,s,name);r.hostId=p.id;replyState(r,s,cb,p);
  });
  s.on('join',(payload={},cb)=>{
    const code=String(payload.code||'').trim();const name=String(payload.name||'').trim();const r=rooms.get(code);
    if(!r)return send(cb,false,'Nie znaleziono pokoju.');
    if(r.phase!=='lobby')return send(cb,false,'Ta gra już się rozpoczęła.');
    if(!ROSTER.includes(name))return send(cb,false,'Wybierz imię z listy.');
    if(r.players.some(p=>p.name===name))return send(cb,false,'To imię jest już zajęte.');
    if(r.players.length>=5)return send(cb,false,'Pokój jest pełny.');
    const p=addPlayer(r,s,name);replyState(r,s,cb,p);
  });
  s.on('resume',(payload={},cb)=>{
    const r=rooms.get(String(payload.code||''));
    const p=r?.players.find(p=>!p.bot&&p.token===payload.token);
    if(!r||!p)return send(cb,false,'Nie można wrócić do pokoju.');
    p.socketId=s.id;p.online=true;s.data.room=r.code;s.data.pid=p.id;s.join(r.code);
    replyState(r,s,cb,p);
    nextBot(r);
  });
  s.on('watch',(payload={},cb)=>{
    const code=String(payload.code||'').trim();const r=rooms.get(code);
    if(!r)return send(cb,false,'Nie ma takiego pokoju.');
    if(s.data.watch)s.leave('tv:'+s.data.watch);
    s.data.watch=code;s.join('tv:'+code);send(cb,true);
    io.to(s.id).emit('state',publicState(r,null));
  });
  s.on('setQuestions',(payload={},cb)=>{
    const r=validRoom(s,cb,true);if(!r)return;
    if(r.phase!=='lobby')return send(cb,false,'Edytować pytania można przed startem.');
    const qs=cleanQuestions(payload.questions);
    if(!qs)return send(cb,false,'Pytanie musi mieć 5 odpowiedzi, każda z punktami 0–100.');
    r.allQuestions=qs;r.questions=makeRoundList(r);r.totalRounds=r.questions.length;
    r.last=`📝 Prowadzący zapisał ${qs.length} pytań.`;send(cb,true);broadcast(r);
  });
  s.on('setSettings',(payload={},cb)=>{
    const r=validRoom(s,cb,true);if(!r)return;
    if(r.phase!=='lobby')return send(cb,false,'Ustawienia zmieniamy przed startem.');
    if(!['8','15','20','all'].includes(String(payload.rounds))||!['random','sequential'].includes(payload.order))return send(cb,false,'Błędne ustawienia.');
    r.settings={rounds:String(payload.rounds),order:payload.order};r.questions=makeRoundList(r);r.totalRounds=r.questions.length;
    send(cb,true);broadcast(r);
  });
  s.on('speaker',(payload={},cb)=>{
    const r=validRoom(s,cb,true);if(!r)return;
    if(!['buzz','answer','steal'].includes(r.phase))return send(cb,false,'Teraz nie można zmienić odpowiadającego.');
    const p=r.players.find(p=>p.id===payload.pid);
    if(!p)return send(cb,false,'Nie ma takiego gracza.');
    if(r.mode==='team'&&r.phase==='answer'&&r.currentTeam!==null&&p.team!==r.currentTeam)return send(cb,false,'To gracz drugiej drużyny.');
    if(r.phase==='steal'&&p.team!==r.stealTeam)return send(cb,false,'Odpowiada drużyna kradnąca punkty.');
    r.activeId=p.id;if(r.phase==='buzz')r.phase='answer';
    r.last=`🎤 Odpowiada ${p.name}!`;issueState(r);send(cb,true);
  });
  s.on('say',(payload={},cb)=>{
    const r=validRoom(s,cb);if(!r)return;
    const p=playerOf(r,s);if(!['answer','steal'].includes(r.phase))return send(cb,false,'Teraz nie ma odpowiedzi.');
    const allowed=hostOf(r,s)||(r.phase==='answer'&&r.activeId===p.id)||(r.phase==='steal'&&r.mode==='team'&&p.team===r.stealTeam);
    if(!allowed)return send(cb,false,'Tylko odpowiadający lub prowadzący może użyć mikrofonu.');
    const heard=String(payload.text||'').trim().slice(0,150);
    if(norm(heard).length<2)return send(cb,false,'Nie rozpoznano odpowiedzi, spróbuj ponownie.');
    r.voiceText=heard;const idx=matchSpeech(r.questions[r.qidx],heard,r.revealed);
    if(!judge(r,idx))return send(cb,false,'Nie można ocenić tej odpowiedzi.');
    send(cb,true,null,{outcome:idx>=0?'correct':'wrong',heard,answer:idx>=0?r.questions[r.qidx].answers[idx][0]:null});
  });
  s.on('undo',(_payload,cb)=>{
    const r=validRoom(s,cb,true);if(!r)return;
    if(!r.undo||!['answer','buzz','steal','result'].includes(r.phase))return send(cb,false,'Brak oceny do cofnięcia.');
    const u=r.undo;r.undo=null;
    for(const k of ['phase','revealed','strikes','bank','activeId','currentTeam','stealTeam','teamScores','result'])r[k]=u[k];
    for(const row of u.scores){const p=r.players.find(x=>x.id===row.id);if(p)p.score=row.score;}
    r.last='↩️ Prowadzący cofnął ostatnią ocenę.';r.effect=null;r.voiceText='';
    issueState(r);send(cb,true);
  });
  s.on('addBot', (_payload,cb)=>{
    const r=validRoom(s,cb,true);if(!r)return;
    if(r.phase!=='lobby')return send(cb,false,'Boty dodajemy przed rozpoczęciem gry.');
    const free=ROSTER.filter(n=>!r.players.some(p=>p.name===n));
    if(!free.length)return send(cb,false,'Wszyscy gracze już są w pokoju.');
    const p=addPlayer(r,s,free[0],true);r.last=`🤖 ${p.name} dołącza jako bot.`;send(cb,true);broadcast(r);
  });
  s.on('removeBots', (_payload,cb)=>{
    const r=validRoom(s,cb,true);if(!r)return;
    if(r.phase!=='lobby')return send(cb,false,'Boty usuwamy przed rozpoczęciem gry.');
    r.players=r.players.filter(p=>!p.bot);assignTeams(r);r.last='Boty usunięte.';send(cb,true);broadcast(r);
  });
  s.on('teamOf',(payload={},cb)=>{
    const r=validRoom(s,cb,true);if(!r)return;
    if(r.phase!=='lobby'||r.mode!=='team')return send(cb,false,'Drużyny zmieniamy w lobby.');
    const p=r.players.find(p=>p.id===payload.pid);
    if(!p || ![0,1].includes(payload.team))return send(cb,false,'Nieprawidłowy gracz lub drużyna.');
    p.team=payload.team;send(cb,true);broadcast(r);
  });
  s.on('start', (_payload,cb)=>{
    const r=validRoom(s,cb,true);if(!r)return;
    if(r.phase!=='lobby')return send(cb,false,'Gra już trwa.');
    if(r.players.length<2)return send(cb,false,'Potrzebujesz przynajmniej 2 graczy (mogą być boty).');
    if(r.mode==='team'&&(!sameTeam(r,0).length||!sameTeam(r,1).length))return send(cb,false,'Każda drużyna musi mieć gracza.');
    r.qidx=0;r.questions=makeRoundList(r);r.totalRounds=r.questions.length;r.teamScores=[0,0];r.players.forEach(p=>p.score=0);beginRound(r);send(cb,true);
  });
  s.on('buzz', (_payload,cb)=>{
    const r=validRoom(s,cb);if(!r)return;
    if(r.phase!=='buzz')return send(cb,false,'Przycisk chwilowo nieaktywny.');
    doBuzz(r,playerOf(r,s));send(cb,true);
  });
  s.on('judge',(payload={},cb)=>{
    const r=validRoom(s,cb,true);if(!r)return;
    if(r.phase!=='answer'&&r.phase!=='steal')return send(cb,false,'Teraz nie oceniamy odpowiedzi.');
    const idx=Number(payload.idx);if(!Number.isInteger(idx)||idx< -1||idx>4)return send(cb,false,'Nieprawidłowa odpowiedź.');
    if(!judge(r,idx))return send(cb,false,'Ta odpowiedź była już odkryta.');
    send(cb,true);
  });
  s.on('endRound', (_payload,cb)=>{
    const r=validRoom(s,cb,true);if(!r)return;
    if(!['answer','buzz','steal'].includes(r.phase))return send(cb,false,'Nie można zakończyć tej rundy.');
    r.undo=null;roundWinner(r,r.phase==='steal'?r.currentTeam:null);send(cb,true);
  });
  s.on('advance', (_payload,cb)=>{
    const r=validRoom(s,cb,true);if(!r)return;
    if(r.phase!=='result')return send(cb,false,'Najpierw zakończ rundę.');
    afterRound(r);send(cb,true);
  });
  s.on('restart', (_payload,cb)=>{
    const r=validRoom(s,cb,true);if(!r)return;
    clearBot(r);r.phase='lobby';r.questions=makeRoundList(r);r.totalRounds=r.questions.length;r.qidx=0;r.effect=null;r.undo=null;r.teamScores=[0,0];r.winner=null;r.result=null;r.players.forEach(p=>p.score=0);r.last='Nowa gra gotowa!';send(cb,true);broadcast(r);
  });
  s.on('leave', (_payload,cb)=>{
    const r=validRoom(s,cb);if(!r)return;
    const p=playerOf(r,s);removePlayer(r,p);s.leave(r.code);s.data.room=null;s.data.pid=null;send(cb,true);
    if(!r.players.some(x=>!x.bot)){clearBot(r);rooms.delete(r.code);}else broadcast(r);
  });
  s.on('disconnect',()=>{
    const r=roomOf(s);const p=playerOf(r,s);
    if(!r||!p)return;p.online=false;p.socketId=null;
    if(p.id===r.hostId){const newHost=r.players.find(x=>!x.bot&&x.online);if(newHost)r.hostId=newHost.id;}
    broadcast(r);
    if(!r.players.some(x=>x.online && !x.bot)) {clearBot(r);r.botTimer=setTimeout(()=>{
      if(!r.players.some(x=>x.online&&!x.bot)){rooms.delete(r.code);}
    },1000*60*60);}
  });
});
server.listen(Number(process.env.PORT)||3000, '0.0.0.0',()=>console.log('PATO FAMILIADA uruchomiona na porcie',process.env.PORT||3000));
