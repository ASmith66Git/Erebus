const express = require('express');
const path = require('path');
const fs = require('fs');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 5000;

const distPath = path.join(__dirname, '..', 'dist', 'web');
const indexPath = path.join(distPath, 'index.html');

app.use('/api', createProxyMiddleware({
  target: 'http://localhost:3001/api',
  changeOrigin: true,
}));

app.use(express.static(distPath, {
  etag: false,
  maxAge: 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));

app.use((req, res) => {
  if (fs.existsSync(indexPath)) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Build not found. Run: npx expo export --platform web --output-dir dist/web');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Web server running on http://0.0.0.0:${PORT}`);
});
