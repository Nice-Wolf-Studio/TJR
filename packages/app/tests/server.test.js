const test = require('node:test');
const assert = require('node:assert/strict');

const { createServer } = require('../dist/server.js');
const http = require('node:http');

function get(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () =>
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null })
        );
      })
      .on('error', reject);
  });
}

test('health endpoint responds', async () => {
  const app = createServer({ mode: 'fixture', port: 9090, fixturePath: '' });
  app.listen();
  const res = await get('http://localhost:9090/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  app.server.close();
});
