import assert from 'node:assert/strict';
import {inferClassesFromRoster,mergeRosterImport,activeNumbers} from '../docs/core.mjs';
const row=(classNo,number,name='학생'+number)=>({gradeNo:1,classNo,number,name});

const girlsOnly=inferClassesFromRoster([row(3,32),row(3,33)])[0];
assert.equal(girlsOnly.boysStart,null);
assert.deepEqual(activeNumbers(girlsOnly),[32,33]);
assert.deepEqual(girlsOnly.missingNos,[]);

const twoBands=inferClassesFromRoster([row(1,1),row(1,3),row(1,21),row(1,24)])[0];
assert.deepEqual(twoBands.missingNos,[2,22,23]);
assert.deepEqual(activeNumbers(twoBands),[1,3,21,24]);
assert.equal(twoBands.genderBandsDefined,true);

const old=[row(1,1),row(1,3),row(1,32)];
const incoming=[row(1,2),row(1,33)];
const merged=mergeRosterImport(old,incoming,[{classNo:1,assignedNo:1}]);
assert.deepEqual(merged.added.map(s=>s.number),[2,33]);
assert.deepEqual(activeNumbers(merged.classes[0]),[1,2,3,32,33]);
assert.deepEqual(merged.classes[0].missingNos,[]);
assert.equal(merged.students.length,5);

const sameNumber=mergeRosterImport([row(1,1,'기존 이름')],[row(1,1,'엑셀 이름')]);
assert.equal(sameNumber.added.length,0);
assert.equal(sameNumber.conflicts.length,1);
assert.equal(sameNumber.students[0].name,'기존 이름');

assert.deepEqual(inferClassesFromRoster([row(1,1),row(1,3)])[0].missingNos,[2]);
assert.deepEqual(mergeRosterImport([row(1,1),row(1,3)],[row(1,2)]).classes[0].missingNos,[]);
assert.throws(()=>mergeRosterImport([row(1,1)],[row(1,2)],[{classNo:1,assignedNo:3}]),/기존 답안/);
console.log('통과: Excel/CSV 병합·기존 답안 보존·남녀 범위별 결번 계산');
