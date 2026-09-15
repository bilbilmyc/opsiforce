// Run against a test deployment with an existing project/session. All writes are mocked or blocked.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('node:assert/strict');
const project=process.env.CHAT_PROJECT_ID,session=process.env.CHAT_SESSION_ID;
if(!project || !session) throw new Error('Set CHAT_PROJECT_ID and CHAT_SESSION_ID to an existing test session.');
const upstream=process.env.CHAT_UPSTREAM_URL || process.env.CHAT_TEST_BASE;
if(!upstream) throw new Error('Set CHAT_TEST_BASE and optionally CHAT_UPSTREAM_URL for a local preview.');
const output=process.env.CHAT_TEST_OUTPUT || '/tmp/opsiforce-chat-regression';
fs.mkdirSync(output,{recursive:true});
const base=process.env.CHAT_TEST_BASE||upstream;
(async()=>{
 const browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars'],timeout:20000,args:['--disable-gpu'],...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
 try{
  const context=await browser.newContext({viewport:{width:1600,height:1000}});
  await context.addInitScript(() => {
   const original = window.fetch.bind(window);
   window.fetch = (input, options) => {
    const url = typeof input === 'string' ? input : input.url || String(input);
    if (!new URL(url, location.href).pathname.endsWith('/api/event')) return original(input, options);
    const encoder = new TextEncoder();
    return Promise.resolve(new Response(new ReadableStream({start(controller) {
     const emit = event => controller.enqueue(encoder.encode('data: '+JSON.stringify(event)+'\n\n'));
     window.__emitChatEvent = emit;
     emit({id:'evt_0a45edf60001XmH3CtO5WCeW6E',type:'server.connected',data:{}});
    }}), {headers:{'Content-Type':'text/event-stream'}}));
   };
  });
  let finished=false;
  let content='STREAMED_REASONING_VISIBLE\n\nThe server has returned this reasoning text.';
  const projects=await fetch(upstream+'/api/projects').then(r=>r.json());
  const projectInfo=projects.find(p=>p.id===project);
  if(!projectInfo) throw new Error('Test project not found');
  const sessionInfo=await fetch(upstream+'/api/proxy/'+project+'/api/session/'+session).then(r=>r.json());
  const message={data:[
   {id:'msg_0a4540c4600158yCo5SgVMLg3C',type:'assistant',time:{created:Date.now()-1000},agent:sessionInfo.data.agent,model:sessionInfo.data.model,content:[]},
   {id:'msg_0a4540adf001r8BJ4EfF5EYa6b',type:'user',text:'Explain this example.',files:[],agents:[],time:{created:Date.now()-2000}}
  ],cursor:{}};
  const requests=[];
  await context.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname;
   if(path==='/api/projects/'+project+'/events')return route.fulfill({status:200,contentType:'text/event-stream',body:'data: '+JSON.stringify({id:project,status:'active',workspaceId:projectInfo.workspaceId,title:projectInfo.title,app:null})+'\n\n'});
   if(path.endsWith('/api/event')||path.endsWith('/events'))return route.fulfill({status:200,contentType:'text/event-stream',body:': fixture\n\n'});
   if(path.endsWith('/api/session/active'))return route.fulfill({json:{data:finished?{}:{[session]:{type:'running'}}}});
   if(path.endsWith('/api/session/'+session+'/message')){
    const data=structuredClone(message);for(const m of data.data)if(m.type==='assistant'){m.content=[{type:'reasoning',text:content,time:{created:Date.now()-2000}}];if(finished){m.content.unshift({type:'text',text:'INTERMEDIATE_FORMAL_OUTPUT'});m.finish='stop';m.time.completed=Date.now();m.content.push({type:'text',text:'FINAL_ANSWER_VISIBLE'});}}
    return route.fulfill({json:data});
   }
   if(req.method()==='PATCH' && path==='/api/projects/'+project+'/environments/'+project+'/session')return route.fulfill({json:{ok:true}});
   if(req.method()!=='GET'&&path!='/api/users/me'){requests.push(path);return route.abort()}
   const response=await route.fetch({url:upstream+path+url.search,headers:{}});return route.fulfill({response});
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/projects/'+project);
  await page.locator('[contenteditable="true"]').first().waitFor({timeout:20000}).catch(async e=>{console.log('BODY',await page.locator('body').innerText(),'ERRORS',errors,'REQUESTS',requests);throw e});
  const reasoning=page.locator('[data-component="reasoning-part"]');
  await page.getByText('STREAMED_REASONING_VISIBLE',{exact:false}).waitFor({timeout:10000});
  assert(await reasoning.locator('button').first().getAttribute('aria-expanded')==='true','reasoning is expanded without nested clicks');
  assert.equal(await page.locator('[data-component="turn-completion-status"]').count(),0,'no duplicate active status');
  const x=await page.locator('[data-component="turn-activity"]').evaluate(e=>e.getBoundingClientRect().x),composerX=await page.locator('[data-component="composer"]').evaluate(e=>e.getBoundingClientRect().x);
  assert(Math.abs(x-composerX)<20,'process panel aligns with message column');
  await reasoning.locator('button').first().click();assert.equal(await reasoning.locator('button').first().getAttribute('aria-expanded'),'false');
  await reasoning.locator('button').first().click();await page.getByText('STREAMED_REASONING_VISIBLE',{exact:false}).waitFor();
  await page.screenshot({path:output+'/content.png',fullPage:true});
  content='';await page.reload();await page.getByText('模型尚未返回思考内容，收到后会在这里实时显示。',{exact:true}).waitFor({timeout:20000});
  assert.equal(await page.locator('[data-component="turn-completion-status"]').count(),0);
  assert.equal(await page.locator('[data-component="session-working"]').count(),0);
  assert.equal(await page.getByText(/Used|Thoughts|Notices/).count(),0);
  await page.screenshot({path:output+'/waiting.png',fullPage:true});
  assert.equal(await reasoning.locator('button').count(),0,'empty thought has no misleading disclosure');
  await page.evaluate(({session})=>window.__emitChatEvent({id:'evt_0a45edf60002XmH3CtO5WCeW6E',created:Date.now(),type:'session.reasoning.delta',location:{directory:'/workspace'},data:{sessionID:session,assistantMessageID:'msg_0a4540c4600158yCo5SgVMLg3C',ordinal:0,delta:'LIVE_DELTA_VISIBLE\n\n'+('A streamed reasoning paragraph.\n\n'.repeat(2500))}}),{session});
  await page.getByText('LIVE_DELTA_VISIBLE',{exact:true}).waitFor({timeout:20000});
  assert.equal(await page.locator('[data-slot="reasoning-waiting"]').count(),0,'waiting replaced by live text');
  const panel=page.locator('[data-component="turn-activity"]');
  assert.equal(await panel.count(),1,'all activity is one group');
  const scroll=await page.locator('[data-slot="activity-scroll"]').evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight}));
  assert(scroll.height<=420 && scroll.scroll>scroll.height,'the whole process has one bounded scrollbar');
  assert.equal(await page.locator('[data-slot="reasoning-content"]').evaluate(e=>getComputedStyle(e).overflowY),'visible');
  await panel.locator('[data-slot="activity-toggle"]').click();
  assert.equal(await page.locator('[data-slot="activity-scroll"]').count(),0,'whole process closes');
  await page.evaluate(({session})=>window.__emitChatEvent({id:'evt_0a45edf60003XmH3CtO5WCeW6E',created:Date.now(),type:'session.reasoning.delta',location:{directory:'/workspace'},data:{sessionID:session,assistantMessageID:'msg_0a4540c4600158yCo5SgVMLg3C',ordinal:0,delta:' User collapse is preserved.'}}),{session});
  assert.equal(await panel.locator('[data-slot="activity-toggle"]').getAttribute('aria-expanded'),'false');
  await panel.locator('[data-slot="activity-toggle"]').click();
  await page.getByText('LIVE_DELTA_VISIBLE',{exact:true}).waitFor();
  const viewport=page.locator('[data-slot="activity-scroll"]');
  await page.setViewportSize({width:1600,height:500});
  await page.waitForFunction(()=>document.querySelector('[data-slot="activity-scroll"]').clientHeight<=250);
  await viewport.hover();
  const outerBefore=await viewport.evaluate(e=>{let p=e.parentElement;while(p){if(/auto|scroll/.test(getComputedStyle(p).overflowY)&&p.scrollHeight>p.clientHeight){window.__chatOuter=p;return p.scrollTop}p=p.parentElement}return null});
  assert.notEqual(outerBefore,null,'fixture has an independently scrollable conversation');
  await page.mouse.wheel(0,300);
  await page.waitForFunction(()=>document.querySelector('[data-slot="activity-scroll"]').scrollTop>0);
  assert.equal(await page.evaluate(()=>window.__chatOuter.scrollTop),outerBefore,'inner wheel does not scroll conversation');
  const outerBox=await page.evaluate(()=>{const r=window.__chatOuter.getBoundingClientRect();return {x:r.x,y:r.y,height:r.height,top:window.__chatOuter.scrollTop}});
  await page.mouse.move(outerBox.x+5,outerBox.y+outerBox.height/2);await page.mouse.wheel(0,outerBox.top>0?-200:200);
  await page.waitForFunction(top=>window.__chatOuter.scrollTop!==top,outerBox.top);
  await page.setViewportSize({width:1600,height:1000});
  await page.screenshot({path:output+'/process.png',fullPage:true});
  await page.reload();await page.locator('[data-slot="reasoning-waiting"]').waitFor();

  await page.getByRole('combobox',{name:'语言 / Language',exact:true}).selectOption('en');
  await page.getByText('The model has not returned reasoning text yet. It will appear here as it arrives.',{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});await page.reload();await page.getByText('The model has not returned reasoning text yet. It will appear here as it arrives.',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-component="turn-activity"]').evaluate(e=>e.getBoundingClientRect().width>390),false);
  await page.screenshot({path:output+'/mobile.png',fullPage:true});
  finished=true;content='Completed reasoning';await page.setViewportSize({width:1600,height:1000});await page.reload();
  await page.getByText('This turn is complete',{exact:true}).waitFor();
  await page.getByText('FINAL_ANSWER_VISIBLE',{exact:true}).waitFor();
  await page.getByText('INTERMEDIATE_FORMAL_OUTPUT',{exact:true}).waitFor();
  assert.equal(await page.getByText('INTERMEDIATE_FORMAL_OUTPUT',{exact:true}).evaluate(e=>!!e.closest('[data-component="turn-activity"]')),false,'intermediate formal output stays outside the collapsed process');
  assert.equal(await page.locator('[data-slot="activity-toggle"]').getAttribute('aria-expanded'),'false','finished process collapsed by default');
  assert.equal(await page.locator('[data-slot="activity-scroll"]').count(),0);
  await page.locator('[data-slot="activity-toggle"]').click();
  await page.getByText('Completed reasoning',{exact:true}).waitFor();
  await page.screenshot({path:output+'/completed.png',fullPage:true});
  const terminal=await page.locator('[data-component="turn-completion-status"]').boundingBox();
  const composer=await page.locator('[data-component="composer"]').boundingBox();
  assert(Math.abs(terminal.x-composer.x)<20,'terminal status also aligns with message column');
  assert.equal(await page.locator('[data-component="session-working"]').count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  console.log('PASS: supplied reasoning visible, one-click folding, aligned column, empty reasoning explained, one active status, live SSE delta, bounded long thoughts, bilingual + mobile. API fixtures only; no chat submitted.');
 }finally{for(const context of browser.contexts())await context.unrouteAll({behavior:'ignoreErrors'});await browser.close()}
})().catch(e=>{console.error(e.message);process.exit(1)});
