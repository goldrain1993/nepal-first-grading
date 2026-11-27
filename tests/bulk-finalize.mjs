import assert from 'node:assert/strict';
import {checkClassBulkFinalize} from '../docs/bulk-finalize.mjs';
import {DEFAULT_RUBRIC,score} from '../docs/core.mjs';

const classes=[{classNo:1,startNo:1,endNo:3,missingNos:[]}];
const roster=[1,2,3].map(number=>({classNo:1,number,name:'학생'+number}));
const grade={
 data:{level:'상',reason:'답안과 기준 대조'},strategy:{level:'상',reason:'전략 확인'},algorithm:{level:'상',reason:'알고리즘 확인'}
};
const points=score(grade,DEFAULT_RUBRIC);
const submitted=[1,2,3].map(number=>({
 id:'s'+number,classNo:1,assignedNo:number,identityConfirmed:true,status:'ready',
 teacherGrade:grade,pointsSnapshot:{rubric:DEFAULT_RUBRIC,points},
 finalized:false
}));
const check=items=>checkClassBulkFinalize(1,classes,roster,items);
assert.equal(check(submitted).ready,true);
assert.equal(check(submitted).pending.length,3);
assert.equal(check(submitted).total,300);
assert.equal(check(submitted.slice(0,2)).ready,false);
assert.match(check(submitted.slice(0,2)).blockers.join(' '),/미업로드/);
assert.equal(check(submitted.map((s,i)=>({...s,identityConfirmed:i!==1}))).ready,false);
assert.equal(check(submitted.map((s,i)=>i===2?{...s,teacherGrade:null}:s)).ready,false);
assert.equal(check(submitted.map((s,i)=>i===1?{...s,pointsSnapshot:{rubric:DEFAULT_RUBRIC,points:{...points,total:99}}}:s)).ready,false);
assert.equal(check(submitted.map(s=>({...s,finalized:true}))).ready,false);
assert.equal(check([...submitted,{...submitted[0],id:'duplicate'}]).ready,false);
const partialRoster={...classes[0],missingNos:[2]};
assert.equal(checkClassBulkFinalize(1,[partialRoster],[roster[0],roster[2]],[submitted[0],submitted[2]]).ready,true);
console.log('통과: 반별 일괄 확정 조건·결번·신원 확인·교사 점수 저장·중복 방지');
