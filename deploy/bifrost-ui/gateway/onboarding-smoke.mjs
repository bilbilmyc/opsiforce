import assert from 'node:assert/strict';
const root=process.env.BIFROST_PROXY_URL.replace(/\/v1\/?$/,'');
const headers={'Content-Type':'application/json',Authorization:'Basic '+Buffer.from(process.env.BIFROST_ADMIN_USERNAME+':'+process.env.BIFROST_ADMIN_PASSWORD).toString('base64')};
const name='codex-onboarding-smoke';
async function req(method,path,body){return fetch(root+path,{method,headers,signal:AbortSignal.timeout(20000),...(body===undefined?{}:{body:JSON.stringify(body)})})}
const existing=await req('GET','/api/providers/'+name); assert.equal(existing.status,404,'test provider must not already exist');
try {
 const created=await req('POST','/api/providers',{provider:name,network_config:{base_url:'https://example.com/v1',default_request_timeout_in_seconds:5,max_retries:0,retry_backoff_initial:500,retry_backoff_max:5000},custom_provider_config:{base_provider_type:'openai',is_key_less:false,allowed_requests:{list_models:false,chat_completion:true,chat_completion_stream:true}}});
 if (!created.ok) console.log(await created.text()); assert.ok(created.ok,'create provider status '+created.status);
 const result=await req('PUT','/api/models/catalog',[{provider:name,model:'onboarding-smoke-model',additional_attributes:{'opsiforce.context':'131072','opsiforce.maxOutput':'65536'}}]);
 console.log(JSON.stringify({step:'save-new-channel-model',status:result.status,...(!result.ok?{error:await result.text()}:{})}));
 assert.equal(result.status,204,'new channel model capability save must succeed without SQL initialization');
 const page=await req('GET','/api/models/details?provider='+name+'&limit=100');
 const data=await page.json();
 assert.ok(data.models.some(m=>m.provider===name&&m.name==='onboarding-smoke-model'&&m.additional_attributes?.['opsiforce.context']==='131072'),'catalog readback');
 console.log('PASS: new channel model saved and read back');
} finally { const removed=await req('DELETE','/api/providers/'+name); console.log('fixture provider cleanup: '+removed.status); }
