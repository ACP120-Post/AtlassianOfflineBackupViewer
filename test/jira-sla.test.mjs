import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatDuration,slaSnapshot} from '../src/jira-sla.mjs';

test('SLA snapshots preserve archived states, cycle outcomes and signed durations',()=>{
  for(const [raw,state] of [['running','running'],['ongoing','running'],['paused','paused'],['completed','completed'],['not started','pending'],['breached','breached'],['other','unknown'],['constructor','unknown'],['__proto__','unknown'],[undefined,'unknown']]) {
    assert.equal(slaSnapshot({last_cycle_state:raw}).state,state);
  }
  assert.equal(slaSnapshot({last_timeline_cycle_state:'ongoing'}).state,'running');
  for(const [failed,outcome] of [[true,'breached'],['true','breached'],[false,'met'],['false','met'],[undefined,'unknown'],['','unknown']]) {
    assert.deepEqual(slaSnapshot({last_cycle_state:'running',last_complete_cycle_failed:failed}),{state:'running',outcome,complete:null,ongoing:null,startTime:undefined,stopTime:undefined});
    assert.deepEqual(slaSnapshot({last_cycle_state:'completed',last_complete_cycle_failed:failed}),{state:'completed',outcome,complete:null,ongoing:null,startTime:undefined,stopTime:undefined});
  }
  assert.equal(slaSnapshot({any_complete_cycle_failed:'true'}).outcome,'unknown');
  for(const value of [undefined,null,'',' ',NaN,Infinity,'invalid',false,{}]) assert.equal(formatDuration(value),'Unbekannt');
  for(const [value,expected] of [[0,'0 Sek.'],['0','0 Sek.'],[3661000,'1 Std. 1 Min. 1 Sek.'],[7200000,'2 Std.'],[-60000,'−1 Min.'],[-1,'−< 1 Sek.'],[1,'< 1 Sek.']]) assert.equal(formatDuration(value),expected);
  assert.equal(formatDuration(60,1000),'1 Min.');
  const encoded=JSON.stringify({completeSLAData:[{succeeded:true,goalTime:28800000,elapsedTime:18009960,remainingTime:10790040,startTime:1773148886546,stopTime:1773224496506}]});
  assert.deepEqual(slaSnapshot({timeline:encoded}),{state:'completed',outcome:'met',complete:{succeeded:true,goalTime:28800000,elapsedTime:18009960,remainingTime:10790040,startTime:1773148886546,stopTime:1773224496506},ongoing:null,startTime:1773148886546,stopTime:1773224496506});
});
