// Native Chromium geometry on actual minified-bundle renderings; synthetic data only.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,relative,isAbsolute,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const project=dirname(dirname(fileURLToPath(import.meta.url)));
const browser=[process.env.LUBI_BROWSER,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(p=>p&&existsSync(p));
if(!browser) { if(process.env.LUBI_REQUIRE_BROWSER==='1')throw new Error('Native browser required for planning layout'); console.log('SKIP planning layout: browser unavailable'); }
else {
 const preview=spawnSync(process.execPath,['test/preview.mjs'],{cwd:project,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});assert.equal(preview.status,0,preview.stderr+preview.stdout);
 const tmp=mkdtempSync(join(tmpdir(),'lubi-planning-layout-'));
 try {
  for(const theme of ['light','dark'])for(const width of [1400,800,390,320]) {
   const cases=[];
   for(const mode of ['calendar','gantt','list'])for(const period of ['day','week','month']) {
    const name=`planning-${mode}-${period}`;const html=readFileSync(join(project,'preview',theme==='dark'?'dark':'',name+'.html'),'utf8');
    const probe=`<script>addEventListener('load',()=>{requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
      const head=document.querySelector('.lubi-planning-head'),main=document.querySelector('.lubi-planning-main'),root=document.querySelector('.lubi-root');
      const switches=[...head.querySelectorAll('.lubi-seg')].map(e=>({box:rect(e),display:getComputedStyle(e).display,selected:e.querySelectorAll('[aria-pressed="true"]').length}));
      const out={name:${JSON.stringify(name)},width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,rootOverflow:root.scrollWidth-root.clientWidth,pageOverflow:document.querySelector(".lubi-page").scrollWidth-document.querySelector(".lubi-page").clientWidth,switches,head:rect(head),main:rect(main),debug:[...document.querySelectorAll("body *")].filter(e=>rect(e).right>innerWidth+1&&rect(e).width>0).slice(0,12).map(e=>({cls:e.className,rect:rect(e),pos:getComputedStyle(e).position,overflow:getComputedStyle(e).overflowX})),rootBox:rect(root),titleLeft:[...document.querySelectorAll('.lubi-task-title,.lubi-gantt-title,.lubi-month-task')].every(e=>getComputedStyle(e).textAlign==='left'),week:null,month:null,list:null};
      const week=document.querySelector('.lubi-week-body');if(week){
        const headers=[...document.querySelectorAll('.lubi-week-day')],cols=[...week.querySelectorAll('.lubi-week-col')];
        const first=week.querySelector('.lubi-week-hour'),end=week.querySelector('.lubi-week-hour.is-day-end');week.scrollTop=0;
        const fr=rect(first),wr=rect(week);const zeroVisible=fr.top>=wr.top-.5&&fr.bottom<=wr.bottom+.5;
        week.scrollTop=week.scrollHeight;const er=rect(end),axis=rect(week);
        out.week={scroll:getComputedStyle(week.parentElement.parentElement).overflowX,cardWidth:week.parentElement.parentElement.clientWidth,cardScroll:week.parentElement.parentElement.scrollWidth,marks:[...document.querySelectorAll(".lubi-wblock.is-done .lubi-wblock-title")].every(e=>["none","normal"].includes(getComputedStyle(e,"::before").content)&&getComputedStyle(e).textDecorationLine.includes("line-through")),allDayDone:[...document.querySelectorAll(".lubi-allday-chip.is-done")].every(e=>getComputedStyle(e).textDecorationLine.includes("line-through")),count:cols.length,align:headers.every((h,i)=>Math.abs(rect(h).left-rect(cols[i]).left)<=1&&Math.abs(rect(h).width-rect(cols[i]).width)<=1),zero:first.textContent,zeroVisible,end:end.textContent,endVisible:er.top>=axis.top-.5&&er.bottom<=axis.bottom+.5,cursor:cols.every(c=>getComputedStyle(c).cursor==='crosshair')};
      }
      const month=document.querySelector('.lubi-month-calendar');if(month){const sc=month.parentElement;out.month={cells:month.querySelectorAll('.lubi-month-day').length,inside:rect(sc).right<=innerWidth+1,scroll:getComputedStyle(sc).overflowX,minCell:Math.min(...[...month.querySelectorAll('.lubi-month-day')].map(c=>rect(c).width))};}
      const list=document.querySelector('.lubi-plan-range-list');if(list)out.list={inside:rect(list).right<=innerWidth+1,sidebarCards:document.querySelectorAll('.lubi-task-lists .lubi-list-card').length,rows:list.querySelectorAll('.lubi-task').length};
      parent.postMessage({type:'planning-layout',value:out},'*');
    }));},{once:true});<\/script>`;
    cases.push({name,html:html.replace('</body>',probe+'</body>')});
   }
   const parent=`<!doctype html><html><body style="margin:0"><pre id="results"></pre><script>
     const cases=${JSON.stringify(cases).replaceAll('<','\\u003c')};const results=[];
     addEventListener('message',e=>{if(e.data?.type==='planning-layout'){results.push(e.data.value);if(results.length===cases.length)document.getElementById('results').textContent='LUBI_PLANNING:'+encodeURIComponent(JSON.stringify(results));}});
     for(const c of cases){const frame=document.createElement('iframe');frame.style.cssText='border:0;display:block;width:${width}px;height:850px';frame.srcdoc=c.html;document.body.append(frame);}
     </script></body></html>`;
   const file=join(tmp,`${theme}-${width}.html`);writeFileSync(file,parent,'utf8');
   const run=spawnSync(browser,['--headless=new','--disable-gpu','--disable-extensions','--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1000','--force-device-scale-factor=1','--virtual-time-budget=4000',`--user-data-dir=${join(tmp,`profile-${theme}-${width}`)}`,'--dump-dom',pathToFileURL(file).href],{encoding:'utf8',timeout:45000,maxBuffer:20*1024*1024});
   assert.equal(run.status,0,run.error||run.stderr?.slice(-700));const found=[...run.stdout.matchAll(/LUBI_PLANNING:(%5B[^<\s]+)/g)].at(-1);assert(found,`missing planning metrics: ${run.stderr?.slice(-500)} ${run.stdout.slice(-500)}`);
   const metrics=JSON.parse(decodeURIComponent(found[1]));assert.equal(metrics.length,9);
   for(const g of metrics){const label=`${theme} ${width}px ${g.name}`;
     assert.equal(g.width,width,label+' native viewport width');assert(g.overflow<=1,label+' page overflow '+JSON.stringify(g));
     assert.equal(g.switches.length,2,label+' exactly two view/range groups');assert(g.switches.every(s=>s.display!=='none'&&s.box.width>0&&s.box.left>=0&&s.box.right<=width+1&&s.selected===1),label+' controls visible '+JSON.stringify(g));
     assert(g.main.width>0&&g.main.right<=width+1,label+' main stays visible');assert(g.titleLeft,label+' task titles left aligned');
     if(g.week){assert((g.week.cardScroll<=g.week.cardWidth+1||g.week.scroll==='auto')&&g.pageOverflow<=1,label+' calendar scroll containment '+JSON.stringify(g));assert.equal(g.week.count,g.name.endsWith('-day')?1:7,label+' calendar columns');assert(g.week.marks&&g.week.allDayDone&&g.week.align&&g.week.zero==='00:00'&&g.week.end==='24:00'&&g.week.zeroVisible&&g.week.endVisible&&g.week.cursor,label+' aligned full-day axis '+JSON.stringify(g.week));}
     if(g.month){assert([28,35,42].includes(g.month.cells)&&g.month.inside&&g.month.scroll==='auto'&&g.month.minCell>=80,label+' month scroll/geometry '+JSON.stringify(g.month));}
     if(g.list){assert(g.list.inside&&g.list.sidebarCards===1&&g.list.rows>0,label+' list with no duplicate sidebar');}
   }
   console.log(`PASS planning native layout: ${theme} ${width}px, all nine combinations`);
  }
 }finally{
   const owner=realpathSync(tmpdir()), target=realpathSync(tmp), child=relative(owner,target);
   assert(child&&!child.startsWith('..')&&!isAbsolute(child)&&dirname(child)==='.'&&basename(child).startsWith('lubi-planning-layout-'),'temporary cleanup must stay in the owned test directory');
   rmSync(target,{recursive:true,force:true});
 }
}
