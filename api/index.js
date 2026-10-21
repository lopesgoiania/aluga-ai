import app from '../artifacts/api-server/dist/app.mjs';

// Restore the path captured by the Vercel rewrite before dispatching to Express.
export default function handler(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const path = url.searchParams.get('__eva_path');
  if (path === null) {
    res.statusCode = 404;
    res.end();
    return;
  }
  url.searchParams.delete('__eva_path');
  req.url = `/api/${path.replace(/^\/+/, '')}${url.search}`;
  app(req, res);
}
