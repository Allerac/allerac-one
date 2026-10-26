// Live regression check for the eMudhra incident. No HTTP requests or credentials.
// Network failures are inconclusive and fail the check, never count as protection.
const tls = require('node:tls'); // eslint-disable-line @typescript-eslint/no-require-imports
const control = 'emudhra.we-have-a-problem.com';
const prefixes = ['dv-g3b', 'dv-g3b-aaa', 'dv-g3b-noct', 'dv-g3b-aaa-noct',
  'dv-g3c', 'dv-g3c-aaa', 'ev-g3b', 'ev-g3b-aaa', 'ev-g3c', 'ev-g3c-aaa',
  'ov-g3b', 'ov-g3b-aaa', 'ov-g3c', 'ov-g3c-aaa'];
const certificateErrors = new Set(['CERT_REVOKED', 'CERT_UNTRUSTED',
  'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN']);

function check(host) {
  return new Promise(resolve => {
    const conn = tls.connect({host, port: 443, servername: host, rejectUnauthorized: true});
    conn.setTimeout(15000, () => conn.destroy(Object.assign(new Error('timeout'), {code: 'TIMEOUT'})));
    conn.once('secureConnect', () => {
      conn.end();
      resolve({host, accepted: true, pass: host === control});
    });
    conn.once('error', error => resolve({host, code: error.code, accepted: false,
      pass: host !== control && certificateErrors.has(error.code)}));
  });
}

(async () => {
  const hosts = [control, ...prefixes.map(prefix => `${prefix}-emudhra.we-have-a-problem.com`)];
  const results = await Promise.all(hosts.map(check));
  for (const result of results) console.log(JSON.stringify({node: process.version, ...result}));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})();
