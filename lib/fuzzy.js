// lib/fuzzy.js — tolerant string matching for voice-transcribed names.

function normalize(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

// Similarity 0..1 between two names (spelling-tolerant).
function score(query, text) {
  const q = normalize(query), t = normalize(text);
  if (!q || !t) return 0;
  if (q === t) return 1;
  if (t.includes(q) || q.includes(t)) return 0.9;
  const dist = levenshtein(q, t);
  return 1 - dist / Math.max(q.length, t.length);
}

// Best candidate above a similarity threshold, or null.
function bestMatch(query, candidates, getText, threshold = 0.6) {
  let best = null, bestScore = 0;
  for (const c of candidates) {
    const s = score(query, getText(c));
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return bestScore >= threshold ? best : null;
}

module.exports = { normalize, score, bestMatch };