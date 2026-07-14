// Global high-score leaderboard via dreamlo (no backend needed).
//
// SETUP: go to https://dreamlo.com, click "Get New Leaderboard", and paste the
// two codes below. The private code can write scores; the public code reads them.
// Note: in a browser game the private code is visible to players (that's dreamlo's
// design). To wipe/reset, generate a fresh leaderboard and swap the codes.
const DREAMLO = {
  publicCode:  'PUT_PUBLIC_CODE_HERE',
  privateCode: 'PUT_PRIVATE_CODE_HERE',
  base: 'https://www.dreamlo.com/lb',
};

const Leaderboard = {
  configured() { return DREAMLO.publicCode && !DREAMLO.publicCode.startsWith('PUT_'); },

  // Fire-and-forget write (no-cors: the GET records the score, response is opaque)
  submit(name, score) {
    if (!this.configured()) return Promise.resolve();
    const n = encodeURIComponent((name || 'ANON').slice(0, 16));
    return fetch(`${DREAMLO.base}/${DREAMLO.privateCode}/add/${n}/${Math.floor(score)}`, { mode: 'no-cors' })
      .catch(() => {});
  },

  // Top N scores, already sorted high→low by dreamlo. Resolves [] on any failure.
  top(count = 10) {
    if (!this.configured()) return Promise.resolve([]);
    return fetch(`${DREAMLO.base}/${DREAMLO.publicCode}/json/${count}`)
      .then(r => r.json())
      .then(d => {
        const lb = d && d.dreamlo && d.dreamlo.leaderboard;
        if (!lb || !lb.entry) return [];
        const e = lb.entry;
        return (Array.isArray(e) ? e : [e]).map(x => ({ name: x.name, score: +x.score }));
      })
      .catch(() => []);
  },
};
