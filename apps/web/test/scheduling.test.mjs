import {test} from 'node:test';
import assert from 'node:assert/strict';
import {suggestSchedule} from '../src/features/ai/scheduling.ts';
const input={now:Date.parse('2026-11-01T09:05:00+08:00'),timezone:'Asia/Shanghai',workStart:'09:00',workEnd:'18:00',durationMinutes:30,due:null,items:[{kind:'event',startAt:'2026-11-01T01:00:00Z',endAt:'2026-11-01T02:00:00Z'},{kind:'block',startAt:'2026-11-01T02:00:00Z',endAt:'2026-11-01T03:00:00Z'}]};
test('AI preview finds a real free slot, permits adjoining intervals and does not treat deadlines as busy work',()=>{assert.equal(suggestSchedule(input).startAt,'2026-11-01T03:00:00.000Z');assert.equal(suggestSchedule({...input,items:[...input.items,{kind:'milestone',startAt:'2026-11-01T03:00:00Z'}]}).startAt,'2026-11-01T03:00:00.000Z');});
test('AI preview respects the task deadline and working hours, without inventing a slot when none fits',()=>{assert.equal(suggestSchedule({...input,due:{kind:'instant',at:'2026-11-01T02:30:00Z',timezone:'UTC'}}),null);assert.equal(suggestSchedule({...input,due:{kind:'date',date:'2026-10-31'}}),null);});
