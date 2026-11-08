import subprocess, json
from pathlib import Path
import sys
source = (Path(__file__).resolve().parents[2] / "src/index.js").as_uri()
prefix = '''import { root, signal, c as globalC } from ANOD_SOURCE;
const drain = async () => { for(let i=0;i<30;i++) await Promise.resolve(); };
const gate = () => { let resolve; const promise = new Promise(r=>resolve=r); return {promise,resolve}; };
'''
cases = {
'own_abort': '''
let ctrl, cleaned=false, finished=false;
const app=root(r=>{r.spawn(async c=>{c.shield();ctrl=c.controller();c.cleanup(()=>cleaned=true);await c.suspend(new Promise(r=>ctrl.signal.addEventListener('abort',r,{once:true})));finished=true;});});
app.dispose();await drain(); console.log('dispose', {aborted:ctrl.signal.aborted,cleaned,finished});
app.dispose(true);await drain(); console.log('force', {aborted:ctrl.signal.aborted,cleaned,finished});
''',
'child_cleanup': '''
const g=gate();let childCleaned=false,finished=false;
const app=root(r=>r.spawn(async c=>{c.shield();c.effect(child=>child.cleanup(()=>{childCleaned=true;g.resolve();}));await c.suspend(g.promise);finished=true;}));
app.dispose();await drain();console.log('dispose',{childCleaned,finished});
app.dispose(true);await drain();console.log('force',{childCleaned,finished});
''',
'sync_and_async_return': '''
for(const asyncReturn of [false,true]) { const s=signal(0);let runs=0,cleaned=false;
const body=c=>{c.val(s);c.shield();runs++;c.cleanup(()=>cleaned=true);};
const app=root(r=>r.spawn(asyncReturn?async c=>body(c):body));await drain();s.set(1);await drain();app.dispose();await drain();console.log({asyncReturn,runs,cleaned}); }
''',
'cross_scope_cleanup_cycle': '''
const ga=gate(),gb=gate();let aDone=false,bDone=false,aClean=false,bClean=false;
const a=root(r=>r.spawn(async c=>{c.shield();c.cleanup(()=>{aClean=true;gb.resolve();});await c.suspend(ga.promise);aDone=true;}));
const b=root(r=>r.spawn(async c=>{c.shield();c.cleanup(()=>{bClean=true;ga.resolve();});await c.suspend(gb.promise);bDone=true;}));
a.dispose();b.dispose();await drain();console.log('dispose',{aDone,bDone,aClean,bClean});a.dispose(true);await drain();console.log('force_a',{aDone,bDone,aClean,bClean});
''',
'parent_cleanup_cycle': '''
const g=gate();let done=false,cleaned=false;
const app=root(r=>{r.cleanup(()=>{cleaned=true;g.resolve();});r.spawn(async c=>{c.shield();await c.suspend(g.promise);done=true;});});
app.dispose();await drain();console.log('dispose',{done,cleaned});app.dispose(true);await drain();console.log('force',{done,cleaned});
''',
'mutual_task_await': '''
const g=gate();let a,b;
const app=root(r=>{a=r.task(async c=>{await c.suspend(g.promise);return await c.suspend(b);});b=r.task(async c=>{await c.suspend(g.promise);return await c.suspend(a);});});
g.resolve();await drain();console.log({aLoading:a.loading,bLoading:b.loading,aError:a.error,bError:b.error,message:b.get().error.message});app.dispose();
'''
}
expected = {
 'own_abort': ['dispose { aborted: false, cleaned: false, finished: false }', 'force { aborted: true, cleaned: true, finished: false }'],
 'child_cleanup': ['dispose { childCleaned: false, finished: false }', 'force { childCleaned: true, finished: false }'],
 'sync_and_async_return': ['{ asyncReturn: false, runs: 2, cleaned: true }', '{ asyncReturn: true, runs: 2, cleaned: true }'],
 'cross_scope_cleanup_cycle': ['dispose { aDone: false, bDone: false, aClean: false, bClean: false }', 'force_a { aDone: false, bDone: true, aClean: true, bClean: true }'],
 'parent_cleanup_cycle': ['dispose { done: false, cleaned: false }', 'force { done: false, cleaned: true }'],
 'mutual_task_await': ['aLoading: false', 'bLoading: false', 'aError: true', 'bError: true', "message: 'Cycle detected'"],
}
prefix = prefix.replace('ANOD_SOURCE', json.dumps(source))
failures = 0
for name, body in cases.items():
 try:
  p=subprocess.run(['node','--input-type=module','-e',prefix+body],capture_output=True,text=True,timeout=3)
  passed = p.returncode == 0 and not p.stderr and all(x in p.stdout for x in expected[name])
  failures += not passed
  print(json.dumps({'case':name,'observed_as_expected':passed,'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr[:1600]}))
 except subprocess.TimeoutExpired:
  failures += 1
  print(json.dumps({'case':name,'timeout':True}))
sys.exit(1 if failures else 0)
