import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConferenceSnapshot } from '../../dist/modules/conferences/conference-source.js';
const yaml = `- title: ICLR
  description: Learning representations
  sub: AI
  rank: { ccf: A }
  confs:
    - year: 2027
      id: iclr27
      link: https://iclr.cc/Conferences/2027
      timezone: AoE
      timeline:
        - abstract_deadline: '2026-09-18 23:59:59'
          deadline: '2026-09-25 23:59:59'
          rebuttal_deadline: TBD
          decision_deadline: '2026-12-16 23:59:59'
`;
const snapshot = source => ({ commitSha: 'a'.repeat(40), fetchedAt: '2026-10-30T00:00:00Z', files: [{ path: 'conference/AI/iclr.yml', yaml: source }] });
test('CCF A filtering, four node mapping, source seconds and TBD are preserved', () => {
  const items = parseConferenceSnapshot(snapshot(yaml));assert.equal(items.length,1);assert.equal(items[0].rank,'A');assert.equal(items[0].milestones.length,4);assert.equal(items[0].milestones[1].due.at,'2026-09-26T11:59:59.000Z');assert.equal(items[0].milestones[2].due,null);assert.equal(items[0].milestones[1].rawDeadline,'2026-09-25 23:59:59');assert.equal(items[0].importable,true);
  assert.deepEqual(parseConferenceSnapshot(snapshot(yaml.replace('ccf: A','ccf: B'))),[]);
  assert.equal(parseConferenceSnapshot(snapshot(yaml.replace('timezone: AoE','timezone: UTC-8')))[0].milestones[1].due.at,'2026-09-26T07:59:59.000Z');
});
test('missing timezone blocks precise import and unsafe YAML/source paths are rejected', () => {
  const missing=parseConferenceSnapshot(snapshot(yaml.replace('      timezone: AoE\n','')))[0];assert.equal(missing.importable,false);assert.ok(missing.issues.some(issue=>issue.includes('时区')));
  assert.throws(()=>parseConferenceSnapshot(snapshot('test: &a [x]\nother: *a')));
  assert.throws(()=>parseConferenceSnapshot({...snapshot(yaml),files:[{path:'../../private.yml',yaml}]}));
});
