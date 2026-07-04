// ════════════════════════════════════════════════════════════
//  STATE & STORAGE
// ════════════════════════════════════════════════════════════

let state = {
  rounds: [],
  customCourses: [],
  courseOverrides: {},  // preloaded-course edits, keyed by course id
  recordStep: 1,
  rec: null,   // round being recorded
};

async function loadState() {
  try {
    const [rounds, courses] = await Promise.all([
      fetch('/api/rounds').then(r => r.json()),
      fetch('/api/courses').then(r => r.json()),
    ]);
    state.rounds          = rounds || [];
    state.customCourses   = (courses && courses.customCourses)   || [];
    state.courseOverrides = (courses && courses.courseOverrides) || {};
  } catch(e) { /* server unreachable — start fresh */ }
}

function saveState() {
  fetch('/api/rounds',  { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(state.rounds) });
  fetch('/api/courses', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ courses: allCourses(), customCourses: state.customCourses, courseOverrides: state.courseOverrides }) });
}

function isPreloadedCourse(id) {
  return COURSES.some(c => c.id === id);
}

function allCourses() {
  const preloaded = COURSES.map(c => state.courseOverrides[c.id] || c);
  const custom    = state.customCourses.map(c => state.courseOverrides[c.id] || c);
  return [...preloaded, ...custom];
}

function getCourse(id) {
  return allCourses().find(c => c.id === id);
}

// ════════════════════════════════════════════════════════════
//  ROUTER
// ════════════════════════════════════════════════════════════

function navigateTo(view) {
  destroyCharts();
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.querySelectorAll(`[data-view="${view}"]`).forEach(n => n.classList.add('active'));
  renderView(view);
}

function renderView(v) {
  const m = {
    dashboard: renderDashboard,
    record:    renderRecord,
    history:   renderHistory,
    courses:   renderCourses,
    settings:  renderSettings,
  };
  m[v] && m[v]();
}

// ════════════════════════════════════════════════════════════
//  CHARTS
// ════════════════════════════════════════════════════════════

const _charts = {};

function destroyCharts() {
  Object.values(_charts).forEach(c => c && c.destroy());
  Object.keys(_charts).forEach(k => delete _charts[k]);
}

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 400 },
  plugins: { legend: { display: false }, tooltip: {
    backgroundColor: '#1a2e1f',
    titleColor: '#94a3b8',
    bodyColor: '#e2e8f0',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    padding: 10,
    cornerRadius: 8,
  }},
  scales: {
    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#475569', font: { size: 11 } } },
    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#475569', font: { size: 11 } } },
  },
};

function mkLineChart(canvasId, labels, data, color, unit = '') {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  _charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: color,
        backgroundColor: color.replace(')', ', 0.08)').replace('rgb', 'rgba'),
        borderWidth: 2,
        pointBackgroundColor: color,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.35,
        fill: true,
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: { ...CHART_DEFAULTS.plugins, tooltip: {
        ...CHART_DEFAULTS.plugins.tooltip,
        callbacks: { label: ctx => `${ctx.parsed.y}${unit}` },
      }},
    },
  });
}

function mkBarChart(canvasId, labels, data, color) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  _charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data, backgroundColor: color, borderRadius: 5, borderSkipped: false }]
    },
    options: {
      ...CHART_DEFAULTS,
      indexAxis: 'y',
      scales: {
        x: CHART_DEFAULTS.scales.x,
        y: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 12 } } },
      },
    },
  });
}

// ════════════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════════════

function renderDashboard() {
  const el = document.getElementById('view-dashboard');
  const rounds = state.rounds;
  const hcp = calcHandicapIndex(rounds);
  const prevHcp = rounds.length >= 4 ? calcHandicapIndex(rounds.slice(0, -1)) : null;

  const totalRounds = rounds.length;
  const avgScore = rounds.length
    ? (rounds.reduce((s, r) => s + r.totalScore, 0) / rounds.length).toFixed(1)
    : '—';
  const bestRound = rounds.length
    ? rounds.reduce((b, r) => r.totalScore < b.totalScore ? r : b, rounds[0])
    : null;

  const hcpDisplay = hcp !== null
    ? `<div class="dash-hcp-num">${hcp}</div>`
    : `<div class="dash-hcp-num pending">${totalRounds < 3 ? `${totalRounds}/3` : '—'}</div>`;

  const hcpSub = hcp !== null
    ? `Based on ${Math.min(totalRounds, 20)} round${totalRounds !== 1 ? 's' : ''}`
    : `${Math.max(0, 3 - totalRounds)} more round${(3 - totalRounds) !== 1 ? 's' : ''} needed to establish index`;

  let trendHtml = '';
  if (hcp !== null && prevHcp !== null) {
    const delta = +(hcp - prevHcp).toFixed(1);
    if (delta < 0) trendHtml = `<div class="dash-trend dash-trend-down">▼ ${Math.abs(delta)} improvement</div>`;
    else if (delta > 0) trendHtml = `<div class="dash-trend dash-trend-up">▲ ${delta} increase</div>`;
    else trendHtml = `<div class="dash-trend">Unchanged from last round</div>`;
  }

  const recentRounds = [...rounds].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  el.innerHTML = `
    <div class="dash-page-header">
      <div class="dash-logo">⛳ Linkslog</div>
      <div class="dash-avatar">M</div>
    </div>

    <div class="dash-hero">
      <div class="dash-hcp-label">Handicap index</div>
      ${hcpDisplay}
      <div class="dash-hcp-sub">${hcpSub}</div>
      ${trendHtml}
    </div>

    <div class="dash-stats-row">
      <div class="dash-stat-card">
        <div class="dash-stat-val">${totalRounds}</div>
        <div class="dash-stat-lbl">Rounds</div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-val">${avgScore}</div>
        <div class="dash-stat-lbl">Avg score</div>
      </div>
      <div class="dash-stat-card">
        <div class="dash-stat-val">${bestRound ? bestRound.totalScore : '—'}</div>
        <div class="dash-stat-lbl">Best score</div>
      </div>
    </div>

    ${rounds.length === 0 ? `
      <div class="empty-state">
        <div class="empty-icon">⛳</div>
        <h3>No rounds yet</h3>
        <p>Record your first round to see your handicap and stats here.</p>
        <button class="btn btn-primary" onclick="navigateTo('record')">Record a Round</button>
      </div>
    ` : `
      <div class="dash-section-bar">
        <div class="dash-section-title">Recent rounds</div>
        <button class="dash-see-all btn-ghost" style="font-size:12px;padding:4px 10px;border-radius:20px" onclick="navigateTo('history')">See all</button>
      </div>
      <div class="dash-recent-list">
        ${recentRounds.map(r => recentRoundRow(r)).join('')}
      </div>

      <div class="dash-section-bar" style="margin-top:28px">
        <div class="dash-section-title">Trends</div>
      </div>
      <div class="chart-grid">
        <div class="card chart-card">
          <div class="chart-title">Handicap index</div>
          <div class="chart-wrap"><canvas id="chart-hcp"></canvas></div>
        </div>
        <div class="card chart-card">
          <div class="chart-title">Score by course</div>
          <div class="chart-wrap"><canvas id="chart-score"></canvas></div>
        </div>
        <div class="card chart-card">
          <div class="chart-title">Fairways hit %</div>
          <div class="chart-wrap"><canvas id="chart-fir"></canvas></div>
        </div>
        <div class="card chart-card">
          <div class="chart-title">Putts per round</div>
          <div class="chart-wrap"><canvas id="chart-putts"></canvas></div>
        </div>
      </div>
    `}
  `;

  if (!rounds.length) return;

  // Chart 1: Handicap trend
  const hcpDates = rounds
    .map((r, i) => ({ date: r.date, hcp: calcHandicapIndex(rounds.slice(0, i + 1)) }))
    .filter(x => x.hcp !== null);
  mkLineChart('chart-hcp',
    hcpDates.map(x => fmtDate(x.date).slice(0, 6)),
    hcpDates.map(x => x.hcp),
    'rgb(245,158,11)'
  );

  // Chart 2: Avg score by course (bar)
  const courseScores = {};
  rounds.forEach(r => {
    if (!courseScores[r.courseName]) courseScores[r.courseName] = [];
    courseScores[r.courseName].push(r.totalScore);
  });
  const cNames = Object.keys(courseScores);
  const cAvgs  = cNames.map(n => +(courseScores[n].reduce((a,b)=>a+b,0)/courseScores[n].length).toFixed(1));
  mkBarChart('chart-score', cNames.map(n => n.split(' ')[0]), cAvgs, 'rgba(34,197,94,0.7)');

  // Chart 3: FIR %
  const firData = rounds.filter(r => r.firPct !== null)
    .map(r => ({ d: fmtDate(r.date).slice(0,6), v: r.firPct }));
  mkLineChart('chart-fir', firData.map(x => x.d), firData.map(x => x.v), 'rgb(59,130,246)', '%');

  // Chart 4: Putts
  mkLineChart('chart-putts',
    rounds.map(r => fmtDate(r.date).slice(0, 6)),
    rounds.map(r => r.totalPutts),
    'rgb(168,85,247)'
  );
}

function recentRoundRow(r) {
  const vpClass = r.vsPar > 0 ? 'vspar-over' : r.vsPar < 0 ? 'vspar-under' : 'vspar-even';
  return `
    <div class="recent-round-row" onclick="openRoundModal('${r.id}')">
      <div class="rrr-left">
        <div class="rrr-course">${r.courseName}</div>
        <div class="rrr-meta">${fmtDate(r.date)} · ${r.teeName} tees</div>
      </div>
      <div class="rrr-right">
        <div class="rrr-score">${r.totalScore}</div>
        <div class="rrr-vspar ${vpClass}">${fmtVsPar(r.vsPar)}</div>
      </div>
    </div>
  `;
}

// ════════════════════════════════════════════════════════════
//  RECORD ROUND
// ════════════════════════════════════════════════════════════

function renderRecord() {
  const el = document.getElementById('view-record');
  if (!state.rec) {
    state.recordStep = 1;
    state.rec = null;
  }
  switch (state.recordStep) {
    case 1: renderRecordSetup(el); break;
    case 2: renderRecordScorecard(el); break;
    case 3: renderRecordReview(el); break;
  }
}

function stepDots(active) {
  return `<div class="step-indicator">
    ${[1,2,3].map(i => `<div class="step-dot ${i < active ? 'done' : i === active ? 'active' : ''}"></div>`).join('')}
  </div>`;
}

// ── Step 1: Setup ────────────────────────────────────────────
function renderRecordSetup(el) {
  const courses = allCourses();
  const today = new Date().toISOString().slice(0, 10);

  el.innerHTML = `
    <div class="view-title">Record Round</div>
    ${stepDots(1)}
    <div class="card" style="max-width:520px">
      <div class="setup-grid">
        <div class="field full">
          <label>Course</label>
          <select class="input" id="r-course">
            ${courses.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Tee Box</label>
          <select class="input" id="r-tee"></select>
        </div>
        <div class="field">
          <label>Date</label>
          <input class="input" type="date" id="r-date" value="${today}">
        </div>
        <div class="field full">
          <label>Round Type</label>
          <div class="round-type-group" id="r-type-group">
            <button class="round-type-btn active" data-type="full">Full 18</button>
            <button class="round-type-btn" data-type="front9">Front 9</button>
            <button class="round-type-btn" data-type="back9">Back 9</button>
          </div>
        </div>
      </div>
      <div class="divider"></div>
      <div id="r-tee-info" class="text-sm text-dim mb-16"></div>
      <button class="btn btn-primary btn-lg" onclick="startScorecard()">Start Scorecard →</button>
    </div>
  `;

  populateTees();

  document.getElementById('r-course').addEventListener('change', populateTees);
  document.getElementById('r-tee').addEventListener('change', updateTeeInfo);
  document.querySelectorAll('.round-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.round-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function populateTees() {
  const courseId = document.getElementById('r-course').value;
  const course = getCourse(courseId);
  const sel = document.getElementById('r-tee');
  sel.innerHTML = course.tees.map(t =>
    `<option value="${t.id}">${t.name} — ${t.rating} / ${t.slope}</option>`
  ).join('');
  updateTeeInfo();
}

function updateTeeInfo() {
  const courseId = document.getElementById('r-course').value;
  const teeId    = document.getElementById('r-tee').value;
  const course   = getCourse(courseId);
  const tee      = course.tees.find(t => t.id === teeId);
  const info     = document.getElementById('r-tee-info');
  if (tee && info) {
    const total = tee.yards.reduce((a, b) => a + b, 0);
    info.textContent = `Rating ${tee.rating}  ·  Slope ${tee.slope}  ·  ${total.toLocaleString()} yds`;
  }
}

function startScorecard() {
  const courseId = document.getElementById('r-course').value;
  const teeId    = document.getElementById('r-tee').value;
  const date     = document.getElementById('r-date').value;
  const type     = document.querySelector('.round-type-btn.active').dataset.type;

  const course = getCourse(courseId);
  const tee    = course.tees.find(t => t.id === teeId);

  let holeNums;
  if (type === 'full')   holeNums = Array.from({length:18}, (_,i) => i);
  else if (type === 'front9') holeNums = Array.from({length:9}, (_,i) => i);
  else                   holeNums = Array.from({length:9}, (_,i) => i + 9);

  state.rec = {
    courseId,
    courseName: course.name,
    teeId,
    teeName: tee.name,
    courseRating: tee.rating,
    slope: tee.slope,
    roundType: type,
    date,
    holes: holeNums.map(i => {
      const h = course.holes[i];
      return {
        n: h.n,
        par: h.par,
        si: h.si,
        yards: tee.yards[i],
        score: h.par,
        putts: 2,
        fir: null,
        penalties: 0,
      };
    }),
  };

  state.recordStep = 2;
  renderView('record');
}

// ── Step 2: Scorecard ────────────────────────────────────────
function renderRecordScorecard(el) {
  const rec = state.rec;
  const holes = rec.holes;
  const stats = getRoundStats(holes);
  const vpClass = stats.vsPar > 0 ? 'vspar-over' : stats.vsPar < 0 ? 'vspar-under' : 'vspar-even';

  const front = holes.filter(h => h.n <= 9);
  const back  = holes.filter(h => h.n > 9);

  el.innerHTML = `
    <div class="view-title">Scorecard</div>
    ${stepDots(2)}

    <div class="score-bar">
      <div>
        <span class="score-bar-total">${stats.totalScore}</span>
        <span class="score-bar-meta"> / Par ${stats.totalPar}</span>
      </div>
      <div class="flex-center gap-8">
        <span class="score-bar-vspar ${vpClass}">${fmtVsPar(stats.vsPar)}</span>
        <span class="score-bar-meta">${stats.totalPutts} putts</span>
      </div>
    </div>

    <div class="score-bar-meta mb-16 text-dim text-sm">
      ${rec.courseName} · ${rec.teeName} · ${rec.courseRating}/${rec.slope}
    </div>

    ${front.length ? renderScorecardSection('Front 9', front) : ''}
    ${back.length  ? renderScorecardSection('Back 9',  back)  : ''}

    <div class="record-actions">
      <button class="btn btn-ghost" onclick="state.recordStep=1; renderView('record')">← Back</button>
      <button class="btn btn-primary btn-lg" onclick="goToReview()">Review & Save →</button>
    </div>
  `;

  bindScorecardEvents();
}

function renderScorecardSection(label, holes) {
  return `
    <div class="nine-header">${label}</div>
    <div class="scorecard-wrap">
      <table class="scorecard-table">
        <thead>
          <tr>
            <th>Hole</th>
            <th>Par</th>
            <th>Yds</th>
            <th>Score</th>
            <th>Putts</th>
            <th>FIR</th>
            <th>Pen</th>
          </tr>
        </thead>
        <tbody>
          ${holes.map(h => renderHoleRow(h)).join('')}
          ${renderSubtotalRow(holes)}
        </tbody>
      </table>
    </div>
  `;
}

function renderHoleRow(h) {
  const firHtml = h.par === 3
    ? `<span class="fir-na">N/A</span>`
    : `<div class="fir-group">
        <button class="fir-btn hit ${h.fir === true ? 'active' : ''}" data-hole="${h.n}" data-fir="hit">H</button>
        <button class="fir-btn miss ${h.fir === false ? 'active' : ''}" data-hole="${h.n}" data-fir="miss">M</button>
      </div>`;

  return `
    <tr>
      <td><span class="hole-num">${h.n}</span></td>
      <td><span class="hole-par">${h.par}</span></td>
      <td class="text-muted text-sm">${h.yards}</td>
      <td>
        <div class="stepper" data-hole="${h.n}" data-field="score">
          <button class="stepper-btn" data-action="dec">−</button>
          <span class="stepper-val">${h.score}</span>
          <button class="stepper-btn" data-action="inc">+</button>
        </div>
      </td>
      <td>
        <div class="stepper" data-hole="${h.n}" data-field="putts">
          <button class="stepper-btn" data-action="dec">−</button>
          <span class="stepper-val">${h.putts}</span>
          <button class="stepper-btn" data-action="inc">+</button>
        </div>
      </td>
      <td>${firHtml}</td>
      <td>
        <div class="stepper" data-hole="${h.n}" data-field="penalties">
          <button class="stepper-btn" data-action="dec">−</button>
          <span class="stepper-val">${h.penalties}</span>
          <button class="stepper-btn" data-action="inc">+</button>
        </div>
      </td>
    </tr>
  `;
}

function renderSubtotalRow(holes) {
  const sub = getRoundStats(holes);
  return `
    <tr class="subtotal-row">
      <td>Out/In</td>
      <td>${sub.totalPar}</td>
      <td></td>
      <td>${sub.totalScore}</td>
      <td>${sub.totalPutts}</td>
      <td>${sub.firPct !== null ? sub.firPct + '%' : ''}</td>
      <td>${holes.reduce((s,h) => s + h.penalties, 0)}</td>
    </tr>
  `;
}

function bindScorecardEvents() {
  // Steppers
  document.querySelectorAll('.stepper').forEach(stepper => {
    const holeN  = +stepper.dataset.hole;
    const field  = stepper.dataset.field;
    const valEl  = stepper.querySelector('.stepper-val');

    stepper.querySelectorAll('.stepper-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const hole = state.rec.holes.find(h => h.n === holeN);
        if (!hole) return;
        const inc = btn.dataset.action === 'inc' ? 1 : -1;
        const min = field === 'score' ? 1 : 0;
        hole[field] = Math.max(min, (hole[field] || 0) + inc);
        valEl.textContent = hole[field];
        refreshScoreBar();
      });
    });

    // Tap to edit directly
    valEl.addEventListener('click', () => {
      const hole = state.rec.holes.find(h => h.n === holeN);
      if (!hole) return;
      const input = document.createElement('input');
      input.type = 'number';
      input.value = hole[field];
      input.min   = field === 'score' ? 1 : 0;
      input.style.cssText = 'width:36px;text-align:center;background:transparent;border:none;outline:none;color:var(--text);font:inherit;font-weight:600;font-size:14px';
      valEl.replaceWith(input);
      input.select();
      input.focus();
      const commit = () => {
        const v = parseInt(input.value, 10);
        if (!isNaN(v)) hole[field] = Math.max(field === 'score' ? 1 : 0, v);
        input.replaceWith(valEl);
        valEl.textContent = hole[field];
        refreshScoreBar();
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
    });
  });

  // FIR buttons
  document.querySelectorAll('.fir-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const holeN = +btn.dataset.hole;
      const hole  = state.rec.holes.find(h => h.n === holeN);
      if (!hole) return;
      const isHit = btn.dataset.fir === 'hit';
      if ((isHit && hole.fir === true) || (!isHit && hole.fir === false)) {
        hole.fir = null;
      } else {
        hole.fir = isHit;
      }
      const group = btn.closest('.fir-group');
      group.querySelector('.fir-btn.hit').classList.toggle('active', hole.fir === true);
      group.querySelector('.fir-btn.miss').classList.toggle('active', hole.fir === false);
      refreshScoreBar();
    });
  });

}

function refreshScoreBar() {
  const stats  = getRoundStats(state.rec.holes);
  const vpClass = stats.vsPar > 0 ? 'vspar-over' : stats.vsPar < 0 ? 'vspar-under' : 'vspar-even';
  const totalEl = document.querySelector('.score-bar-total');
  const vsEl    = document.querySelector('.score-bar-vspar');
  const puttEl  = document.querySelector('.score-bar .score-bar-meta');
  if (totalEl) totalEl.textContent = stats.totalScore;
  if (vsEl)    { vsEl.textContent = fmtVsPar(stats.vsPar); vsEl.className = `score-bar-vspar ${vpClass}`; }
  if (puttEl)  puttEl.textContent = `${stats.totalPutts} putts`;

  // Refresh subtotal rows
  const front = state.rec.holes.filter(h => h.n <= 9);
  const back   = state.rec.holes.filter(h => h.n > 9);
  document.querySelectorAll('.subtotal-row').forEach((row, i) => {
    const hs = i === 0 ? front : back;
    if (!hs.length) return;
    const sub = getRoundStats(hs);
    const cells = row.querySelectorAll('td');
    cells[1].textContent = sub.totalPar;
    cells[3].textContent = sub.totalScore;
    cells[4].textContent = sub.totalPutts;
    cells[5].textContent = sub.firPct !== null ? sub.firPct + '%' : '';
    cells[6].textContent = hs.reduce((s, h) => s + h.penalties, 0);
  });
}

function goToReview() {
  state.recordStep = 3;
  renderView('record');
}

// ── Step 3: Review ───────────────────────────────────────────
function renderRecordReview(el) {
  const rec   = state.rec;
  const stats = getRoundStats(rec.holes);
  const isNine = rec.roundType !== 'full';
  const diff  = isNine
    ? calc9HoleDifferential(stats.totalScore, rec.courseRating, rec.slope)
    : calcScoreDifferential(stats.totalScore, rec.courseRating, rec.slope);

  const vpClass = stats.vsPar > 0 ? 'vspar-over' : stats.vsPar < 0 ? 'vspar-under' : 'vspar-even';

  el.innerHTML = `
    <div class="view-title">Review Round</div>
    ${stepDots(3)}

    <div class="card review-card">
      <div class="text-dim text-sm mb-8">${fmtDate(rec.date)} · ${rec.courseName}</div>
      <div class="text-dim text-sm mb-16">${rec.teeName} tees · ${rec.courseRating}/${rec.slope} · ${rec.roundType === 'full' ? '18 holes' : rec.roundType === 'front9' ? 'Front 9' : 'Back 9'}</div>

      <div class="section-title">Score Differential</div>
      <div class="review-diff">${diff}</div>
      <div class="text-dim text-sm mt-4">
        ${isNine ? '9-hole equivalent (doubled)' : '18-hole differential'}
      </div>

      <div class="review-grid mt-16">
        <div class="review-stat">
          <div class="review-stat-val">${stats.totalScore}</div>
          <div class="review-stat-lbl">Total Score</div>
        </div>
        <div class="review-stat">
          <div class="review-stat-val ${vpClass}">${fmtVsPar(stats.vsPar)}</div>
          <div class="review-stat-lbl">vs Par</div>
        </div>
        <div class="review-stat">
          <div class="review-stat-val">${stats.totalPutts}</div>
          <div class="review-stat-lbl">Putts</div>
        </div>
        ${stats.firPct !== null ? `
        <div class="review-stat">
          <div class="review-stat-val">${stats.firPct}%</div>
          <div class="review-stat-lbl">FIR</div>
        </div>` : ''}
      </div>

      ${function() {
        const simRounds = [...state.rounds, { scoreDifferential: diff }];
        const newHcp = calcHandicapIndex(simRounds);
        const curHcp = calcHandicapIndex(state.rounds);
        if (newHcp === null) return '';
        const dir = newHcp < (curHcp || 999) ? '▼' : newHcp > (curHcp || -999) ? '▲' : '—';
        const cls = newHcp < (curHcp || 999) ? 'text-green' : newHcp > (curHcp || -999) ? 'text-red' : 'text-muted';
        return `<div class="divider"></div>
          <div class="text-dim text-sm">New Handicap Index: <span class="${cls} fw-700">${dir} ${newHcp}</span></div>`;
      }()}

      <div class="record-actions">
        <button class="btn btn-ghost" onclick="state.recordStep=2; renderView('record')">← Edit Scores</button>
        <button class="btn btn-gold btn-lg" onclick="saveRound()">Save Round ✓</button>
      </div>
    </div>
  `;
}

function saveRound() {
  const rec   = state.rec;
  const stats = getRoundStats(rec.holes);
  const isNine = rec.roundType !== 'full';
  const diff  = isNine
    ? calc9HoleDifferential(stats.totalScore, rec.courseRating, rec.slope)
    : calcScoreDifferential(stats.totalScore, rec.courseRating, rec.slope);

  const round = {
    id: uid(),
    date:          rec.date,
    courseId:      rec.courseId,
    courseName:    rec.courseName,
    teeId:         rec.teeId,
    teeName:       rec.teeName,
    courseRating:  rec.courseRating,
    slope:         rec.slope,
    roundType:     rec.roundType,
    holes:         rec.holes,
    totalScore:    stats.totalScore,
    totalPar:      stats.totalPar,
    vsPar:         stats.vsPar,
    totalPutts:    stats.totalPutts,
    firHit:        stats.firHit,
    firTotal:      stats.firTotal,
    firPct:        stats.firPct,
    scoreDifferential: diff,
  };

  state.rounds.push(round);
  state.rounds.sort((a, b) => a.date.localeCompare(b.date));
  saveState();

  state.rec = null;
  state.recordStep = 1;
  navigateTo('dashboard');
}

// ════════════════════════════════════════════════════════════
//  HISTORY
// ════════════════════════════════════════════════════════════

function renderHistory() {
  const el = document.getElementById('view-history');
  const rounds = [...state.rounds].sort((a, b) => b.date.localeCompare(a.date));

  if (!rounds.length) {
    el.innerHTML = `
      <div class="page-header">
        <div class="page-title">History</div>
      </div>
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h3>No rounds recorded</h3>
        <p>Your round history will appear here.</p>
        <button class="btn btn-primary" onclick="navigateTo('record')">Record a Round</button>
      </div>`;
    return;
  }

  // Group by Month Year
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const groups = {};
  rounds.forEach(r => {
    const [y, m] = r.date.split('-');
    const key = `${y}-${m}`;
    const label = `${months[+m - 1]} ${y}`;
    if (!groups[key]) groups[key] = { label, rounds: [] };
    groups[key].rounds.push(r);
  });

  const groupHtml = Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(key => `
    <div class="hist-month-label">${groups[key].label}</div>
    ${groups[key].rounds.map(r => roundCard(r)).join('')}
  `).join('');

  el.innerHTML = `
    <div class="page-header">
      <div class="page-title">History</div>
      <div class="page-badge">${rounds.length}</div>
    </div>
    ${groupHtml}
  `;
}

function roundCard(r) {
  const vpClass = r.vsPar > 0 ? 'vspar-over' : r.vsPar < 0 ? 'vspar-under' : 'vspar-even';
  const typeLabel = r.roundType === 'full' ? '18 holes' : r.roundType === 'front9' ? 'Front 9' : 'Back 9';
  const stats = getRoundStats(r.holes);

  const chips = [
    stats.firPct !== null ? `<div class="stat-chip">FIR <strong>${stats.firPct}%</strong></div>` : '',
    stats.girTotal > 0   ? `<div class="stat-chip">GIR <strong>${stats.girPct}%</strong></div>` : '',
    r.totalPutts         ? `<div class="stat-chip">Putts <strong>${r.totalPutts}</strong></div>` : '',
    `<div class="stat-chip ${vpClass}"><strong>${fmtVsPar(r.vsPar)}</strong> par</div>`,
  ].filter(Boolean).join('');

  return `
    <div class="hist-round-card" onclick="openRoundModal('${r.id}')">
      <div class="hist-card-top">
        <div class="hist-card-left">
          <div class="hist-course">${r.courseName}</div>
          <div class="hist-meta">${fmtDate(r.date)} · ${r.teeName} tees · ${typeLabel}</div>
        </div>
        <div class="hist-card-right">
          <div class="hist-score">${r.totalScore}</div>
          <div class="hist-diff">Diff ${r.scoreDifferential}</div>
        </div>
      </div>
      <div class="hist-stats-strip">${chips}</div>
    </div>
  `;
}

function openRoundModal(id) {
  const r = state.rounds.find(x => x.id === id);
  if (!r) return;

  const stats   = getRoundStats(r.holes);
  const vpClass = r.vsPar > 0 ? 'vspar-over' : r.vsPar < 0 ? 'vspar-under' : 'vspar-even';
  const typeLabel = { full: '18 Holes', front9: 'Front 9', back9: 'Back 9' }[r.roundType] || '18 Holes';

  // Build horizontal scorecard
  const front = r.holes.filter(h => h.n <= 9);
  const back  = r.holes.filter(h => h.n >= 10);
  const isFull = r.roundType === 'full';
  const holes = isFull ? [...front, ...back] : r.holes;

  function subPar(hs)   { return hs.reduce((s,h) => s + h.par, 0); }
  function subScore(hs) { return hs.reduce((s,h) => s + (h.score||0), 0); }
  function subPutts(hs) { return hs.reduce((s,h) => s + (h.putts||0), 0); }

  // FIR stats
  const firEligible = holes.filter(h => h.par !== 3 && (h.fir === true || h.fir === false));
  const firHitCount = firEligible.filter(h => h.fir === true).length;
  const firTotalCount = holes.filter(h => h.par !== 3).length;
  const firStr = firTotalCount > 0
    ? `${firHitCount}/${firTotalCount}${stats.firPct !== null ? ' ('+stats.firPct+'%)' : ''}`
    : '—';

  // GIR stats (auto-calculated: shots to green = score - putts; GIR if ≤ par - 2)
  const girStr = stats.girTotal > 0
    ? `${stats.girHit}/${stats.girTotal} (${stats.girPct}%)`
    : '—';

  // Build table rows for a set of holes plus a subtotal cell
  function buildRows(frontHoles, backHoles) {
    function cells(hs, fn) { return hs.map(fn).join(''); }

    function parCells(hs) {
      return cells(hs, h => `<td class="text-muted">${h.par}</td>`);
    }
    function scoreCells(hs) {
      return cells(hs, h => {
        const cls = scoreClass(h.score, h.par);
        return `<td><span class="score-pill sc-${cls}">${h.score}</span></td>`;
      });
    }
    function puttsCells(hs) {
      return cells(hs, h => `<td>${h.putts||0}</td>`);
    }
    function firCells(hs) {
      return cells(hs, h => {
        if (h.par === 3) return `<td class="text-muted">—</td>`;
        if (h.fir === true)  return `<td class="text-green">✓</td>`;
        if (h.fir === false) return `<td class="text-red">✗</td>`;
        return `<td class="text-muted">—</td>`;
      });
    }
    function hGir(h) {
      if (!h.score || h.putts === null || h.putts === undefined) return null;
      return (h.score - h.putts) <= (h.par - 2);
    }
    function girCells(hs) {
      return cells(hs, h => {
        const g = hGir(h);
        if (g === true)  return `<td class="text-green">✓</td>`;
        if (g === false) return `<td class="text-red">✗</td>`;
        return `<td class="text-muted">—</td>`;
      });
    }
    function subFirLabel(hs) {
      const elig = hs.filter(h => h.par !== 3);
      const hit  = elig.filter(h => h.fir === true).length;
      const tracked = hs.filter(h => h.par !== 3 && (h.fir === true || h.fir === false));
      return tracked.length > 0 ? `${hit}/${elig.length}` : '—';
    }
    function subGirLabel(hs) {
      const tracked = hs.filter(h => hGir(h) !== null);
      const hit = tracked.filter(h => hGir(h) === true).length;
      return tracked.length > 0 ? `${hit}/${tracked.length}` : '—';
    }

    if (backHoles) {
      // Full 18: front | Out | back | In | Total
      const totalPar   = subPar(frontHoles)   + subPar(backHoles);
      const totalScore = subScore(frontHoles) + subScore(backHoles);
      const totalPutts = subPutts(frontHoles) + subPutts(backHoles);
      const totalVpCls = (totalScore-totalPar)>0?'text-red':(totalScore-totalPar)<0?'text-green':'text-muted';
      const outVpCls   = (subScore(frontHoles)-subPar(frontHoles))>0?'text-red':(subScore(frontHoles)-subPar(frontHoles))<0?'text-green':'text-muted';
      const inVpCls    = (subScore(backHoles)-subPar(backHoles))>0?'text-red':(subScore(backHoles)-subPar(backHoles))<0?'text-green':'text-muted';

      return `
        <tr><td class="sc-lbl">Par</td>${parCells(frontHoles)}<td class="sc-sub text-muted">${subPar(frontHoles)}</td>${parCells(backHoles)}<td class="sc-sub text-muted">${subPar(backHoles)}</td><td class="sc-sub text-muted">${totalPar}</td></tr>
        <tr><td class="sc-lbl">Score</td>${scoreCells(frontHoles)}<td class="sc-sub ${outVpCls}">${subScore(frontHoles)}</td>${scoreCells(backHoles)}<td class="sc-sub ${inVpCls}">${subScore(backHoles)}</td><td class="sc-sub ${totalVpCls}">${totalScore}</td></tr>
        <tr><td class="sc-lbl">Putts</td>${puttsCells(frontHoles)}<td class="sc-sub">${subPutts(frontHoles)}</td>${puttsCells(backHoles)}<td class="sc-sub">${subPutts(backHoles)}</td><td class="sc-sub">${totalPutts}</td></tr>
        <tr><td class="sc-lbl">FIR</td>${firCells(frontHoles)}<td class="sc-sub">${subFirLabel(frontHoles)}</td>${firCells(backHoles)}<td class="sc-sub">${subFirLabel(backHoles)}</td><td class="sc-sub">${firStr}</td></tr>
        <tr><td class="sc-lbl">GIR</td>${girCells(frontHoles)}<td class="sc-sub">${subGirLabel(frontHoles)}</td>${girCells(backHoles)}<td class="sc-sub">${subGirLabel(backHoles)}</td><td class="sc-sub">${girStr}</td></tr>
      `;
    } else {
      // 9-hole
      const hs = frontHoles;
      const vpCls = (subScore(hs)-subPar(hs))>0?'text-red':(subScore(hs)-subPar(hs))<0?'text-green':'text-muted';
      return `
        <tr><td class="sc-lbl">Par</td>${parCells(hs)}<td class="sc-sub text-muted">${subPar(hs)}</td></tr>
        <tr><td class="sc-lbl">Score</td>${scoreCells(hs)}<td class="sc-sub ${vpCls}">${subScore(hs)}</td></tr>
        <tr><td class="sc-lbl">Putts</td>${puttsCells(hs)}<td class="sc-sub">${subPutts(hs)}</td></tr>
        <tr><td class="sc-lbl">FIR</td>${firCells(hs)}<td class="sc-sub">${subFirLabel(hs)}</td></tr>
        <tr><td class="sc-lbl">GIR</td>${girCells(hs)}<td class="sc-sub">${subGirLabel(hs)}</td></tr>
      `;
    }
  }

  let tableHTML;
  if (isFull) {
    const frontHdrs = front.map(h => `<th>${h.n}</th>`).join('');
    const backHdrs  = back.map(h => `<th>${h.n}</th>`).join('');
    tableHTML = `
      <div style="overflow-x:auto">
        <table class="sc-traditional">
          <thead>
            <tr><th class="sc-lbl">Hole</th>${frontHdrs}<th class="sc-sub">Out</th>${backHdrs}<th class="sc-sub">In</th><th class="sc-sub">Tot</th></tr>
          </thead>
          <tbody>${buildRows(front, back)}</tbody>
        </table>
      </div>`;
  } else {
    const hdrs = r.holes.map(h => `<th>${h.n}</th>`).join('');
    tableHTML = `
      <div style="overflow-x:auto">
        <table class="sc-traditional">
          <thead>
            <tr><th class="sc-lbl">Hole</th>${hdrs}<th class="sc-sub">Tot</th></tr>
          </thead>
          <tbody>${buildRows(r.holes, null)}</tbody>
        </table>
      </div>`;
  }

  document.querySelector('.modal-dialog').style.maxWidth = '900px';
  document.getElementById('modal-body').innerHTML = `
    <div class="modal-title">${r.courseName}</div>
    <div class="text-dim text-sm mb-16">${fmtDate(r.date)} · ${r.teeName} tees · ${typeLabel} · ${r.courseRating}/${r.slope}</div>

    <div class="review-grid mb-16">
      <div class="review-stat">
        <div class="review-stat-val">${r.totalScore}</div>
        <div class="review-stat-lbl">Score</div>
      </div>
      <div class="review-stat">
        <div class="review-stat-val ${vpClass}">${fmtVsPar(r.vsPar)}</div>
        <div class="review-stat-lbl">vs Par</div>
      </div>
      <div class="review-stat">
        <div class="review-stat-val text-gold">${r.scoreDifferential}</div>
        <div class="review-stat-lbl">Differential</div>
      </div>
      <div class="review-stat">
        <div class="review-stat-val">${r.totalPutts || 0}</div>
        <div class="review-stat-lbl">Putts</div>
      </div>
      <div class="review-stat">
        <div class="review-stat-val">${firStr}</div>
        <div class="review-stat-lbl">FIR</div>
      </div>
      <div class="review-stat">
        <div class="review-stat-val">${girStr}</div>
        <div class="review-stat-lbl">GIR</div>
      </div>
    </div>

    ${tableHTML}

    <div style="margin-top:24px; display:flex; gap:10px; justify-content:flex-end">
      <button class="btn btn-danger" onclick="deleteRound('${r.id}')">Delete Round</button>
      <button class="btn btn-primary" onclick="openRoundEditor('${r.id}')">Edit Round</button>
    </div>
  `;

  openModal();
}

function deleteRound(id) {
  if (!confirm('Delete this round? This cannot be undone.')) return;
  state.rounds = state.rounds.filter(r => r.id !== id);
  saveState();
  closeModal();
  renderHistory();
}

// ── Edit existing round ──────────────────────────────────────
let _roundDraft = null;

function openRoundEditor(id) {
  const r = state.rounds.find(x => x.id === id);
  if (!r) return;
  _roundDraft = JSON.parse(JSON.stringify(r));
  renderRoundEditor();
}

function renderRoundEditor() {
  const d = _roundDraft;
  const stats = getRoundStats(d.holes);
  const vpClass = stats.vsPar > 0 ? 'vspar-over' : stats.vsPar < 0 ? 'vspar-under' : 'vspar-even';
  const front = d.holes.filter(h => h.n <= 9);
  const back  = d.holes.filter(h => h.n > 9);

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-title">Edit Round</div>
    <div class="field" style="max-width:200px"><label>Date</label><input class="input" type="date" id="er-date" value="${d.date}"></div>
    <div class="text-dim text-sm mb-16">${d.courseName} · ${d.teeName} tees · ${d.courseRating}/${d.slope}</div>

    <div class="score-bar">
      <div>
        <span class="score-bar-total">${stats.totalScore}</span>
        <span class="score-bar-meta"> / Par ${stats.totalPar}</span>
      </div>
      <div class="flex-center gap-8">
        <span class="score-bar-vspar ${vpClass}">${fmtVsPar(stats.vsPar)}</span>
        <span class="score-bar-meta">${stats.totalPutts} putts</span>
      </div>
    </div>

    ${front.length ? renderScorecardSection('Front 9', front) : ''}
    ${back.length  ? renderScorecardSection('Back 9',  back)  : ''}

    <div style="margin-top:20px; display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap">
      <button class="btn btn-danger" onclick="deleteRound('${d.id}')">Delete Round</button>
      <button class="btn btn-ghost" onclick="openRoundModal('${d.id}')">Cancel</button>
      <button class="btn btn-primary" onclick="saveRoundEdit()">Save Changes</button>
    </div>
  `;

  bindRoundEditorEvents();
}

function bindRoundEditorEvents() {
  document.querySelectorAll('.stepper').forEach(stepper => {
    const holeN = +stepper.dataset.hole;
    const field = stepper.dataset.field;
    const valEl = stepper.querySelector('.stepper-val');

    stepper.querySelectorAll('.stepper-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const hole = _roundDraft.holes.find(h => h.n === holeN);
        if (!hole) return;
        const inc = btn.dataset.action === 'inc' ? 1 : -1;
        const min = field === 'score' ? 1 : 0;
        hole[field] = Math.max(min, (hole[field] || 0) + inc);
        valEl.textContent = hole[field];
        refreshRoundEditorBar();
      });
    });

    valEl.addEventListener('click', () => {
      const hole = _roundDraft.holes.find(h => h.n === holeN);
      if (!hole) return;
      const input = document.createElement('input');
      input.type = 'number';
      input.value = hole[field];
      input.min   = field === 'score' ? 1 : 0;
      input.style.cssText = 'width:36px;text-align:center;background:transparent;border:none;outline:none;color:var(--text);font:inherit;font-weight:600;font-size:14px';
      valEl.replaceWith(input);
      input.select();
      input.focus();
      const commit = () => {
        const v = parseInt(input.value, 10);
        if (!isNaN(v)) hole[field] = Math.max(field === 'score' ? 1 : 0, v);
        input.replaceWith(valEl);
        valEl.textContent = hole[field];
        refreshRoundEditorBar();
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
    });
  });

  document.querySelectorAll('.fir-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const holeN = +btn.dataset.hole;
      const hole  = _roundDraft.holes.find(h => h.n === holeN);
      if (!hole) return;
      const isHit = btn.dataset.fir === 'hit';
      if ((isHit && hole.fir === true) || (!isHit && hole.fir === false)) {
        hole.fir = null;
      } else {
        hole.fir = isHit;
      }
      const group = btn.closest('.fir-group');
      group.querySelector('.fir-btn.hit').classList.toggle('active', hole.fir === true);
      group.querySelector('.fir-btn.miss').classList.toggle('active', hole.fir === false);
      refreshRoundEditorBar();
    });
  });

}

function refreshRoundEditorBar() {
  const stats  = getRoundStats(_roundDraft.holes);
  const vpClass = stats.vsPar > 0 ? 'vspar-over' : stats.vsPar < 0 ? 'vspar-under' : 'vspar-even';
  const totalEl = document.querySelector('#modal-body .score-bar-total');
  const vsEl    = document.querySelector('#modal-body .score-bar-vspar');
  const puttEl  = document.querySelector('#modal-body .score-bar .score-bar-meta');
  if (totalEl) totalEl.textContent = stats.totalScore;
  if (vsEl)    { vsEl.textContent = fmtVsPar(stats.vsPar); vsEl.className = `score-bar-vspar ${vpClass}`; }
  if (puttEl)  puttEl.textContent = `${stats.totalPutts} putts`;

  const front = _roundDraft.holes.filter(h => h.n <= 9);
  const back  = _roundDraft.holes.filter(h => h.n > 9);
  document.querySelectorAll('#modal-body .subtotal-row').forEach((row, i) => {
    const hs = i === 0 ? front : back;
    if (!hs.length) return;
    const sub = getRoundStats(hs);
    const cells = row.querySelectorAll('td');
    cells[1].textContent = sub.totalPar;
    cells[3].textContent = sub.totalScore;
    cells[4].textContent = sub.totalPutts;
    cells[5].textContent = sub.firPct !== null ? sub.firPct + '%' : '';
    cells[6].textContent = hs.reduce((s, h) => s + h.penalties, 0);
  });
}

function saveRoundEdit() {
  const d = _roundDraft;
  d.date = document.getElementById('er-date').value || d.date;

  const stats  = getRoundStats(d.holes);
  const isNine = d.roundType !== 'full';
  const diff   = isNine
    ? calc9HoleDifferential(stats.totalScore, d.courseRating, d.slope)
    : calcScoreDifferential(stats.totalScore, d.courseRating, d.slope);

  d.totalScore = stats.totalScore;
  d.totalPar   = stats.totalPar;
  d.vsPar      = stats.vsPar;
  d.totalPutts = stats.totalPutts;
  d.firHit     = stats.firHit;
  d.firTotal   = stats.firTotal;
  d.firPct     = stats.firPct;
  d.scoreDifferential = diff;

  const idx = state.rounds.findIndex(r => r.id === d.id);
  if (idx === -1) return;
  state.rounds[idx] = d;
  state.rounds.sort((a, b) => a.date.localeCompare(b.date));
  saveState();

  closeModal();
  renderHistory();
}

// ════════════════════════════════════════════════════════════
//  COURSES
// ════════════════════════════════════════════════════════════

let _courseSearch = '';

function renderCourses() {
  const el = document.getElementById('view-courses');
  const all = allCourses();

  // Recently played: unique courses from rounds, most recent first, max 4
  const seenIds = new Set();
  const recentCourses = [];
  for (const r of [...state.rounds].sort((a, b) => b.date.localeCompare(a.date))) {
    if (!seenIds.has(r.courseId)) {
      const c = getCourse(r.courseId);
      if (c) { seenIds.add(r.courseId); recentCourses.push(c); }
    }
    if (recentCourses.length >= 4) break;
  }

  // Filter by search query
  const q = _courseSearch.toLowerCase().trim();
  const filtered = q
    ? all.filter(c => c.name.toLowerCase().includes(q) || c.location.toLowerCase().includes(q))
    : all;

  const recentHtml = (!q && recentCourses.length > 0) ? `
    <div class="courses-section-label">Recently played</div>
    <div class="recent-courses-row">
      ${recentCourses.map(c => recentCourseChip(c)).join('')}
    </div>
  ` : '';

  const allLabel = q ? `Results (${filtered.length})` : 'All courses';
  const emptyHtml = `<div class="courses-empty">No courses match "${_courseSearch}".</div>`;

  el.innerHTML = `
    <div class="view-title">Courses</div>

    <div class="course-search-wrap">
      <svg class="course-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input class="input course-search-input" id="course-search" type="search"
             placeholder="Search by name or location…"
             value="${_courseSearch.replace(/"/g, '&quot;')}"
             oninput="onCourseSearch(this.value)">
      ${q ? `<button class="course-search-clear" onclick="onCourseSearch('')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>` : ''}
    </div>

    ${recentHtml}

    <div class="courses-section-label">${allLabel}</div>
    <div class="courses-grid">
      ${filtered.length ? filtered.map(c => courseCard(c)).join('') : emptyHtml}
      ${!q ? `
        <div class="card course-add-card" onclick="openCourseEditor(null)">
          <div style="font-size:28px;margin-bottom:8px">+</div>
          <div style="font-size:13px;font-weight:600">Add Custom Course</div>
        </div>` : ''}
    </div>
  `;

  // Restore focus + cursor position after re-render
  if (q) {
    const input = document.getElementById('course-search');
    if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  }
}

function onCourseSearch(val) {
  _courseSearch = val;
  renderCourses();
}

function recentCourseChip(c) {
  const roundCount = state.rounds.filter(r => r.courseId === c.id).length;
  const city = c.location.split(',')[0];
  return `
    <div class="recent-course-chip" onclick="openCourseDetail('${c.id}')">
      <div class="rcc-name">${c.name}</div>
      <div class="rcc-meta">${city} · Par ${c.par}</div>
      <div class="rcc-rounds">${roundCount} round${roundCount !== 1 ? 's' : ''}</div>
    </div>
  `;
}

function courseCard(c) {
  const teeBadges = c.tees.map(t => `
    <span class="tee-badge">
      <span class="tee-dot" style="background:${t.color}"></span>
      ${t.name} <span class="tee-note">${t.rating}/${t.slope}</span>
    </span>
  `).join('');

  return `
    <div class="card course-card" data-id="${c.id}" style="cursor:pointer" onclick="openCourseDetail('${c.id}')">
      <div class="course-name">${c.name}</div>
      <div class="course-loc">📍 ${c.location} · Par ${c.par}</div>
      <div class="tee-list">${teeBadges}</div>
    </div>
  `;
}

// ── Course detail (view) modal ──────────────────────────────
function openCourseDetail(id) {
  const course = getCourse(id);
  if (!course) return;
  document.querySelector('.modal-dialog').style.maxWidth = '800px';
  renderCourseDetail(course);
  openModal();
}

function renderCourseDetail(course) {
  const isCustom    = state.customCourses.some(c => c.id === course.id);
  const hasOverride = !!state.courseOverrides[course.id];
  const front = course.holes.filter(h => h.n <= 9);
  const back   = course.holes.filter(h => h.n > 9);
  const is18   = back.length > 0;
  const frontPar = front.reduce((s, h) => s + h.par, 0);
  const backPar  = back.reduce((s, h) => s + h.par, 0);

  const sub = (v) => `<td class="sc-sub">${v}</td>`;

  const holeHeaders = `<tr>
    <th class="sc-lbl">Hole</th>
    ${front.map(h => `<th>${h.n}</th>`).join('')}
    ${is18 ? `${sub('Out')}${back.map(h => `<th>${h.n}</th>`).join('')}${sub('In')}${sub('Tot')}` : sub('Out')}
  </tr>`;

  const parRow = `<tr class="sc-par">
    <td class="sc-lbl">Par</td>
    ${front.map(h => `<td>${h.par}</td>`).join('')}
    ${is18 ? `${sub(frontPar)}${back.map(h => `<td>${h.par}</td>`).join('')}${sub(backPar)}${sub(course.par)}` : sub(frontPar)}
  </tr>`;

  const siRow = `<tr class="sc-si">
    <td class="sc-lbl">SI</td>
    ${front.map(h => `<td>${h.si}</td>`).join('')}
    ${is18 ? `${sub('')}${back.map(h => `<td>${h.si}</td>`).join('')}${sub('')}${sub('')}` : sub('')}
  </tr>`;

  const teeRows = course.tees.map(t => {
    const fy = front.map((_, i) => t.yards[i] || 0);
    const by = back.map((_, i)  => t.yards[i + 9] || 0);
    const fo = fy.reduce((s, y) => s + y, 0);
    const bo = by.reduce((s, y) => s + y, 0);
    return `<tr>
      <td class="sc-lbl"><div class="sc-tee-inner"><span class="tee-dot" style="background:${t.color}"></span>${t.name}<span class="sc-rtg">${t.rating}/${t.slope}</span></div></td>
      ${fy.map(y => `<td>${y}</td>`).join('')}
      ${is18 ? `${sub(fo)}${by.map(y => `<td>${y}</td>`).join('')}${sub(bo)}${sub(fo + bo)}` : sub(fo)}
    </tr>`;
  }).join('');

  // ── Course stats ────────────────────────────────────────────
  const cRounds = state.rounds
    .filter(r => r.courseId === course.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  let statsHtml = '';
  if (cRounds.length === 0) {
    statsHtml = `
      <div class="cd-stats-empty">You haven't recorded a round here yet.</div>`;
  } else {
    const scores      = cRounds.map(r => r.totalScore);
    const best        = Math.min(...scores);
    const avg         = (scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(1);
    const avgDiff     = (cRounds.reduce((s, r) => s + r.scoreDifferential, 0) / cRounds.length).toFixed(1);

    // Putts — only rounds that have hole-level putt data
    const puttRounds  = cRounds.filter(r => r.holes && r.holes.some(h => h.putts));
    const avgPutts    = puttRounds.length
      ? (puttRounds.reduce((s, r) => s + r.holes.reduce((p, h) => p + (h.putts || 0), 0), 0) / puttRounds.length).toFixed(1)
      : null;

    // FIR — aggregate across all hole records
    let firHit = 0, firTotal = 0, girHit = 0, girTotal = 0;
    for (const r of cRounds) {
      if (!r.holes) continue;
      for (const h of r.holes) {
        if (h.fir !== null && h.fir !== undefined) { firTotal++; if (h.fir) firHit++; }
        if (h.score && h.putts !== null && h.putts !== undefined) {
          girTotal++;
          if ((h.score - h.putts) <= (h.par - 2)) girHit++;
        }
      }
    }
    const firPct = firTotal > 0 ? Math.round(firHit / firTotal * 100) : null;
    const girPct = girTotal > 0 ? Math.round(girHit / girTotal * 100) : null;

    // Scoring distribution across all holes
    let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubles = 0;
    for (const r of cRounds) {
      if (!r.holes) continue;
      for (const h of r.holes) {
        if (!h.score) continue;
        const d = h.score - h.par;
        if (d <= -2) eagles++;
        else if (d === -1) birdies++;
        else if (d === 0) pars++;
        else if (d === 1) bogeys++;
        else doubles++;
      }
    }
    const totalHoles = eagles + birdies + pars + bogeys + doubles || 1;
    const distBar = (count, cls, label) => {
      const pct = Math.round(count / totalHoles * 100);
      return pct > 0 ? `<div class="cd-dist-seg ${cls}" style="flex:${count}" title="${label}: ${count} (${pct}%)"></div>` : '';
    };

    // Recent rounds list
    const recentList = [...cRounds].reverse().slice(0, 5).map(r => `
      <div class="cd-round-row" onclick="openRoundModal('${r.id}')">
        <div class="cd-round-left">
          <div class="cd-round-date">${fmtDate(r.date)}</div>
          <div class="cd-round-tee text-muted">${r.teeName} tees · Diff ${r.scoreDifferential > 0 ? '+' : ''}${r.scoreDifferential}</div>
        </div>
        <div class="cd-round-score ${r.vsPar < 0 ? 'text-green' : r.vsPar > 0 ? 'text-red' : ''}">${r.totalScore}</div>
      </div>`).join('');

    // Score trend chart (3+ rounds)
    const chartHtml = cRounds.length >= 3
      ? `<div class="cd-chart-wrap"><canvas id="cd-score-chart" height="110"></canvas></div>`
      : '';

    statsHtml = `
      <div class="cd-stats-grid">
        <div class="cd-stat"><div class="cd-stat-val">${cRounds.length}</div><div class="cd-stat-lbl">Rounds</div></div>
        <div class="cd-stat"><div class="cd-stat-val">${avg}</div><div class="cd-stat-lbl">Avg score</div></div>
        <div class="cd-stat"><div class="cd-stat-val">${best}</div><div class="cd-stat-lbl">Best score</div></div>
        <div class="cd-stat"><div class="cd-stat-val">${avgDiff > 0 ? '+' : ''}${avgDiff}</div><div class="cd-stat-lbl">Avg diff</div></div>
      </div>

      <div class="cd-kpi-row">
        ${avgPutts !== null ? `<div class="cd-kpi"><span class="cd-kpi-val">${avgPutts}</span><span class="cd-kpi-lbl">Avg putts</span></div>` : ''}
        ${firPct !== null   ? `<div class="cd-kpi"><span class="cd-kpi-val">${firPct}%</span><span class="cd-kpi-lbl">FIR</span></div>` : ''}
        ${girPct !== null   ? `<div class="cd-kpi"><span class="cd-kpi-val">${girPct}%</span><span class="cd-kpi-lbl">GIR</span></div>` : ''}
      </div>

      <div class="cd-dist-label">Scoring distribution</div>
      <div class="cd-dist-bar">
        ${distBar(eagles,  'eagle',  'Eagles/better')}
        ${distBar(birdies, 'birdie', 'Birdies')}
        ${distBar(pars,    'par',    'Pars')}
        ${distBar(bogeys,  'bogey',  'Bogeys')}
        ${distBar(doubles, 'double', 'Doubles+')}
      </div>
      <div class="cd-dist-legend">
        ${eagles  > 0 ? `<span class="cd-leg eagle">Eagle−</span>` : ''}
        ${birdies > 0 ? `<span class="cd-leg birdie">Birdie</span>` : ''}
        ${pars    > 0 ? `<span class="cd-leg par">Par</span>` : ''}
        ${bogeys  > 0 ? `<span class="cd-leg bogey">Bogey</span>` : ''}
        ${doubles > 0 ? `<span class="cd-leg double">Double+</span>` : ''}
      </div>

      ${chartHtml}

      <div class="cd-rounds-title">Recent rounds</div>
      <div class="cd-rounds-list">${recentList}</div>`;
  }

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-title">${course.name}</div>
    <div class="text-dim text-sm mb-16">📍 ${course.location} · Par ${course.par}</div>

    <div class="cd-section-label">Your stats here</div>
    ${statsHtml}

    <div class="cd-section-label" style="margin-top:24px">Scorecard</div>
    <div class="modal-scorecard">
      <table class="sc-traditional">
        <thead>${holeHeaders}</thead>
        <tbody>${parRow}${siRow}${teeRows}</tbody>
      </table>
    </div>
    <div style="margin-top:20px;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
      ${hasOverride ? `<button class="btn btn-ghost" onclick="resetCourseOverride('${course.id}')">Reset to Default</button>` : ''}
      ${isCustom ? `<button class="btn btn-danger" onclick="deleteCourse('${course.id}')">Delete</button>` : ''}
      <button class="btn btn-primary" onclick="openCourseEditor('${course.id}')">Edit Course</button>
    </div>
  `;

  // Draw trend chart after DOM is set
  if (cRounds.length >= 3) {
    const labels = cRounds.map(r => fmtDate(r.date).slice(0, 6));
    const data   = cRounds.map(r => r.totalScore);
    mkLineChart('cd-score-chart', labels, data, 'rgb(74,222,128)');
  }
}

function resetCourseOverride(id) {
  if (!confirm('Reset this course back to its default data? Your edits will be lost.')) return;
  delete state.courseOverrides[id];
  saveState();
  closeModal();
  renderCourses();
}

function deleteCourse(id) {
  if (!confirm('Remove this course?')) return;
  state.customCourses = state.customCourses.filter(c => c.id !== id);
  delete state.courseOverrides[id];
  saveState();
  closeModal();
  renderCourses();
}

// ── Course editor (create + edit) ───────────────────────────
let _draft = null;

function openCourseEditor(id) {
  if (id) {
    const course = getCourse(id);
    _draft = JSON.parse(JSON.stringify(course));
  } else {
    _draft = {
      id: null,
      name: '',
      location: '',
      par: 72,
      holes: Array.from({length:18}, (_,i) => ({ n: i+1, par: 4, si: i+1 })),
      tees: [{ id: uid(), name: 'Blue', color: '#3b82f6', rating: 70.0, slope: 125, yards: Array(18).fill(0) }],
    };
  }
  renderCourseEditor();
  openModal();
}

function renderCourseEditor() {
  const d = _draft;
  const isNew = !d.id;

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-title">${isNew ? 'Add Custom Course' : 'Edit Course'}</div>

    <div class="field"><label>Course Name</label><input class="input" id="cc-name" value="${escAttr(d.name)}" placeholder="e.g. Rattlesnake Point Golf Club"></div>
    <div class="field"><label>Location</label><input class="input" id="cc-loc" value="${escAttr(d.location)}" placeholder="e.g. Milton, ON"></div>

    <div class="divider"></div>
    <div class="section-title">Tee Boxes</div>
    <div id="tee-rows">
      ${d.tees.map((t, i) => teeRowHtml(t, i)).join('')}
    </div>
    <button class="btn btn-ghost btn-sm mt-8" onclick="addDraftTee()">+ Add Tee</button>

    <div class="divider"></div>
    <div class="section-title">Holes — Par, Stroke Index &amp; Yardage</div>
    <div class="modal-scorecard">
      <table>
        <thead>
          <tr>
            <th>Hole</th><th>Par</th><th>SI</th>
            ${d.tees.map(t => `<th>${escHtml(t.name) || 'Tee'}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${d.holes.map((h, i) => `
            <tr>
              <td>${h.n}</td>
              <td><input class="par-input" style="width:40px" type="number" min="3" max="6" value="${h.par}" oninput="updateDraftHole(${i},'par',this.value)"></td>
              <td><input class="par-input" style="width:40px" type="number" min="1" max="18" value="${h.si}" oninput="updateDraftHole(${i},'si',this.value)"></td>
              ${d.tees.map((t, ti) => `<td><input class="par-input" style="width:52px" type="number" min="0" value="${t.yards[i] || 0}" oninput="updateDraftYard(${ti},${i},this.value)"></td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="record-actions">
      <button class="btn btn-ghost" onclick="${isNew ? 'closeModal()' : `openCourseDetail('${d.id}')`}">Cancel</button>
      <button class="btn btn-primary" onclick="saveCourseDraft()">Save Course</button>
    </div>
  `;
}

function teeRowHtml(t, i) {
  return `
    <div class="tee-row" id="tee-row-${i}">
      <div class="field" style="margin:0"><label>Name</label><input class="input" value="${escAttr(t.name)}" oninput="updateDraftTee(${i},'name',this.value)"></div>
      <div class="field" style="margin:0"><label>Rating</label><input class="input" type="number" step="0.1" value="${t.rating}" oninput="updateDraftTee(${i},'rating',this.value)"></div>
      <div class="field" style="margin:0"><label>Slope</label><input class="input" type="number" value="${t.slope}" oninput="updateDraftTee(${i},'slope',this.value)"></div>
      <button class="btn btn-ghost btn-sm" style="margin-bottom:0;align-self:flex-end" onclick="removeDraftTee(${i})">✕</button>
    </div>`;
}

function escHtml(s) { return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escAttr(s) { return escHtml(s); }

function updateDraftTee(i, field, value) {
  if (field === 'rating') value = parseFloat(value) || 0;
  if (field === 'slope') value = parseInt(value, 10) || 0;
  _draft.tees[i][field] = value;
  if (field === 'name') renderCourseEditor(); // refresh table headers, preserves other inputs via draft
}

function updateDraftYard(teeIdx, holeIdx, value) {
  _draft.tees[teeIdx].yards[holeIdx] = parseInt(value, 10) || 0;
}

function updateDraftHole(holeIdx, field, value) {
  _draft.holes[holeIdx][field] = parseInt(value, 10) || (field === 'par' ? 4 : 1);
}

function addDraftTee() {
  _draft.tees.push({ id: uid(), name: 'New Tee', color: '#94a3b8', rating: 70.0, slope: 125, yards: Array(18).fill(0) });
  renderCourseEditor();
}

function removeDraftTee(i) {
  if (_draft.tees.length <= 1) { alert('A course needs at least one tee box.'); return; }
  _draft.tees.splice(i, 1);
  renderCourseEditor();
}

function saveCourseDraft() {
  const name = document.getElementById('cc-name').value.trim();
  const loc  = document.getElementById('cc-loc').value.trim();
  if (!name) { alert('Course name is required.'); return; }
  if (!_draft.tees.length) { alert('Add at least one tee box.'); return; }
  for (const t of _draft.tees) {
    if (!t.name.trim()) { alert('Every tee needs a name.'); return; }
  }

  _draft.name = name;
  _draft.location = loc || 'Custom';
  _draft.par = _draft.holes.reduce((s, h) => s + h.par, 0);

  if (!_draft.id) {
    _draft.id = uid();
    state.customCourses.push(_draft);
  } else if (state.customCourses.some(c => c.id === _draft.id)) {
    const idx = state.customCourses.findIndex(c => c.id === _draft.id);
    state.customCourses[idx] = _draft;
  } else {
    // editing a preloaded course — store as an override, leave COURSES untouched
    state.courseOverrides[_draft.id] = _draft;
  }

  saveState();
  closeModal();
  renderCourses();
}

// ════════════════════════════════════════════════════════════
//  SETTINGS
// ════════════════════════════════════════════════════════════

function renderSettings() {
  const el = document.getElementById('view-settings');
  const hcp = calcHandicapIndex(state.rounds);
  const activeTheme = getStoredTheme();

  el.innerHTML = `
    <div class="view-title">Settings</div>

    <div class="settings-section">
      <div class="section-title">Appearance</div>
      <div class="theme-picker">
        <button class="theme-btn${activeTheme === 'dark' ? ' active' : ''}" onclick="applyTheme('dark')">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          Dark
        </button>
        <button class="theme-btn${activeTheme === 'light' ? ' active' : ''}" onclick="applyTheme('light')">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          Light
        </button>
        <button class="theme-btn${activeTheme === 'system' ? ' active' : ''}" onclick="applyTheme('system')">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
          System
        </button>
      </div>
    </div>

    <div class="settings-section">
      <div class="section-title">Data</div>
      <div class="card settings-row">
        <div class="settings-row-info">
          <h4>Export Rounds</h4>
          <p>${state.rounds.length} rounds · ${state.customCourses.length} custom course${state.customCourses.length !== 1 ? 's' : ''}</p>
        </div>
        <button class="btn btn-ghost" onclick="exportData()">Export JSON</button>
      </div>
      <div class="card settings-row">
        <div class="settings-row-info">
          <h4>Import Rounds</h4>
          <p>Merge from a previously exported JSON file</p>
        </div>
        <label class="btn btn-ghost" style="cursor:pointer">
          Import JSON
          <input type="file" accept=".json" style="display:none" onchange="importData(this)">
        </label>
      </div>
    </div>

    <div class="settings-section">
      <div class="section-title">About</div>
      <div class="card" style="padding:20px">
        <div class="text-dim text-sm" style="line-height:1.8">
          <div><strong>Handicap Method:</strong> World Handicap System (WHS)</div>
          <div><strong>Rounds stored:</strong> ${state.rounds.length}</div>
          <div><strong>Current index:</strong> ${hcp !== null ? hcp : 'Not yet calculated (need 3 rounds)'}</div>
          <div class="mt-8 text-muted">All data is stored locally in your browser. Nothing is sent to any server.</div>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <div class="section-title">Danger Zone</div>
      <div class="card settings-row">
        <div class="settings-row-info">
          <h4>Clear All Data</h4>
          <p>Permanently delete all rounds and custom courses</p>
        </div>
        <button class="btn btn-danger" onclick="clearAllData()">Clear Data</button>
      </div>
    </div>
  `;
}

function exportData() {
  const payload = { rounds: state.rounds, customCourses: state.customCourses, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `linkslog-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importData(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      const rounds = data.rounds || [];
      const courses = data.customCourses || [];

      // Merge: skip duplicates by id
      const existingIds = new Set(state.rounds.map(r => r.id));
      let added = 0;
      rounds.forEach(r => { if (!existingIds.has(r.id)) { state.rounds.push(r); added++; } });

      const existingCIds = new Set(state.customCourses.map(c => c.id));
      courses.forEach(c => { if (!existingCIds.has(c.id)) state.customCourses.push(c); });

      state.rounds.sort((a, b) => a.date.localeCompare(b.date));
      saveState();
      alert(`Imported ${added} new round${added !== 1 ? 's' : ''}.`);
      renderSettings();
    } catch(err) {
      alert('Invalid file. Please select a Linkslog JSON export.');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

function clearAllData() {
  if (!confirm('This will permanently delete ALL rounds and custom courses. Are you sure?')) return;
  if (!confirm('Are you absolutely sure? This cannot be undone.')) return;
  state.rounds = [];
  state.customCourses = [];
  saveState();
  renderSettings();
}

// ════════════════════════════════════════════════════════════
//  MODAL
// ════════════════════════════════════════════════════════════

function openModal() {
  document.getElementById('modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  document.body.style.overflow = '';
  document.querySelector('.modal-dialog').style.maxWidth = '';
}

// ════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
//  THEME
// ════════════════════════════════════════════════════════════

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', theme);
  }
  localStorage.setItem('theme', theme);
  // Re-render settings if open to update active button
  const el = document.getElementById('view-settings');
  if (el && el.classList.contains('active')) renderSettings();
}

function getStoredTheme() {
  return localStorage.getItem('theme') || 'dark';
}

// Listen for OS-level theme changes when system mode is active
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (getStoredTheme() === 'system') applyTheme('system');
});

document.addEventListener('DOMContentLoaded', async () => {
  applyTheme(getStoredTheme());
  await loadState();

  // Nav clicks (sidebar + bottom nav)
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.view));
  });

  // Modal close
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // Chart.js global defaults
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color = '#475569';
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  }

  renderView('dashboard');
});
