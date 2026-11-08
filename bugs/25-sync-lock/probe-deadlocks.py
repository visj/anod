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
let ctx, ctrl, node, cleaned=false, finished=false;
const app=root(r=>{node=r.spawn(async c=>{ctx=c;c.lock();ctrl=c.controller();c.cleanup(()=>cleaned=true);await c.suspend(new Promise(r=>ctrl.signal.addEventListener('abort',r,{once:true})));finished=true;});});
app.dispose();await drain(); console.log('dispose', {aborted:ctrl.signal.aborted,cleaned,finished});
ctx.unlock();await drain(); console.log('unlock', {aborted:ctrl.signal.aborted,cleaned,finished});
app.dispose(true);await drain(); console.log('force_argument', {aborted:ctrl.signal.aborted,cleaned,finished});
ctrl.abort();await drain();console.log('external_abort',{cleaned,finished});
''',
'child_cleanup': '''
const g=gate();let childCleaned=false,finished=false;
const app=root(r=>r.spawn(async c=>{c.lock();c.effect(child=>child.cleanup(()=>{childCleaned=true;g.resolve();}));await c.suspend(g.promise);finished=true;}));
app.dispose();await drain();console.log('dispose',{childCleaned,finished});
g.resolve();await drain();console.log('external_resolve',{childCleaned,finished});
''',
'unlock_stale': '''
for(const locked of [false,true]) {
const s=signal(true),g=gate();let ctx,runs=0,aborted=false;
const app=root(r=>r.spawn(async c=>{ctx=c;runs++;if(!c.val(s))return;if(locked)c.lock();c.controller().signal.addEventListener('abort',()=>aborted=true);await c.suspend(g.promise);}));
s.set(false);ctx.unlock();await drain();console.log({locked,runs,aborted});g.resolve();await drain();app.dispose();
}
''',
'sync_and_async_return': '''
for(const asyncReturn of [false,true]) { const s=signal(0);let runs=0,cleaned=false,ctx;
const body=c=>{ctx=c;c.val(s);c.lock();runs++;c.cleanup(()=>cleaned=true);};
const app=root(r=>r.spawn(asyncReturn?async c=>body(c):body));await drain();s.set(1);await drain();app.dispose();await drain();console.log({asyncReturn,runs,cleaned});ctx.unlock(); }
''',
'cross_scope_cleanup_cycle': '''
const ga=gate(),gb=gate();let aDone=false,bDone=false,aClean=false,bClean=false;
const a=root(r=>r.spawn(async c=>{c.lock();c.cleanup(()=>{aClean=true;gb.resolve();});await c.suspend(ga.promise);aDone=true;}));
const b=root(r=>r.spawn(async c=>{c.lock();c.cleanup(()=>{bClean=true;ga.resolve();});await c.suspend(gb.promise);bDone=true;}));
a.dispose();b.dispose();await drain();console.log('dispose',{aDone,bDone,aClean,bClean});ga.resolve();await drain();console.log('break_cycle',{aDone,bDone,aClean,bClean});
''',
'parent_cleanup_control': '''
const g=gate();let done=false,cleaned=false;
const app=root(r=>{r.cleanup(()=>{cleaned=true;g.resolve();});r.spawn(async c=>{c.lock();await c.suspend(g.promise);done=true;});});
app.dispose();await drain();console.log({done,cleaned});
''',
'mutual_task_await_locked': '''
const g=gate();let a,b,errors=[];
const app=root(r=>{r.recover(e=>{errors.push(String(e.error));return true;});a=r.task(async c=>{c.lock();await c.suspend(g.promise);return await c.suspend(b);});b=r.task(async c=>{c.lock();await c.suspend(g.promise);return await c.suspend(a);});});
g.resolve();await drain();console.log({aLoading:a.loading,bLoading:b.loading,aError:a.error,bError:b.error,errors});app.dispose();
''',
'mutual_task_await_unlocked': '''
const g=gate();let a,b,errors=[];
const app=root(r=>{r.recover(e=>{errors.push(String(e.error));return true;});a=r.task(async c=>{await c.suspend(g.promise);return await c.suspend(b);});b=r.task(async c=>{await c.suspend(g.promise);return await c.suspend(a);});});
g.resolve();await drain();console.log({aLoading:a.loading,bLoading:b.loading,aError:a.error,bError:b.error,errors});app.dispose();
'''
}
expected = {
 'own_abort': ['dispose { aborted: false, cleaned: false, finished: false }', 'unlock { aborted: false, cleaned: false, finished: false }', 'force_argument { aborted: false, cleaned: false, finished: false }', 'external_abort { cleaned: true, finished: true }'],
 'child_cleanup': ['dispose { childCleaned: false, finished: false }', 'external_resolve { childCleaned: true, finished: true }'],
 'unlock_stale': ['{ locked: false, runs: 2, aborted: true }', '{ locked: true, runs: 1, aborted: false }'],
 'sync_and_async_return': ['{ asyncReturn: false, runs: 1, cleaned: false }', '{ asyncReturn: true, runs: 2, cleaned: true }'],
 'cross_scope_cleanup_cycle': ['dispose { aDone: false, bDone: false, aClean: false, bClean: false }', 'break_cycle { aDone: true, bDone: true, aClean: true, bClean: true }'],
 'parent_cleanup_control': ['{ done: true, cleaned: true }'],
 'mutual_task_await_locked': ['aLoading: true', 'bLoading: true', 'aError: false', 'bError: false', 'errors: []'],
 'mutual_task_await_unlocked': ['aLoading: true', 'bLoading: true', 'aError: false', 'bError: false', 'errors: []'],
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
