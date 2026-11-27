// 저장된 학생별 PDF를 재사용하는 AI 채점 관리용 순수 함수.
import {score} from './core.mjs?v=2';

export function aiSuggestedPoints(submission,rubric){
 // 실패/판독불가 시 오래된 AI 제안을 현재 점수처럼 표시하지 않는다.
 if(!submission?.aiGrade||submission.aiStatus!=='AI 완료')return null;
 try{return score(submission.aiGrade,rubric);}catch{return null;}
}
export function aiGradingCandidates(submissions,classNo,mode,rubric,selectedIds=[]){
 const allClasses=classNo==='all';
 const n=Number(classNo);
 if(!allClasses&&(!Number.isInteger(n)||n<1))throw Error('AI 채점할 학급을 선택하세요.');
 if(!['selected','pending','all'].includes(mode))throw Error('AI 채점 유형을 확인하세요.');
 const selected=new Set(selectedIds);
 return submissions.filter(s=>{
  if((!allClasses&&s.classNo!==n)||s.status!=='ready'||s.finalized)return false;
  if(mode==='selected')return selected.has(s.id);
  if(mode==='all')return true;
  return !s.aiGrade||s.aiStatus!=='AI 완료';
 }).sort((a,b)=>a.classNo-b.classNo||a.assignedNo-b.assignedNo);
}
