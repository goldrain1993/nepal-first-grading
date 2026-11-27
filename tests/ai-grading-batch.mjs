import assert from 'node:assert/strict';
import {DEFAULT_RUBRIC} from '../docs/core.mjs';
import {aiSuggestedPoints,aiGradingCandidates} from '../docs/ai-grading-batch.mjs';

const middle={
 data:{level:'중',reason:'예시'},strategy:{level:'중',reason:'예시'},algorithm:{level:'중',reason:'예시'}
};
const high={...middle,data:{level:'상',reason:'예시'}};
const students=[
 {id:'a',classNo:1,assignedNo:1,status:'ready',finalized:false,aiGrade:middle,aiStatus:'AI 완료'},
 {id:'b',classNo:1,assignedNo:2,status:'ready',finalized:false,aiGrade:high,aiStatus:'AI 완료'},
 {id:'c',classNo:1,assignedNo:3,status:'ready',finalized:false,aiGrade:null,aiStatus:'AI 미실행'},
 {id:'d',classNo:1,assignedNo:4,status:'ready',finalized:false,aiGrade:middle,aiStatus:'AI 오류',teacherGrade:high},
 {id:'e',classNo:1,assignedNo:5,status:'ready',finalized:true,aiGrade:middle,aiStatus:'AI 완료'},
 {id:'f',classNo:1,assignedNo:6,status:'uploading',finalized:false,aiGrade:middle,aiStatus:'AI 완료'},
 {id:'g',classNo:2,assignedNo:1,status:'ready',finalized:false,aiGrade:middle,aiStatus:'AI 완료'}
];
const ids=mode=>aiGradingCandidates(students,1,mode,DEFAULT_RUBRIC).map(s=>s.id);
assert.equal(aiSuggestedPoints(students[0],DEFAULT_RUBRIC).total,60);
assert.deepEqual(ids('sixty'),['a','d']);
assert.deepEqual(ids('pending'),['c','d']);
assert.deepEqual(ids('all'),['a','b','c','d']);
assert.equal(students[3].teacherGrade,high); // 교사 점수는 후보 선별에서 변경되지 않음
assert.ok(['sixty','pending','all'].every(mode=>!ids(mode).some(id=>['e','f','g'].includes(id))));
assert.throws(()=>aiGradingCandidates(students,0,'sixty',DEFAULT_RUBRIC),/학급/);
assert.throws(()=>aiGradingCandidates(students,1,'unknown',DEFAULT_RUBRIC),/유형/);
console.log('통과: AI 60점 재채점 / 미채점 / 전체 재분석 대상을 안전하게 선별');
