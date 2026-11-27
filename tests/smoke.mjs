import assert from 'node:assert/strict';
import {parseCsv,score,DEFAULT_RUBRIC,verifyRubric,rangesForPages,parseMissingNumbers,activeNumbers,genderRangesForClass,parseXlsxRosterRows,inferClassesFromRoster,toCsv,assertClass,escapeHtml} from '../docs/core.mjs';
const list=parseCsv('\uFEFF반,번호,이름\r\n1,1,김민수\r\n1,2,"이,서연"\r\n2,1,박지훈');
assert.equal(list.length,3);assert.equal(list[1].name,'이,서연');
assert.throws(()=>parseCsv('반,번호,이름\n1,1,학생\n1,1,중복'),/중복/);
assert.deepEqual(score({data:{level:'중'},strategy:{level:'기초'},algorithm:{level:'기초'}}),{data:20,strategy:15,algorithm:15,total:50});
assert.equal(verifyRubric(DEFAULT_RUBRIC),true);
assert.throws(()=>verifyRubric({...DEFAULT_RUBRIC,strategy:{...DEFAULT_RUBRIC.strategy,scores:{...DEFAULT_RUBRIC.strategy.scores,'기초':26}}}),/순/);
assert.deepEqual(rangesForPages([{name:'test.pdf',pages:10}],3,4).map(x=>[x.number,x.pageFrom]),[[3,1],[4,6]]);
assert.throws(()=>rangesForPages([{name:'test.pdf',pages:9}],3,4),/5의 배수/);
assert.deepEqual(parseMissingNumbers('3, 8, 23-25',1,30),[3,8,23,24,25]);
assert.deepEqual(parseMissingNumbers('',1,30),[]);
assert.throws(()=>parseMissingNumbers('3, 99',1,30),/밖/);
assert.throws(()=>parseMissingNumbers('3,,4',1,30),/형식/);
assert.throws(()=>parseMissingNumbers('23-21',1,30),/밖/);
const boysGirls={classNo:1,startNo:1,endNo:24,missingNos:[3,19,20,22]};
assert.deepEqual(activeNumbers(boysGirls,18,24),[18,21,23,24]);
assert.deepEqual(rangesForPages([{name:'students.pdf',pages:20}],18,24,boysGirls.missingNos).map(x=>[x.number,x.pageFrom]),[[18,1],[21,6],[23,11],[24,16]]);
assert.throws(()=>rangesForPages([{name:'students.pdf',pages:25}],18,24,boysGirls.missingNos),/결번 제외 학생 4명/);
assert.throws(()=>rangesForPages([{name:'students.pdf',pages:5}],19,20,boysGirls.missingNos),/결번만/);
assert.throws(()=>assertClass({classNo:1,startNo:1,endNo:30,missingNos:[32]}),/결번/);

assert.doesNotThrow(()=>assertClass({classNo:1,startNo:1,endNo:30}));
assert.equal(escapeHtml('<test>'),'&lt;test&gt;');
assert.ok(toCsv([['반','이름'],[1,'이,서연']]).includes('"이,서연"'));

const excelRows=[
  ['학년','반','번호','이름'],
  [1,1,1,'테스트 남학생1'],
  [1,1,3,'테스트 남학생3'],
  [1,1,21,'테스트 여학생21'],
  [1,1,23,'테스트 여학생23'],
  [1,2,21,'여학생만 있는 반'],
  [1,2,22,'여학생만 있는 반 2']
];
const excelStudents=parseXlsxRosterRows(excelRows);
assert.equal(excelStudents.length,6);
const inferred=inferClassesFromRoster(excelStudents);
assert.deepEqual(inferred.map(x=>x.classNo),[1,2]);
// 남/여 사이 사용하지 않는 번호대는 결번이 아니라 범위 밖이므로 제외한다.
assert.deepEqual(inferred[0].missingNos,[2,22]);
assert.deepEqual([inferred[0].boysStart,inferred[0].boysEnd,inferred[0].girlsStart,inferred[0].girlsEnd],[1,3,21,23]);
assert.equal(activeNumbers(inferred[0]).length,4);
assert.deepEqual([inferred[1].boysStart,inferred[1].boysEnd,inferred[1].girlsStart,inferred[1].girlsEnd],[null,null,21,22]);
assert.deepEqual(inferred[1].missingNos,[]);
assert.deepEqual(genderRangesForClass({classNo:3,startNo:1,endNo:5,missingNos:[]}),{boysStart:1,boysEnd:5,girlsStart:null,girlsEnd:null});
assert.throws(()=>parseXlsxRosterRows([['학년','반','번호','이름'],[2,1,1,'타학년']]),/1학년 전용/);
assert.throws(()=>parseXlsxRosterRows([['학년','반','번호','이름'],[1,1,1,'갑'],[1,1,1,'을']]),/중복/);
assert.throws(()=>parseXlsxRosterRows([['학년','반','번호','이름'],[1,1,1,'']]),/모두 입력/);
assert.throws(()=>parseXlsxRosterRows([['반','학년','번호','이름'],[1,1,1,'갑']]),/첫 행/);
// 5쪽 고정 양식의 과거 배정 함수는 남학생·여학생의 실제 번호 구간을 따로 호출한다.
const boyPages=rangesForPages([{name:'boys.pdf',pages:10}],1,3,[2]);
const girlPages=rangesForPages([{name:'girls.pdf',pages:10}],21,23,[22]);
assert.deepEqual([...boyPages,...girlPages].map(x=>x.number),[1,3,21,23]);

console.log('검증 통과: CSV / XLSX 명단 / 남녀 번호 구간 / 자동 결번 / 5쪽 배정 / 배점');
