const express = require('express');
const cors = require('cors');
const { Readable } = require('stream');
const YouTube = require('youtube-sr').default;
const youtubedl = require('youtube-dl-exec');

const app = express();
const PORT = process.env.PORT || 3000;

// ป้องกันเซิร์ฟเวอร์ล่ม (Crash Shield) หมดปัญหา 502 Bad Gateway
process.on('uncaughtException', (err) => {
  console.error('Caught Exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

app.use(cors());
app.use(express.json());

// เช็คสถานะเซิร์ฟเวอร์
app.get('/', (req, res) => {
  res.send('Music Streaming Backend is running stably!');
});

// 1. API ค้นหาเพลงไทยและสากล
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Missing query' });

    const videos = await YouTube.search(query, { limit: 15, type: 'video' });
    const results = videos.map(v => ({
      id: v.id,
      title: v.title,
      artist: v.channel ? v.channel.name : 'ศิลปิน',
      cover: v.thumbnail ? v.thumbnail.url : `https://img.youtube.com/vi/${v.id}/hqdefault.jpg`,
      duration: v.durationFormatted
    }));

    res.json(results);
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

// 2. API สตรีมเสียงสด (Hybrid Streaming ไม่ติดบล็อก Data Center IP)
app.get('/api/stream', async (req, res) => {
  const videoId = req.query.id;
  if (!videoId) return res.status(400).send('Missing video ID');

  console.log(`[Stream] Requesting audio for: ${videoId}`);

  // โหนด Invidious Relay สำหรับดึงเสียงโดยตรงไม่ติดบล็อก Data Center
  const relayHosts = [
    'https://inv.nadeko.net',
    'https://invidious.nerdvpn.de',
    'https://inv.tux.pizza'
  ];

  // วิธีที่ 1: ดึง Stream ตรงผ่าน Relay Relay
  for (const host of relayHosts) {
    try {
      const streamUrl = `${host}/latest_version?id=${videoId}&itag=140`;
      const streamRes = await fetch(streamUrl, { 
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(6000) 
      });

      if (streamRes.ok && streamRes.body) {
        res.setHeader('Content-Type', 'audio/mp4');
        res.setHeader('Transfer-Encoding', 'chunked');
        Readable.fromWeb(streamRes.body).pipe(res);
        return;
      }
    } catch (e) {
      console.warn(`Host ${host} failed, trying next...`);
    }
  }

  // วิธีที่ 2: ดึงผ่าน yt-dlp พร้อมระบบดัก Error ปลอดภัย
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const subprocess = youtubedl.exec(videoUrl, {
      format: 'bestaudio',
      output: '-',
      extractorArgs: 'youtube:player_client=android',
      noCheckCertificates: true,
      noWarnings: true
    });

    subprocess.catch((err) => {
      console.error('yt-dlp fallback error:', err.message);
      if (!res.headersSent) res.status(500).send('Stream error');
    });

    if (subprocess.stdout) {
      res.setHeader('Content-Type', 'audio/webm');
      subprocess.stdout.pipe(res);
    }

    req.on('close', () => {
      try { subprocess.kill(); } catch (e) {}
    });

  } catch (err) {
    console.error('Final stream fallback error:', err.message);
    if (!res.headersSent) res.status(500).send('Unable to stream this track');
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
