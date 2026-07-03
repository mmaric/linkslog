// Pure WHS calculation functions — no DOM or localStorage references.

function calcScoreDifferential(grossScore, courseRating, slope) {
  return +((grossScore - courseRating) * 113 / slope).toFixed(1);
}

// WHS formula for 9-hole equivalence using 18-hole course rating/slope.
function calc9HoleDifferential(nineScore, courseRating, slope) {
  return +((2 * nineScore - courseRating) * 113 / slope).toFixed(1);
}

// WHS sliding scale: rounds sorted oldest-first, returns null if < 3 rounds.
function calcHandicapIndex(rounds) {
  if (!rounds || rounds.length < 3) return null;
  const n = rounds.length;
  const relevant = n >= 20 ? rounds.slice(-20) : rounds;
  const sorted = relevant.map(r => r.scoreDifferential).sort((a, b) => a - b);

  let count, adj;
  if      (n === 3)  { count = 1; adj = -2.0; }
  else if (n === 4)  { count = 1; adj = -1.0; }
  else if (n === 5)  { count = 1; adj =  0.0; }
  else if (n === 6)  { count = 2; adj = -1.0; }
  else if (n <= 8)   { count = 2; adj =  0.0; }
  else if (n <= 11)  { count = 3; adj =  0.0; }
  else if (n <= 14)  { count = 4; adj =  0.0; }
  else if (n <= 16)  { count = 5; adj =  0.0; }
  else if (n <= 18)  { count = 6; adj =  0.0; }
  else if (n === 19) { count = 7; adj =  0.0; }
  else               { count = 8; adj =  0.0; }

  const avg = sorted.slice(0, count).reduce((s, d) => s + d, 0) / count;
  return +((avg * 0.96 + adj).toFixed(1));
}

// Returns handicap index after each round for trend charting.
function getHandicapHistory(rounds) {
  return rounds.map((_, i) => calcHandicapIndex(rounds.slice(0, i + 1)));
}

function getRoundStats(holes) {
  let score = 0, putts = 0, par = 0, firHit = 0, firTotal = 0, girHit = 0, girTotal = 0;
  for (const h of holes) {
    score += h.score || 0;
    putts += h.putts || 0;
    par   += h.par;
    if (h.fir !== null && h.fir !== undefined) {
      firTotal++;
      if (h.fir) firHit++;
    }
    if (h.score && (h.putts !== null && h.putts !== undefined)) {
      girTotal++;
      if ((h.score - h.putts) <= (h.par - 2)) girHit++;
    }
  }
  return {
    totalScore: score,
    totalPutts: putts,
    totalPar:   par,
    vsPar:      score - par,
    firHit,
    firTotal,
    firPct: firTotal > 0 ? Math.round(firHit / firTotal * 100) : null,
    girHit,
    girTotal,
    girPct: girTotal > 0 ? Math.round(girHit / girTotal * 100) : null,
  };
}

function scoreClass(score, par) {
  const d = score - par;
  if (d <= -2) return 'eagle';
  if (d === -1) return 'birdie';
  if (d ===  0) return 'par';
  if (d ===  1) return 'bogey';
  if (d ===  2) return 'double';
  return 'triple';
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function fmtDate(iso) {
  const [y, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[+m - 1]} ${+d}, ${y}`;
}

function fmtVsPar(n) {
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : `${n}`;
}
