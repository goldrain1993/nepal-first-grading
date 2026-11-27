import {activeNumbers,score} from './core.mjs';

// 반 전체의 등록 명단·PDF·신원 확인·교사 채점 저장 상태를 모두 점검한다.
// 일부 학생만 업로드한 경우는 아직 '반 전체 확정' 상태가 아니다.
export function checkClassBulkFinalize(classNo,classes,roster,submissions){
 const n=Number(classNo);
 const group=classes.find(c=>c.classNo===n);
 const blockers=[];
 if(!group)return {ready:false,classNo:n,students:0,submitted:0,confirmed:0,graded:0,finalized:0,pending:[],total:0,blockers:['학급을 선택하세요.']};
 const numbers=activeNumbers(group);
 const included=new Set(numbers);
 const students=roster.filter(s=>s.classNo===n&&included.has(s.number));
 const source=submissions.filter(s=>s.classNo===n);
 const byNumber=new Map();
 const duplicate=[];
 const outOfRange=[];
 for(const s of source){
  if(!included.has(s.assignedNo))outOfRange.push(s.assignedNo);
  if(byNumber.has(s.assignedNo))duplicate.push(s.assignedNo);
  else byNumber.set(s.assignedNo,s);
 }
 const missingRoster=numbers.filter(no=>!students.some(x=>x.number===no&&String(x.name||'').trim()));
 const missingPdf=numbers.filter(no=>!byNumber.has(no));
 const unfinished=source.filter(s=>s.status!=='ready');
 const notConfirmed=source.filter(s=>!s.identityConfirmed);
 const notGraded=source.filter(s=>{
  if(!s.teacherGrade||!s.pointsSnapshot?.rubric||!s.pointsSnapshot?.points)return true;
  try{
   const scored=score(s.teacherGrade,s.pointsSnapshot.rubric);
   return !scored||!Number.isInteger(s.pointsSnapshot.points.total)||scored.total!==s.pointsSnapshot.points.total;
  }catch{return true;}
 });
 const nums=(items)=>[...new Set(items)].sort((a,b)=>a-b).slice(0,12).join(', ')+(new Set(items).size>12?' 외':'');
 if(missingRoster.length)blockers.push('학생 명단 미등록 '+missingRoster.length+'명: '+nums(missingRoster)+'번');
 if(missingPdf.length)blockers.push('PDF 미업로드 '+missingPdf.length+'명: '+nums(missingPdf)+'번');
 if(duplicate.length)blockers.push('동일 학급 중복 배정: '+nums(duplicate)+'번');
 if(outOfRange.length)blockers.push('학급 번호 범위 밖의 답안: '+nums(outOfRange)+'번');
 if(unfinished.length)blockers.push('PDF 업로드 미완료 '+unfinished.length+'명: '+nums(unfinished.map(s=>s.assignedNo))+'번');
 if(notConfirmed.length)blockers.push('신원 확인 미완료 '+notConfirmed.length+'명: '+nums(notConfirmed.map(s=>s.assignedNo))+'번');
 if(notGraded.length)blockers.push('교사 점수·근거 저장 미완료 '+notGraded.length+'명: '+nums(notGraded.map(s=>s.assignedNo))+'번');
 const pending=source.filter(s=>!s.finalized);
 const total=source.reduce((sum,s)=>sum+(Number(s.pointsSnapshot?.points?.total)||0),0);
 return {ready:blockers.length===0&&pending.length>0,classNo:n,students:numbers.length,submitted:source.length,
  confirmed:source.length-notConfirmed.length,graded:source.length-notGraded.length,
  finalized:source.length-pending.length,pending,total,blockers};
}
