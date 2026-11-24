// 페이지 단위 학생 식별·재정렬: 첫 페이지(학번/이름)부터 다음 첫 페이지 직전까지를 1명으로 처리
export const PAGE_ROLES=['front','data-cont','strategy','algorithm','test'];
export const ROLE_NAMES={front:'STEP 1 첫 장(학번·이름)', 'data-cont':'STEP 1 계속',strategy:'STEP 2 전략',algorithm:'STEP 3 알고리즘',test:'STEP 4 TEST',unknown:'판별 필요'};

export function inferPageRole(text){
 const t=String(text||'').replace(/\s+/g,' ').toUpperCase();
 if(/STEP\s*1\s*(계속|CONT)/i.test(t))return 'data-cont';
 if(/STEP\s*2\b/i.test(t))return 'strategy';
 if(/STEP\s*3\b/i.test(t))return 'algorithm';
 if(/STEP\s*4\b/i.test(t))return 'test';
 if(/STEP\s*1\b/i.test(t)&&(/학\s*번/.test(t)&&/이\s*름/.test(t)))return 'front';
 return 'unknown';
}
export function groupPages(pages,studentNumbers){
 if(!Array.isArray(pages)||!pages.length)throw Error('PDF 페이지를 분석한 뒤 학생별 시작 위치를 확인하세요.');
 const students=[];
 let group=[];
 for(let i=0;i<pages.length;i++){
  const p=pages[i];
  if(i===0&&!p.start)throw Error('PDF 첫 페이지는 반드시 이름·학번이 있는 시작 페이지로 지정하세요.');
  if(p.start&&group.length){students.push(group);group=[];}
  if(p.start&&p.role!=='front')throw Error((i+1)+'번째 페이지: 학생 시작은 STEP 1 첫 장이어야 합니다.');
  if(!p.start&&p.role==='front')throw Error((i+1)+'번째 페이지: 이름 있는 첫 장은 반드시 "새 학생 시작"으로 표시하세요.');
  if(!PAGE_ROLES.includes(p.role))throw Error((i+1)+'번째 페이지의 STEP 구분이 필요합니다. 미확인 장은 교사가 직접 확인하세요.');
  group.push(p);
  if(group.length>5)throw Error('학생 한 명에게 6장 이상 배정됐습니다. 새 학생의 첫 장 위치를 확인하세요.');
 }
 if(group.length)students.push(group);
 if(students.length!==studentNumbers.length)throw Error('PDF에서 분리한 학생 '+students.length+'명과 선택한 학생 '+studentNumbers.length+'명이 다릅니다. 첫 장과 번호 범위를 대조하세요.');
 return students.map((parts,i)=>{
   if(parts[0].role!=='front')throw Error((i+1)+'번째 학생의 첫 장은 이름·학번이 있는 STEP 1이어야 합니다.');
   const used=new Set();
   for(const p of parts){if(used.has(p.role))throw Error((i+1)+'번째 학생에게 "'+ROLE_NAMES[p.role]+'" 페이지가 중복됩니다. STEP 선택과 시작 위치를 수정하세요.');used.add(p.role);}
   const sorted=[...parts].sort((a,b)=>PAGE_ROLES.indexOf(a.role)-PAGE_ROLES.indexOf(b.role));
   return {number:studentNumbers[i],pages:sorted,sourcePages:parts.length,missingRoles:PAGE_ROLES.filter(role=>!used.has(role))};
 });
}
