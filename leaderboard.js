// Vercel Serverless Function — IQ test umumiy reytingi (Upstash Redis REST orqali)
// Joylashuvi: repozitoriyda  api/leaderboard.js
const DB_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const DB_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(commands) {
  const r = await fetch(DB_URL + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + DB_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands)
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return (await r.json()).map(x => { if (x.error) throw new Error(x.error); return x.result; });
}

const cleanId = v => String(v || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!DB_URL || !DB_TOKEN) return res.status(503).json({ error: 'db not configured' });
  try {
    if (req.method === 'POST') {
      const b = req.body || {};
      const id = cleanId(b.id);
      const iq = Math.round(Number(b.iq));
      const name = String(b.name || '').replace(/[<>&"]/g, '').trim().slice(0, 30) || 'Ishtirokchi';
      if (id.length < 8 || !(iq >= 40 && iq <= 180)) return res.status(400).json({ error: 'bad input' });
      await redis([['ZADD', 'iq:board', 'GT', iq, id], ['HSET', 'iq:names', id, name]]);
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'GET') {
      const id = cleanId(req.query && req.query.id);
      const cmds = [['ZCARD', 'iq:board'], ['ZREVRANGE', 'iq:board', 0, 9, 'WITHSCORES']];
      if (id) cmds.push(['ZSCORE', 'iq:board', id]);
      const [total, top, mine] = await redis(cmds);
      let rank = null;
      if (mine !== null && mine !== undefined) {
        const [greater] = await redis([['ZCOUNT', 'iq:board', '(' + mine, '+inf']]);
        rank = greater + 1;
      }
      const ids = [], scores = [];
      for (let i = 0; i < top.length; i += 2) { ids.push(top[i]); scores.push(Number(top[i + 1])); }
      const names = ids.length ? (await redis([['HMGET', 'iq:names', ...ids]]))[0] : [];
      return res.status(200).json({ total, rank, top: ids.map((_, i) => ({ n: names[i] || 'Ishtirokchi', iq: scores[i] })) });
    }
    return res.status(405).json({ error: 'method' });
  } catch (e) {
    return res.status(500).json({ error: 'server' });
  }
};
