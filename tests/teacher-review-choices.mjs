import assert from 'node:assert/strict';
import {DEFAULT_RUBRIC} from '../docs/core.mjs';
import {teacherReviewChoices} from '../docs/teacher-review-choices.mjs';

const grade={
 data:{level:'중상',reason:'선정한 센서와 홍수 O/X 사례를 비교하고 반례를 설명했지만 결론이 간결함'},
 strategy:{level:'중상',reason:'센서 세 종류의 위험 기준값과 2개 이상 위험시 경보 규칙을 기술했으나 사례 근거 일부가 부족함'},
 algorithm:{level:'중',reason:'센서값 입력과 반복 확인 및 두 개 이상 위험 신호 시 경보한다는 절차를 적었으나 TEST 정합성 논쟁이 있음'}
};
const base={status:'ready',aiStatus:'교사 확인 필요',finalized:false,
 aiCandidateGrade:grade,
 aiReviewReasons:['STEP 4 TEST 값의 공식 데이터 검증 결과와 AI의 충족 판정이 불일치하여 교사 확인이 필요합니다.'],
 aiChecks:{algorithm:{test:{status:'충족',page:5,observed:'학생이 진동·수위·유속 값에 대한 TEST 근거를 작성함'}}},
 missingRoles:[]};
const options=teacherReviewChoices(base,DEFAULT_RUBRIC);
assert.ok(options);
assert.equal(options.area,'algorithm');
assert.equal(options.positive.points.total-options.negative.points.total,5);
assert.equal(options.positive.grade.algorithm.level,'중');
assert.equal(options.negative.grade.algorithm.level,'기초');
assert.equal(options.positive.points.total,70);
assert.equal(options.negative.points.total,65);
assert.equal(grade.algorithm.level,'중');
for(const level of ['상','중상','중','기초']){
 const subject=structuredClone(base);subject.aiCandidateGrade.algorithm.level=level;
 const choices=teacherReviewChoices(subject,DEFAULT_RUBRIC);
 assert.ok(choices,level);assert.equal(choices.positive.points.total-choices.negative.points.total,5);
}
const strategy=structuredClone(base);
strategy.aiReviewReasons=['strategy/grounds: 필기 판독 불확실'];
assert.equal(teacherReviewChoices(strategy,DEFAULT_RUBRIC).area,'strategy');
const dataOnly=structuredClone(base);
dataOnly.aiReviewReasons=['data/inference: 필기 판독 불확실'];
assert.equal(teacherReviewChoices(dataOnly,DEFAULT_RUBRIC),null); // 데이터의 공식 배점 간격 10점, 임의 5점 불허
const dataFive=structuredClone(DEFAULT_RUBRIC);
dataFive.data.scores['중상']=25;
assert.equal(teacherReviewChoices(dataOnly,dataFive).positive.points.total-teacherReviewChoices(dataOnly,dataFive).negative.points.total,5);
for(const reason of ['원본 누락 단계 test','data/inference: 필기 판독 불확실 / algorithm/test: 필기 판독 불확실']){
 const subject=structuredClone(base);subject.aiReviewReasons=[reason];assert.equal(teacherReviewChoices(subject,DEFAULT_RUBRIC),null);
}
for(const variant of [
 {finalized:true},{status:'uploading'},{aiStatus:'AI 완료'},{aiCandidateGrade:null},{missingRoles:['test']}
]){
 assert.equal(teacherReviewChoices({...base,...variant},DEFAULT_RUBRIC),null);
}
console.log('통과: 실제 평가수준의 긍·부정 두 선택지 5점 차이, 원본누락·다영역·확정 차단');
