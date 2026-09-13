#!/usr/bin/env node
/** Live route audit. It only clicks navigation controls and reads rendered state. */
const port=Number(process.env.CODEX_DEBUG_PORT||9229);const waitMs=Number(process.env.CODEX_AUDIT_WAIT_MS||850);
const pages=async()=>{const x=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());return x.filter(t=>t.type==='page'&&t.webSocketDebuggerUrl&&t.url==='app://-/index.html')};
const [target]=await pages();if(!target)throw Error(`No Codex index renderer on ${port}`);
const ws=new WebSocket(target.webSocketDebuggerUrl);let id=0;
const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===n){ws.removeEventListener('message',h);x.error?reject(Error(JSON.stringify(x.error))):resolve(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:n,method,params}));setTimeout(()=>reject(Error(method)),12000)});
await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})});
const ev=async expression=>(await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result?.value;
const click=async selector=>{const p=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e?.scrollIntoView({block:'nearest',inline:'nearest'});if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);if(!p)return false;await call('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});return true};
const clickText=async text=>{const p=await ev(`(()=>{const all=[...document.querySelectorAll('button,[role=button],[role=menuitem]')];const e=all.find(x=>(x.innerText||x.textContent||'').trim()===${JSON.stringify(text)})||all.find(x=>(x.innerText||x.textContent||'').trim().includes(${JSON.stringify(text)}));if(!e)return null;if(e.getAttribute('role')!=='menuitem')e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect();const s=getComputedStyle(e);if(r.width<8||r.height<8||r.x+r.width<=0||r.y+r.height<=0||r.x>=innerWidth||r.y>=innerHeight||s.visibility==='hidden'||s.display==='none')return null;return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);if(!p)return false;await call('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});return true};
const snapshot=async label=>{await new Promise(r=>setTimeout(r,waitMs));const x=await ev(`(()=>{window.__CODEX_MELODY_SKIN_STATE__?.ensure?.();const d=document.documentElement,b=document.body;return {label:${JSON.stringify(label)},url:location.href,skin:d?.dataset.melodySkin||null,parts:document.querySelectorAll('[data-melody-part]').length,settings:document.querySelectorAll('[data-settings-panel-slug]').length,composer:!!document.querySelector('[data-codex-composer-root],[contenteditable="true"]'),overflowX:d.scrollWidth>d.clientWidth,overflowY:d.scrollHeight>d.clientHeight,heading:[...document.querySelectorAll('h1,h2,h3,[role=heading]')].map(e=>(e.innerText||'').trim()).filter(Boolean).slice(0,2)}})()`);return x};
const out=[];
await clickText('返回应用');
await new Promise(r=>setTimeout(r,500));
for(const [label,text] of [['home','新对话'],['pull','Pull Request'],['tasks','定时任务'],['plugins','插件'],['explore','探索']]){await clickText(text);out.push(await snapshot(label));}
await clickText('新对话');await click('button[aria-label="打开个人资料菜单"]');await new Promise(r=>setTimeout(r,350));
const settingsPoint=await ev(`(()=>{const e=[...document.querySelectorAll('[role=menuitem]')].find(x=>{const r=x.getBoundingClientRect(),s=getComputedStyle(x);return (x.innerText||'').trim().startsWith('设置')&&r.width>8&&r.height>8&&r.x+r.width>0&&r.y+r.height>0&&r.x<innerWidth&&r.y<innerHeight&&s.visibility!=='hidden'&&s.display!=='none'});if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
if(settingsPoint){await call('Input.dispatchMouseEvent',{type:'mousePressed',x:settingsPoint.x,y:settingsPoint.y,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:settingsPoint.x,y:settingsPoint.y,button:'left',clickCount:1});}
await new Promise(r=>setTimeout(r,1000));
const slugs=await ev(`[...document.querySelectorAll('[data-settings-panel-slug]')].map(e=>e.getAttribute('data-settings-panel-slug')).filter((x,i,a)=>a.indexOf(x)===i)`)||[];
for(const slug of slugs){await click(`[data-settings-panel-slug="${slug}"]`);out.push(await snapshot(`settings/${slug}`));}
await clickText('返回应用');
await new Promise(r=>setTimeout(r,500));
if(await clickText('开发 macOS 风格 Codex 皮肤')) out.push(await snapshot('thread'));
const bad=out.filter(x=>!x||x.skin!=='active'||x.overflowX||x.overflowY||(x.label==='home'&&!x.composer));console.log(JSON.stringify({ok:bad.length===0,checked:out.length,settings:slugs.length,bad,out},null,2));ws.close();if(bad.length)process.exit(1);
