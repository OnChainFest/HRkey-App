import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export default async function handler(req, res) {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const htmlPath = join(__dirname, '..', '..', 'static', 'app.html');
    const html = readFileSync(htmlPath);
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  } catch (e) {
    return new Response('Not Found', { status: 404 });
  }
}
