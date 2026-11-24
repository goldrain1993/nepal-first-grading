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
