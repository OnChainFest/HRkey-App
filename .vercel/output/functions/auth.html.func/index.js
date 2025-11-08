const { readFileSync } = require('fs');
const { join } = require('path');

module.exports = async (req, res) => {
  try {
    const htmlPath = join(__dirname, '..', '..', 'static', 'auth.html');
    const html = readFileSync(htmlPath);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(html);
  } catch (e) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not Found');
  }
};
