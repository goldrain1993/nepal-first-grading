// 순수 함수: 브라우저 + Node 테스트에서 동일하게 사용
export const AREA_KEYS=['data','strategy','algorithm'];
export const LEVELS=['상','중상','중','기초','미제출'];
export const DEFAULT_RUBRIC={
 data:{name:'데이터 수집·분석',max:40,scores:{'상':40,'중상':30,'중':20,'기초':10,'미제출':0}},
 strategy:{name:'문제 해결 전략 선택',max:30,scores:{'상':30,'중상':25,'중':20,'기초':15,'미제출':0}},
 algorithm:{name:'알고리즘 설계·시험',max:30,scores:{'상':30,'중상':25,'중':20,'기초':15,'미제출':0}}
};
export function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
export function score(grade,rubric=DEFAULT_RUBRIC){if(!grade)return null;const pts={};for(const a of AREA_KEYS){const lv=grade[a]?.level;if(!LEVELS.includes(lv))return null;pts[a]=rubric[a].scores[lv]??0;}return {...pts,total:Object.values(pts).reduce((a,b)=>a+b,0)};}
export function verifyRubric(r){if(!r||typeof r!=='object')throw Error('평가기준이 없습니다.');for(const a of AREA_KEYS){const x=r[a],orig=DEFAULT_RUBRIC[a];if(!x||x.max!==orig.max)throw Error('영역의 최대점수는 변경할 수 없습니다.');const nums=LEVELS.map(l=>Number(x.scores?.[l]));if(nums.some(n=>!Number.isInteger(n)||n<0||n>x.max)||nums.at(-1)!==0)throw Error('배점을 확인하세요. 미제출은 0점입니다.');if(nums.some((v,i)=>i&&v>nums[i-1]))throw Error('수준별 점수는 상 ≥ 중상 ≥ 중 ≥ 기초 ≥ 미제출 순이어야 합니다.');}return true;}
export function parseMissingNumbers(input,startNo,endNo){
  const text=String(input??'').trim();if(!text)return [];
  const found=new Set();
  for(const raw of text.split(/[,，]/)){
    const token=raw.trim();const match=token.match(/^(\d{1,2})(?:\s*[-~]\s*(\d{1,2}))?$/);
    if(!match)throw Error(`결번 입력 형식이 올바르지 않습니다: ${raw||'(빈 항목)'} (예: 3, 8, 23-25)`);
    const a=Number(match[1]),b=match[2]?Number(match[2]):a;
    if(a>b||a<startNo||b>endNo)throw Error(`결번 ${raw}은(는) 학급 번호 범위 ${startNo}~${endNo} 밖입니다.`);
    for(let n=a;n<=b;n++)found.add(n);
  }
  return [...found].sort((a,b)=>a-b);
}
export function assertClass(c){
  const {classNo,startNo,endNo}=c;
  if(!Number.isInteger(classNo)||classNo<1||classNo>99||!Number.isInteger(startNo)||!Number.isInteger(endNo)||startNo<1||startNo>endNo||endNo>99)throw Error('반 번호와 시작·마지막 번호를 확인하세요.');
  const missing=c.missingNos??[];
  if(!Array.isArray(missing)||missing.some(n=>!Number.isInteger(n)||n<startNo||n>endNo)||new Set(missing).size!==missing.length)throw Error('결번 목록을 확인하세요.');
}
export function activeNumbers(c,startNo=c.startNo,endNo=c.endNo){
  assertClass(c);
  if(!Number.isInteger(startNo)||!Number.isInteger(endNo)||startNo<c.startNo||endNo>c.endNo||startNo>endNo)throw Error('학급과 학생 번호 범위를 확인하세요.');
  const missing=new Set(c.missingNos||[]);
  return Array.from({length:endNo-startNo+1},(_,i)=>startNo+i).filter(n=>!missing.has(n));
}

export function genderRangesForClass(c){
  const nums=activeNumbers(c);
  const boys=nums.filter(n=>n<=20),girls=nums.filter(n=>n>=21);
  return {
    boysStart: boys.length?boys[0]:null,
    boysEnd: boys.length?boys[boys.length-1]:null,
    girlsStart: girls.length?girls[0]:null,
    girlsEnd: girls.length?girls[girls.length-1]:null
  };
}
export function parseXlsxRosterRows(rows){
  if(!Array.isArray(rows)||!rows.length)throw Error('학생명단 시트가 비어 있습니다.');
  const hdr=rows[0].slice(0,4).map(v=>String(v??'').replace(/\uFEFF/g,'').replace(/\s+/g,''));
  if(hdr.join(',')!=='학년,반,번호,이름')throw Error('첫 행의 제목은 학년, 반, 번호, 이름 순서여야 합니다. 양식 다운로드를 이용하세요.');
  const items=[],seen=new Set();
  const parseNum=(v,suffix,at)=>{
    const str=String(v??'').trim();
    const reg=new RegExp('^(\\d{1,2})(?:'+suffix+')?files,startNo,endNo,missingNos=[]){
  const numbers=activeNumbers({classNo:1,startNo,endNo,missingNos});
  const expected=numbers.length;
  if(!expected)throw Error('선택한 범위에는 결번만 있습니다. 실제 학생이 있는 번호를 선택하세요.');
  const chunks=[];let index=0;
  for(const f of files){
    if(f.pages<1||f.pages%5)throw Error(`${f.name}: PDF 페이지 수가 5의 배수가 아닙니다 (${f.pages}쪽)`);
    for(let i=0;i<f.pages;i+=5){
      chunks.push({number:numbers[index++],name:f.name,pageFrom:i+1,pageTo:i+5,file:f});
    }
  }
  if(chunks.length!==expected)throw Error(`결번 제외 학생 ${expected}명에 대한 ${expected*5}쪽이 필요한데 PDF에서 ${chunks.length}명분을 찾았습니다.`);
  return chunks;
}
export function parseCsv(input){const lines=[],row=[];let s='',quoted=false;for(let i=0;i<input.length;i++){const ch=input[i];if(quoted){if(ch==='"'&&input[i+1]==='"'){s+='"';i++;}else if(ch==='"')quoted=false;else s+=ch;}else if(ch==='"')quoted=true;else if(ch===','){row.push(s);s='';}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&input[i+1]==='\n')i++;row.push(s);s='';if(row.some(v=>v.trim()))lines.push(row.slice());row.length=0;}else s+=ch;}if(quoted)throw Error('CSV 따옴표가 닫히지 않았습니다.');row.push(s);if(row.some(v=>v.trim()))lines.push(row);if(lines.length<2)throw Error('CSV에 제목행과 학생 자료가 필요합니다.');const headers=lines.shift().map((h)=>h.replace(/^\uFEFF/,'').trim().replaceAll(' ',''));const find=(names)=>headers.findIndex(h=>names.includes(h));const ic=find(['반','학급','class','class_no']),inm=find(['번호','number','student_no']),ina=find(['이름','name']);if([ic,inm,ina].includes(-1))throw Error('CSV 머리글은 반,번호,이름이어야 합니다.');const records=lines.map((r,i)=>{const classNo=Number(String(r[ic]||'').trim().replace('반',''));const number=Number(String(r[inm]||'').trim().replace('번',''));const name=String(r[ina]||'').trim();if(!Number.isInteger(classNo)||!Number.isInteger(number)||!name||name.length>80)throw Error(`CSV ${i+2}행의 반/번호/이름을 확인하세요.`);return {classNo,number,name};});const ids=records.map(x=>`${x.classNo}-${x.number}`);if(new Set(ids).size!==ids.length)throw Error('CSV에 학급·번호 중복이 있습니다.');return records;}
export function csvCell(x){let str=String(x??'');if(/^[\s]*[=+@]/.test(str)||/^[\s]*-\D/.test(str))str="'"+str;return /[",\n\r]/.test(str)?'"'+str.replaceAll('"','""')+'"':str;}
export function toCsv(rows){return '\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');}
);
    const match=str.match(reg);
    if(!match)throw Error(at+'은(는) 1~99의 정수여야 합니다.');
    return Number(match[1]);
  };
  for(let i=1;i<rows.length;i++){
    const r=rows[i]||[],four=[0,1,2,3].map(j=>String(r[j]??'').trim());
    if(four.every(v=>!v))continue;
    if(four.some(v=>!v))throw Error('엑셀 '+(i+1)+'행: 학년, 반, 번호, 이름을 모두 입력하세요.');
    const gradeNo=parseNum(four[0],'학년',String(i+1)+'행 학년');
    const classNo=parseNum(four[1],'반',String(i+1)+'행 반');
    const number=parseNum(four[2],'번',String(i+1)+'행 번호');
    const name=four[3];
    if(gradeNo!==1)throw Error(String(i+1)+'행: 현재 이 수행평가 웹앱은 1학년 전용입니다. 학년은 1로 입력하세요.');
    if(classNo<1||classNo>99||number<1||number>99||name.length>80||/[\u0000-\u001f]/.test(name))throw Error(String(i+1)+'행: 반·번호는 1~99, 이름은 80자 이하로 입력하세요.');
    const key=[gradeNo,classNo,number].join('-');
    if(seen.has(key))throw Error(String(i+1)+'행: '+gradeNo+'학년 '+classNo+'반 '+number+'번이 중복되었습니다.');
    seen.add(key);
    items.push({gradeNo,classNo,number,name});
    if(items.length>4500)throw Error('엑셀에는 한 번에 최대 4,500명만 등록할 수 있습니다.');
  }
  if(!items.length)throw Error('엑셀 학생명단 시트에 학생을 1명 이상 입력하세요.');
  return items;
}
export function inferClassesFromRoster(items){
  const grouped=new Map();
  for(const st of items){
    if(st.gradeNo!==1)throw Error('현재 웹앱은 1학년 전용입니다.');
    if(!grouped.has(st.classNo))grouped.set(st.classNo,[]);
    grouped.get(st.classNo).push(st.number);
  }
  if(grouped.size>50)throw Error('학급은 최대 50개까지 등록할 수 있습니다.');
  return [...grouped.entries()].sort((a,b)=>a[0]-b[0]).map(([classNo,raw])=>{
    const all=[...new Set(raw)].sort((a,b)=>a-b);
    if(all.length!==raw.length)throw Error(String(classNo)+'반 번호 중복이 있습니다.');
    const startNo=all[0],endNo=all[all.length-1];
    const exists=new Set(all);
    const missingNos=Array.from({length:endNo-startNo+1},(_,i)=>startNo+i).filter(n=>!exists.has(n));
    const c={gradeNo:1,classNo,startNo,endNo,missingNos};
    assertClass(c);
    return {...c,...genderRangesForClass(c)};
  });
}

export function rangesForPages(files,startNo,endNo,missingNos=[]){
  const numbers=activeNumbers({classNo:1,startNo,endNo,missingNos});
  const expected=numbers.length;
  if(!expected)throw Error('선택한 범위에는 결번만 있습니다. 실제 학생이 있는 번호를 선택하세요.');
  const chunks=[];let index=0;
  for(const f of files){
    if(f.pages<1||f.pages%5)throw Error(`${f.name}: PDF 페이지 수가 5의 배수가 아닙니다 (${f.pages}쪽)`);
    for(let i=0;i<f.pages;i+=5){
      chunks.push({number:numbers[index++],name:f.name,pageFrom:i+1,pageTo:i+5,file:f});
    }
  }
  if(chunks.length!==expected)throw Error(`결번 제외 학생 ${expected}명에 대한 ${expected*5}쪽이 필요한데 PDF에서 ${chunks.length}명분을 찾았습니다.`);
  return chunks;
}
export function parseCsv(input){const lines=[],row=[];let s='',quoted=false;for(let i=0;i<input.length;i++){const ch=input[i];if(quoted){if(ch==='"'&&input[i+1]==='"'){s+='"';i++;}else if(ch==='"')quoted=false;else s+=ch;}else if(ch==='"')quoted=true;else if(ch===','){row.push(s);s='';}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&input[i+1]==='\n')i++;row.push(s);s='';if(row.some(v=>v.trim()))lines.push(row.slice());row.length=0;}else s+=ch;}if(quoted)throw Error('CSV 따옴표가 닫히지 않았습니다.');row.push(s);if(row.some(v=>v.trim()))lines.push(row);if(lines.length<2)throw Error('CSV에 제목행과 학생 자료가 필요합니다.');const headers=lines.shift().map((h)=>h.replace(/^\uFEFF/,'').trim().replaceAll(' ',''));const find=(names)=>headers.findIndex(h=>names.includes(h));const ic=find(['반','학급','class','class_no']),inm=find(['번호','number','student_no']),ina=find(['이름','name']);if([ic,inm,ina].includes(-1))throw Error('CSV 머리글은 반,번호,이름이어야 합니다.');const records=lines.map((r,i)=>{const classNo=Number(String(r[ic]||'').trim().replace('반',''));const number=Number(String(r[inm]||'').trim().replace('번',''));const name=String(r[ina]||'').trim();if(!Number.isInteger(classNo)||!Number.isInteger(number)||!name||name.length>80)throw Error(`CSV ${i+2}행의 반/번호/이름을 확인하세요.`);return {classNo,number,name};});const ids=records.map(x=>`${x.classNo}-${x.number}`);if(new Set(ids).size!==ids.length)throw Error('CSV에 학급·번호 중복이 있습니다.');return records;}
export function csvCell(x){let str=String(x??'');if(/^[\s]*[=+@]/.test(str)||/^[\s]*-\D/.test(str))str="'"+str;return /[",\n\r]/.test(str)?'"'+str.replaceAll('"','""')+'"':str;}
export function toCsv(rows){return '\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');}
