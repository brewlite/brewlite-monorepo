const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const {spawn} = require('node:child_process');
async function exercise(badHealth) {
  const seen=[];
  const server=http.createServer((req,res)=>{seen.push(req.url);res.setHeader('Content-Type',req.url.startsWith('/api/')?'application/json':'text/html');res.end(req.url==='/api/health'?JSON.stringify({status:badHealth?'error':'ok'}):req.url==='/api/products'?'[]':'<html><body>BrewLite test page</body></html>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.resolve('deploy/smoke.mjs'),`http://127.0.0.1:${server.address().port}`],{stdio:'pipe'});child.on('error',reject);child.on('close',resolve);});
    return {code,seen};
  } finally {await new Promise(resolve=>server.close(resolve));}
}
test('smoke visits all public read-only endpoints on healthy HTTP fixture',async()=>{const r=await exercise(false);assert.equal(r.code,0);assert.deepEqual(r.seen,['/api/health','/api/products','/','/menu','/login']);});
test('smoke rejects HTTP 200 with unhealthy JSON, before acceptance',async()=>{const r=await exercise(true);assert.notEqual(r.code,0);assert.deepEqual(r.seen,['/api/health']);});
