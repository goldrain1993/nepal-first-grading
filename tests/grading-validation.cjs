'use strict';
const assert=require('node:assert/strict');
const {auditGradingProposal}=require('../functions/grading-validation.js');
function item(status='충족',page=1,observed='실제 학생 답안에서 읽은 구체적 서술') {
 return {status,page,observed};
}
function sample(level='상'){
 return {grades:{
  data:{level,reason:'홍수 O·X 사례와 3개 센서 선택 이유를 실제 서술에 근거하여 비교함',checks:{selection:item(),cases:item(),inference:item()}},
  strategy:{level,reason:'관측값과 위험 기준 3개를 비교하고 2개 이상 경보 규칙 적용 여부를 확인함',checks:{thresholds:item(),grounds:item(),rule:item()}},
  algorithm:{level,reason:'입력 처리 출력과 순서형 알고리즘, 실제 TEST 판정을 확인함',checks:{io:item(),steps:item(),test:item()}}
 }};
}
let r=auditGradingProposal(sample(),{pageCount:5});
assert.equal(r.grades.data.level,'상');
assert.deepEqual(r.reviewReasons,[]);
const validMiddle=sample('중');
for(const area of ['data','strategy','algorithm']) {
 const key=Object.keys(validMiddle.grades[area].checks)[0];
 validMiddle.grades[area].checks[key]=item('부분');
}
assert.equal(auditGradingProposal(validMiddle).grades.algorithm.level,'중');
assert.throws(()=>auditGradingProposal(sample('중')),/모순/);
const blank=sample();blank.grades.strategy.checks.grounds={status:'판독불가',page:null,observed:'읽기 어려움'};
blank.grades.strategy.level='중';
assert.match(auditGradingProposal(blank).reviewReasons.join(' '),/판독 불확실/);
assert.match(auditGradingProposal(sample(),{missingRoles:['data-cont']}).reviewReasons.join(' '),/원본 누락/);
const noEvidence=sample();delete noEvidence.grades.algorithm.checks.test;
assert.throws(()=>auditGradingProposal(noEvidence),/검증 결과/);
const noPage=sample();noPage.grades.data.checks.selection.page=9;
assert.throws(()=>auditGradingProposal(noPage),/페이지 번호/);
const tooShort=sample();tooShort.grades.data.reason='보통';
assert.throws(()=>auditGradingProposal(tooShort),/근거 부족/);
const absent=sample('미제출');
for(const area of ['data','strategy','algorithm'])for(const k of Object.keys(absent.grades[area].checks))absent.grades[area].checks[k]=item('미충족',1,'확인한 문항 칸이 비어 있음');
assert.equal(auditGradingProposal(absent).grades.data.level,'미제출');
console.log('통과: 채점 근거·수준 일관성·누락·판독 불확실 확인');
