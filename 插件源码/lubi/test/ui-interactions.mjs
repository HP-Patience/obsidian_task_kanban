import assert from 'node:assert/strict';
import * as O from './mock-obsidian.js';
import Module from 'node:module';
import { createRequire } from 'node:module';
const orig=Module._load;Module._load=function(req,...a){return req==='obsidian'?O:orig.call(this,req,...a)};
const Plugin=createRequire(import.meta.url)(process.env.LUBI_TEST_PLUGIN||'./plugin.cjs').default;
const app=new O.App(),plugin=new Plugin(app,{id:'lubi',version:'1.6.0'});await plugin.onload();await plugin.tasks.load();
const tick=()=>new Promise(r=>setTimeout(r,60));let failures=0;
const check=(value,message)=>{console.log((value?'ok  ':'FAIL ')+message);if(!value)failures++};
const D='2026-09-24';
const {blankTask}=await import('./core.mjs');await plugin.tasks.upsert(blankTask({id:'history-candidate',title:'可主动选择的历史任务',category:'学习'}));let Record;
const view=await plugin.activateView('today',D);await tick();const root=view.contentEl;
check([...root.querySelectorAll('.lubi-topbar-tabs button')].map(x=>x.dataset.lubiFocus).join('|')==='seg:today|seg:tasks|seg:review','top tabs are daily/plan/review');
for(const page of ['today','tasks']){view.show(page,D);await tick();view.openNew();await tick();let modal=O.openModals.at(-1);if(page==='today')Record=modal.constructor;check(!modal.contentEl.contains(document.activeElement)||!document.activeElement.matches('input[type=text]'),'opening '+page+' does not focus the title');check([...modal.contentEl.querySelectorAll('.lubi-name-options')].every(x=>x.hidden),'opening '+page+' does not open history');if(page==='today'){[...modal.contentEl.querySelectorAll('.lubi-kind-seg button')].find(x=>x.textContent.includes('支出')).click();await tick();modal=O.openModals.at(-1);check(!document.activeElement.matches('input[type=text]'),'opening expense does not focus title')}if(page==='tasks'){const input=modal.contentEl.querySelector('[role=combobox]');input.focus();await tick();check(!modal.contentEl.querySelector('.lubi-name-options').hidden,'explicit input focus still opens history')}modal.close()}
const money=plugin.settings.categories.find(c=>c.kind==='money');const expense=new Record(app,plugin,{date:D,defaults:{category:money.name}});expense.open();await tick();check(!document.activeElement.matches('input[type=text]'),'initial expense opening does not focus title');expense.close();
for(const [key,page] of [['2','tasks'],['3','review']]){root.dispatchEvent(new window.KeyboardEvent('keydown',{key,bubbles:true}));await tick();check(view.tab===page,'shortcut '+key+' follows new tab order')}
view.show('review',D);await tick();const body=root.querySelector('.lubi-body'),empty=body.empty.bind(body);body.empty=()=>{empty();body.scrollTop=0};
body.scrollTop=92;[...root.querySelectorAll('.lubi-review .lubi-seg-item')].find(x=>x.textContent==='年').click();await tick();check(body.scrollTop===92,'first switch to year preserves body scroll despite DOM replacement');
body.scrollTop=51;[...root.querySelectorAll('.lubi-review .lubi-seg-item')].find(x=>x.textContent==='周').click();await tick();check(body.scrollTop===51,'period switch keeps current viewport instead of stale cached scroll');
const readRange=plugin.journal.readRange.bind(plugin.journal);plugin.journal.readRange=async(...args)=>{const result=await readRange(...args);body.scrollTop=37;return result};
[...root.querySelectorAll('.lubi-review .lubi-seg-item')].find(x=>x.textContent==='年').click();await tick();check(body.scrollTop===37,'period rendering retains a scroll made while records load');plugin.journal.readRange=readRange;
await plugin.tasks.upsert(blankTask({id:'cue-plan',title:'计划标题不应被盖住',category:'学习',date:D,start:'09:00',estimate:60}));await plugin.journal.add({date:D,start:'08:00',minutes:60,category:'学习',title:'记录标题不应被盖住',extra:{}});
view.show('today',D);await tick();const before=JSON.stringify([...app.vault.files]);
const pointer=(target,type,y)=>{const e=new window.MouseEvent(type,{bubbles:true,cancelable:true,clientX:200,clientY:y,button:0});Object.defineProperty(e,'pointerId',{value:99});target.dispatchEvent(e)};
for(const selector of ['.lubi-block','.lubi-plan'])for(const mode of ['move','resize-start','resize-end']){const el=root.querySelector(selector);const handle=mode==='move'?el:el.querySelector(mode==='resize-start'?'.is-top':'.is-bottom');pointer(handle,'pointerdown',100);pointer(window,'pointermove',156);const readout=root.querySelector('.lubi-drag-readout');check(!!readout&&!readout.hidden&&readout.textContent.includes('–')&&!readout.textContent.includes('\n')&&!root.querySelector('.lubi-timeline-scroll').contains(readout),selector+' '+mode+' has a separate, visible time readout');check(readout?.dataset.anchor==='block'&&!!readout.style.top&&!!readout.style.left,selector+' '+mode+' readout follows the task rather than the bottom corner');check(root.querySelector('.lubi-tl-hover-label').hidden,selector+' '+mode+' hides the overlapping inline time label');window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await tick();check(!readout||readout.hidden,selector+' '+mode+' clears feedback on cancel')}
check(JSON.stringify([...app.vault.files])===before,'cancelled cue gestures do not write tasks or actual records');
// Freeze persistence to expose stale hover metadata while the gesture finishes.
for(const selector of ['.lubi-block','.lubi-plan']) {
  view.show('today',D);await tick();const el=root.querySelector(selector);const oldRange=el.querySelector(selector==='.lubi-block'?'.lubi-block-time':'.lubi-plan-time').textContent;
  let release;const gate=new Promise(r=>release=r);const owner=selector==='.lubi-block'?plugin.journal:plugin.tasks;const key=selector==='.lubi-block'?'update':'upsert';const save=owner[key].bind(owner);owner[key]=async(...args)=>{await gate;return save(...args)};
  pointer(el,'pointerdown',100);pointer(window,'pointermove',156);const preview=root.querySelector('.lubi-drag-readout').firstChild.textContent;pointer(window,'pointerup',168);
  check(el.querySelector(selector==='.lubi-block'?'.lubi-block-time':'.lubi-plan-time').textContent!==preview,selector+' release applies the final pointer position before persistence completes');
  check(root.querySelector('.lubi-tl-hover-label').hidden,selector+' release does not uncover the old inline label during hover fade-out');
  el.dispatchEvent(new window.MouseEvent('pointerout',{bubbles:true,relatedTarget:document.body}));
  const tipMove=new window.MouseEvent('pointermove',{bubbles:true,clientX:200,clientY:156,buttons:0});el.dispatchEvent(tipMove);await new Promise(r=>setTimeout(r,300));
  check(root.querySelector('.lubi-drag-readout').hidden,selector+' release hides drag readout immediately');
  check(!document.querySelector('.lubi-tip')?.textContent.includes(oldRange),selector+' release never flashes stale old-time hover while save is pending');
  release();owner[key]=save;await new Promise(r=>setTimeout(r,180));
  const current=root.querySelector(selector);current.focus();await tick();check(!!document.querySelector('.lubi-tip'),'updated task keeps ordinary keyboard hover after save');current.blur();
}
plugin.onunload();await view.onClose();view.containerEl.remove();if(failures)process.exitCode=1;
