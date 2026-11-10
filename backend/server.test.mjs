import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHandler } from './server.mjs';

const env = {
  OPENAI_API_KEY: 'not-a-real-key',
  NOVA_APP_PASSWORD: 'example-for-tests-only',
  NOVA_SESSION_SECRET: 'test-only-string-test-only-string-test-only'
};
test('requires credentials', () => {
  assert.throws(() => createHandler({ env: {} }), /Set OPENAI_API_KEY/);
});
test('health and auth', async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls++;
    return { ok:true, status:200, json:async () => ({
      output:[{content:[{type:'output_text',text:'Hello from test AI'}]}]
    }) };
  };
  const server = http.createServer(createHandler({env, fetchImpl:fakeFetch}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const base='http://127.0.0.1:'+server.address().port;
    const h={ 'Content-Type':'application/json', Origin:'https://appassets.androidplatform.net' };
    const health=await fetch(base+'/health');
    assert.equal(health.status,200);
    const denied=await fetch(base+'/api/chat',{method:'POST',headers:h,body:'{}'});
    assert.equal(denied.status,401);
    const login=await fetch(base+'/api/login',{method:'POST',headers:h,body:JSON.stringify({password:env.NOVA_APP_PASSWORD})});
    assert.equal(login.status,200);
    const token=(await login.json()).token;
    const result=await fetch(base+'/api/chat',{method:'POST',headers:{...h,Authorization:'Bearer '+token},
      body:JSON.stringify({messages:[{role:'user',content:'Hi'}]})});
    assert.equal(result.status,200);
    assert.equal((await result.json()).reply,'Hello from test AI');
    assert.equal(calls,1);
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
});
