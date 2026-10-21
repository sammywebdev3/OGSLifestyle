// TEST-ONLY gateway for scripts/test-api.sh: routes /auth/v1 -> GoTrue and /rest/v1 -> PostgREST,
// like Supabase's API gateway, on 127.0.0.1 only. Never used outside the disposable test stack.
import http from 'node:http';

const [port, authPort, restPort] = process.argv.slice(2).map(Number);
const routes = [['/auth/v1', authPort], ['/rest/v1', restPort]];

http.createServer((req, res) => {
  const hit = routes.find(([prefix]) => req.url.startsWith(prefix));
  if (!hit) { res.writeHead(404); res.end(); return; }
  const upstream = http.request(
    { host: '127.0.0.1', port: hit[1], path: req.url.slice(hit[0].length) || '/', method: req.method, headers: { ...req.headers, host: '127.0.0.1' } },
    (up) => { res.writeHead(up.statusCode ?? 502, up.headers); up.pipe(res); },
  );
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.on('error', () => upstream.destroy());
  req.pipe(upstream);
}).listen(port, '127.0.0.1', () => console.log(`gateway on ${port}`));
