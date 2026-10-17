/* ═══════════════════════════════════════════════════════
   DALI TASKS — app.js
   Full feature set: calendar, tasks (w/ priority), milestones,
   streaks, activity tracker, peak-hours heatmap,
   Pomodoro timer, Web Audio, toast, modals, localStorage
═══════════════════════════════════════════════════════ */
'use strict';

/* ── Constants ──────────────────────────────────────── */
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const DAYS   = ['M','T','W','T','F','S','S'];
const HRS    = [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21];
const CYCLE  = 4;
const CIRC   = +(2 * Math.PI * 84).toFixed(2);

const MODES = {
  pomodoro: { label:'FOCUS',       mins:25, next:'short'    },
  short:    { label:'SHORT BREAK', mins:5,  next:'pomodoro' },
  long:     { label:'LONG BREAK',  mins:15, next:'pomodoro' },
  custom:   { label:'CUSTOM',      mins:30, next:'short'    },
};

/* ── State ──────────────────────────────────────────── */
const S = {
  today:   new Date(),
  viewY:   new Date().getFullYear(),
  viewM:   new Date().getMonth(),
  selDate: null,

  tasks:    lsGet('dk-tasks')    || {},
  miles:    lsGet('dk-miles')    || [],
  streaks:  lsGet('dk-streaks')  || { cur:0, active:0, best:0, goal:7, lastDay:null, week:[0,0,0,0,0,0,0] },
  activity: lsGet('dk-activity') || {},
  peak:     lsGet('dk-peak')     || {},

  timer: {
    mode:'pomodoro', custMins:30,
    total:1500, left:1500,
    running:false, iv:null,
    sessions:0, startTs:null, taskName:'',
  },
};

/* ── Storage ────────────────────────────────────────── */
function lsGet(k){ try{ return JSON.parse(localStorage.getItem(k)); } catch{ return null; } }
function lsSet(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
function saveAll(){
  lsSet('dk-tasks',    S.tasks);
  lsSet('dk-miles',    S.miles);
  lsSet('dk-streaks',  S.streaks);
  lsSet('dk-activity', S.activity);
  lsSet('dk-peak',     S.peak);
}

/* ── Audio ──────────────────────────────────────────── */
let _ac = null;
function getAC(){ return _ac || (_ac = new (window.AudioContext || window.webkitAudioContext)()); }
function beep(type){
  if (!document.getElementById('sound-toggle').checked) return;
  const ctx = getAC();
  const seqs = {
    start: [{f:440,d:.1},{f:550,d:.1}],
    done:  [{f:523,d:.18},{f:659,d:.18},{f:784,d:.35}],
    brk:   [{f:350,d:.25},{f:280,d:.25}],
    check: [{f:523,d:.12},{f:659,d:.12},{f:1047,d:.3}],
    tick:  [{f:880,d:.04,v:.04}],
  };
  let t = ctx.currentTime;
  (seqs[type] || seqs.start).forEach(({f,d,v=0.28}) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.start(t); o.stop(t + d + .01); t += d;
  });
}

/* ── Toast ──────────────────────────────────────────── */
let _tTm;
function showToast(msg, ms = 3500){
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(_tTm);
  _tTm = setTimeout(() => el.classList.remove('show'), ms);
}

/* ── Notifications ──────────────────────────────────── */
function askNotif(){ if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }
function pushNotif(t, b){ if ('Notification' in window && Notification.permission === 'granted') new Notification(t, {body:b}); }

/* ── Date helpers ───────────────────────────────────── */
function todayStr(){
  const d = S.today;
  return ds(d.getFullYear(), d.getMonth(), d.getDate());
}
function ds(y, m, d){ return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function fmtDate(str){
  const [y,m,d] = str.split('-').map(Number);
  return new Date(y, m-1, d).toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
}
function fmtDateShort(str){
  const [y,m,d] = str.split('-').map(Number);
  return new Date(y, m-1, d).toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
}
function isToday(y, m, d){ const t = S.today; return t.getFullYear()===y && t.getMonth()===m && t.getDate()===d; }
function weekDates(){
  const t = S.today, dow = t.getDay()===0 ? 6 : t.getDay()-1, out = [];
  for (let i = 0; i < 7; i++){
    const x = new Date(t); x.setDate(t.getDate() - dow + i);
    out.push(ds(x.getFullYear(), x.getMonth(), x.getDate()));
  }
  return out;
}
function fmtSecs(s){
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

/* ── Greeting + hero date ───────────────────────────── */
function renderHero(){
  // Greeting based on time
  const hr = S.today.getHours();
  const greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const greetEl = document.getElementById('hero-greeting');
  if (greetEl) greetEl.textContent = `${greet}, Aryan`;

  // Date
  const dateEl = document.getElementById('hero-date');
  if (dateEl) dateEl.textContent = S.today.toLocaleDateString('en-GB', {
    weekday:'long', day:'numeric', month:'long', year:'numeric'
  });
}

/* ── Nav scroll highlight ───────────────────────────── */
function initNav(){
  const links = document.querySelectorAll('.nav-link');
  const ids   = ['section-dashboard','section-schedule','section-timer'];
  const obs   = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting){
        links.forEach(l => l.classList.remove('active'));
        const a = document.querySelector(`.nav-link[href="#${e.target.id}"]`);
        if (a) a.classList.add('active');
      }
    });
  }, { rootMargin: '-56px 0px -60% 0px', threshold: 0 });
  ids.forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el); });
}

/* ── Calendar ───────────────────────────────────────── */
function renderCal(){
  const { viewY:y, viewM:m } = S;
  document.getElementById('month-label').textContent = `${MONTHS[m]} ${y}`;

  const first = new Date(y, m, 1).getDay();
  const off   = first === 0 ? 6 : first - 1;
  const days  = new Date(y, m+1, 0).getDate();
  const grid  = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  for (let i = 0; i < off; i++){
    const b = document.createElement('button');
    b.className = 'cal-day empty'; b.disabled = true;
    grid.appendChild(b);
  }
  for (let d = 1; d <= days; d++){
    const dstr = ds(y, m, d);
    const btn  = document.createElement('button');
    btn.className    = 'cal-day';
    btn.textContent  = d;
    btn.setAttribute('aria-label', `${d} ${MONTHS[m]} ${y}`);
    btn.dataset.date = dstr;
    if (isToday(y, m, d))           btn.classList.add('today');
    if (dstr === S.selDate)          btn.classList.add('selected');
    if ((S.tasks[dstr]||[]).length)  btn.classList.add('has-tasks');
    btn.addEventListener('click', () => selectDate(dstr));
    grid.appendChild(btn);
  }
}

function selectDate(dstr){
  S.selDate = dstr;
  renderCal();
  renderTasks();
  const sec = document.getElementById('section-schedule');
  if (sec) sec.scrollIntoView({ behavior:'smooth', block:'start' });
  setTimeout(() => { const inp = document.getElementById('task-input'); if (inp) inp.focus(); }, 500);
}

/* ── Tasks ──────────────────────────────────────────── */
function renderTasks(){
  const dstr  = S.selDate;
  const hdr   = document.getElementById('task-date-heading');
  const cnt   = document.getElementById('task-count');
  const empty = document.getElementById('empty-state');
  const list  = document.getElementById('task-list');
  const form  = document.getElementById('add-task-form');
  if (!hdr) return;

  if (!dstr){
    hdr.textContent = 'Select a date';
    cnt.textContent = '';
    empty.style.display = 'flex'; list.style.display = 'none'; form.style.display = 'none';
    // hide copy button when no date selected
    const cw = document.getElementById('copy-menu-wrap');
    if (cw) cw.style.display = 'none';
    return;
  }

  // show copy button when date is selected
  const cw = document.getElementById('copy-menu-wrap');
  if (cw) cw.style.display = 'flex';

  const tasks = S.tasks[dstr] || [];
  const done  = tasks.filter(t => t.done).length;

  hdr.textContent = fmtDateShort(dstr);
  cnt.textContent = tasks.length ? `${tasks.length} task${tasks.length > 1 ? 's' : ''}` : '';
  empty.style.display = tasks.length ? 'none' : 'flex';
  list.style.display  = tasks.length ? 'flex'  : 'none';
  form.style.display  = 'flex';

  list.innerHTML = '';
  tasks.forEach(t => {
    const li = document.createElement('li');
    li.className = `task-item${t.done ? ' done' : ''}`;

    // Circle checkbox
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'task-cb'; cb.checked = t.done;
    cb.addEventListener('change', () => toggleTask(dstr, t.id));

    // Body
    const body = document.createElement('div');
    body.className = 'task-body';

    const name = document.createElement('div');
    name.className = 'task-name'; name.textContent = t.text;

    const meta = document.createElement('div');
    meta.className = 'task-meta';
    const cat = document.createElement('span'); cat.textContent = t.category || 'other';
    const dot = document.createElement('span'); dot.className = 'task-meta-dot'; dot.textContent = '·';
    const sub = document.createElement('span'); sub.textContent = t.subcategory || 'Task';
    meta.append(cat, dot, sub);
    body.append(name, meta);

    // Right side
    const right = document.createElement('div');
    right.className = 'task-right';

    if (t.time){
      const timeEl = document.createElement('span');
      timeEl.className = 'task-time'; timeEl.textContent = t.time;
      right.appendChild(timeEl);
    }

    const prio = document.createElement('span');
    prio.className = `task-priority ${t.priority || 'medium'}`;
    prio.textContent = t.priority ? (t.priority.charAt(0).toUpperCase() + t.priority.slice(1)) : 'Medium';
    right.appendChild(prio);

    const menuBtn = document.createElement('button');
    menuBtn.className = 'task-menu-btn'; menuBtn.setAttribute('aria-label', 'Delete task');
    menuBtn.textContent = '×';
    menuBtn.addEventListener('click', () => delTask(dstr, t.id));
    right.appendChild(menuBtn);

    li.append(cb, body, right);
    list.appendChild(li);
  });
}

function addTask(text, dstr, cat = 'other', priority = 'medium'){
  if (!text.trim() || !dstr) return;
  (S.tasks[dstr] = S.tasks[dstr] || []).push({
    id: `t-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
    text: text.trim(), done: false,
    category: cat, subcategory: cat,
    priority, createdAt: Date.now(),
  });
  saveAll(); renderCal(); renderTasks(); updateStreaks(dstr); beep('start');
}

function toggleTask(dstr, id){
  S.tasks[dstr] = (S.tasks[dstr] || []).map(t => t.id === id ? {...t, done: !t.done} : t);
  const justDone = S.tasks[dstr].find(t => t.id === id)?.done;
  if (justDone) beep('check');
  saveAll(); renderCal(); renderTasks(); updateStreaks(dstr);
  if (S.tasks[dstr].length && S.tasks[dstr].every(t => t.done))
    showToast(`✓ All tasks done for ${fmtDate(dstr).split(',')[0]}!`);
}

function delTask(dstr, id){
  S.tasks[dstr] = (S.tasks[dstr] || []).filter(t => t.id !== id);
  if (!S.tasks[dstr].length) delete S.tasks[dstr];
  saveAll(); renderCal(); renderTasks();
}

/* ── Streaks ────────────────────────────────────────── */
function updateStreaks(dstr){
  const sk = S.streaks, td = todayStr();
  if (dstr !== td){ renderStreaks(); return; }
  const hasAct = !!(S.tasks[td]?.length || S.activity[td]);
  if (!hasAct){ renderStreaks(); return; }
  const wd = weekDates();
  sk.week = wd.map(d => !!(S.tasks[d]?.length || S.activity[d]) ? 1 : 0);
  if (sk.lastDay !== td){
    const yest = new Date(S.today); yest.setDate(yest.getDate() - 1);
    const yd = ds(yest.getFullYear(), yest.getMonth(), yest.getDate());
    if (sk.lastDay === yd){ sk.cur++; sk.active++; }
    else { sk.cur = 1; sk.active = 1; }
    sk.best = Math.max(sk.best, sk.cur); sk.lastDay = td;
    lsSet('dk-streaks', sk);
  }
  renderStreaks();
}

function renderStreaks(){
  const sk = S.streaks;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('streak-current', sk.cur); set('streak-goal', sk.goal);
  set('streak-active', sk.active); set('streak-best', sk.best);

  const wrap = document.getElementById('streak-week');
  if (!wrap) return;
  wrap.innerHTML = '';
  DAYS.forEach((lbl, i) => {
    const col = document.createElement('div'); col.className = 'sw-col';
    const dot = document.createElement('div'); dot.className = 'sw-dot' + (sk.week[i] ? ' lit' : '');
    dot.textContent = sk.week[i] ? '🔥' : '';
    const sp = document.createElement('span'); sp.className = 'sw-lbl'; sp.textContent = lbl;
    col.append(dot, sp); wrap.appendChild(col);
  });
}

/* ── Activity ───────────────────────────────────────── */
function logActivity(label, secs){
  if (secs < 5) return;
  const td = todayStr();
  const day = (S.activity[td] = S.activity[td] || {});
  day[label || 'Focus'] = (day[label || 'Focus'] || 0) + secs;
  lsSet('dk-activity', S.activity);
  renderActivity(); updateStreaks(td);
}

function logPeak(secs){
  if (secs < 30) return;
  const td = todayStr(), hr = new Date().getHours();
  if (!HRS.includes(hr)) return;
  const day = (S.peak[td] = S.peak[td] || {});
  day[hr] = (day[hr] || 0) + Math.round(secs / 60);
  lsSet('dk-peak', S.peak);
  renderHeatmap();
}

function renderActivity(){
  const td   = todayStr(), data = S.activity[td] || {};
  const wrap = document.getElementById('activity-bars');
  const totEl= document.getElementById('activity-total');
  if (!wrap) return;
  wrap.innerHTML = '';

  const entries = Object.entries(data);
  if (!entries.length){
    wrap.innerHTML = '<p class="nil-hint">No focus sessions yet today.</p>';
    if (totEl) totEl.textContent = '0h 0m';
    return;
  }
  const maxS = Math.max(...entries.map(([,s]) => s));
  let total = 0;
  entries.forEach(([lbl, secs]) => {
    total += secs;
    const pct = maxS > 0 ? (secs / maxS) * 100 : 0;
    const row = document.createElement('div'); row.className = 'act-row';
    row.innerHTML = `
      <span class="act-lbl" title="${lbl}">${lbl.slice(0,6)}</span>
      <div class="act-track"><div class="act-fill" style="width:${pct}%"></div></div>
      <span class="act-time">${fmtSecs(secs)}</span>`;
    wrap.appendChild(row);
  });
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60);
  if (totEl) totEl.textContent = `${h}h ${m}m`;
}

/* ── Heatmap ────────────────────────────────────────── */
function renderHeatmap(){
  const grid = document.getElementById('heatmap-grid');
  if (!grid) return;
  grid.innerHTML = '';
  weekDates().forEach((dstr, di) => {
    const lbl = document.createElement('div'); lbl.className = 'hm-dlbl'; lbl.textContent = DAYS[di];
    grid.appendChild(lbl);
    const day = S.peak[dstr] || {};
    const mx  = Math.max(1, ...Object.values(day));
    HRS.forEach(hr => {
      const cell = document.createElement('div'); cell.className = 'hm-cell';
      const mins = day[hr] || 0;
      if (mins){ const r = mins/mx; cell.classList.add(r>.75?'h4':r>.5?'h3':r>.25?'h2':'h1'); cell.title=`${hr}:00 — ${mins}m`; }
      grid.appendChild(cell);
    });
  });
}

/* ── Milestones ─────────────────────────────────────── */
function renderMiles(){
  const list = document.getElementById('milestone-list');
  if (!list) return;
  list.innerHTML = '';
  if (!S.miles.length){
    list.innerHTML = '<p class="nil-hint">No milestones yet.<br>Create one to get started.</p>';
    return;
  }
  S.miles.forEach(ms => {
    const pct  = ms.total > 0 ? Math.min(100, (ms.done / ms.total) * 100) : 0;
    const card = document.createElement('div');
    card.className = `ms-card${ms.completed ? ' done' : ''}`;
    card.innerHTML = `
      <div class="ms-name">${ms.title}</div>
      <div class="ms-bar-row">
        <div class="ms-bar-bg"><div class="ms-bar-fg" style="width:${pct}%"></div></div>
        <span class="ms-bar-txt">${ms.completed ? '✓ Done' : `${ms.done}/${ms.total}`}</span>
      </div>
      <div class="ms-btns">
        ${!ms.completed ? `
          <button class="ms-btn" data-id="${ms.id}" data-act="inc">+1</button>
          <button class="ms-btn mark-done" data-id="${ms.id}" data-act="complete">Complete</button>
        ` : ''}
        <button class="ms-btn" data-id="${ms.id}" data-act="del">Delete</button>
      </div>`;
    list.appendChild(card);
  });
  list.querySelectorAll('[data-act]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { id, act } = btn.dataset, ms = S.miles.find(m => m.id === id);
      if (act === 'inc' && ms && ms.done < ms.total){
        ms.done++; beep('check');
        if (ms.done >= ms.total){ ms.completed = true; showToast(`🎉 "${ms.title}" complete!`); beep('done'); }
      } else if (act === 'complete' && ms){
        ms.completed = true; ms.done = ms.total; beep('done'); showToast(`🎉 "${ms.title}" complete!`);
      } else if (act === 'del'){
        S.miles = S.miles.filter(m => m.id !== id);
      }
      lsSet('dk-miles', S.miles); renderMiles();
    });
  });
}

/* ── Timer ──────────────────────────────────────────── */
function timerSetMode(mode){
  if (S.timer.running) timerPause();
  S.timer.mode = mode;
  const mins = mode === 'custom' ? S.timer.custMins : MODES[mode].mins;
  document.getElementById('custom-duration').style.display = mode === 'custom' ? 'block' : 'none';
  S.timer.total = mins * 60; S.timer.left = mins * 60;
  renderTimer();
}

function timerStart(){
  if (S.timer.running) return;
  S.timer.running  = true; S.timer.startTs = Date.now();
  S.timer.taskName = (document.getElementById('timer-task-name').value.trim()) || 'Focus';
  const pb = document.getElementById('timer-play');
  pb.textContent = '⏸'; pb.classList.add('running');
  document.getElementById('timer-digits').classList.add('ticking');
  beep('start');
  S.timer.iv = setInterval(() => {
    S.timer.left--;
    if (S.timer.left % 60 === 0 && S.timer.left > 0) beep('tick');
    if (S.timer.left <= 0) timerComplete(); else renderTimer();
  }, 1000);
}

function timerPause(){
  if (!S.timer.running) return;
  clearInterval(S.timer.iv); S.timer.running = false;
  const e = Math.round((Date.now() - S.timer.startTs) / 1000);
  logActivity(S.timer.taskName, e); logPeak(e);
  const pb = document.getElementById('timer-play');
  pb.textContent = '▶'; pb.classList.remove('running');
  document.getElementById('timer-digits').classList.remove('ticking');
}

function timerStop(){
  if (S.timer.running) timerPause(); else clearInterval(S.timer.iv);
  S.timer.running = false;
}

function timerReset(){
  timerStop();
  const mins = S.timer.mode === 'custom' ? S.timer.custMins : MODES[S.timer.mode].mins;
  S.timer.total = mins * 60; S.timer.left = mins * 60;
  const pb = document.getElementById('timer-play');
  pb.textContent = '▶'; pb.classList.remove('running');
  document.getElementById('timer-digits').classList.remove('ticking');
  renderTimer();
}

function timerSkip(){
  timerStop();
  const next = MODES[S.timer.mode]?.next || 'pomodoro';
  document.querySelectorAll('.mode-chip').forEach(b => b.classList.toggle('active', b.dataset.mode === next));
  timerSetMode(next); showToast(`Skipped → ${MODES[next].label}`);
}

function timerComplete(){
  clearInterval(S.timer.iv); S.timer.running = false;
  const e = Math.round((Date.now() - S.timer.startTs) / 1000);
  logActivity(S.timer.taskName, e); logPeak(e);
  const pb = document.getElementById('timer-play');
  pb.textContent = '▶'; pb.classList.remove('running');
  document.getElementById('timer-digits').classList.remove('ticking');
  document.getElementById('ring-progress').classList.add('ring-done');
  setTimeout(() => document.getElementById('ring-progress').classList.remove('ring-done'), 2100);

  if (S.timer.mode !== 'pomodoro'){
    beep('brk'); const msg = '☕ Break over. Back to work.';
    showToast(msg, 5000); pushNotif('Dali Tasks', msg);
    setTimeout(() => {
      document.querySelectorAll('.mode-chip').forEach(b => b.classList.toggle('active', b.dataset.mode === 'pomodoro'));
      timerSetMode('pomodoro');
    }, 1500);
  } else {
    S.timer.sessions++; beep('done');
    const msg = '✓ Focus session done! Take a break.';
    showToast(msg, 5000); pushNotif('Dali Tasks', msg);
    const next = S.timer.sessions % CYCLE === 0 ? 'long' : 'short';
    setTimeout(() => {
      document.querySelectorAll('.mode-chip').forEach(b => b.classList.toggle('active', b.dataset.mode === next));
      timerSetMode(next);
    }, 1500);
  }
  S.timer.left = 0; renderTimer(); renderDots();
}

function renderTimer(){
  const { left, total, mode, sessions } = S.timer;
  const m = Math.floor(left / 60), s = left % 60;
  document.getElementById('timer-digits').textContent =
    `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  document.getElementById('timer-mode-display').textContent = MODES[mode]?.label || 'FOCUS';
  document.getElementById('timer-session-count').textContent = `Session ${sessions + 1}`;

  const ring = document.getElementById('ring-progress');
  ring.style.strokeDashoffset = CIRC * (total > 0 ? left / total : 0);
  ring.classList.toggle('break-mode', mode === 'short' || mode === 'long');

  document.getElementById('timer-progress-bar').style.width =
    `${total > 0 ? ((total - left) / total) * 100 : 0}%`;
  renderDots();
}

function renderDots(){
  const row = document.getElementById('timer-sessions-row');
  if (!row) return;
  row.innerHTML = '';
  for (let i = 0; i < CYCLE; i++){
    const d = document.createElement('div'); d.className = 'sdot';
    if (i < S.timer.sessions % CYCLE) d.classList.add('done');
    else if (i === S.timer.sessions % CYCLE && S.timer.running) d.classList.add('current');
    row.appendChild(d);
  }
}

/* ── Modals ─────────────────────────────────────────── */
function openTaskModal(prefill){
  const d = document.getElementById('modal-task-date');
  d.value = prefill || todayStr();
  document.getElementById('modal-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('modal-task-text').focus(), 60);
}
function closeTaskModal(){
  document.getElementById('modal-overlay').style.display = 'none';
  document.getElementById('modal-form').reset();
}
function openMileModal(){
  document.getElementById('milestone-modal-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('ms-title').focus(), 60);
}
function closeMileModal(){
  document.getElementById('milestone-modal-overlay').style.display = 'none';
  document.getElementById('milestone-form').reset();
}

/* ── Copy tasks ─────────────────────────────────────── */

/**
 * Copy all tasks from S.selDate to targetDate.
 * Skips exact duplicates (same text already exists on target).
 * Resets `done` to false on the copies (fresh start for the new day).
 */
function copyTasksTo(targetDate){
  if (!S.selDate || !targetDate) return;
  if (S.selDate === targetDate){
    showToast('⚠ Already on this day.'); return;
  }

  const src = S.tasks[S.selDate] || [];
  if (!src.length){ showToast('Nothing to copy — no tasks on this day.'); return; }

  const dest = S.tasks[targetDate] || [];
  const destTexts = new Set(dest.map(t => t.text.toLowerCase()));

  let added = 0;
  src.forEach(t => {
    if (!destTexts.has(t.text.toLowerCase())){
      dest.push({
        id:          `t-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
        text:        t.text,
        done:        false,            // fresh copy — not done
        category:    t.category,
        subcategory: t.subcategory,
        priority:    t.priority,
        time:        t.time || null,
        createdAt:   Date.now(),
      });
      added++;
    }
  });

  if (!added){ showToast('All tasks already exist on that day.'); return; }

  S.tasks[targetDate] = dest;
  saveAll();
  renderCal();

  // If we copied to the currently viewed date, refresh the panel
  if (S.selDate === targetDate) renderTasks();

  const [y,m,d] = targetDate.split('-').map(Number);
  const label = new Date(y, m-1, d).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
  showToast(`✓ ${added} task${added > 1 ? 's' : ''} copied to ${label}`);
}

function offsetDate(dstr, days){
  const [y,m,d] = dstr.split('-').map(Number);
  const date = new Date(y, m-1, d);
  date.setDate(date.getDate() + days);
  return ds(date.getFullYear(), date.getMonth(), date.getDate());
}

function initCopyMenu(){
  const wrap    = document.getElementById('copy-menu-wrap');
  const trigger = document.getElementById('copy-menu-btn');
  const dropdown= document.getElementById('copy-dropdown');
  if (!trigger || !dropdown) return;

  // Toggle open/close
  trigger.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains('open');
    dropdown.classList.toggle('open', !isOpen);
    trigger.setAttribute('aria-expanded', String(!isOpen));
  });

  // Close when clicking outside
  document.addEventListener('click', () => {
    dropdown.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
  });
  dropdown.addEventListener('click', e => e.stopPropagation());

  // Today
  document.getElementById('copy-today').addEventListener('click', () => {
    dropdown.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    copyTasksTo(todayStr());
  });

  // Tomorrow
  document.getElementById('copy-tomorrow').addEventListener('click', () => {
    dropdown.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    if (!S.selDate) return;
    copyTasksTo(offsetDate(S.selDate, 1));
  });

  // Yesterday
  document.getElementById('copy-yesterday').addEventListener('click', () => {
    dropdown.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    if (!S.selDate) return;
    copyTasksTo(offsetDate(S.selDate, -1));
  });

  // Pick a date — trigger native date input
  const picker = document.getElementById('copy-date-picker');
  document.getElementById('copy-pick').addEventListener('click', () => {
    dropdown.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    picker.value = S.selDate || todayStr();
    picker.showPicker ? picker.showPicker() : picker.click();
  });
  picker.addEventListener('change', () => {
    if (picker.value) copyTasksTo(picker.value);
    picker.value = '';
  });

  // Hide the whole copy button area when no date is selected
  // (handled in renderTasks by toggling visibility)
}

/* ── Wire events ────────────────────────────────────── */
function wireEvents(){
  document.getElementById('prev-month').addEventListener('click', () => {
    if (--S.viewM < 0){ S.viewM = 11; S.viewY--; } renderCal();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    if (++S.viewM > 11){ S.viewM = 0; S.viewY++; } renderCal();
  });

  document.getElementById('add-task-form').addEventListener('submit', e => {
    e.preventDefault();
    const inp = document.getElementById('task-input');
    addTask(inp.value, S.selDate); inp.value = ''; inp.focus();
  });

  document.getElementById('btn-new-task').addEventListener('click', () => openTaskModal(S.selDate));

  document.getElementById('modal-close').addEventListener('click', closeTaskModal);
  document.getElementById('modal-cancel').addEventListener('click', closeTaskModal);
  document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeTaskModal(); });
  document.getElementById('modal-form').addEventListener('submit', e => {
    e.preventDefault();
    const txt  = document.getElementById('modal-task-text').value;
    const dat  = document.getElementById('modal-task-date').value;
    const cat  = document.getElementById('modal-task-category').value;
    const prio = document.getElementById('modal-task-priority').value;
    if (txt && dat){ addTask(txt, dat, cat, prio); closeTaskModal(); showToast('✓ Task added'); }
  });

  document.getElementById('add-milestone-btn').addEventListener('click', openMileModal);
  document.getElementById('milestone-modal-close').addEventListener('click', closeMileModal);
  document.getElementById('milestone-cancel').addEventListener('click', closeMileModal);
  document.getElementById('milestone-modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeMileModal(); });
  document.getElementById('milestone-form').addEventListener('submit', e => {
    e.preventDefault();
    const title = document.getElementById('ms-title').value.trim();
    const total = parseInt(document.getElementById('ms-total').value, 10);
    if (!title || !total) return;
    S.miles.push({ id:`ms-${Date.now()}`, title, total, done:0, completed:false });
    lsSet('dk-miles', S.miles); renderMiles(); closeMileModal(); showToast('✓ Milestone created');
  });

  document.querySelectorAll('.mode-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); timerSetMode(btn.dataset.mode);
    });
  });

  document.querySelectorAll('.preset-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mins = parseInt(btn.dataset.minutes, 10);
      S.timer.custMins = mins; S.timer.total = mins * 60; S.timer.left = mins * 60;
      if (S.timer.running) timerStop();
      document.querySelectorAll('.mode-chip').forEach(b => b.classList.toggle('active', b.dataset.mode === 'custom'));
      S.timer.mode = 'custom';
      document.getElementById('custom-duration').style.display = 'block';
      document.getElementById('custom-minutes').value = mins;
      renderTimer(); showToast(`⏱ ${mins} min — ${btn.dataset.label}`);
    });
  });

  document.getElementById('btn-set-custom').addEventListener('click', () => {
    const mins = parseInt(document.getElementById('custom-minutes').value, 10);
    if (isNaN(mins) || mins < 1) return;
    S.timer.custMins = mins; S.timer.total = mins * 60; S.timer.left = mins * 60;
    if (S.timer.running) timerStop();
    renderTimer(); showToast(`⏱ Custom: ${mins} min`);
  });

  document.getElementById('timer-play').addEventListener('click',  () => S.timer.running ? timerPause() : timerStart());
  document.getElementById('timer-reset').addEventListener('click', timerReset);
  document.getElementById('timer-skip').addEventListener('click',  timerSkip);

  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){
      e.preventDefault(); S.timer.running ? timerPause() : timerStart();
    }
  });
}

/* ── Init ───────────────────────────────────────────── */
function init(){
  askNotif();
  renderHero();
  initNav();
  renderCal();
  renderTasks();
  renderActivity();
  renderHeatmap();
  renderStreaks();
  renderMiles();

  const ring = document.getElementById('ring-progress');
  ring.style.strokeDasharray  = CIRC;
  ring.style.strokeDashoffset = CIRC;
  renderTimer();
  initCopyMenu();
  wireEvents();
}

document.addEventListener('DOMContentLoaded', init);
