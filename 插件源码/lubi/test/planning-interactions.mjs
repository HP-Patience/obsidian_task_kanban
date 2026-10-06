import assert from 'node:assert/strict';
import * as O from './mock-obsidian.js';
import Module from 'node:module';
import {createRequire} from 'node:module';
import {blankTask,ganttWindow} from './core.mjs';
const load=Module._load;Module._load=function(id,...args){return id==='obsidian'?O:load.call(this,id,...args)};
const Plugin=createRequire(import.meta.url)(process.env.LUBI_TEST_PLUGIN||'./plugin.cjs').default;
const app=new O.App(), plugin=new Plugin(app,{id:'lubi',version:'1.6.0'});await plugin.onload();await plugin.tasks.load();
plugin.settings.onboardingDone=true;plugin.settings.promptLogOnComplete=false;
const D='2026-10-06';const settle=()=>new Promise(r=>setTimeout(r,230));
const task=(id,extra={})=>blankTask({id,title:id,category:'学习',...extra});
for(const t of [task('early',{date:D,start:'08:00',estimate:60}),task('late',{date:D,start:'14:00',estimate:30}),task('all-day',{date:D}),
 task('span',{startDate:'2026-10-04',endDate:'2026-10-09',date:'2026-10-07',start:'10:00',estimate:60}),
 task('repeat',{repeat:{kind:'daily',days:[]},startDate:'2026-10-05',endDate:'2026-10-11',doneDates:[D],skipDates:['2026-10-08']}),
 task('undated'),task('record',{date:D,origin:'record'}),task('parent'),task('child',{date:D,parent:'parent'})])await plugin.tasks.upsert(t);
await plugin.journal.add({date:D,start:'09:00',minutes:20,category:'学习',title:'synthetic actual',extra:{}});
const view=await plugin.activateView('tasks',D);await settle();const root=view.contentEl;
assert.equal(view.tasksState.scheduleView,'calendar');assert.equal(view.tasksState.period,'week');
const press=async key=>{const button=root.querySelector(`[data-lubi-focus="${key}"]`);assert(button,`missing control ${key}`);button.click();await settle()};
const journal=()=>JSON.stringify([...app.vault.files].filter(([name])=>name.startsWith('日记/')));
const dataBefore=JSON.stringify([...app.vault.files]);
for(const mode of ['calendar','gantt','list'])for(const period of ['day','week','month']) {
 await press(`schedule:${mode}`);await press(`planning-period:${period}`);
 assert.equal(view.tasksState.selectedDate,D);assert.equal(view.tasksState.period,period);
 assert.equal(root.querySelectorAll('.lubi-schedule-switch').length,1);
 assert.equal(root.querySelectorAll('.lubi-planning-period-switch').length,1);
 assert.equal(root.querySelectorAll('.lubi-topbar .mod-cta').length,1);
 assert(!root.querySelector('.lubi-error'));
 if(mode==='calendar'&&period!=='month') {
  const heads=[...root.querySelectorAll('.lubi-week-day-button')];assert.equal(heads.length,period==='day'?1:7);
  assert.equal(root.querySelector('.lubi-week-hour').textContent,'00:00');assert.equal([...root.querySelectorAll('.lubi-week-hour')].at(-1).textContent,'24:00');
  assert(root.querySelector('.lubi-wblock'));assert(root.querySelector('.lubi-allday-chip'));
 }
 if(mode==='calendar'&&period==='month') {
  assert.equal(root.querySelectorAll('.lubi-month-day').length,35);
  assert(root.querySelector('.lubi-month-task[data-task-id="early"]'));
  assert(!root.querySelector('.lubi-month-task[data-task-id="repeat"][data-date="2026-10-08"]'));
 }
 if(mode==='list') {
  assert.equal(root.querySelectorAll('.lubi-task-lists .lubi-list-card').length,1,'no duplicate selected-day sidebar');
  const rows=[...root.querySelectorAll('.lubi-plan-range-list .lubi-task')];
  assert(rows.some(row=>row.dataset.taskId==='early'));assert.equal(rows.filter(row=>row.dataset.taskId==='span').length,1);
  const dayRows=rows.filter(row=>row.dataset.date===D);assert(dayRows.findIndex(row=>row.dataset.taskId==='early')<dayRows.findIndex(row=>row.dataset.taskId==='late'));
  assert(root.querySelector('.lubi-plan-list-parent')?.textContent==='parent');
 }
 if(mode==='calendar'&&period==='day') {
  const side=root.querySelector('.lubi-task-lists');
  assert(side.previousElementSibling.classList.contains('lubi-planning-main'),'day timeline precedes right sidebar in reading/tab order');
  assert.equal(side.querySelectorAll('.lubi-distribution').length,1);
  assert.equal(side.querySelectorAll('.lubi-plan-card').length,1);
  assert.equal(side.querySelectorAll('.lubi-list-card').length,1,'only inbox, no duplicate Today list');
  assert(side.querySelector('.lubi-plan-task-details').open,'day plans expanded by default');
  assert.equal(side.querySelector('.lubi-donut-center').textContent,'0.3h','distribution uses actual, not planned duration');
  assert.equal(side.querySelector('.lubi-legend-pct').textContent,'100%');
  const tasks=[...side.querySelectorAll('.lubi-plan-task-list .lubi-task')];
  assert(tasks.findIndex(t=>t.dataset.taskId==='early')<tasks.findIndex(t=>t.dataset.taskId==='late'));
  assert(tasks.findIndex(t=>t.dataset.taskId==='late')<tasks.findIndex(t=>t.dataset.taskId==='all-day'),'untimed after timed');
  const progress=side.querySelector('[role="progressbar"]');
  assert.equal(Number(progress.getAttribute('aria-valuemax')),tasks.length);
  assert.equal(Number(progress.getAttribute('aria-valuenow')),1,'repeat completion is for selected occurrence');
  assert.deepEqual([...side.children].map(e=>e.classList.contains('lubi-distribution')?'distribution':e.classList.contains('lubi-plan-card')?'plans':'inbox'),['distribution','plans','inbox']);
 } else assert(!root.querySelector('.lubi-task-lists .lubi-distribution, .lubi-task-lists .lubi-plan-card'),'other presentations retain existing sidebar');
 assert(!root.querySelector('.lubi-planning-main [data-task-id="record"]'));
 assert(!root.querySelector('.lubi-task-lists [data-task-id="span"]')||mode!=='list');
}
assert.equal(JSON.stringify([...app.vault.files]),dataBefore,'viewing all nine combinations never writes task or journal data');
// Shared distribution is identical to daily; refreshing preserves the chosen fold state.
await press('schedule:calendar');await press('planning-period:day');
const distribution=()=>root.querySelector('.lubi-distribution').innerHTML.replace(/lubi-tooltip-label-\d+/g,'lubi-tooltip-label');
const snapshot=distribution();
view.show('today',D);await settle();assert.equal(distribution(),snapshot);
view.show('tasks',D);await settle();
root.querySelector('.lubi-plan-task-details').open=false;view.refresh();await settle();assert(!root.querySelector('.lubi-plan-task-details').open);
await press('planning:next');assert(root.querySelector('.lubi-plan-task-details').open);
assert.equal(root.querySelector('.lubi-donut-center').textContent,'0h','date navigation reloads summary');
view.show('tasks',D);await settle();
const beforeComplete=journal();
root.querySelector('.lubi-plan-task-list [data-task-id="early"] input').click();await settle();
assert.equal(root.querySelector('.lubi-plan-progress').getAttribute('aria-valuenow'),'2');
assert(root.querySelector('.lubi-plan-task-list [data-task-id="early"]').classList.contains('is-done'));
root.querySelector('.lubi-plan-task-list [data-task-id="early"] input').click();await settle();
assert.equal(root.querySelector('.lubi-plan-progress').getAttribute('aria-valuenow'),'1');
assert.equal(journal(),beforeComplete,'progress rendering does not create records with automatic logging disabled');
// Linked actuals count once toward the same completed-or-recorded metric as daily.
await plugin.journal.add({date:D,start:'16:00',minutes:45,category:'学习',title:'linked actual',task:'late',extra:{}});
view.refresh();await settle();assert.equal(root.querySelector('.lubi-plan-progress').getAttribute('aria-valuenow'),'2');
assert.equal(root.querySelector('.lubi-donut-center').textContent,'1.1h');
// Shared summary read errors surface in the existing page error boundary.
const originalRead=plugin.journal.read;plugin.journal.read=async()=>{throw new Error('synthetic summary read failure')};
view.refresh();await settle();assert(root.querySelector('.lubi-error'));
plugin.journal.read=originalRead;view.refresh();await settle();assert(!root.querySelector('.lubi-error'));
// New day card keeps the existing inbox drop and quick-add paths.
await plugin.tasks.upsert(task('day-drop'));view.refresh();await settle();
const card=root.querySelector('.lubi-plan-card');
const event=new window.Event('drop',{bubbles:true,cancelable:true});
Object.defineProperty(event,'dataTransfer',{value:{types:['text/lubi-task'],getData:t=>t==='text/lubi-task'?'day-drop':'',dropEffect:''}});
card.dispatchEvent(event);await settle();
assert.equal(plugin.tasks.byId('day-drop').date,D);
assert(root.querySelector('.lubi-plan-task-list [data-task-id="day-drop"]').draggable);
assert(!root.querySelector('.lubi-list-card [data-task-id="day-drop"]'),'scheduled drop leaves inbox');
const input=root.querySelector('.lubi-quick-add input');input.value='day quick add';
input.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await settle();
assert(plugin.tasks.all.some(t=>t.title==='day quick add'&&t.date===D));
// Month-end navigation is shared by every presentation.
for(const mode of ['calendar','gantt','list']) {
 await press(`schedule:${mode}`);await press('planning-period:month');view.show('tasks','2026-01-31');await settle();
 await press('planning:next');assert.equal(view.tasksState.selectedDate,'2026-02-28');
 await press('planning:previous');assert.equal(view.tasksState.selectedDate,'2026-01-28');
}
view.show('tasks',D);await settle();await press('schedule:calendar');await press('planning-period:month');
const beforeDrag=journal();
const drop=async(selector,id,sourceDate='')=>{const target=root.querySelector(selector);assert(target,selector);const transfer={types:['text/lubi-task'],getData:type=>type==='text/lubi-task'?id:type==='text/lubi-task-date'?sourceDate:'',dropEffect:''};
 const e=new window.Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(e,'dataTransfer',{value:transfer});target.dispatchEvent(e);await settle()};
await drop('.lubi-month-day[data-date="2026-10-09"]','early');assert.equal(plugin.tasks.byId('early').date,'2026-10-09');assert.equal(plugin.tasks.byId('early').start,'08:00');
await drop('.lubi-month-day[data-date="2026-10-09"]','span');assert.equal(plugin.tasks.byId('span').startDate,'2026-10-06');assert.equal(plugin.tasks.byId('span').endDate,'2026-10-11');
await drop('.lubi-month-day[data-date="2026-10-09"]','undated');assert.equal(plugin.tasks.byId('undated').date,'2026-10-09');
const repeatBefore=JSON.stringify(plugin.tasks.byId('repeat'));await drop('.lubi-month-day[data-date="2026-10-09"]','repeat');assert.equal(JSON.stringify(plugin.tasks.byId('repeat')),repeatBefore);
await drop('.lubi-month-day[data-date="2026-10-07"]','span','2026-10-06');
assert.equal(plugin.tasks.byId('span').startDate,'2026-10-07');assert.equal(plugin.tasks.byId('span').date,'2026-10-10');
const unchangedSpan=JSON.stringify(plugin.tasks.byId('span'));await drop('.lubi-month-day[data-date="2026-10-07"]','span','2026-10-07');assert.equal(JSON.stringify(plugin.tasks.byId('span')),unchangedSpan,'same continuation-day drop is a no-op');
await drop('.lubi-month-day[data-date="2026-11-01"]','early','2026-10-09');
assert.equal(view.tasksState.selectedDate,'2026-11-01');assert(root.querySelector('.lubi-month-task[data-task-id="early"][data-date="2026-11-01"]'),'adjacent-month drop navigates to its visible destination');
view.show('tasks',D);await settle();
assert.equal(journal(),beforeDrag,'calendar date moves never modify actual records');
// Month chips and date-Gantt segments must edit the clicked recurrence, not selectedDate.
const assertOccurrence=async(element,date)=>{assert(element);element.click();await settle();const modal=O.openModals.at(-1);assert.equal(modal.contentEl.querySelector('[data-actual="date"]').value,date);modal.close()};
await assertOccurrence(root.querySelector('.lubi-month-task[data-task-id="repeat"][data-date="2026-10-09"]'),'2026-10-09');
await press('schedule:gantt');await assertOccurrence(root.querySelector('.lubi-gantt-row[data-task-id="repeat"] .lubi-gantt-bar[data-from="2026-10-09"]'),'2026-10-09');
await press('schedule:list');const recurrence=root.querySelector('.lubi-plan-range-list .lubi-task[data-task-id="repeat"][data-date="2026-10-09"]');assert(recurrence);recurrence.querySelector('input').click();await settle();
assert(plugin.tasks.byId('repeat').doneDates.includes('2026-10-09'));assert(!plugin.tasks.byId('repeat').doneDates.includes('2026-10-10'));
// Session remembers view and range across page switches; new instance resets without writing settings.
view.show('review');await settle();view.show('tasks');await settle();assert.equal(view.tasksState.scheduleView,'list');assert.equal(view.tasksState.period,'month');
const fresh=app.workspace.getLeaf(true);await fresh.setViewState({type:'lubi-dashboard',active:true});await settle();assert.equal(fresh.view.tasksState.scheduleView,'calendar');assert.equal(fresh.view.tasksState.period,'week');
// An empty Vault still renders all three presentation axes, plus one range switch.
const emptyApp=new O.App(),emptyPlugin=new Plugin(emptyApp,{id:'lubi',version:'1.6.0'});await emptyPlugin.onload();await emptyPlugin.tasks.load();const emptyView=await emptyPlugin.activateView('tasks',D);await settle();
for(const mode of ['calendar','gantt','list'])for(const period of ['day','week','month']) {
 const state=emptyView.tasksState;state.scheduleView=mode;state.period=period;emptyView.show('tasks',D);await settle();const host=emptyView.contentEl;
 assert(host.querySelector('.lubi-planning-period-switch'));assert(!host.querySelector('.lubi-error'));
 assert(host.querySelector(mode==='calendar'?(period==='month'?'.lubi-month-calendar':'.lubi-week'):mode==='gantt'?'.lubi-gantt-heading':'.lubi-plan-list-date'));
 if(mode==='calendar'&&period==='day') {
  assert(host.querySelector('.lubi-distribution svg circle'),'empty ring retained');
  assert.equal(host.querySelector('.lubi-donut-center').textContent,'0h');
  assert(host.querySelector('.lubi-distribution').textContent.includes('暂无记录'));
  assert(host.querySelector('.lubi-plan-card').textContent.includes('0/0 已做'));
  assert.equal(host.querySelector('.lubi-plan-progress-fill').style.width,'0%');
  assert(host.querySelector('.lubi-plan-task-details').open);
  assert(host.querySelector('.lubi-plan-task-details').textContent.includes('暂无安排'));
 }
}
assert(!root.querySelector('.lubi-error'));emptyPlugin.onunload();plugin.onunload();await view.onClose();await fresh.view.onClose();await emptyView.onClose();
console.log('PASS planning interactions: nine modes, shared navigation, clean views, date moves, recurrence edit/completion, parent context, empty axes and session defaults');
