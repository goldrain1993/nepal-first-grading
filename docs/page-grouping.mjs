// 페이지 단위 학생 식별·재정렬: 첫 페이지(학번/이름)부터 다음 첫 페이지 직전까지를 1명으로 처리
export const PAGE_ROLES=['front','data-cont','strategy','algorithm','test'];
export const ROLE_NAMES={front:'STEP 1 첫 장(학번·이름)', 'data-cont':'STEP 1 계속',strategy:'STEP 2 전략',algorithm:'STEP 3 알고리즘',test:'STEP 4 TEST',unknown:'판별 필요'};

export function inferPageRole(text){
 const t=String(text||'').replace(/\s+/g,' ').toUpperCase();
 const normalized=t.replace(/[·.:\-_]/g,' ');
 // 2026년 수행평가지 공식 5쪽의 인쇄 제목을 우선 사용한다.
 if(/STEP\s*1\s*(계속|CONT)/i.test(t)||/데이터에서\s*특징\s*찾기/.test(t))return 'data-cont';
 if(/STEP\s*2\b/i.test(t)||/문제\s*해결\s*전략\s*선택/.test(t))return 'strategy';
 if(/STEP\s*3\b/i.test(t)||/알고리즘\s*설계\s*\[?\s*30점/.test(t))return 'algorithm';
 if(/STEP\s*4\b/i.test(t)||/내\s*알고리즘\s*시험하기/.test(t))return 'test';
 if(/STEP\s*1\b/i.test(t)&&( /학\s*번/.test(t)&&/이\s*름/.test(t)||/데이터\s*수집/.test(t)))return 'front';
 // STEP 제목 추출이 누락된 디지털 PDF에만 문항 구조로 보조 추정한다.
 if(/TEST\s*값/.test(t)&&/위험\s*신호/.test(t)&&/최종\s*결과|경보|정상/.test(t))return 'test';
 if(/입력\s*처리\s*출력/.test(normalized)&&/알고리즘을\s*순서대로|5단계/.test(t))return 'algorithm';
 if(/위험\s*기준값/.test(t)&&/근거\s*사례/.test(t)&&/센서\s*3개/.test(t))return 'strategy';
 if(/홍수\s*O\s*사례/.test(t)&&/반례/.test(t)&&/특징/.test(t))return 'data-cont';
 if(/학\s*번/.test(t)&&/이\s*름/.test(t)&&/데이터뱅크/.test(t))return 'front';
 return 'unknown';
}
// AI는 인쇄 양식과 문항·배치를 참고해 STEP을 분류한다. 불확실한 결과는
// 임의로 학생에게 연결하지 않으며 수동 확인 대상으로 유지한다.
export function applyVisualPageResult(page,result){
 const role=PAGE_ROLES.includes(result?.role)?result.role:'unknown';
 const confidence=['높음','보통','낮음'].includes(result?.confidence)?result.confidence:'낮음';
 const valid=role!=='unknown'&&confidence!=='낮음';
 if(!page.manualEdited){
  page.role=valid?role:'unknown';
  page.start=page.role==='front';
 }
 page.aiRole=role;
 page.confidence=confidence;
 page.recognizedNo=String(result?.studentNo||'').trim().slice(0,24);
 page.recognizedName=String(result?.studentName||'').trim().slice(0,60);
 const reason=String(result?.reason||'').trim().slice(0,160);
 page.detected='AI 이미지 판별 · '+confidence+(valid?'':' · 교사 확인 필요')+
  (reason?' · '+reason:'')+
  (page.recognizedNo?' · 번호 '+page.recognizedNo:'')+
  (page.recognizedName?' · 이름 '+page.recognizedName:'');
 page.visualChecked=true;
 return valid;
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
 if(studentNumbers!==undefined&&students.length!==studentNumbers.length)throw Error('PDF에서 분리한 학생 '+students.length+'명과 선택한 학생 '+studentNumbers.length+'명이 다릅니다. 첫 장과 번호 범위를 대조하세요.');
 return students.map((parts,i)=>{
   if(parts[0].role!=='front')throw Error((i+1)+'번째 학생의 첫 장은 이름·학번이 있는 STEP 1이어야 합니다.');
   const used=new Set();
   for(const p of parts){if(used.has(p.role))throw Error((i+1)+'번째 학생에게 "'+ROLE_NAMES[p.role]+'" 페이지가 중복됩니다. STEP 선택과 시작 위치를 수정하세요.');used.add(p.role);}
   const sorted=[...parts].sort((a,b)=>PAGE_ROLES.indexOf(a.role)-PAGE_ROLES.indexOf(b.role));
   return {number:studentNumbers?.[i]??null,pages:sorted,sourcePages:parts.length,missingRoles:PAGE_ROLES.filter(role=>!used.has(role))};
 });
}

// 첫 장에서 AI가 읽은 학번을 반·번호로 해석한다. 맞는 학급이 아니면 자동 선택하지 않는다.
// 예: 10135 = 1학년 1반 35번, 26-10135 = 해당 연도 1학년 1반 35번.
export function recognizedStudentNumber(text,classNo){
 const raw=String(text??'').trim().replace(/[\s-]/g,'');
 if(!/^\d+$/.test(raw))return null;
 if(/^\d{1,2}$/.test(raw)){
  const n=Number(raw);return n>=1&&n<=99?n:null;
 }
 const id=raw.length===7?raw.slice(2):raw;
 if(!/^\d{5}$/.test(id))return null;
 const grade=Number(id.slice(0,1)),room=Number(id.slice(1,3)),student=Number(id.slice(3,5));
 return grade===1&&room===Number(classNo)&&student>=1&&student<=99?student:null;
}
