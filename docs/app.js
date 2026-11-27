import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import {getAuth,signInWithEmailAndPassword,signOut,onAuthStateChanged,setPersistence,browserSessionPersistence} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,getDocs,setDoc,deleteDoc,updateDoc,writeBatch,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';
import {getStorage,ref,uploadBytes,getBlob,deleteObject} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-storage.js';
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-functions.js';
import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
import {firebaseConfig} from './firebase-config.js';
import {readSchoolExcel,downloadSchoolExcelTemplate} from './roster-excel.mjs?v=2';
import {renderFlexibleUpload} from './flexible-upload.mjs?v=13';
import {checkClassBulkFinalize} from './bulk-finalize.mjs?v=2';
import {AREA_KEYS,LEVELS,DEFAULT_RUBRIC,escapeHtml as esc,score,verifyRubric,assertClass,activeNumbers,parseMissingNumbers,genderRangesForClass,rangesForPages,parseCsv,toCsv,mergeRosterImport} from './core.mjs?v=2';

const $=id=>document.getElementById(id);
const ui={page:'dashboard',classNo:1,startNo:1,endNo:5,rosterClass:1,resultsClass:'all',files:[],detailId:null,pdfPage:1,renderToken:0,busy:false};
const state={classes:[],roster:[],batches:[],submissions:[],rubric:structuredClone(DEFAULT_RUBRIC)};
const pdfCache=new Map();
let app,auth,db,storage,functions,teacher=null;
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
const labelFor={dashboard:'대시보드',upload:'PDF 업로드',results:'채점 현황',roster:'학생 명단',settings:'설정',grade:'답안 검토 및 채점'};
const msgStatus={ready:'검토 대기',uploading:'업로드 중',failed:'업로드 오류'};
function dateText(v){try{return v?.toDate?.().toLocaleString('ko-KR',{hour12:false})||'—'}catch{return '—'}}
function toast(msg,bad=false){const e=$('toast');e.textContent=String(msg);e.className='toast'+(bad?' error':'');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>e.classList.add('hidden'),4500)}
async function safe(fn){try{return await fn()}catch(e){console.error(e);toast(e?.message||'오류가 발생했습니다.',true)}}
function ask(title,message,yes='확인'){return new Promise(resolve=>{const box=$('modalBox');box.innerHTML=`<h3>${esc(title)}</h3><p>${esc(message)}</p><div class="btn-row"><button class="btn secondary" id="noBtn">취소</button><button class="btn primary" id="yesBtn">${esc(yes)}</button></div>`;$('modal').classList.remove('hidden');$('noBtn').onclick=()=>{$('modal').classList.add('hidden');resolve(false)};$('yesBtn').onclick=()=>{$('modal').classList.add('hidden');resolve(true)}})}
function badge(type,value){return `<span class="tag ${type}">${esc(value)}</span>`}
function heading(k,title,desc,action=''){return `<div class="page-heading"><div><div class="eyebrow">${esc(k)}</div><h1>${esc(title)}</h1><p>${esc(desc)}</p></div>${action}</div>`}
function stat(title,n,foot,icon){return `<div class="stat"><div class="stat-caption">${esc(title)}</div><div class="stat-deco">${icon}</div><div class="stat-number">${Number(n).toLocaleString('ko-KR')}</div><div class="stat-foot">${esc(foot)}</div></div>`}
function cBy(n){return state.classes.find(x=>x.classNo===Number(n))}
function student(n,no){return state.roster.find(x=>x.classNo===Number(n)&&x.number===Number(no))}
function studentName(n,no){return student(n,no)?.name||'미등록'}
function optsClass(value,all=false){return (all?'<option value="all">전체 학급</option>':'')+state.classes.map(c=>`<option value="${c.classNo}" ${String(value)===String(c.classNo)?'selected':''}>${c.classNo}반</option>`).join('')}
function submissionGrade(x){return x.teacherGrade?score(x.teacherGrade,x.pointsSnapshot?.rubric||state.rubric):null}
function subFull(x){return `${x.classNo}반 ${x.assignedNo}번 ${studentName(x.classNo,x.assignedNo)}`}
function button(id,text,cls='secondary'){return `<button class="btn ${cls}" id="${id}">${text}</button>`}
async function loadAll(){const paths=['classes','roster','batches','submissions'];await Promise.all(paths.map(async p=>{const snap=await getDocs(collection(db,p));state[p]=snap.docs.map(d=>({id:d.id,...d.data()}));}));state.classes.sort((a,b)=>a.classNo-b.classNo);state.roster.sort((a,b)=>a.classNo-b.classNo||a.number-b.number);state.batches.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));state.submissions.sort((a,b)=>a.classNo-b.classNo||a.assignedNo-b.assignedNo);const rs=await getDoc(doc(db,'settings','rubric'));state.rubric=rs.exists()?rs.data().areas:structuredClone(DEFAULT_RUBRIC);verifyRubric(state.rubric);if(!state.classes.length){ui.classNo=1;ui.rosterClass=1;}else {if(!cBy(ui.classNo))ui.classNo=state.classes[0].classNo;if(!cBy(ui.rosterClass))ui.rosterClass=state.classes[0].classNo;}}
async function nav(page){ui.page=page;if(page!=='grade')ui.detailId=null;$('crumb').textContent=labelFor[page]||page;document.querySelectorAll('.nav').forEach(e=>e.classList.toggle('active',e.dataset.page===page));await safe(async()=>{await loadAll();await render();});}
async function render(){switch(ui.page){case 'dashboard':return renderDashboard();case 'upload':return renderUpload();case 'results':return renderResults();case 'roster':return renderRoster();case 'settings':return renderSettings();case 'grade':return renderGrade();}}
function main(s){$('content').innerHTML=s}

function renderDashboard(){const registered=state.roster.length,uploaded=state.submissions.length,finalized=state.submissions.filter(x=>x.finalized).length;
 main(heading('ASSESSMENT WORKSPACE','1차 수행평가 채점 관리실','학생별 1~5장 PDF 확인부터 AI 보조 채점, 교사 확정, 결과 출력까지 관리합니다.',button('refreshBtn','↻ 새로고침'))+
 `<div class="stats-grid">${stat('등록 학생',registered,'학급별 학생 명단','♙')}${stat('업로드 답안',uploaded,'학생당 1~5쪽','▣')}${stat('확정 완료',finalized,'교사 최종 확정','✓')}${stat('확인 대기',uploaded-finalized,'교사 검토 필요','◷')}</div>
 <div class="dashboard-columns"><div><div class="feature-card"><div class="eyebrow">START GRADING</div><h2>PDF의 첫 장을 기준으로<br>학생별 1~5쪽을 정리합니다.</h2><p>첫 페이지의 이름·번호를 반드시 대조하고, 채점 근거를 확인한 다음 확정할 수 있습니다.</p>${button('startUpload','＋ 답안 PDF 업로드')}</div><div class="panel" style="margin-top:18px"><div class="panel-head"><h2>최근 업로드</h2></div>${batchTable(state.batches.slice(0,5))}</div></div><div><div class="panel"><div class="panel-head"><h2>사용 순서</h2></div><ol class="step-list"><li><b>1</b><div><strong>학급·명단 등록</strong><small>학급별 번호 범위와 학생 이름을 설정합니다.</small></div></li><li><b>2</b><div><strong>PDF 순서대로 업로드</strong><small>학생 1명은 1~5쪽, 여러 명도 가능</small></div></li><li><b>3</b><div><strong>첫 페이지 신원 확인</strong><small>AI 판독은 참고만 하고 교사가 원본과 명단을 확인합니다.</small></div></li><li><b>4</b><div><strong>AI 보조 채점 · 교사 확정</strong><small>영역별 점수와 근거 검토 후 CSV로 내보냅니다.</small></div></li></ol></div><div class="notice warn" style="margin-top:15px">PDF 원본과 AI 판별 임시 작업은 현재 브라우저에 보관되고, 저장 확정한 답안은 Firebase에 등록됩니다. 공용 PC에서는 작업 완료 후 임시 자료를 삭제하세요. 실제 학생 자료 사용 전 학교 개인정보·보안 지침을 확인하세요. AI 판독 시 스캔 이미지가 외부 AI API로 전송됩니다.</div></div></div>`);
 $('refreshBtn').onclick=()=>nav('dashboard');$('startUpload').onclick=()=>nav('upload');document.querySelectorAll('[data-batch]').forEach(e=>e.onclick=()=>{ui.resultsClass=String(e.dataset.class);nav('results')});}
function batchTable(list){if(!list.length)return '<div class="empty"><div class="emoji">▤</div>업로드된 답안이 없습니다.</div>';return `<div class="table-wrap"><table><thead><tr><th>날짜</th><th>학급</th><th>업로드 학생</th><th>답안</th><th>확정</th><th>상태</th><th></th></tr></thead><tbody>${list.map(b=>{const subs=state.submissions.filter(s=>s.batchId===b.id);return `<tr><td class="muted">${esc(dateText(b.createdAt))}</td><td>${b.classNo}반</td><td>${Array.isArray(b.studentNumbers)&&b.studentNumbers.length?(b.studentNumbers.length<=8?b.studentNumbers.join(', ')+'번':b.studentNumbers.length+'명 ('+b.studentNumbers.slice(0,4).join(', ')+'…'+b.studentNumbers.at(-1)+'번)'):b.startNo+'–'+b.endNo+'번'}</td><td>${subs.length}명</td><td>${subs.filter(s=>s.finalized).length}/${subs.length}</td><td>${badge(b.status==='완료'?'success':'warning',b.status||'검토 대기')}</td><td><button class="btn link" data-batch="${b.id}" data-class="${b.classNo}">확인</button></td></tr>`}).join('')}</tbody></table></div>`}


let excelPending=null;
function schoolExcelPanel(){
 return '<div class="panel excel-import-panel">'+
 '<div class="panel-head"><h2>엑셀로 학급·학생 명단 추가·병합</h2><span class="tag info">1학년 전용</span></div>'+
 '<p class="thin-note">엑셀의 <strong>학년 · 반 · 번호 · 이름</strong>을 기존 명단에 추가합니다. 처음 등록 시 빠뜨린 학생만 입력해도 됩니다. 이미 등록한 학생·PDF·채점 정보는 삭제하지 않습니다.</p>'+
 '<div class="toolbar excel-import-actions"><button type="button" class="btn secondary" id="downloadSchoolXlsx">↓ 엑셀 양식 다운로드 (.xlsx)</button>'+
 '<input type="file" class="control" id="schoolXlsx" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">'+
 '<button type="button" class="btn primary" id="previewSchoolXlsx">엑셀 검사·미리보기</button></div>'+
 '<p class="thin-note">남학생 1~20번, 여학생 21번 이후 중 <strong>각각 등록된 첫 번호~마지막 번호 사이에서 비어 있는 번호만 결번</strong>으로 계산합니다. 기존 학생 + 새 학생을 합쳐 계산하며, 두 성별 구간 사이의 빈 번호는 결번으로 넣지 않습니다.</p>'+
 '<div id="excelPreview" class="excel-preview" role="status"></div>'+
 '<button type="button" class="btn primary" id="commitSchoolXlsx" disabled>확인 후 기존 명단에 추가 저장</button>'+
 '<p class="thin-note attention">기존 명단과 같은 번호지만 이름이 다른 행은 자동으로 이름을 덮어쓰지 않습니다. 미리보기에서 충돌을 확인하고, 이름 수정은 학생 명단 관리에서 따로 진행하세요. 공용 PC에서는 학생 파일을 안전하게 관리하세요.</p>'+
 '</div>';
}
function bindSchoolExcelPanel(){
 const previewBtn=$('previewSchoolXlsx'),commitBtn=$('commitSchoolXlsx'),fileInput=$('schoolXlsx'),area=$('excelPreview');
 if(!previewBtn)return;
 excelPending=null;
 $('downloadSchoolXlsx').onclick=()=>safe(async()=>downloadSchoolExcelTemplate());
 fileInput.onchange=()=>{excelPending=null;commitBtn.disabled=true;area.textContent='';};
 previewBtn.onclick=()=>safe(async()=>{
  const file=fileInput.files?.[0];if(!file)throw Error('엑셀(.xlsx) 파일을 먼저 선택하세요.');
  previewBtn.disabled=true;area.textContent='기존 명단과 엑셀을 합쳐 남녀 번호 구간 및 결번을 계산하는 중입니다…';
  try{
   await loadAll();
   const incoming=await readSchoolExcel(file);
   const merged=mergeRosterImport(state.roster,incoming.students,state.submissions);
   if(new Set([...state.classes.map(c=>c.classNo),...merged.affected]).size>50)throw Error('저장된 학급과 합쳐서 50개 반을 초과합니다.');
   const cell=v=>v??'—';
   const rows=merged.classes.map(c=>
    '<tr><td>1학년 '+c.classNo+'반</td><td>'+cell(c.boysStart)+'</td><td>'+cell(c.boysEnd)+'</td>'+
    '<td>'+cell(c.girlsStart)+'</td><td>'+cell(c.girlsEnd)+'</td>'+
    '<td>'+((c.missingNos||[]).length?c.missingNos.join(', '):'없음')+'</td>'+
    '<td><strong>'+activeNumbers(c).length+'명</strong></td></tr>').join('');
   area.innerHTML='<div class="result-stats">엑셀 '+incoming.students.length+'명 · 신규 '+merged.added.length+'명 · 기존 번호 유지 '+merged.unchanged.length+'명 · 이름 충돌(기존 유지) '+merged.conflicts.length+'명 · 기존 답안 유지</div>'+
    '<div class="table-wrap"><table class="small-table"><thead><tr><th>학급</th><th>남 시작</th><th>남 끝</th><th>여 시작</th><th>여 끝</th><th>남녀 구간 내 결번</th><th>합산 학생 수</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    (merged.added.length?'<p class="notice good">신규 학생 '+merged.added.map(s=>s.classNo+'반 '+s.number+'번 '+esc(s.name)).join(', ')+'을(를) 추가할 수 있습니다. 기존 학생·답안은 보존됩니다.</p>':
     '<p class="notice">추가할 신규 학생이 없습니다. 학급 번호 구간·결번만 기존 명단 기준으로 재계산할 수 있습니다.</p>')+
    (merged.conflicts.length?'<p class="notice warn">이름 충돌(기존 유지): '+merged.conflicts.map(s=>s.classNo+'반 '+s.number+'번 [기존 '+esc(s.existingName)+' / 엑셀 '+esc(s.incomingName)+']').join(', ')+'</p>':'');
   excelPending={students:incoming.students,filename:file.name};
   commitBtn.disabled=false;
  }catch(e){excelPending=null;commitBtn.disabled=true;area.textContent='엑셀 확인 실패: '+e.message;throw e;}
  finally{previewBtn.disabled=false;}
 });
 commitBtn.onclick=()=>safe(async()=>{
  const pending=excelPending;if(!pending)throw Error('엑셀 검사·미리보기를 먼저 실행하세요.');
  commitBtn.disabled=true;
  try{
   await loadAll();
   const merged=mergeRosterImport(state.roster,pending.students,state.submissions);
   if(new Set([...state.classes.map(c=>c.classNo),...merged.affected]).size>50)throw Error('최대 50개 학급까지 등록할 수 있습니다.');
   const opCount=merged.classes.length+merged.added.length;
   if(opCount>450)throw Error('한 번에 저장할 자료가 450건을 초과합니다. 반별로 엑셀을 나눠 등록해 주세요.');
   const question='기존 명단과 답안은 삭제·덮어쓰지 않고, '+merged.classes.length+'개 반에 신규 '+merged.added.length+'명만 추가합니다. '
    +'중복 번호 '+merged.unchanged.length+'명은 유지, 이름 충돌 '+merged.conflicts.length+'건도 기존 이름을 유지합니다. '
    +'남학생·여학생 각각의 첫 번호~마지막 번호 내 결번을 다시 계산합니다. 저장하시겠습니까?';
   if(!await ask('기존 명단에 엑셀 추가·병합',question,'추가 저장'))return;
   // 확인창 이후에도 변경된 학생·답안이 없도록 다시 조회하고 병합한다.
   await loadAll();
   const latest=mergeRosterImport(state.roster,pending.students,state.submissions);
   if(JSON.stringify(latest.classes)!==JSON.stringify(merged.classes)||
      JSON.stringify(latest.added)!==JSON.stringify(merged.added))
    throw Error('확인 중 다른 명단 변경이 발견되었습니다. 엑셀 미리보기를 다시 실행해 주세요.');
   const batch=writeBatch(db);
   for(const c of latest.classes)batch.set(doc(db,'classes',String(c.classNo)),c);
   for(const x of latest.added)batch.set(doc(db,'roster',x.classNo+'-'+x.number),
    {gradeNo:1,classNo:x.classNo,number:x.number,name:x.name});
   await batch.commit();
   excelPending=null;
   toast('기존 명단 유지 · 신규 '+latest.added.length+'명 추가 · '+latest.classes.length+'개 반 결번 재계산 완료');
   await nav('roster');
  }finally{if($('commitSchoolXlsx'))$('commitSchoolXlsx').disabled=!excelPending;}
 });
}

function renderSettings(){const classes=state.classes.length?state.classes:Array.from({length:11},(_,i)=>({classNo:i+1,startNo:1,endNo:30}));main(heading('CLASS & RUBRIC','학급·채점 기준 설정','학급별 남학생(1~20번)·여학생(21번 이후) 번호 범위와 결번을 설정합니다.')+schoolExcelPanel()+
 `<div class="panel"><div class="panel-head"><h2>학급별 번호 및 결번 설정</h2><div class="sub-actions">${button('addClass','＋ 학급 추가')}${button('saveClasses','학급 저장','primary')}</div></div><div class="table-wrap"><table class="class-table small-table"><thead><tr><th>반</th><th>시작 번호</th><th>마지막 번호</th><th>결번 번호 (쉼표·범위)</th><th>남 시작</th><th>남 끝</th><th>여 시작</th><th>여 끝</th><th>실제 학생 수 (자동 계산)</th><th>등록 학생</th><th></th></tr></thead><tbody id="classRows">${classes.map(c=>classRow(c)).join('')}</tbody></table></div><div class="rubric-note class-count-summary" id="classCountSummary" aria-live="polite"></div><div class="rubric-note">엑셀로 등록·병합한 반은 남학생(1~20번)과 여학생(21번 이후)의 실제 첫·끝 번호를 각각 사용하여 결번과 학생 수를 계산합니다. 두 성별 구간 사이의 번호는 자동으로 제외됩니다. 명단에 학생을 추가할 때는 위 엑셀 병합 기능을 사용하세요. 이미 등록된 이름이나 PDF가 있는 번호를 결번으로 지정할 수 없습니다.</div></div>
 <div class="panel"><div class="panel-head"><h2>수준별 점수 설정</h2>${button('saveRubric','배점 저장','primary')}</div><div class="notice warn">아래 배점은 임시값입니다. 학교의 확정된 수행평가 평가계획과 반드시 대조하여 사용하세요.</div><div class="table-wrap" style="margin-top:15px"><table class="rubric-table small-table"><thead><tr><th>영역</th>${LEVELS.map(l=>`<th>${l}</th>`).join('')}</tr></thead><tbody>${AREA_KEYS.map(a=>`<tr><td>${esc(state.rubric[a].name)} (${state.rubric[a].max}점)</td>${LEVELS.map(l=>`<td><input type="number" class="rubric-input" data-area="${a}" data-level="${l}" min="0" max="${state.rubric[a].max}" value="${state.rubric[a].scores[l]}"></td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="rubric-note">확정된 학생의 점수는 저장 당시 점수로 고정됩니다. 기준 변경 후에는 기존 미확정 점수도 다시 확인하세요.</p></div>`);
 bindSchoolExcelPanel();
 $('addClass').onclick=()=>{const v=[...$('classRows').querySelectorAll('tr')].map(row=>Number(row.querySelector('[data-field="classNo"]').value));let n=1;while(v.includes(n))n++;if(v.length>=50)return toast('학급은 최대 50개까지 등록 가능합니다.',true);$('classRows').insertAdjacentHTML('beforeend',classRow({classNo:n,startNo:1,endNo:30}));updateClassCounts();};
 $('classRows').onclick=e=>{if(e.target.matches('.remove-row')){e.target.closest('tr').remove();updateClassCounts();}};$('classRows').addEventListener('input',updateClassCounts);$('classRows').addEventListener('change',updateClassCounts);updateClassCounts();
 $('saveClasses').onclick=()=>safe(async()=>{
  const rows=[...$('classRows').querySelectorAll('tr')];
  const values=rows.map(readClassRow);
  if(values.length<1||values.length>50)throw Error('학급은 1~50개 설정해야 합니다.');
  values.forEach(assertClass);
  if(new Set(values.map(x=>x.classNo)).size!==values.length)throw Error('반 번호가 중복되었습니다.');
  for(const x of [...state.roster,...state.submissions.map(s=>({classNo:s.classNo,number:s.assignedNo}))]){
   const k=values.find(c=>c.classNo===x.classNo);
   if(!k||!activeNumbers(k).includes(x.number))
    throw Error(x.classNo+'반 '+x.number+'번은 등록된 학생·답안이 있으므로 번호를 삭제하거나 결번 처리할 수 없습니다.');
  }
  const batch=writeBatch(db);
  state.classes.forEach(c=>{if(!values.some(v=>v.classNo===c.classNo))batch.delete(doc(db,'classes',String(c.classNo)));});
  values.forEach(c=>batch.set(doc(db,'classes',String(c.classNo)),c));
  await batch.commit();
  toast('학급 범위를 저장했습니다. 기존 학생·답안 정보는 유지됩니다.');
  await nav('settings');
 });
 $('saveRubric').onclick=()=>safe(async()=>{const r=structuredClone(state.rubric);document.querySelectorAll('.rubric-input').forEach(el=>r[el.dataset.area].scores[el.dataset.level]=Number(el.value));verifyRubric(r);await setDoc(doc(db,'settings','rubric'),{areas:r,updatedAt:serverTimestamp()});toast('배점이 저장되었습니다.');await nav('settings')});}
function readClassRow(row){
 const c={classNo:Number(row.querySelector('[data-field="classNo"]').value),
  startNo:Number(row.querySelector('[data-field="startNo"]').value),
  endNo:Number(row.querySelector('[data-field="endNo"]').value)};
 c.missingNos=parseMissingNumbers(row.querySelector('[data-field="missingNos"]').value,c.startNo,c.endNo);
 const previous=state.classes.find(x=>x.classNo===c.classNo);
 if(previous?.genderBandsDefined===true){
  if(c.startNo!==previous.startNo||c.endNo!==previous.endNo)
   throw Error(c.classNo+'반은 남녀 실제 번호 범위가 엑셀 병합으로 등록되어 있습니다. 범위를 늘리려면 학생 명단 엑셀로 추가해 주세요.');
  return {...previous,...c,gradeNo:1,missingNos:c.missingNos};
 }
 return {...c,gradeNo:1,...genderRangesForClass(c)};
}
function classRow(c){const missing=c.missingNos||[];return `<tr><td><input type="number" data-field="classNo" min="1" max="99" value="${c.classNo}"></td><td><input type="number" data-field="startNo" min="1" max="99" value="${c.startNo}"></td><td><input type="number" data-field="endNo" min="1" max="99" value="${c.endNo}"></td><td><input type="text" data-field="missingNos" class="missing-input" placeholder="예: 3, 8, 23-25" value="${esc(missing.join(', '))}"></td><td><span data-gender-range="boysStart">${genderRangesForClass(c).boysStart??'—'}</span></td><td><span data-gender-range="boysEnd">${genderRangesForClass(c).boysEnd??'—'}</span></td><td><span data-gender-range="girlsStart">${genderRangesForClass(c).girlsStart??'—'}</span></td><td><span data-gender-range="girlsEnd">${genderRangesForClass(c).girlsEnd??'—'}</span></td><td><strong data-student-count class="class-student-count">${activeNumbers(c).length}명</strong></td><td>${state.roster.filter(x=>x.classNo===c.classNo).length}명</td><td><button class="btn link remove-row" type="button">삭제</button></td></tr>`}

function updateClassCounts(){
 const rows=[...$('classRows').querySelectorAll('tr')];let total=0,invalid=0;
 for(const row of rows){
  const count=row.querySelector('[data-student-count]');
  try{
   const startNo=Number(row.querySelector('[data-field="startNo"]').value);
   const endNo=Number(row.querySelector('[data-field="endNo"]').value);
   const classNo=Number(row.querySelector('[data-field="classNo"]').value);
   const missingNos=parseMissingNumbers(row.querySelector('[data-field="missingNos"]').value,startNo,endNo);
   const model=readClassRow(row);
   const countNow=activeNumbers(model).length;
   count.textContent=countNow+'명';count.title='';count.classList.remove('count-invalid');const genders=genderRangesForClass(model);for(const key of Object.keys(genders))row.querySelector('[data-gender-range="'+key+'"]').textContent=genders[key]??'—';total+=countNow;
  }catch(e){invalid++;count.textContent='입력 확인';count.title=e.message;count.classList.add('count-invalid');for(const el of row.querySelectorAll('[data-gender-range]'))el.textContent='—';}
 }
 const summary=$('classCountSummary');
 if(summary)summary.textContent=invalid
  ? `학급 ${rows.length}개 중 ${invalid}개 반의 번호 또는 결번을 확인하세요. 입력을 수정하면 학생 수가 자동 갱신됩니다.`
  : `전체 ${rows.length}개 학급 · 실제 학생 ${total}명 (결번 제외, 아직 명단에 이름을 등록하지 않은 학생 포함)`;
 if($('saveClasses'))$('saveClasses').disabled=!rows.length||invalid>0;
}
function rosterSlot(klass,n){const missing=(klass.missingNos||[]).includes(n);if(missing)return `<div class="roster-entry roster-missing"><span>${n}번</span><em>결번</em></div>`;return `<label class="roster-entry"><span>${n}번</span><input data-student="${n}" maxlength="80" placeholder="이름" value="${esc(studentName(klass.classNo,n)==='미등록'?'':studentName(klass.classNo,n))}" /></label>`}
function renderRoster(){if(!state.classes.length){main(heading('STUDENT ROSTER','학생 명단 관리','학급을 먼저 등록해야 합니다.')+`<div class="panel">학급 설정을 먼저 저장하세요. ${button('toSettings','설정으로 이동','primary')}</div>`);$('toSettings').onclick=()=>nav('settings');return;}const klass=cBy(ui.rosterClass)||state.classes[0];ui.rosterClass=klass.classNo;main(heading('STUDENT ROSTER','학생 명단 관리','학교 번호 체계에 따라 남학생은 1~20번, 여학생은 21번부터 표시합니다. 결번은 학급 설정에서 지정합니다.')+schoolExcelPanel()+
 `<div class="panel"><div class="panel-head"><h2>${klass.classNo}반 학생 이름 (결번 ${((klass.missingNos||[]).length)}개)</h2><div class="toolbar"><select class="control" id="rosterClass">${optsClass(ui.rosterClass)}</select>${button('saveRoster','명단 저장','primary')}</div></div><div class="roster-band-title">남학생 번호 (1~20번)</div><div class="roster-grid">${(klass.genderBandsDefined?(klass.boysStart!=null?Array.from({length:klass.boysEnd-klass.boysStart+1},(_,i)=>i+klass.boysStart):[]):Array.from({length:Math.max(0,Math.min(20,klass.endNo)-klass.startNo+1)},(_,i)=>i+klass.startNo)).map(n=>rosterSlot(klass,n)).join('')}</div><div class="roster-band-title">여학생 번호 (21번부터)</div><div class="roster-grid">${(klass.genderBandsDefined?(klass.girlsStart!=null?Array.from({length:klass.girlsEnd-klass.girlsStart+1},(_,i)=>i+klass.girlsStart):[]):Array.from({length:Math.max(0,klass.endNo-Math.max(21,klass.startNo)+1)},(_,i)=>i+Math.max(21,klass.startNo))).map(n=>rosterSlot(klass,n)).join('')}</div><p class="help-text">회색 결번 칸은 학생이 없으므로 이름을 입력하지 않습니다. 결번은 [설정]에서 변경하며, 이미 답안이 등록된 번호는 삭제할 수 없습니다.</p></div><div class="panel"><div class="panel-head"><h2>CSV 명단 일괄 등록</h2></div><p class="thin-note">CSV 형식: <code>반,번호,이름</code> · 기존 학생·답안은 유지하고 새 학생만 추가합니다. UTF-8 또는 CP949 지원</p><div class="toolbar"><input id="rosterCsv" class="control" type="file" accept=".csv,text/csv">${button('importRoster','CSV 가져오기','primary')}${button('downloadSample','CSV 양식 다운로드')}</div></div>`);
 bindSchoolExcelPanel();
 $('rosterClass').onchange=e=>{ui.rosterClass=Number(e.target.value);renderRoster()};
 $('saveRoster').onclick=()=>safe(async()=>{const updates=[...document.querySelectorAll('[data-student]')].map(e=>({classNo:klass.classNo,number:Number(e.dataset.student),name:e.value.trim()}));if(updates.some(v=>v.name.length>80))throw Error('이름은 80자까지 입력 가능합니다.');for(const x of updates){if(!x.name&&state.submissions.some(s=>s.classNo===x.classNo&&s.assignedNo===x.number))throw Error(`${x.number}번은 답안이 있으므로 이름을 지울 수 없습니다.`)}const b=writeBatch(db);updates.forEach(x=>{const d=doc(db,'roster',`${x.classNo}-${x.number}`);if(x.name)b.set(d,x);else b.delete(d)});await b.commit();toast('학생 명단을 저장했습니다.');await nav('roster')});
 $('importRoster').onclick=()=>safe(async()=>{
  const file=$('rosterCsv').files[0];if(!file)throw Error('CSV 파일을 선택하세요.');
  if(file.size>2_000_000)throw Error('CSV는 2MB 이하로 제한됩니다.');
  const buf=await file.arrayBuffer();let str;
  try{str=new TextDecoder('utf-8',{fatal:true}).decode(buf);}catch{str=new TextDecoder('euc-kr').decode(buf);}
  const incoming=parseCsv(str).map(x=>({gradeNo:1,...x}));
  if(incoming.length>4500)throw Error('한 번에 4,500명 이하로 등록하세요.');
  await loadAll();
  const before=mergeRosterImport(state.roster,incoming,state.submissions);
  if(new Set([...state.classes.map(c=>c.classNo),...before.affected]).size>50)
   throw Error('등록 가능한 학급 수는 50개입니다.');
  if(before.classes.length+before.added.length>450)
   throw Error('한 번에 450개 이하의 자료만 추가할 수 있습니다. CSV를 반별로 나눠 주세요.');
  const msg='CSV '+incoming.length+'명 중 신규 '+before.added.length+'명만 추가합니다. '
   +'중복 번호의 이름이 같은 '+before.unchanged.length+'명과 이름이 다른 '+before.conflicts.length+'명은 기존 정보를 유지합니다. '
   +'각 반의 남녀 첫·끝 번호 구간과 결번을 갱신하고 기존 PDF·채점 결과는 보존합니다. 저장하시겠습니까?';
  if(!await ask('CSV 명단 추가·병합',msg,'신규 명단 추가'))return;
  await loadAll();
  const latest=mergeRosterImport(state.roster,incoming,state.submissions);
  if(JSON.stringify(before.classes)!==JSON.stringify(latest.classes)||
     JSON.stringify(before.added)!==JSON.stringify(latest.added))
   throw Error('확인 중 학생 명단이 변경됐습니다. CSV를 다시 확인하세요.');
  const batch=writeBatch(db);
  for(const c of latest.classes)batch.set(doc(db,'classes',String(c.classNo)),c);
  for(const x of latest.added)batch.set(doc(db,'roster',x.classNo+'-'+x.number),
   {gradeNo:1,classNo:x.classNo,number:x.number,name:x.name});
  await batch.commit();
  toast('CSV 신규 '+latest.added.length+'명 추가, 기존 명단과 답안 유지');
  await nav('roster');
 });
 $('downloadSample').onclick=()=>download('학생명단_양식.csv',toCsv([['반','번호','이름'],['1','1','김민수'],['1','21','이서연'],['2','2','박지훈']]),'text/csv;charset=utf-8');}
function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000)}

function renderUpload(){return renderFlexibleUpload({main,heading,state,ui,toast,ask,nav,safe,db,storage,functions,pdfjsLib,loadAll,analyzeSubmission,userId:auth.currentUser?.uid});}

function renderResults(){
 const rows=state.submissions.filter(s=>ui.resultsClass==='all'||s.classNo===Number(ui.resultsClass));
 const bulk=ui.resultsClass==='all'?null:checkClassBulkFinalize(Number(ui.resultsClass),state.classes,state.roster,state.submissions);
 const bulkHint=!bulk
  ?'반별 일괄 확정은 학급을 선택한 뒤 사용할 수 있습니다.'
  :bulk.blockers.length
   ?'일괄 확정 대기: '+bulk.blockers.join(' / ')
   :bulk.pending.length
    ?bulk.classNo+'반 전체 '+bulk.students+'명 · 신원 확인 및 교사 점수 저장 완료 · 미확정 '+bulk.pending.length+'명을 일괄 확정할 수 있습니다.'
    :bulk.classNo+'반 전체 학생의 점수가 이미 확정되어 있습니다.';
 main(heading('GRADING STATUS','채점 현황','학생을 클릭하면 누락된 장을 제외한 1~5쪽 PDF와 AI·교사 채점을 함께 확인할 수 있습니다.',button('exportCsv','CSV 성적 내려받기','primary'))+
 `<div class="panel"><div class="panel-head"><h2>학생별 결과</h2><div class="toolbar"><select class="control" id="resultClass">${optsClass(ui.resultsClass,true)}</select>${button('refreshResults','새로고침')}${button('bulkFinalizeClass','선택 반 점수 일괄 확정','primary')}${button('deleteBatchBtn','업로드 묶음 삭제')}</div></div><p class="help-text" id="bulkFinalizeHint">${esc(bulkHint)}</p><div class="result-stats" style="margin-bottom:15px">표시 ${rows.length}명 · 확정 ${rows.filter(s=>s.finalized).length}명 · 확인 대기 ${rows.filter(s=>!s.identityConfirmed).length}명</div><div class="table-wrap"><table><thead><tr><th>학급</th><th>번호</th><th>이름</th><th>첫 장 확인</th><th>AI 채점</th><th>교사 점수</th><th>확정</th><th></th></tr></thead><tbody>${rows.map(s=>{const points=submissionGrade(s);return `<tr><td>${s.classNo}반</td><td><strong>${s.assignedNo}번</strong></td><td>${esc(studentName(s.classNo,s.assignedNo))}</td><td>${badge(s.identityConfirmed?'success':'warning',s.identityConfirmed?'교사 확인':'확인 필요')}</td><td>${badge(s.aiStatus==='AI 완료'?'success':'neutral',s.aiStatus||'미실행')}</td><td>${points?`<strong>${points.total}점</strong>`:'—'}</td><td>${badge(s.finalized?'success':'warning',s.finalized?'확정':'미확정')}</td><td><button class="btn link openSub" data-id="${s.id}">답안 검토</button></td></tr>`}).join('')||'<tr><td colspan="8" class="centered muted">해당 학생 답안이 없습니다.</td></tr>'}</tbody></table></div></div><div class="panel"><div class="panel-head"><h2>PDF 업로드 묶음</h2></div>${batchTable(state.batches.filter(b=>ui.resultsClass==='all'||b.classNo===Number(ui.resultsClass)))}</div>`);
 $('bulkFinalizeClass').disabled=!bulk?.ready;
 $('bulkFinalizeClass').title=bulk?.ready?'교사 점수·근거를 저장한 해당 반 미확정 학생의 점수를 일괄 확정':'등록된 학생 전원의 업로드·신원 확인·교사 점수 저장 완료 시 사용 가능';
 $('bulkFinalizeClass').onclick=()=>safe(async()=>{
  if(ui.resultsClass==='all')throw Error('일괄 확정할 반을 먼저 선택하세요.');
  const classNo=Number(ui.resultsClass);
  // 화면을 연 뒤 변경된 상태까지 반영해 다시 점검한다.
  await loadAll();
  const current=checkClassBulkFinalize(classNo,state.classes,state.roster,state.submissions);
  if(!current.ready)throw Error(current.blockers.length?current.blockers.join(' / '):'일괄 확정할 미확정 학생이 없습니다.');
  const signature=current.pending.map(s=>[s.id,s.assignedNo,s.pointsSnapshot.points.total].join(':')).sort().join('|');
  if(!await ask('반별 교사 점수 일괄 확정',
   classNo+'반 학생 '+current.students+'명 모두 PDF 업로드·신원 확인·교사 점수 저장 완료. '
   +'기존 확정 '+current.finalized+'명, 이번 확정 '+current.pending.length+'명. '
   +'저장된 교사 점수 합계 '+current.total+'점(학생별 점수 합산). '
   +'개별 점수·채점 근거를 최종 검토했으며 '+current.pending.length+'명의 점수를 한 번에 확정하시겠습니까?',
   classNo+'반 점수 일괄 확정'))return;
  await loadAll();
  const latest=checkClassBulkFinalize(classNo,state.classes,state.roster,state.submissions);
  const latestSignature=latest.pending.map(s=>[s.id,s.assignedNo,s.pointsSnapshot.points.total].join(':')).sort().join('|');
  if(!latest.ready||latestSignature!==signature)
   throw Error('확인 중 학생 점수·신원 확인 상태가 변경됐습니다. 채점 현황을 새로고침하고 다시 확인하세요.');
  const batch=writeBatch(db);
  for(const sub of latest.pending){
   batch.update(doc(db,'submissions',sub.id),{
    finalized:true,finalizedAt:serverTimestamp(),updatedAt:serverTimestamp()
   });
  }
  await batch.commit();
  toast(classNo+'반 '+latest.pending.length+'명 점수를 일괄 확정했습니다.');
  await nav('results');
 });
 $('resultClass').onchange=e=>{ui.resultsClass=e.target.value;renderResults()};$('refreshResults').onclick=()=>nav('results');document.querySelectorAll('.openSub').forEach(el=>el.onclick=()=>{ui.detailId=el.dataset.id;ui.pdfPage=1;nav('grade')});document.querySelectorAll('[data-batch]').forEach(el=>el.onclick=()=>{ui.resultsClass=String(el.dataset.class);renderResults()});$('exportCsv').onclick=()=>exportCsv();
 $('deleteBatchBtn').onclick=()=>safe(async()=>{const list=state.batches.filter(b=>ui.resultsClass==='all'||b.classNo===Number(ui.resultsClass));if(!list.length)throw Error('삭제할 업로드 묶음이 없습니다.');const id=window.prompt('삭제할 업로드 묶음 ID를 입력하세요.\n'+list.map(b=>`${b.classNo}반 ${b.startNo}~${b.endNo}번 : ${b.id}`).join('\n'));if(!id)return;const target=state.batches.find(b=>b.id===id);if(!target)throw Error('일치하는 묶음이 없습니다.');const subs=state.submissions.filter(s=>s.batchId===id);if(subs.some(s=>s.finalized))throw Error('확정된 답안이 있습니다. 먼저 확정을 취소하세요.');if(!await ask('답안 완전 삭제',`${target.classNo}반 ${target.startNo}~${target.endNo}번의 PDF와 채점 기록을 완전히 삭제합니다. 복구할 수 없습니다.`,'삭제'))return;for(const s of subs){try{await deleteObject(ref(storage,s.pdfPath))}catch(e){if(e.code!=='storage/object-not-found')throw e;}await deleteDoc(doc(db,'submissions',s.id));}await deleteDoc(doc(db,'batches',id));toast('업로드 묶음을 삭제했습니다.');await nav('results')});}
function exportCsv(){const rows=state.submissions.filter(s=>ui.resultsClass==='all'||s.classNo===Number(ui.resultsClass));const out=[['반','번호','이름','첫장교사확인','AI상태','데이터수집분석','문제해결전략','알고리즘설계','총점','점수확정','데이터근거','전략근거','알고리즘근거','원본파일']];for(const s of rows){const pts=submissionGrade(s),g=s.teacherGrade;out.push([s.classNo,s.assignedNo,studentName(s.classNo,s.assignedNo),s.identityConfirmed?'완료':'미완료',s.aiStatus||'',pts?.data??'',pts?.strategy??'',pts?.algorithm??'',pts?.total??'',s.finalized?'확정':'미확정',g?.data?.reason||'',g?.strategy?.reason||'',g?.algorithm?.reason||'',s.sourceName])}download(`수행평가_채점결과_${ui.resultsClass==='all'?'전체':ui.resultsClass+'반'}.csv`,toCsv(out),'text/csv;charset=utf-8');}

async function loadPdf(sub){if(pdfCache.has(sub.id))return pdfCache.get(sub.id);const pdfBlob=await getBlob(ref(storage,sub.pdfPath),22*1024*1024);const bytes=new Uint8Array(await pdfBlob.arrayBuffer());const pdf=await pdfjsLib.getDocument({data:bytes}).promise;if(pdf.numPages<1||pdf.numPages>5)throw Error('답안 PDF는 학생당 1~5쪽이어야 합니다.');pdfCache.set(sub.id,pdf);return pdf;}
async function renderPdfPage(sub,pageNo){const token=++ui.renderToken,container=$('pdfView');if(!container)return;container.textContent=`${pageNo}쪽을 불러오는 중…`;try{const pdf=await loadPdf(sub),page=await pdf.getPage(pageNo),viewport=page.getViewport({scale:1.5});if(token!==ui.renderToken)return;const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:ctx,canvas,viewport}).promise;if(token!==ui.renderToken)return;container.replaceChildren(canvas);document.querySelectorAll('.page-tab').forEach(b=>b.classList.toggle('active',Number(b.dataset.page)===pageNo));}catch(e){container.textContent='PDF 보기 오류: '+e.message;throw e}}
function pickGrade(s){const g=s.teacherGrade||s.aiGrade||Object.fromEntries(AREA_KEYS.map(a=>[a,{level:'미제출',reason:''}]));return structuredClone(g)}
async function renderGrade(){const s=state.submissions.find(x=>x.id===ui.detailId);if(!s){ui.page='results';return renderResults()}if(s.status!=='ready'){main('<div class="notice warn">PDF 업로드가 아직 완료되지 않았습니다. 채점 현황에서 상태를 확인하세요.</div>');return;}const grade=pickGrade(s),result=score(grade,state.rubric),expected=studentName(s.classNo,s.expectedNo);const pageCount=Math.max(1,Math.min(5,s.pageCount||5));ui.pdfPage=Math.min(pageCount,Math.max(1,ui.pdfPage));const sorted=state.submissions.filter(x=>x.classNo===s.classNo).sort((a,b)=>a.assignedNo-b.assignedNo);const pos=sorted.findIndex(x=>x.id===s.id);const allOpts=state.roster.filter(r=>r.classNo===s.classNo).map(r=>`<option value="${r.number}" ${r.number===s.assignedNo?'selected':''}>${r.number}번 ${esc(r.name)}</option>`).join('');
 main(`<button class="top-back" id="backResults">← 채점 현황으로</button>${heading('REVIEW & FINALIZE',`${esc(subFull(s))} 답안 검토`,'첫 페이지의 자필 이름·학번을 학생 명단과 반드시 대조해 주세요.',`<div class="student-nav">${button('prevStudent','← 이전')}${button('nextStudent','다음 →')}</div>`)}
 <div class="grade-layout"><div class="pdf-pane"><div class="pdf-bar"><div><strong>원본 답안 PDF</strong><br><small>학생 1명 · ${pageCount}쪽(최대 5쪽) / 1쪽에서 신원 확인</small></div><div class="pagebuttons">${Array.from({length:pageCount},(_,i)=>`<button type="button" class="page-tab ${i+1===ui.pdfPage?'active':''}" data-page="${i+1}">${i+1}</button>`).join('')}</div></div><div id="pdfView" class="pdf-image-wrap" style="color:#334;display:grid;place-items:center">PDF 불러오는 중…</div></div>
 <div class="grade-right">${(s.missingRoles?.length)?'<div class="notice warn">원본 누락 단계: '+s.missingRoles.map(role=>({'front':'첫 장','data-cont':'STEP 1 계속','strategy':'STEP 2','algorithm':'STEP 3','test':'STEP 4'}[role]||role)).join(', ')+' · 없는 답변을 추정하여 채점하지 마세요.</div>':''}${s.sourcePages?.length?'<div class="notice good">재정렬된 페이지: '+s.sourcePages.map((p,i)=>(i+1)+'번 '+esc(p.file)+' 원본 '+p.page+'쪽').join(' → ')+'</div>':''}<div class="panel"><div class="panel-head"><h2>01. 첫 페이지 학번·이름 검증</h2>${badge(s.identityConfirmed?'success':'warning',s.identityConfirmed?'교사 확인 완료':'확인 필수')}</div><div class="identity-cols"><div class="identity-box"><small>번호 순서에 따른 예상 학생</small><strong>${s.classNo}반 ${s.expectedNo}번 · ${esc(expected)}</strong><span>PDF ${esc(s.sourceName)} ${s.sourcePage}쪽부터</span></div><div class="identity-box"><small>AI 첫 장 판독 결과</small><strong>${esc(s.recognizedNo||'번호 미판독')} · ${esc(s.recognizedName||'이름 미판독')}</strong><span>확신도 ${esc(s.recognizedConfidence||'—')}</span></div></div><div class="field"><label>실제 첫 장과 대조한 학생</label><select id="confirmedNo" ${s.finalized?'disabled':''}>${allOpts}</select></div><label class="identity-check"><input type="checkbox" id="firstPageCheck" ${s.finalized?'disabled':''}> 원본 PDF 1쪽의 학번·이름과 교사 명단을 직접 대조했습니다.</label><div class="sub-actions" style="margin-top:12px">${button('confirmIdentity',s.identityConfirmed?'신원 다시 확인':'교사 신원 확인','primary')}</div>${s.identityConfirmed?'<div class="notice good" style="margin-top:10px">교사 확인 기록이 저장되어 있습니다.</div>':'<p class="thin-note">AI 일치 판정만으로는 확정되지 않습니다. 확인 버튼을 누르기 전 실제 첫 장을 보세요.</p>'}</div>
 <div class="panel"><div class="panel-head"><h2>02. AI 판독 및 채점 제안</h2>${badge(s.aiStatus==='AI 완료'?'success':'neutral',s.aiStatus||'AI 미실행')}</div><div class="sub-actions">${button('analyzeNow','AI 판독·채점 실행','secondary')}</div><p class="help-text">Firebase Cloud Functions와 OpenAI API 키가 설정돼 있어야 작동합니다. 실행 시 학생 필기 이미지 1~5쪽이 외부 AI로 전송되며 비용이 발생할 수 있습니다.</p>${s.aiSummary?`<div class="ai-note">${esc(s.aiSummary)}</div>`:''}${s.aiUncertain?.length?`<div class="notice warn" style="margin-top:10px">판독 불확실: ${esc(s.aiUncertain.join(' · '))}</div>`:''}${s.testValueChecks?.length?`<div class="notice" style="margin-top:10px"><strong>STEP 4 TEST 값 이중 기준 확인</strong><div class="thin-note">TEST 번호(1~6)와 실제 센서값을 모두 인정합니다. AI 판독 결과이므로 교사가 원본을 재확인하세요.</div>${s.testValueChecks.map(v=>`<p class="thin-note">${esc(v.sensor)}: ${esc(v.value)} — ${v.valid?'유효한 표기':'불일치 · 확인 필요'} (${esc(v.reason)})</p>`).join('')}</div>`:''}</div>
 <div class="panel"><div class="panel-head"><h2>03. 교사 채점 근거 및 점수</h2>${badge(s.finalized?'success':'info',s.finalized?'확정됨':'검토 중')}</div>${!s.teacherGrade&&s.aiGrade?'<div class="notice warn">아래 성취수준은 AI의 채점 제안이며, 아직 교사가 저장한 점수가 아닙니다. 기존 분석에서 세 영역 모두 중으로 표시됐다면 반드시 실제 답안을 대조하세요.</div>':!s.teacherGrade?'<div class="notice warn">아직 교사 점수가 저장되지 않았습니다. 영역별 수준과 근거를 확인한 후 저장하세요.</div>':''}${AREA_KEYS.map(a=>{const g=grade[a]||{};return `<div class="grade-card"><div class="grade-head"><strong>${esc(state.rubric[a].name)} (${state.rubric[a].max}점)</strong><span class="points" id="points-${a}">${state.rubric[a].scores[g.level]??0}점</span></div><div class="grade-controls"><select class="level-pick" data-area="${a}" ${s.finalized?'disabled':''}>${LEVELS.map(l=>`<option value="${l}" ${l===g.level?'selected':''}>${l}</option>`).join('')}</select><span class="subtext">AI는 참고용</span></div><textarea class="reason-input" data-area="${a}" maxlength="2000" ${s.finalized?'disabled':''} placeholder="실제 답안의 구체적 채점 근거">${esc(g.reason||'')}</textarea></div>`}).join('')}<div class="score-total"><strong>현재 화면 점수 합계</strong><em id="totalPoints">${result?.total??0}<small style="font-size:13px"> / 100점</small></em></div><div class="sub-actions">${button('saveGrade','점수·근거 저장','primary')}${button('finalizeGrade',s.finalized?'확정 취소':'교사 최종 점수 확정','secondary')}</div><p class="thin-note">최종 확정하려면 ①첫 장 교사 확인 ②3개 영역의 교사 채점 저장이 필요합니다.</p></div></div></div>`);
 $('backResults').onclick=()=>nav('results');$('prevStudent').disabled=pos<=0;$('nextStudent').disabled=pos>=sorted.length-1;$('prevStudent').onclick=()=>{ui.detailId=sorted[pos-1].id;ui.pdfPage=1;nav('grade')};$('nextStudent').onclick=()=>{ui.detailId=sorted[pos+1].id;ui.pdfPage=1;nav('grade')};document.querySelectorAll('.page-tab').forEach(el=>el.onclick=()=>{ui.pdfPage=Number(el.dataset.page);safe(()=>renderPdfPage(s,ui.pdfPage))});
 document.querySelectorAll('.level-pick').forEach(el=>el.onchange=()=>updateLiveScore());
 $('confirmIdentity').disabled=!!s.finalized;$('confirmIdentity').onclick=()=>safe(async()=>{if(ui.pdfPage!==1)throw Error('신원 확인은 반드시 PDF 1쪽을 펼친 상태에서 하세요.');if(!$('firstPageCheck').checked)throw Error('원본 첫 장을 직접 확인했다면 체크하세요.');const selected=Number($('confirmedNo').value);if(!student(s.classNo,selected))throw Error('등록된 학생이 아닙니다.');const other=state.submissions.find(x=>x.id!==s.id&&x.classNo===s.classNo&&x.assignedNo===selected);if(other){if(other.finalized)throw Error('해당 번호의 답안은 확정된 상태입니다. 먼저 확정 취소하세요.');if(!await ask('번호 맞교환',`${s.assignedNo}번 답안을 ${selected}번으로 변경하고, 다른 학생 답안을 ${s.assignedNo}번으로 맞교환합니다. 맞교환된 학생은 첫 장을 다시 확인해야 합니다.`,'맞교환'))return;const b=writeBatch(db);b.update(doc(db,'submissions',other.id),{assignedNo:s.assignedNo,identityConfirmed:false,identityStatus:'다시 확인 필요',updatedAt:serverTimestamp()});b.update(doc(db,'submissions',s.id),{assignedNo:selected,identityConfirmed:true,identityStatus:'교사 확인',updatedAt:serverTimestamp()});await b.commit();}
 else {if(selected!==s.assignedNo&&state.submissions.some(x=>x.id!==s.id&&x.classNo===s.classNo&&x.assignedNo===selected))throw Error('번호가 중복됩니다.');await updateDoc(doc(db,'submissions',s.id),{assignedNo:selected,identityConfirmed:true,identityStatus:'교사 확인',updatedAt:serverTimestamp()});}toast('첫 페이지 신원을 교사가 확인했습니다.');await nav('grade')});
 $('analyzeNow').disabled=s.finalized;$('analyzeNow').onclick=()=>safe(async()=>{if(!await ask('AI 분석 실행','답안의 실제 1~5쪽 이미지가 외부 AI API로 전송됩니다. 판독·채점 비용이 발생할 수 있습니다.','실행'))return;$('analyzeNow').disabled=true;try{await analyzeSubmission(s.id);toast('AI 분석 결과를 받았습니다. 반드시 교사가 확인하세요.');await nav('grade');}finally{if($('analyzeNow'))$('analyzeNow').disabled=false}});
 $('saveGrade').disabled=s.finalized;$('saveGrade').onclick=()=>safe(async()=>{const g=readGradeForm();await updateDoc(doc(db,'submissions',s.id),{teacherGrade:g,pointsSnapshot:{rubric:structuredClone(state.rubric),points:score(g,state.rubric)},updatedAt:serverTimestamp()});toast('교사 점수와 채점 근거를 저장했습니다.');await nav('grade')});
 $('finalizeGrade').onclick=()=>safe(async()=>{if(s.finalized){if(!await ask('점수 확정 취소','확정을 취소한 뒤 점수를 수정할 수 있습니다.','취소하기'))return;await updateDoc(doc(db,'submissions',s.id),{finalized:false,updatedAt:serverTimestamp()});toast('확정을 취소했습니다.');await nav('grade');return;}
 if(!s.identityConfirmed)throw Error('원본 PDF 첫 장의 학번과 이름을 교사가 확인해야 합니다.');if(!s.teacherGrade||!s.pointsSnapshot)throw Error('먼저 영역별 교사 점수와 근거를 저장하세요.');if(!await ask('최종 점수 확정',`${subFull(s)} · ${s.pointsSnapshot.points.total}점을 확정합니다.`, '확정'))return;await updateDoc(doc(db,'submissions',s.id),{finalized:true,finalizedAt:serverTimestamp(),updatedAt:serverTimestamp()});toast('최종 점수를 확정했습니다.');await nav('grade')});
 await safe(()=>renderPdfPage(s,ui.pdfPage));}
function readGradeForm(){return Object.fromEntries(AREA_KEYS.map(a=>{const el=[...document.querySelectorAll('.level-pick')].find(x=>x.dataset.area===a);const reason=[...document.querySelectorAll('.reason-input')].find(x=>x.dataset.area===a);return [a,{level:el.value,reason:reason.value.trim()}]}))}
function updateLiveScore(){const points=score(readGradeForm(),state.rubric);AREA_KEYS.forEach(a=>$(`points-${a}`).textContent=`${points[a]}점`);$('totalPoints').innerHTML=`${points.total}<small style="font-size:13px"> / 100점</small>`}
async function renderAiImages(sub){const pdf=await loadPdf(sub);const images=[];for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n);const base=page.getViewport({scale:1}),scale=Math.min(1.8,1260/base.width,1750/base.height),vp=page.getViewport({scale});const canvas=document.createElement('canvas');canvas.width=Math.floor(vp.width);canvas.height=Math.floor(vp.height);await page.render({canvasContext:canvas.getContext('2d'),canvas,viewport:vp}).promise;images.push(canvas.toDataURL('image/jpeg',0.72));canvas.width=1;canvas.height=1;}return images;}
async function analyzeSubmission(sid){const sub=state.submissions.find(s=>s.id===sid);if(!sub)throw Error('학생 답안을 찾지 못했습니다.');if(sub.status!=='ready')throw Error('업로드 중인 PDF는 분석할 수 없습니다.');await updateDoc(doc(db,'submissions',sid),{aiStatus:'AI 분석 중',updatedAt:serverTimestamp()});try{const images=await renderAiImages(sub);const callable=httpsCallable(functions,'gradeAnswer',{timeout:120000});await callable({submissionId:sid,images});await loadAll();}catch(e){await updateDoc(doc(db,'submissions',sid),{aiStatus:'AI 오류',aiSummary:String(e.message||e).slice(0,240),updatedAt:serverTimestamp()});throw new Error(`AI 기능 사용 실패: ${e.message}. Cloud Functions/Secret 배포 여부를 확인하세요.`)}}

if(firebaseConfig.apiKey.startsWith('REPLACE_')||firebaseConfig.projectId==='YOUR_PROJECT_ID'){$('setupScreen').classList.remove('hidden');}else{
 try{app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);storage=getStorage(app);functions=getFunctions(app,'asia-northeast3');setPersistence(auth,browserSessionPersistence).catch(console.error);
 onAuthStateChanged(auth,async user=>{if(!user){teacher=null;$('appShell').classList.add('hidden');$('loginScreen').classList.remove('hidden');return;}try{const teacherDoc=await getDoc(doc(db,'teachers',user.uid));if(!teacherDoc.exists()){await signOut(auth);throw Error('교사 권한이 등록되지 않은 계정입니다. Firebase teachers 문서를 확인하세요.');}teacher=user;$('teacherBadge').textContent=user.email||'교사';$('loginScreen').classList.add('hidden');$('appShell').classList.remove('hidden');await nav('dashboard');}catch(e){toast('인증 오류: '+e.message,true);$('loginScreen').classList.remove('hidden');$('appShell').classList.add('hidden');}});
 }catch(e){$('setupScreen').classList.remove('hidden');$('setupScreen').querySelector('p').textContent='Firebase 초기화 실패: '+e.message;}}
$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginError').textContent='';try{await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value);$('password').value='';}catch(err){$('loginError').textContent='로그인 실패. 계정·비밀번호 또는 교사 권한 등록을 확인하세요.';console.error(err)}};
$('logoutBtn').onclick=()=>safe(()=>signOut(auth));document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>nav(b.dataset.page));
