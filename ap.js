// --- DOM Elements ---
const nE=document.getElementById('n'), mvE=document.getElementById('mv'), bE=document.getElementById('best'), tE=document.getElementById('tm'), bestNE=document.getElementById('best-n');
const thE=document.getElementById('theme'), sndE=document.getElementById('snd'), spdE=document.getElementById('spd');
const st=document.getElementById('stage'), prgE=document.getElementById('prog'), htE=document.getElementById('hintText');
const fin=document.getElementById('finish'), near=document.getElementById('nearOptimal');
const autoBtn=document.getElementById('auto'), hintBtn=document.getElementById('hint'), undoBtn=document.getElementById('undo');

// --- State Variables ---
let n=4,moves=0,tmr=null,t0=null,run=false,seq=[],ix=0,teach=null,actx=null,emMap={},diskCols=["#e74c3c","#f39c12","#2ecc71","#3498db","#9b59b6","#1abc9c","#e67e22","#8e44ad"];
let nearWarned=false;
let CURRENT_MODE = 'play';
let challengeTimer=null,challengeDeadline=0,challengeLimit=0,challengeActive=false;
let moveHistory = [];
let heldDisk = null;

// --- Local Storage for Best Scores ---
function getBestKey(diskCount) { return `hanoi_best_v2_${diskCount}_disks`; }
function loadBest(diskCount) { try { return JSON.parse(localStorage.getItem(getBestKey(diskCount))) || {}; } catch(e) { return {}; } }
function saveBest(diskCount, score) { localStorage.setItem(getBestKey(diskCount), JSON.stringify(score)); }
function updateBestScoreDisplay() {
    n = Math.max(1, Math.min(8, parseInt(nE.value) || 4));
    bestNE.textContent = n;
    const best = loadBest(n);
    if (best && best.moves) {
        bE.textContent = `${best.moves}m / ${best.time}s`;
    } else {
        bE.textContent = '—';
    }
}

// --- Audio Handling ---
function eEnsure(){if(actx) return actx;try{actx=new (window.AudioContext||window.webkitAudioContext)()}catch(e){actx=null}return actx}
function pTone(f,d=0.12,t='sine',g=0.08){if(!sndE || !sndE.checked) return; const c=eEnsure(); if(!c) return; const o=c.createOscillator(),gg=c.createGain();o.type=t;o.frequency.value=f;gg.gain.value=g;o.connect(gg);gg.connect(c.destination);o.start();o.stop(c.currentTime+d)}
const bgmEl=document.getElementById('bgm'); function playBGM(){ if(!bgmEl || !sndE.checked) return; try{ bgmEl.volume=0.35; bgmEl.loop=true; bgmEl.play().catch(()=>{}); if(actx && actx.state==='suspended') actx.resume().catch(()=>{}); }catch(e){} }
function pauseBGM(){ if(bgmEl) bgmEl.pause(); }

// --- Game Logic ---
const emojiLists={classic:["✨","🔮","🌙","💠","⭐","🌀","🔺","🔵","⬜"],burger:["🍔","🍟","🌭","🍕","🧀","🥓","🥪","🍗","🥨","🧂","🌮","🍖"],rescue:["🐱","😺","😸","😹","😻","🐾","🦊","🐶","🐯","🐼","🐵","🦁"],neon:["✨","⚡","🌈","💥","🔮","🌟","🎇","🌠","💫","⚡️","🔆","🌠"],dark:["🌙","🕯️","🌌","☕","💤","⭐","🌑","🌒","🪐","🌫️","🖤","🦉"]};
function bld(){
    n=Math.max(1,Math.min(8,parseInt(nE.value)||4)); nE.value=n;
    ['a','b','c'].forEach(id=>{const p=document.getElementById(id);p.querySelectorAll('.disk').forEach(d=>d.remove());p.classList.remove('from','to','hv')});
    aplTh();
    const A=document.getElementById('a'); emMap={};
    for(let i=n;i>=1;i--){
        const d=document.createElement('div');d.className='disk';d.id='disk-'+i+'-'+Math.floor(Math.random()*1e6);d.dataset.size=i;d.dataset.width=40+i*18;d.style.width=(40+i*18)+'px';d.style.background=diskCols[(i-1)%diskCols.length];const em=pickEmoji();d.dataset.emoji=em;const lbl=document.createElement('div');lbl.className='disk--label';const eSpan=document.createElement('span'); eSpan.textContent=em;const nSpan=document.createElement('span'); nSpan.className='num'; nSpan.textContent=i;lbl.appendChild(eSpan); lbl.appendChild(nSpan);d.appendChild(lbl);d.style.zIndex=100+i;d.style.pointerEvents='auto';d.draggable=true;
        d.addEventListener('dragstart',(ev)=>{try{ev.dataTransfer.setData('text/plain',d.id);ev.dataTransfer.effectAllowed='move';}catch(e){} if(!t0){t0=Date.now();tmr=setInterval(()=>{tE.textContent=fmt(Math.floor((Date.now()-t0)/1000))},250)} tonePickup();});
        A.appendChild(d); emMap[i]=em;
    }
    moves=0; mvE.textContent=moves; tE.textContent='00:00'; clearInterval(tmr); t0=null; prgE.style.width='0%'; htE.textContent='—'; updTop(); nearWarned=false;
    moveHistory = [];
    updateUndoButton();
    updateBestScoreDisplay();
}

function pickEmoji(){const t=thE.value;const list=emojiLists[t]||[]; if(!list.length) return''; return list[Math.floor(Math.random()*list.length)]}
function aplTh(){const t=thE.value; const app=document.getElementById('app'); app.className='app'; if(t!=='classic') app.classList.add(`theme--${t}`);}
function updTop(){['a','b','c'].forEach(id=>{const p=document.getElementById(id);const ds=p.querySelectorAll('.disk');ds.forEach(x=>x.classList.remove('small','ghost')); if(ds.length) ds[ds.length-1].classList.add('small'); p.querySelectorAll('.disk').forEach(x=>x.style.pointerEvents='none'); if(ds.length) ds[ds.length-1].style.pointerEvents='auto';})}
['a','b','c'].forEach(id=>{const p=document.getElementById(id);p.addEventListener('dragover',(e)=>{e.preventDefault();}); p.addEventListener('drop',(e)=>{e.preventDefault(); const diskId=e.dataTransfer.getData('text/plain'); const disk=document.getElementById(diskId); if(!disk) return; const from=disk.parentElement?disk.parentElement.id:null; if(p && canP(p.id,disk.dataset.size)){ if(from) executeMove(from,p.id); } else { toneBad(); } }); });
function canP(id,s){const top=[...document.getElementById(id).querySelectorAll('.disk')].pop(); if(!top) return true; return +top.dataset.size > +s}

function executeMove(from, to) {
    pMove(from, to);
    moveHistory.push({ from, to });
    updateUndoButton();
}

function pMove(from,to){const s=document.getElementById(from); const d=document.getElementById(to); let disk=s?[...s.querySelectorAll('.disk')].pop():null; if(!disk) return; d.appendChild(disk); moves++; mvE.textContent=moves; toneDrop(); updTop(); updPrg(); if(CURRENT_MODE!=='learn'){ chkDone(); } if(CURRENT_MODE==='teach' && teach){ if(teach[1]===to){ if(ix < seq.length) sTeach(); else sStop(); } } }
function updPrg(){ const tot=Math.pow(2,n)-1; const pct=Math.min(100,Math.round((moves/tot)*100)); prgE.style.width=pct+'%'}
function chkDone(){ const c=document.getElementById('c').querySelectorAll('.disk'); if(c.length===n){ clearInterval(tmr); shFin(); svIfBest(); if(challengeActive) successChallenge(); } }
function shFin(){ const tot=Math.pow(2,n)-1; const tSeconds=Math.floor((Date.now()-t0)/1000)||0; const tStr=fmt(tSeconds); if(moves===tot){ fin.innerHTML=`<div style="text-align:center"><div style="font-size:20px">Tuyệt vời! 🏆🥇👏</div><div style="margin-top:6px">Số bước: ${moves} (Tối ưu) | Thời gian: ${tStr}</div></div>`; } else { fin.innerHTML=`<div style="text-align:center"><div style="font-size:20px">🎉 Hoàn thành!</div><div style="margin-top:6px">Số bước: ${moves} | Thời gian: ${tStr}</div></div>`; } fin.classList.add('show'); setTimeout(()=>{ fin.classList.remove('show') },2200); try{ const diff=moves-tot; if(diff<=3){ const lines=[]; lines.push(`<div style="text-align:center">`); if(diff===0) lines.push(`<div style="font-size:20px">Bạn là người chiến thắng! 🏆🥇</div>`); else lines.push(`<div style="font-size:20px">Gần tối ưu rồi, cố lên! 💪</div>`); lines.push(`<div style="margin-top:8px">Số bước: <strong>${moves}</strong> | Thời gian: <strong>${tStr}</strong></div>`); lines.push(`<button class="closeBtn" id="closeNear">Đóng</button>`); lines.push(`</div>`); near.innerHTML=lines.join(''); near.classList.add('show'); if(sndE.checked){ try{ const a=new Audio('smooth-gaming-atmosphere-323659.mp3'); a.volume=0.85; a.play().catch(()=>{}); }catch(e){} } if(diff===0){ try{ confettiInstance({ particleCount:90, spread:110, startVelocity:60, origin:{x:0.5,y:0.35} }); }catch(e){} cele(); } const btn=document.getElementById('closeNear'); if(btn) btn.addEventListener('click',()=>{ near.classList.remove('show'); }); } }catch(e){} }
function svIfBest(){ if(CURRENT_MODE!=='play' && CURRENT_MODE!=='challenge') return; const t=Math.floor((Date.now()-t0)/1000)||0; const best = loadBest(n); if(!best.moves||moves<best.moves||(moves===best.moves&&t<best.time)){ saveBest(n, {moves:moves,time:t}); updateBestScoreDisplay(); } }
const confettiCanvas=document.getElementById('confetti'); const confettiInstance=confetti.create(confettiCanvas,{resize:true,useWorker:true}); function cele(){ if(CURRENT_MODE==='learn') return; confettiCanvas.style.transition='opacity 1600ms cubic-bezier(.2,.8,.2,1)'; confettiCanvas.style.opacity='1'; confettiInstance({ particleCount:120, spread:130, startVelocity:60, origin:{x:0.5,y:0.25}, ticks:200 }); setTimeout(()=>{ confettiCanvas.style.opacity='0' },1200); if(sndE.checked){ const a=new Audio('smooth-gaming-atmosphere-323659.mp3'); a.volume=0.75; a.play().catch(()=>{}); } }
function successChallenge(){ challengeActive=false; clearInterval(challengeTimer); setTimeout(()=>{ cele(); },200); }
function failChallenge(){ challengeActive=false; const loserPopup = document.getElementById('loserPopup'); loserPopup.querySelector('.popup-box div').innerHTML = "Hết giờ rồi! ⏳<br>Cố gắng lần sau nhé!"; loserPopup.style.display='flex'; }
function startChallengeFor(n){ challengeLimit=Math.max(20, n*15); challengeDeadline=Date.now()+challengeLimit*1000; challengeActive=true; challengeTimer=setInterval(()=>{ const rem=Math.max(0,Math.ceil((challengeDeadline-Date.now())/1000)); tE.textContent=fmt(rem); if(rem<=0){ clearInterval(challengeTimer); if(document.getElementById('c').querySelectorAll('.disk').length!==n){ failChallenge(); } } },250); }
function gen(k,f,t,a,r){ if(k<=0) return; gen(k-1,f,a,t,r); r.push([f,t]); gen(k-1,a,t,f,r); }
function sAuto(){ if(run){ sStop(); return } seq=[]; gen(n,'a','c','b',seq); ix=0; run=true; if(CURRENT_MODE === 'demo') sDemo(); else sTeach(); }
function sDemo(){ if(ix>=seq.length){ sStop(); return } const p=seq[ix++]; hl(p); setTimeout(()=>{ pMove(p[0],p[1]); setTimeout(sDemo,Math.max(120,+spdE.value/3)) }, +spdE.value) }
function sTeach(){ teach=seq[ix++]; hl(teach); htE.textContent=`Di chuyển đĩa từ ${teach[0].toUpperCase()} → ${teach[1].toUpperCase()}` }
function hl(p){ ['a','b','c'].forEach(id=>document.getElementById(id).classList.remove('from','to','hv')); if(p){ document.getElementById(p[0]).classList.add('from','hv'); document.getElementById(p[1]).classList.add('to') } }
function sStop(){ run=false; seq=[]; ix=0; teach=null; ['a','b','c'].forEach(id=>document.getElementById(id).classList.remove('from','to','hv')); htE.textContent='—' }
function fmt(s){ const mm=String(Math.floor(s/60)).padStart(2,'0'); const ss=String(s%60).padStart(2,'0'); return mm+':'+ss }
function tonePickup(){ pTone(420,0.08,'sine',0.06) }
function toneDrop(){ pTone(620,0.09,'triangle',0.07) }
function toneBad(){ pTone(180,0.18,'sawtooth',0.06) }
function showWelcomePopup(){ const p1=document.getElementById('popup-rule1'); const p2=document.getElementById('popup-rule2'); p1.style.display='flex'; p1.setAttribute('aria-hidden','false'); p2.style.display='none'; p2.setAttribute('aria-hidden','true'); document.getElementById('popup-yes').onclick=()=>{ p1.style.display='none'; p1.setAttribute('aria-hidden','true'); bld(); }; document.getElementById('popup-no').onclick=()=>{ p1.style.display='none'; p1.setAttribute('aria-hidden','true'); p2.style.display='flex'; p2.setAttribute('aria-hidden','false'); }; document.getElementById('popup-start').onclick=()=>{ p2.style.display='none'; p2.setAttribute('aria-hidden','true'); bld(); }; }

// --- Event Listeners ---
document.getElementById('reset').addEventListener('click',()=>{ sStop(); bld(); if(challengeActive){ clearInterval(challengeTimer); challengeActive=false; tE.textContent='00:00' } });
document.getElementById('auto').addEventListener('click',()=>{ if(CURRENT_MODE === 'play'){ sStop(); CURRENT_MODE='demo'; sAuto(); CURRENT_MODE='play'; } });
hintBtn.addEventListener('click', () => {
    if (CURRENT_MODE !== 'play') return;
    const optimalSequence = [];
    gen(n, 'a', 'c', 'b', optimalSequence);
    if (moves < optimalSequence.length) {
        const nextMove = optimalSequence[moves];
        htE.textContent = `Gợi ý: ${nextMove[0].toUpperCase()} → ${nextMove[1].toUpperCase()}`;
        hl(nextMove);
        setTimeout(() => hl(null), 1000);
    } else {
        htE.textContent = "Bạn đã vượt qua số bước tối ưu.";
    }
});
nE.addEventListener('change', bld);
thE.addEventListener('change',()=>{ aplTh(); bld() });
sndE.addEventListener('change',()=>{ if(sndE.checked) playBGM(); else pauseBGM(); });
document.getElementById('bgm-upload-input').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        const fileURL = URL.createObjectURL(file);
        const sourceEl = bgmEl.querySelector('source');
        sourceEl.src = fileURL;
        bgmEl.load();
        playBGM();
    }
});

// --- Undo Logic ---
function updateUndoButton() { undoBtn.disabled = moveHistory.length === 0; }
undoBtn.addEventListener('click', () => {
    if (moveHistory.length > 0) {
        const lastMove = moveHistory.pop();
        // Reverse the move
        const fromPole = document.getElementById(lastMove.to);
        const toPole = document.getElementById(lastMove.from);
        const disk = [...fromPole.querySelectorAll('.disk')].pop();
        if (disk) {
            toPole.appendChild(disk);
            moves--; // Decrement moves
            mvE.textContent = moves;
            tonePickup();
            updTop();
            updPrg();
        }
        updateUndoButton();
    }
});

// --- Keyboard Controls ---
function clearHeldDisk() {
    if (heldDisk) {
        heldDisk.diskElement.classList.remove('held');
        heldDisk = null;
    }
}
window.addEventListener('keydown', (e) => {
    if (['1', '2', '3'].includes(e.key)) {
        const poleId = { '1': 'a', '2': 'b', '3': 'c' }[e.key];
        const poleEl = document.getElementById(poleId);

        if (!heldDisk) { // If nothing is held, pick up a disk
            const topDisk = [...poleEl.querySelectorAll('.disk')].pop();
            if (topDisk) {
                heldDisk = { diskElement: topDisk, fromPole: poleId };
                topDisk.classList.add('held');
                tonePickup();
            }
        } else { // If a disk is held, try to place it
            if (canP(poleId, heldDisk.diskElement.dataset.size)) {
                if (heldDisk.fromPole !== poleId) {
                    executeMove(heldDisk.fromPole, poleId);
                }
                clearHeldDisk();
            } else {
                toneBad();
            }
        }
    } else if (e.key === 'Escape') {
        clearHeldDisk();
    }
});


// --- Mode Selection Logic ---
const modeOverlay=document.getElementById('modeSelect');
const allModeCards = Array.from(document.querySelectorAll('.mode-card'));
const modeStartBtn=document.getElementById('modeStart');
const changeModeBtn=document.getElementById('changeMode');
const currentModeDisplay=document.getElementById('currentModeDisplay');
let chosenMode='play';

allModeCards.forEach(card => {
    card.addEventListener('click', ()=>{
        allModeCards.forEach(c=>c.classList.remove('selected'));
        card.classList.add('selected');
        chosenMode = card.id.replace('mode-', '');
    });
});

changeModeBtn.addEventListener('click', () => {
    sStop(); stopLearnRun(); clearInterval(tmr); t0=null;
    clearInterval(challengeTimer); challengeActive=false;
    document.getElementById('learnPanel').style.display='none';
    tE.textContent='00:00'; mvE.textContent='0';
    modeOverlay.style.display='flex';
});

modeStartBtn.addEventListener('click',()=>{
    CURRENT_MODE=chosenMode;
    modeOverlay.style.display='none';
    currentModeDisplay.textContent = chosenMode.charAt(0).toUpperCase() + chosenMode.slice(1);

    autoBtn.disabled = CURRENT_MODE !== 'play';
    hintBtn.disabled = CURRENT_MODE !== 'play';

    const speedControl = spdE.parentElement;
    speedControl.style.display = (CURRENT_MODE === 'demo' || CURRENT_MODE === 'learn') ? 'block' : 'none';

    setTimeout(()=>{
        if(CURRENT_MODE==='learn'){
            bld(); startLearnMode(); document.getElementById('learnPanel').style.display='block';
        } else if(CURRENT_MODE==='challenge'){
            bld(); startChallengeFor(n);
        } else if (CURRENT_MODE === 'demo' || CURRENT_MODE === 'teach') {
            bld(); sAuto();
        } else { // 'play' mode
            bld();
        }
    }, 90);
});

// --- Greeting and Music Consent ---
document.addEventListener('DOMContentLoaded', () => {
    const greetingPopup = document.getElementById('greetingPopup');
    document.getElementById('musicYes').addEventListener('click', () => {
        sndE.checked = true;
        playBGM();
        greetingPopup.style.display = 'none';
        modeOverlay.style.display = 'flex';
    });
    document.getElementById('musicNo').addEventListener('click', () => {
        sndE.checked = false;
        greetingPopup.style.display = 'none';
        modeOverlay.style.display = 'flex';
    });

    // Close loser popup
    document.getElementById('loserClose').addEventListener('click', () => {
        document.getElementById('loserPopup').style.display = 'none';
    });
});

// --- Learn Mode Logic (unchanged) ---
const learnPanel=document.getElementById('learnPanel'); const learnNLabel=document.getElementById('learnN');
const learnPrev=document.getElementById('learnPrev'); const learnPlay=document.getElementById('learnPlay'); const learnPause=document.getElementById('learnPause'); const learnNext=document.getElementById('learnNext'); const learnSpeed=document.getElementById('learnSpeed'); const stackArea=document.getElementById('stackArea'); const learnExplain=document.getElementById('learnExplain');
let learnEvents=[], learnIdx=0, learnTimer=null, learnRunning=false,learnInterval=700;
function traceRecBuild(k,f,t,a,depth,id,events){ if(k<=0) return; const uid = id || (Math.random().toString(36).slice(2)); events.push({type:'call',k,from:f,to:t,aux:a,depth,uid}); traceRecBuild(k-1,f,a,t,depth+1,uid+'L',events); events.push({type:'move',k,from:f,to:t,depth,uid}); traceRecBuild(k-1,a,t,f,depth+1,uid+'R',events); events.push({type:'ret',k,from:f,to:t,depth,uid}); }
function buildLearnEvents(){ learnEvents=[]; const K=n; traceRecBuild(K,'a','c','b',0,null,learnEvents); learnIdx=0; renderStack(); }
function renderStack(){ stackArea.innerHTML=''; const active=learnEvents[learnIdx]; const map=[]; for(let i=0;i<=learnIdx && i<learnEvents.length;i++){ const e=learnEvents[i]; if(e.type==='call'){ map.push(e); } else if(e.type==='ret'){ for(let j=map.length-1;j>=0;j--){ if(map[j].uid===e.uid){ map.splice(j,1); break; } } } } map.forEach(e=>{ const node=document.createElement('div'); node.className='stack-node'; node.style.paddingLeft=(10+e.depth*12)+'px'; node.textContent=`Hanoi(${e.k}, ${e.from}, ${e.to}, ${e.aux})`; stackArea.appendChild(node); }); if(active){ if(active.type==='move'){ learnExplain.textContent=`Di chuyển đĩa ${active.k} từ ${active.from} → ${active.to}`; } else if(active.type==='call'){ learnExplain.textContent=`Gọi đệ quy Hanoi(${active.k}, ${active.from}, ${active.to}, ${active.aux})`; } else if(active.type==='ret'){ learnExplain.textContent=`Hoàn thành lời gọi Hanoi(${active.k}, ${active.from}, ${active.to})`; } } }
function stepLearn(dir){ const prevIdx=learnIdx; if(dir===-1) learnIdx=Math.max(0,learnIdx-1); else learnIdx=Math.min(learnEvents.length-1,learnIdx+1); const e=learnEvents[learnIdx]; if(e.type==='move'){ if(dir===-1){ const prevE=learnEvents[prevIdx]; pMove(prevE.to,prevE.from); } else{ pMove(e.from,e.to); } } renderStack(); }
function startLearnRun(){ if(learnRunning) return; learnRunning=true; learnPlay.style.display='none'; learnPause.style.display='inline-block'; learnTimer=setInterval(()=>{ if(learnIdx<learnEvents.length-1){ stepLearn(1); } else{ stopLearnRun(); } },learnInterval); }
function stopLearnRun(){ learnRunning=false; clearInterval(learnTimer); learnTimer=null; learnPlay.style.display='inline-block'; learnPause.style.display='none'; }
function startLearnMode(){ stopLearnRun(); bld(); buildLearnEvents(); learnNLabel.textContent=n; }
learnPrev.addEventListener('click',()=>{ stopLearnRun(); stepLearn(-1); }); learnPlay.addEventListener('click',startLearnRun); learnPause.addEventListener('click',stopLearnRun); learnNext.addEventListener('click',()=>{ stopLearnRun(); stepLearn(1); }); learnSpeed.addEventListener('change',(e)=>{ learnInterval= +e.target.value; if(learnRunning){ stopLearnRun(); startLearnRun(); } });