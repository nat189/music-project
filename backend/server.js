const express = require('express');
const cors = require('cors');
const YouTube = require('youtube-sr').default;
const youtubedl = require('youtube-dl-exec');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// เช็คสถานะเซิร์ฟเวอร์
app.get('/', (req, res) => {
  res.send('Music Streaming Backend is running!');
});

// 1. ค้นหาเพลงไทยได้ทุกเพลง (ไม่ต้องใช้ API Key)
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

// 2. สตรีมเสียงสด (Stream Pipe ตรงผ่าน yt-dlp เลี่ยง Error 150)
app.get('/api/stream', (req, res) => {
  const videoId = req.query.id;
  if (!videoId) return res.status(400).send('Missing video ID');

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  res.setHeader('Content-Type', 'audio/webm');
  res.setHeader('Transfer-Encoding', 'chunked');

  const subprocess = youtubedl.exec(videoUrl, {
    format: 'bestaudio',
    output: '-'
  });

  if (subprocess.stdout) {
    subprocess.stdout.pipe(res);
  }

  req.on('close', () => {
    try {
      subprocess.kill();
    } catch (e) {}
  });

  subprocess.on('error', (err) => {
    console.error('Streaming error:', err);
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
