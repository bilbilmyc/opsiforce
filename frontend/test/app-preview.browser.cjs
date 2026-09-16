// Read-only browser regression: never publishes or restarts the selected app.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const base=process.env.PREVIEW_BASE, project=process.env.PREVIEW_PROJECT_ID;
if(!base || !project) throw new Error('Set PREVIEW_BASE to an HTTP ingress and PREVIEW_PROJECT_ID to a running app with dev and prod environments. Optional PREVIEW_ASSETS serves a local build.');
(async()=>{const b=await chromium.launch({headless:true,timeout:20000,args:['--disable-gpu'],...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});try{
const p=await b.newPage({viewport:{width:1600,height:1000}});p.setDefaultTimeout(15000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.route(base+'/**',async r=>{const u=new URL(r.request().url()),path=u.pathname,method=r.request().method();
 if(path.startsWith('/api/')||path==='/runtime-config.js') {if(method==='GET'||path==='/api/users/me')return r.continue();if(method==='PATCH'&&path.endsWith('/session'))return r.fulfill({json:{ok:true}});return r.abort()}
 if(!process.env.PREVIEW_ASSETS)return r.continue();
 return r.fulfill({response:await p.request.get(process.env.PREVIEW_ASSETS+path+u.search)});
});
await p.addInitScript(()=>{window.copyEvents=[];document.addEventListener('copy',()=>window.copyEvents.push(document.activeElement?.value));});
await p.goto(base+'/projects/'+project);
const input=p.getByRole('textbox',{name:'访问链接',exact:true});await input.waitFor();assert.match(await input.inputValue(),/-dev\.apps\./);
assert.equal(await p.evaluate(()=>typeof navigator.clipboard),'undefined');
await p.getByRole('button',{name:'复制链接',exact:true}).click();await p.getByRole('button',{name:'已复制！',exact:true}).waitFor();
assert.deepEqual(await p.evaluate(()=>window.copyEvents),[await input.inputValue()]);
const popupPromise=p.waitForEvent('popup');await p.getByRole('link',{name:'打开应用',exact:true}).click();const popup=await popupPromise;await popup.waitForLoadState('domcontentloaded');assert.equal(popup.url(),await input.inputValue());assert.ok(await popup.title());await popup.close();
await p.getByRole('button',{name:'关闭面板',exact:true}).click();await p.getByRole('button',{name:'显示应用预览',exact:true}).click();await input.waitFor();
await p.getByRole('button',{name:'环境',exact:true}).click();
await p.getByRole('button',{name:'复制应用链接',exact:true}).last().click();assert.match((await p.evaluate(()=>window.copyEvents)).at(-1),/-prod\.apps\./);
await p.getByText('生产',{exact:true}).click();await p.waitForFunction(()=>document.querySelector('input[aria-label="访问链接"]')?.value.includes('-prod.apps.'));
const productionId=new URL(await input.inputValue()).hostname.split('-prod.')[0];
assert.ok((await p.locator('#webapp-preview').getAttribute('src')).includes(productionId+'.preview.'));
await p.evaluate(()=>{document.execCommand=()=>false});await p.getByRole('button',{name:'复制链接',exact:true}).click();await p.getByText('复制失败，请选中访问链接后手动复制。',{exact:true}).waitFor();
assert.deepEqual(errors,[]);console.log('PASS: HTTP clipboard, open app, collapse/reopen, dev/prod URLs, copy failure');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
