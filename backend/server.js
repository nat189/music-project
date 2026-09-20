const express = require('express');
const cors = require('cors');
const YouTube = require('youtube-sr').default;
const youtubedl = require('youtube-dl-exec');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Music Streaming Backend is running!');
});

// 1. API ค้นหาเพลง
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
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// 2. API สตรีมเสียง (ใช้ Android Client เลี่ยงบอท และรองรับทั้ง WebM / M4A)
app.get('/api/stream', (req, res) => {
  const videoId = req.query.id;
  if (!videoId) return res.status(400).send('Missing video ID');

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  console.log(`[Stream Request] Starting stream for: ${videoId}`);

  // รองรับ audio/mp4 และ audio/webm
  res.setHeader('Content-Type', 'audio/mp4');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Accept-Ranges', 'bytes');

  // เรียกใช้ yt-dlp พร้อม flags พิเศษสำหรับ Server
  const subprocess = youtubedl.exec(videoUrl, {
    format: '140/bestaudio[ext=m4a]/bestaudio', // ดึง m4a ซึ่งเสถียรที่สุดในเบราว์เซอร์
    output: '-',
    extractorArgs: 'youtube:player_client=android', // ป้องกันการตรวจจับบอทบน Cloud IP
    noCheckCertificates: true,
    noWarnings: true
  });

  if (subprocess.stdout) {
    subprocess.stdout.pipe(res);
  }

  // ดักจับ Log เพื่อเช็คปัญหาใน Render Logs
  if (subprocess.stderr) {
    subprocess.stderr.on('data', (data) => {
      console.error(`yt-dlp stderr: ${data.toString()}`);
    });
  }

  req.on('close', () => {
    try {
      subprocess.kill();
    } catch (e) {}
  });

  subprocess.on('error', (err) => {
    console.error('Subprocess error:', err);
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
