// 근거 불확실한 AI 채점 제안을 교사가 공식 평가수준 안에서 선택하도록 한다.
// 점수를 임의로 +/-5 보정하지 않는다. 반드시 동일한 쟁점 영역의 허용 수준 점수여야 한다.
import {AREA_KEYS, LEVELS, score} from './core.mjs?v=2';

const AREA_HINTS={
 algorithm:/(STEP\s*4|TEST|algorithm|알고리즘|자연어|위험\s*신호\s*수)/i,
 strategy:/(strategy|STEP\s*2|기준값|위험\s*기준|임계값|경보\s*규칙)/i,
 data:/(data\/|data:|STEP\s*1|센서\s*선택|홍수\s*사례|반례)/i
};
const NOTES={
 algorithm:{
  positive:'실제 STEP 3·4 원본을 확인해 TEST 표기·AI 판독의 불일치가 학생 알고리즘의 본질적인 오류가 아니라고 판단한 경우',
  negative:'실제 STEP 3·4 원본을 확인해 TEST 결과 불일치가 학생의 알고리즘 적용·검증 오류라고 판단한 경우'
 },
 strategy:{
  positive:'원본을 확인해 위험 기준값과 사례 근거가 실질적으로 타당하며 해당 부족점이 경미하다고 판단한 경우',
  negative:'원본을 확인해 위험 기준값·사례 근거의 부족이 판단의 신뢰성에 영향을 준다고 판단한 경우'
 },
 data:{
  positive:'원본을 확인해 데이터 선택·사례 해석·결론의 근거가 충분하다고 판단한 경우',
  negative:'원본을 확인해 데이터 해석·반례 검토에 주요 누락 또는 오류가 있다고 판단한 경우'
 }
};
function reviewArea(submission){
 const reasons=Array.isArray(submission.aiReviewReasons)?submission.aiReviewReasons:[];
 const hit=new Set();
 for(const reason of reasons){
  const text=String(reason);
  for(const a of AREA_KEYS)if(AREA_HINTS[a].test(text))hit.add(a);
 }
 if(hit.size!==1)return null;
 return [...hit][0];
}
export function teacherReviewChoices(submission,rubric){
 if(submission?.aiStatus!=='교사 확인 필요'||!submission?.aiCandidateGrade||!submission.aiReviewReasons?.length)return null;
 if(submission.finalized||submission.status!=='ready')return null;
 // 페이지가 실제로 없다면 긍/부정 5점 차이를 정당화할 수 없다.
 if(submission.missingRoles?.length||submission.aiReviewReasons.some(x=>/원본\s*누락/.test(String(x))))return null;
 const area=reviewArea(submission);
 if(!area)return null; // 여러 영역에서 논란이 있으면 두 개의 단순 점수로 축소하지 않는다.
 const base=submission.aiCandidateGrade;
 const candidate=score(base,rubric);
 if(!candidate)return null;
 const current=base[area]?.level;
 if(!LEVELS.includes(current)||current==='미제출')return null;
 const currentPoints=rubric[area]?.scores?.[current];
 if(!Number.isInteger(currentPoints))return null;
 const levels=LEVELS.filter(level=>level!=='미제출'&&Number.isInteger(rubric[area]?.scores?.[level]));
 const lower=levels.find(level=>rubric[area].scores[level]===currentPoints-5);
 const higher=levels.find(level=>rubric[area].scores[level]===currentPoints+5);
 // AI 잠정 판정을 긍정적 해석으로 우선 유지. 하위 5점 수준이 없을 때만 상위 수준 채택.
 if(!lower&&!higher)return null;
 const positiveLevel=lower?current:higher;
 const negativeLevel=lower?lower:current;
 const build=(level,kind)=>{
  const grade=structuredClone(base),explanation=NOTES[area][kind];
  grade[area]={...grade[area],level,reason:[grade[area]?.reason||'', '교사 판단 ('+(kind==='positive'?'긍정적 평가':'부정적 평가')+'): '+explanation+'.'].filter(Boolean).join('\n').slice(0,2000)};
  const points=score(grade,rubric);
  return {level,grade,points,explanation};
 };
 const positive=build(positiveLevel,'positive');
 const negative=build(negativeLevel,'negative');
 if(positive.points.total-negative.points.total!==5)throw Error('두 선택지의 점수 차이는 반드시 5점이어야 합니다.');
 const affectedEvidence=Object.values(submission.aiChecks?.[area]||{}).filter(x=>x?.observed)
  .map(x=>(x.page?x.page+'쪽: ':'')+String(x.observed).slice(0,180)).slice(0,3);
 return {area,areaName:rubric[area].name,positive,negative,
  issue:submission.aiReviewReasons.map(String).join(' / ').slice(0,700),observed:affectedEvidence};
}
