// 저장된 학생별 PDF를 재사용하는 AI 채점 관리용 순수 함수.
import {score} from './core.mjs?v=2';

export function aiSuggestedPoints(submission,rubric){
 if(!submission?.aiGrade)return null;
 try{return score(submission.aiGrade,rubric);}catch{return null;}
}
export function aiGradingCandidates(submissions,classNo,mode,rubric){
 const n=Number(classNo);
 if(!Number.isInteger(n)||n<1)throw Error('AI 채점할 학급을 선택하세요.');
 if(!['sixty','pending','all'].includes(mode))throw Error('AI 채점 유형을 확인하세요.');
 return submissions.filter(s=>{
  if(s.classNo!==n||s.status!=='ready'||s.finalized)return false;
  if(mode==='all')return true;
  if(mode==='sixty')return aiSuggestedPoints(s,rubric)?.total===60;
  return !s.aiGrade||s.aiStatus!=='AI 완료';
 }).sort((a,b)=>a.assignedNo-b.assignedNo);
}
