// TEST-ONLY SMTP server for scripts/test-api.sh: accepts every message from the local Auth
// container and writes it to <dir>/<n>.eml so tests can read reset links. No auth, no TLS,
// no relaying. Never used outside the disposable test stack.
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const [port, dir] = [Number(process.argv[2]), process.argv[3]];
fs.mkdirSync(dir, { recursive: true });
let n = 0;

net.createServer((sock) => {
  let buf = ''; let inData = false; let msg = '';
  const say = (line) => sock.write(`${line}\r\n`);
  say('220 sink.test ESMTP');
  sock.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    for (;;) {
      if (inData) {
        const end = buf.indexOf('\r\n.\r\n');
        if (end < 0) return;
        msg += buf.slice(0, end); buf = buf.slice(end + 5); inData = false;
        fs.writeFileSync(path.join(dir, `${String(++n).padStart(4, '0')}.eml`), msg); msg = '';
        say('250 OK queued');
        continue;
      }
      const nl = buf.indexOf('\r\n');
      if (nl < 0) return;
      const line = buf.slice(0, nl); buf = buf.slice(nl + 2);
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === 'EHLO') { sock.write('250-sink.test\r\n250 8BITMIME\r\n'); }
      else if (cmd === 'HELO' || cmd === 'MAIL' || cmd === 'RCPT' || cmd === 'RSET' || cmd === 'NOOP') say('250 OK');
      else if (cmd === 'DATA') { inData = true; say('354 End data with <CR><LF>.<CR><LF>'); }
      else if (cmd === 'QUIT') { say('221 Bye'); sock.end(); return; }
      else say('502 Not implemented');
    }
  });
  sock.on('error', () => {});
}).listen(port, '0.0.0.0', () => console.log(`smtp sink on ${port} -> ${dir}`));
