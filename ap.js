document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const nE = document.getElementById('n'), mvE = document.getElementById('mv'), bE = document.getElementById('best'), tE = document.getElementById('tm'), bestNE = document.getElementById('best-n'), hintBtn = document.getElementById('hint'), undoBtn = document.getElementById('undo'), spdE = document.getElementById('spd'), sndE = document.getElementById('snd'), bgmEl = document.getElementById('bgm'), themeE = document.getElementById('theme'), progE = document.getElementById('prog'), hintTextE = document.getElementById('hintText'), currentModeDisplay = document.getElementById('currentModeDisplay'), confettiCanvas = document.getElementById('confetti');
    const analysisPanel = document.getElementById('analysisPanel'), learnPanel = document.getElementById('learnPanel');
    const learnNLabel = document.getElementById('learnN'), stackArea = document.getElementById('stackArea'), learnExplain = document.getElementById('learnExplain'), learnPrev = document.getElementById('learnPrev'), learnPlay = document.getElementById('learnPlay'), learnPause = document.getElementById('learnPause'), learnNext = document.getElementById('learnNext'), learnSpeed = document.getElementById('learnSpeed');
    const greetingPopup = document.getElementById('greetingPopup'), modeOverlay = document.getElementById('modeSelect'), appPopup = document.getElementById('appPopup'), finishPop = document.getElementById('finish'), nearOptimalPop = document.getElementById('nearOptimal'), loserPopup = document.getElementById('loserPopup');

    // --- State Variables ---
    let n = 4, moves = 0, t0 = null;
    let tmr = null, run = false, seq = [], ix = 0, teach = null, actx = null;
    let diskCols = ["#e74c3c", "#f39c12", "#2ecc71", "#3498db", "#9b59b6", "#1abc9c", "#e67e22", "#8e44ad", "#c0392b", "#d35400"];
    let CURRENT_MODE = 'play';
    let moveHistory = [];
    let heldDisk = null;
    let challengeTimer = null, challengeActive = false;
    let learnEvents = [], learnIdx = 0, learnTimer = null, learnRunning = false, learnInterval = 700;
    const confettiInstance = confetti.create(confettiCanvas, { resize: true, useWorker: true });

    // --- 1. SETUP & CORE GAME LOGIC ---
    function bld() {
        n = Math.max(1, Math.min(10, parseInt(nE.value) || 4));
        nE.value = n;
        updateAnalysis(n);
        ['a', 'b', 'c'].forEach(id => { const p = document.getElementById(id); p.innerHTML = '<div class="peg"></div><div class="pole-label">' + (id.charCodeAt(0) - 96) + '</div>'; p.classList.remove('from', 'to', 'hv'); });
        const A = document.getElementById('a');
        for (let i = n; i >= 1; i--) { const d = document.createElement('div'); d.className = 'disk'; d.id = 'disk-' + i; d.dataset.size = i; d.style.width = (30 + i * 16) + 'px'; d.style.background = diskCols[(i - 1) % diskCols.length]; d.draggable = true; d.addEventListener('dragstart', handleDragStart); A.appendChild(d); }
        moves = 0; mvE.textContent = 0;
        tE.textContent = '00:00'; clearInterval(tmr); t0 = null;
        progE.style.width = '0%'; hintTextE.textContent = '—';
        moveHistory = [];
        updateUndoButton();
        updateBestScoreDisplay();
        updTop();
    }
    function startTimer() { if (!t0) { t0 = Date.now(); tmr = setInterval(() => { tE.textContent = fmt(Math.floor((Date.now() - t0) / 1000)); }, 250); } }
    function updTop() { ['a', 'b', 'c'].forEach(id => { const p = document.getElementById(id); const ds = p.querySelectorAll('.disk'); p.querySelectorAll('.disk').forEach(x => x.style.pointerEvents = 'none'); if (ds.length) { const topDisk = ds[ds.length - 1]; topDisk.style.pointerEvents = 'auto'; ds.forEach(d => d.classList.remove('small')); topDisk.classList.add('small'); } }); }
    function canP(poleId, size) { const top = document.getElementById(poleId).querySelector('.disk:last-child'); return !top || +top.dataset.size > +size; }
    function executeMove(from, to) { pMove(from, to); moveHistory.push({ from, to }); updateUndoButton(); }
    function pMove(from, to) {
        if (CURRENT_MODE !== 'demo' && CURRENT_MODE !== 'learn') startTimer();
        const disk = document.getElementById(from).querySelector('.disk:last-child');
        if (!disk) return;
        document.getElementById(to).appendChild(disk);
        moves++; mvE.textContent = moves;
        pTone(620, 0.09, 'triangle', 0.07);
        updTop(); updPrg();
        if (CURRENT_MODE !== 'learn') chkDone();
        if (CURRENT_MODE === 'teach' && teach && teach[1] === to) { ix < seq.length ? sTeach() : sStop(); }
    }

    // --- 2. SCORING, ANALYSIS & PERSISTENCE ---
    function getBestKey(diskCount) { return `hanoi_best_v2_${diskCount}_disks`; }
    function loadBest(diskCount) { try { return JSON.parse(localStorage.getItem(getBestKey(diskCount))) || {}; } catch (e) { return {}; } }
    function saveBest(diskCount, score) { localStorage.setItem(getBestKey(diskCount), JSON.stringify(score)); }
    function updateBestScoreDisplay() { n = Math.max(1, Math.min(10, parseInt(nE.value) || 4)); bestNE.textContent = n; const best = loadBest(n); bE.textContent = (best && best.moves) ? `${best.moves}m / ${best.time}s` : '—'; }
    function svIfBest() { if (CURRENT_MODE !== 'play' && CURRENT_MODE !== 'challenge') return; const t = Math.floor((Date.now() - t0) / 1000) || 0; const best = loadBest(n); if (!best.moves || moves < best.moves || (moves === best.moves && t < best.time)) { saveBest(n, { moves: moves, time: t }); updateBestScoreDisplay(); } }
    function updateAnalysis(diskCount) { const num = BigInt(diskCount); const moveCount = (2n ** num) - 1n; document.getElementById('analysisN').textContent = diskCount; document.getElementById('analysisMoves').textContent = moveCount.toLocaleString('vi-VN'); const moves64 = (2n ** 64n) - 1n; const years = moves64 / BigInt(31536000); document.getElementById('analysisTime').textContent = `~${(years / 1_000_000_000n).toLocaleString('vi-VN')} tỷ năm`; }

    // --- 3. AUTOMATED & GUIDED MODES ---
    function gen(k, f, t, a, r) { if (k <= 0) return; gen(k - 1, f, a, t, r); r.push([f, t]); gen(k - 1, a, t, f, r); }
    function sAuto() { if (run) { sStop(); return; } seq = []; gen(n, 'a', 'c', 'b', seq); ix = 0; run = true; if (CURRENT_MODE === 'demo') sDemo(); else sTeach(); }
    function sDemo() { if (ix >= seq.length) { sStop(); return; } const p = seq[ix++]; hl(p); setTimeout(() => { pMove(p[0], p[1]); setTimeout(sDemo, Math.max(120, +spdE.value / 3)); }, +spdE.value); }
    function sTeach() { teach = seq[ix++]; hl(teach); hintTextE.textContent = `Di chuyển đĩa từ ${teach[0].toUpperCase()} → ${teach[1].toUpperCase()}`; }
    function hl(p) { ['a', 'b', 'c'].forEach(id => document.getElementById(id).classList.remove('from', 'to', 'hv')); if (p) { document.getElementById(p[0]).classList.add('from', 'hv'); document.getElementById(p[1]).classList.add('to'); } }
    function sStop() { run = false; seq = []; ix = 0; teach = null; hl(null); hintTextE.textContent = '—'; }

    // --- 4. LEARN MODE (DASHBOARD INTEGRATED) ---
    function traceRecBuild(k, f, t, a, depth, id, events) { if (k <= 0) return; const uid = id || Math.random().toString(36).slice(2); events.push({ type: 'call', k, from: f, to: t, aux: a, depth, uid }); traceRecBuild(k - 1, f, a, t, depth + 1, uid + 'L', events); events.push({ type: 'move', k, from: f, to: t, depth, uid }); traceRecBuild(k - 1, a, t, f, depth + 1, uid + 'R', events); events.push({ type: 'ret', k, from: f, to: t, depth, uid }); }
    function buildLearnEvents() { learnEvents = []; traceRecBuild(n, 'a', 'c', 'b', 0, null, learnEvents); learnIdx = 0; renderStack(); }
    function renderStack() { stackArea.innerHTML = ''; const active = learnEvents[learnIdx]; const map = []; for (let i = 0; i <= learnIdx && i < learnEvents.length; i++) { const e = learnEvents[i]; if (e.type === 'call') map.push(e); else if (e.type === 'ret') for (let j = map.length - 1; j >= 0; j--) if (map[j].uid === e.uid) { map.splice(j, 1); break; } } map.forEach(e => { const node = document.createElement('div'); node.className = 'stack-node'; node.style.paddingLeft = (10 + e.depth * 12) + 'px'; node.textContent = `Hanoi(${e.k}, ${e.from}, ${e.to}, ${e.aux})`; stackArea.appendChild(node); }); if (active) { if (active.type === 'move') learnExplain.textContent = `Thực thi: Di chuyển đĩa ${active.k} từ ${active.from} → ${active.to}`; else if (active.type === 'call') learnExplain.textContent = `Gọi đệ quy: Hanoi(${active.k}, ${active.from}, ${active.to}, ${active.aux})`; else if (active.type === 'ret') learnExplain.textContent = `Hoàn thành lời gọi: Hanoi(${active.k}, ${active.from}, ${active.to})`; } }
    function stepLearn(dir) { const prevIdx = learnIdx; if (dir === -1) learnIdx = Math.max(0, learnIdx - 1); else learnIdx = Math.min(learnEvents.length - 1, learnIdx + 1); const e = learnEvents[learnIdx]; if (e.type === 'move') { if (dir === -1) pMove(learnEvents[prevIdx].to, learnEvents[prevIdx].from); else pMove(e.from, e.to); } renderStack(); }
    function startLearnRun() { if (learnRunning) return; learnRunning = true; learnPlay.style.display = 'none'; learnPause.style.display = 'inline-block'; learnTimer = setInterval(() => { learnIdx < learnEvents.length - 1 ? stepLearn(1) : stopLearnRun(); }, learnInterval); }
    function stopLearnRun() { learnRunning = false; clearInterval(learnTimer); learnTimer = null; learnPlay.style.display = 'inline-block'; learnPause.style.display = 'none'; }
    function startLearnMode() { stopLearnRun(); bld(); buildLearnEvents(); learnNLabel.textContent = n; }

    // --- 5. CHALLENGE MODE ---
    function startChallengeFor(diskCount) { const timeLimit = Math.max(20, diskCount * 15); const deadline = Date.now() + timeLimit * 1000; challengeActive = true; challengeTimer = setInterval(() => { const rem = Math.max(0, Math.ceil((deadline - Date.now()) / 1000)); tE.textContent = fmt(rem); if (rem <= 0) { clearInterval(challengeTimer); if (document.getElementById('c').querySelectorAll('.disk').length !== n) failChallenge(); } }, 250); }
    function failChallenge() { challengeActive = false; loserPopup.querySelector('.popup-box div').innerHTML = "Hết giờ rồi! ⏳<br>Cố gắng lần sau nhé!"; loserPopup.style.display = 'flex'; }
    function successChallenge() { challengeActive = false; clearInterval(challengeTimer); setTimeout(cele, 200); }

    // --- 6. UI FEEDBACK & POPUPS ---
    function chkDone() { if (document.getElementById('c').querySelectorAll('.disk').length === n) { clearInterval(tmr); shFin(); svIfBest(); if (challengeActive) successChallenge(); } }
    function shFin() { const tot = Math.pow(2, n) - 1; const tSeconds = Math.floor((Date.now() - t0) / 1000) || 0; const tStr = fmt(tSeconds); if (moves === tot) { finishPop.innerHTML = `<div style="text-align:center"><div style="font-size:20px">Tuyệt vời! 🏆🥇👏</div><div style="margin-top:6px">Số bước: ${moves} (Tối ưu) | Thời gian: ${tStr}</div></div>`; } else { finishPop.innerHTML = `<div style="text-align:center"><div style="font-size:20px">🎉 Hoàn thành!</div><div style="margin-top:6px">Số bước: ${moves} | Thời gian: ${tStr}</div></div>`; } finishPop.classList.add('show'); setTimeout(() => { finishPop.classList.remove('show') }, 2200); if (moves - tot <= 3) cele(); }
    function cele() { confettiInstance({ particleCount: 120, spread: 130, startVelocity: 60, origin: { x: 0.5, y: 0.25 }, ticks: 200 }); }
    function updPrg() { const tot = Math.pow(2, n) - 1; progE.style.width = `${Math.min(100, (moves / tot) * 100)}%`; }
    function fmt(s) { return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }

    // --- 7. AUDIO HANDLING ---
    function pTone(f,d=0.12,t='sine',g=0.08){if(!sndE.checked)return;if(!actx)try{actx=new(window.AudioContext||window.webkitAudioContext)()}catch(e){return}const o=actx.createOscillator(),gg=actx.createGain();o.type=t;o.frequency.value=f;gg.gain.value=g;o.connect(gg);gg.connect(actx.destination);o.start();o.stop(actx.currentTime+d)}
    function playBGM(){ if(sndE.checked){bgmEl.volume=0.35;bgmEl.loop=true;bgmEl.play().catch(()=>{});if(actx&&actx.state==='suspended')actx.resume().catch(()=>{})}}
    function pauseBGM(){ bgmEl.pause(); }

    // --- 8. EVENT LISTENERS ---
    document.getElementById('reset').addEventListener('click', () => { sStop(); stopLearnRun(); bld(); if (challengeActive) { clearInterval(challengeTimer); challengeActive = false; } });
    nE.addEventListener('change', () => { sStop(); stopLearnRun(); bld(); });
    themeE.addEventListener('change', () => { const app = document.getElementById('app'); app.className = 'app'; if (themeE.value !== 'classic') app.classList.add(`theme--${themeE.value}`); });
    sndE.addEventListener('change', () => { sndE.checked ? playBGM() : pauseBGM(); });
    document.getElementById('bgm-upload-input').addEventListener('change', (event) => { const file = event.target.files[0]; if (file) { bgmEl.src = URL.createObjectURL(file); bgmEl.load(); playBGM(); } });
    function handleDragStart(ev) { ev.dataTransfer.setData('text/plain', ev.target.id); ev.dataTransfer.effectAllowed = 'move'; startTimer(); pTone(420, 0.08, 'sine', 0.06); }
    ['a', 'b', 'c'].forEach(id => { const p = document.getElementById(id); p.addEventListener('dragover', e => e.preventDefault()); p.addEventListener('drop', e => { e.preventDefault(); const diskId = e.dataTransfer.getData('text/plain'); const disk = document.getElementById(diskId); if (disk && canP(p.id, disk.dataset.size)) { executeMove(disk.parentElement.id, p.id); } else { pTone(180, 0.18, 'sawtooth', 0.06); } }); });
    undoBtn.addEventListener('click', () => { if (moveHistory.length > 0) { const lastMove = moveHistory.pop(); const disk = document.getElementById(lastMove.to).querySelector('.disk:last-child'); if (disk) { document.getElementById(lastMove.from).appendChild(disk); moves--; mvE.textContent = moves; pTone(420, 0.08, 'sine', 0.06); updTop(); updPrg(); } updateUndoButton(); } });
    function updateUndoButton() { undoBtn.disabled = moveHistory.length === 0; }
    window.addEventListener('keydown', e => { if (['1', '2', '3'].includes(e.key)) { const poleId = { '1': 'a', '2': 'b', '3': 'c' }[e.key]; if (!heldDisk) { const topDisk = document.getElementById(poleId).querySelector('.disk:last-child'); if (topDisk) { heldDisk = { diskElement: topDisk, fromPole: poleId }; topDisk.classList.add('held'); pTone(420, 0.08, 'sine', 0.06); } } else { if (canP(poleId, heldDisk.diskElement.dataset.size)) { if (heldDisk.fromPole !== poleId) executeMove(heldDisk.fromPole, poleId); heldDisk.diskElement.classList.remove('held'); heldDisk = null; } else { pTone(180, 0.18, 'sawtooth', 0.06); } } } else if (e.key === 'Escape' && heldDisk) { heldDisk.diskElement.classList.remove('held'); heldDisk = null; } });
    hintBtn.addEventListener('click', () => { if (CURRENT_MODE !== 'play') return; const optSeq = []; gen(n, 'a', 'c', 'b', optSeq); if (moves < optSeq.length) { const nextMove = optSeq[moves]; hintTextE.textContent = `Gợi ý: ${nextMove[0].toUpperCase()} → ${nextMove[1].toUpperCase()}`; hl(nextMove); setTimeout(() => hl(null), 1000); } else { hintTextE.textContent = "Bạn đã vượt qua số bước tối ưu."; } });
    learnPrev.addEventListener('click', () => { stopLearnRun(); stepLearn(-1); }); learnPlay.addEventListener('click', startLearnRun); learnPause.addEventListener('click', stopLearnRun); learnNext.addEventListener('click', () => { stopLearnRun(); stepLearn(1); });
    learnSpeed.addEventListener('change', (e) => { learnInterval = +e.target.value; if (learnRunning) { stopLearnRun(); startLearnRun(); } });
    document.getElementById('appPopupButton').addEventListener('click', () => appPopup.style.display = 'flex');
    appPopup.addEventListener('click', (e) => { if (e.target.closest('.close-btn') || e.target.closest('.btn') || e.target === appPopup) appPopup.style.display = 'none'; });
    
    // --- 9. MODE SELECTION & INITIALIZATION ---
    document.getElementById('changeMode').addEventListener('click', () => { sStop(); stopLearnRun(); clearInterval(tmr); t0 = null; if(challengeActive) { clearInterval(challengeTimer); challengeActive = false; } analysisPanel.style.display = 'block'; learnPanel.style.display = 'none'; modeOverlay.style.display = 'flex'; });
    Array.from(document.querySelectorAll('.mode-card')).forEach(card => card.addEventListener('click', () => { document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected')); card.classList.add('selected'); }));
    document.getElementById('modeStart').addEventListener('click', () => {
        const chosenMode = document.querySelector('.mode-card.selected')?.id.replace('mode-', '') || 'play';
        CURRENT_MODE = chosenMode;
        modeOverlay.style.display = 'none';
        currentModeDisplay.textContent = chosenMode.charAt(0).toUpperCase() + chosenMode.slice(1);
        hintBtn.disabled = CURRENT_MODE !== 'play';
        spdE.parentElement.style.display = (CURRENT_MODE === 'demo') ? 'block' : 'none';
        if (CURRENT_MODE === 'learn') { analysisPanel.style.display = 'none'; learnPanel.style.display = 'block'; startLearnMode(); } 
        else { analysisPanel.style.display = 'block'; learnPanel.style.display = 'none'; bld(); if (CURRENT_MODE === 'demo' || CURRENT_MODE === 'teach') sAuto(); else if (CURRENT_MODE === 'challenge') startChallengeFor(n); }
    });
    greetingPopup.style.display = 'flex';
    document.getElementById('musicYes').addEventListener('click', () => { sndE.checked = true; playBGM(); greetingPopup.style.display = 'none'; modeOverlay.style.display = 'flex'; });
    document.getElementById('musicNo').addEventListener('click', () => { sndE.checked = false; greetingPopup.style.display = 'none'; modeOverlay.style.display = 'flex'; });
    bld();
});
