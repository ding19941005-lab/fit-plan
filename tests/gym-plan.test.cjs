const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
let checks = 0;
function check(label, run) {
  run();
  console.log('PASS', label);
  checks++;
}
function app(initial) {
  const nodes = new Map();
  const events = {};
  let saved;
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      value: '', dataset: {}, textContent: '', innerHTML: '',
      handlers: {}, setAttribute() {}, querySelectorAll: () => [],
      addEventListener(type, fn) { this.handlers[type] = fn; }
    });
    return nodes.get(selector);
  };
  const context = vm.createContext({
    document: {
      querySelector: node, querySelectorAll: () => [],
      addEventListener(type, fn) { events[type] = fn; }
    },
    localStorage: {
      getItem: () => initial ? JSON.stringify(initial) : null,
      setItem(key, value) { assert.equal(key, 'jzzj-v1'); saved = JSON.parse(value); }
    },
    window: { scrollTo() {}, addEventListener() {} },
    history: { replaceState() {} }, location: { hash: '' },
    setTimeout() {}, setInterval() {}, clearInterval() {}
  });
  vm.runInContext(source, context);
  return { node, events, eval: s => vm.runInContext(s, context), saved: () => saved };
}

const a = app();
a.eval("TODAY='2026-11-18';S.gymStart=TODAY");
check('three distinct training days cover chest, shoulders, back, glutes, legs and core', () => {
  assert.equal(a.eval('TYPES.join()'), 'A,B,C');
  assert.equal(a.eval('PLAN.A.name'), '胸肩＋核心');
  assert.equal(a.eval('PLAN.B.name'), '背部＋核心');
  assert.equal(a.eval('PLAN.C.name'), '臀腿＋核心');
  assert(a.eval('TYPES.every(t=>PLAN[t].ex.some(e=>e.core))'));
  assert(a.eval("PLAN.C.ex.some(e=>e.id==='legpress')&&PLAN.C.ex.some(e=>e.id==='hipthrust')"));
});
check('new gym plan starts with chest and shoulders and two sets', () => {
  assert.equal(a.eval('suggested()'), 'A');
  assert.equal(a.eval('phase()'), 1);
  assert.equal(a.eval('setsFor(PLAN.A.ex[0])'), 2);
  assert.equal(a.eval('setsFor(PLAN.A.ex[4])'), 2);
});
check('all exercise demos and instructions exist', () => {
  const exercises = a.eval('Object.values(PLAN).flatMap(p=>p.ex)');
  assert.equal(exercises.length, 16);
  for (const e of exercises) {
    assert(fs.existsSync(path.join(root, 'assets', e.img)), e.img);
    for (const key of ['setup', 'cue', 'err', 'next', 'alt']) assert(e[key], e.n + key);
  }
});
check('only major exercises gain sets in later phases', () => {
  a.eval('S.gymStart=addDays(TODAY,-28)');
  assert.equal(a.eval('phase()'), 2);
  assert.equal(a.eval('setsFor(PLAN.A.ex[0])'), 3);
  assert.equal(a.eval('setsFor(PLAN.A.ex[4])'), 2);
  a.eval('S.gymPhase3=true');
  assert.equal(a.eval('setsFor(PLAN.A.ex[0])'), 4);
  assert.equal(a.eval('setsFor(PLAN.A.ex[4])'), 2);
});
check('next incomplete theme is suggested and next day recommends rest', () => {
  a.eval("S.sessions=[{date:addDays(TODAY,-1),type:'A',plan:GYM}];renderToday()");
  assert.equal(a.eval('suggested()'), 'B');
  assert.match(a.node('#suggest').textContent, /昨天已练/);
  assert.equal(a.node('#finishBtn').disabled, true);
  a.eval('S.sessions[0].date=addDays(TODAY,-2);renderToday()');
  assert.equal(a.node('#finishBtn').disabled, false);
});
check('each week offers three themes and does not silently repeat a completed theme', () => {
  const b = app();
  b.eval("TODAY='2026-11-20';S.gymStart='2026-11-16';S.sessions=[{date:'2026-11-16',type:'A',plan:GYM},{date:'2026-11-18',type:'B',plan:GYM}];renderToday()");
  assert.equal(b.eval('suggested()'), 'C');
  assert.equal(b.node('#weekCount').textContent, '本周 2/3 个主题');
  b.node('#pickA').handlers.click();
  assert.match(b.node('#suggest').textContent, /本周已完成这个主题/);
  assert.equal(b.node('#finishBtn').disabled, true);
  b.node('#pickC').handlers.click();
  assert.equal(b.node('#finishBtn').disabled, false);
  b.node('#finishBtn').handlers.click();
  assert.equal(b.node('#weekCount').textContent, '本周 3/3 个主题');
  assert.equal(b.eval('gymDone().type'), 'C');
  b.eval("TODAY='2026-11-23';renderToday()");
  assert.equal(b.eval('suggested()'), 'A');
  assert.equal(b.node('#weekCount').textContent, '本周 0/3 个主题');
});
check('new gym completion and undo preserve old sessions', () => {
  a.eval("S.sessions=[{date:addDays(TODAY,-5),type:'B'}]");
  a.node('#finishBtn').handlers.click();
  assert.equal(a.eval('S.sessions.length'), 2);
  assert.equal(a.eval('gymDone().plan'), 'gym-split-v1');
  a.node('#finishBtn').handlers.click();
  assert.equal(a.eval('S.sessions.length'), 1);
  assert.equal(a.eval('S.sessions[0].plan'), undefined);
});
check('weight notes persist, escape HTML and appear in copied report', () => {
  const key = a.eval("recordKey('C','legpress')");
  a.events.input({ target: { dataset: { record: key }, value: '40kg, 12/12; seat 3' } });
  assert.equal(a.saved().gymRecords[key], '40kg, 12/12; seat 3');
  assert.match(a.eval('reportText()'), /腿举：40kg, 12\/12; seat 3/);
  a.eval("S.gymRecords[recordKey('C','legpress')]='\"<img src=x>'");
  a.node('#pickC').handlers.click();
  assert(a.node('#exList').innerHTML.includes('&quot;&lt;img src=x&gt;'));
  assert(!a.node('#exList').innerHTML.includes('value=""<img'));
});
check('phone date updates without reloading the page', () => {
  a.eval('TODAY=ymd(new Date())');
  const today = a.eval('TODAY');
  a.eval('TODAY=addDays(TODAY,-1);syncDay()');
  assert.equal(a.eval('TODAY'), today);
  assert.equal(a.node('#fDate').value, today);
});
check('two consecutive slow weeks and falling waist give distinct advice', () => {
  a.eval('S.gymPhase3=false;S.gymStart=addDays(TODAY,-35);S.logs={};for(let i=0;i<21;i++)S.logs[addDays(TODAY,-i)]={w:78};renderLog()');
  assert.match(a.node('#advice').innerHTML, /连续两个周变化/);
  a.eval('S.logs[addDays(TODAY,-10)].waist=90;S.logs[TODAY].waist=89;renderLog()');
  assert.match(a.node('#advice').innerHTML, /腰围下降/);
  assert(!a.node('#advice').innerHTML.includes('小幅减少'));
});
check('switching from home plan preserves body logs, habits and completed sets', () => {
  const old = { v: 1, start: '2026-01-01', phase3: true,
    logs: { '2026-01-02': { w: 77.8, waist: 90 } },
    habits: { '2026-01-02': { p: true } }, sets: { '2026-01-02|A|0': [true] },
    sessions: [{ date: '2026-01-02', type: 'A' }], pick: null };
  const b = app(old), migrated = b.saved();
  for (const key of ['start', 'phase3', 'logs', 'habits', 'sets', 'sessions']) assert.deepEqual(migrated[key], old[key]);
  assert.equal(b.eval('phase()'), 1);
  assert(b.eval("recordKey('C','legpress')").includes('|gym-split-v1|'));
});
check('old gym records remain readable after exercises move to a different theme', () => {
  const b = app();
  b.eval("S.gymRecords[`${TODAY}|gym-v1|A|legpress`]='40kg，12/12 次';S.sessions=[{date:TODAY,type:'A',plan:'gym-v1'}]");
  assert.match(b.eval('reportText()'), /旧健身房方案 A 腿举：40kg/);
  assert.match(b.eval('reportText()'), /旧健身房方案 A/);
  assert.equal(b.eval('weekTypes().size'), 0);
});
console.log(`${checks} checks passed.`);
