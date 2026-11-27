'use strict';
// 세 평가 영역의 학생 필기 근거를 검증한다. 점수 분포 자체는 판정 기준이 아니다.
const AREAS=['data','strategy','algorithm'];
const LEVELS=['상','중상','중','기초','미제출'];
const CRITERIA={
 data:['selection','cases','inference'],
 strategy:['thresholds','grounds','rule'],
 algorithm:['io','steps','test']
};
const STATUS=['충족','부분','미충족','판독불가'];
const MISSING_BY_AREA={
 data:['front','data-cont'],
 strategy:['strategy'],
 algorithm:['algorithm','test']
};
function auditGradingProposal(result,{pageCount=5,missingRoles=[]}={}){
 if(!result||typeof result!=='object'||!result.grades)throw Error('AI 채점 결과가 없습니다.');
 const grades={},checks={},reviewReasons=[];
 for(const area of AREAS){
  const g=result.grades[area];
  if(!g||!LEVELS.includes(g.level))throw Error(area+': 성취수준 형식 오류');
  const reason=String(g.reason??'').trim();
  if(reason.length<20)throw Error(area+': 학생별 판단 근거 부족');
  grades[area]={level:g.level,reason:reason.slice(0,1500)};
  checks[area]={};
  for(const key of CRITERIA[area]){
   const c=g.checks?.[key];
   if(!c||!STATUS.includes(c.status))throw Error(area+'/'+key+': 평가 요소 검증 결과가 없습니다.');
   const page=c.page===null?null:Number(c.page);
   const observed=String(c.observed??'').trim();
   if(c.status!=='판독불가'&&(!Number.isInteger(page)||page<1||page>pageCount))
    throw Error(area+'/'+key+': 실제 답안 페이지 번호가 없습니다.');
   if(c.status!=='판독불가'&&observed.length<4)
    throw Error(area+'/'+key+': 실제 필기 또는 빈칸 확인 근거가 부족합니다.');
   checks[area][key]={status:c.status,page:Number.isInteger(page)&&page>=1&&page<=pageCount?page:null,observed:observed.slice(0,500)};
   if(c.status==='판독불가')reviewReasons.push(area+'/'+key+': 필기 판독 불확실');
  }
  const values=Object.values(checks[area]).map(x=>x.status);
  if(g.level==='상'&&values.some(x=>x!=='충족'))throw Error(area+': 상 수준 판정과 평가 요소가 일치하지 않습니다.');
  if(g.level==='미제출'&&values.some(x=>x!=='미충족'&&x!=='판독불가'))throw Error(area+': 답안이 있는데 미제출로 판정했습니다.');
  if(['중','기초'].includes(g.level)&&values.every(x=>x==='충족'))throw Error(area+': 충족 결과와 낮은 수준 판정이 모순됩니다.');
  if(g.level==='중상'&&values.filter(x=>x==='미충족').length>=2)throw Error(area+': 중상 판정과 미충족 요소가 모순됩니다.');
  const missing=(Array.isArray(missingRoles)?missingRoles:[]).filter(r=>MISSING_BY_AREA[area].includes(r));
  if(missing.length)reviewReasons.push(area+': 원본 누락 단계 '+missing.join(', '));
 }
 return {grades,checks,reviewReasons:[...new Set(reviewReasons)]};
}
module.exports={AREAS,LEVELS,CRITERIA,auditGradingProposal};
