import assert from 'node:assert/strict';
import {inferPageRole,groupPages} from '../docs/page-grouping.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {TEST_SETS,testValueCheck}=require('../functions/test-rules.js');

assert.equal(inferPageRole('학번 이름 STEP 1. 데이터 수집·분석'),'front');
assert.equal(inferPageRole('STEP 1 계속 - 반례'),'data-cont');
assert.equal(inferPageRole('STEP 2. 전략'),'strategy');
assert.equal(inferPageRole('STEP 3. 알고리즘'),'algorithm');
assert.equal(inferPageRole('STEP 4. 알고리즘 시험'),'test');
assert.equal(inferPageRole('스캔에서 읽을 텍스트 없음'),'unknown');
const names=[1,2,3];
const pages=[
  {start:true,role:'front',pageNo:1},
  {start:false,role:'test',pageNo:2},
  {start:false,role:'strategy',pageNo:3},
  {start:true,role:'front',pageNo:4},
  {start:false,role:'algorithm',pageNo:5},
  {start:true,role:'front',pageNo:6}
];
const groups=groupPages(pages,names);
assert.equal(groups.length,3);
assert.deepEqual(groups.map(g=>g.pages.length),[3,2,1]);
assert.deepEqual(groups[0].pages.map(p=>p.pageNo),[1,3,2]);
assert.deepEqual(groups[0].missingRoles,['data-cont','algorithm']);
assert.deepEqual(groups[1].missingRoles,['data-cont','strategy','test']);
assert.throws(()=>groupPages([{start:true,role:'front'},...Array.from({length:5},()=>({start:false,role:'unknown'}))],[1]),/6장|STEP/);
assert.throws(()=>groupPages([{start:true,role:'front'},{start:false,role:'unknown'}],[1]),/STEP/);
assert.throws(()=>groupPages([{start:true,role:'front'},{start:false,role:'test'},{start:false,role:'test'}],[1]),/중복/);
assert.throws(()=>groupPages([{start:true,role:'front'},{start:false,role:'test'}],[1,2]),/학생 1명과 선택한 학생 2명/);
assert.equal(Object.keys(TEST_SETS).length,6);
for(let t=1;t<=6;t++){
 assert.equal(testValueCheck('TEST'+t,'수위',t).valid,true);
 assert.equal(testValueCheck(String(t),'수위',t).valid,true);
 for(const [sensor,value] of Object.entries(TEST_SETS[t])){
  assert.equal(testValueCheck(String(value),sensor,t).valid,true,String(t)+' '+sensor+' '+value);
 }
}
assert.equal(testValueCheck('4.1','수위',3).valid,true);
assert.equal(testValueCheck('4.1m','수위',3).valid,true);
assert.equal(testValueCheck('999','수위',3).valid,false);
assert.equal(testValueCheck('TEST5','수위',3).valid,false);
assert.equal(testValueCheck('TEST5','수위').valid,true);
assert.equal(testValueCheck('2.8','진동',1).valid,false);
// 회귀 검증: TEST2 유속 3.0은 학생이 '3'으로 적어도 정답이다.
assert.equal(testValueCheck('3','유속',2).valid,true);
assert.equal(testValueCheck('3.0','유속',2).valid,true);
assert.equal(testValueCheck('3','수위',2).valid,false);
assert.equal(testValueCheck('TEST3','유속',2).valid,false);
assert.equal(testValueCheck('3번','유속',2).valid,false);
assert.equal(testValueCheck('3','유속',3).valid,true);
assert.equal(testValueCheck('3','유속',null).valid,true);
console.log('검증 통과: 최대 5장 가변 PDF·이름 시작 분리·STEP 정렬·TEST1~6 이중 정답');
