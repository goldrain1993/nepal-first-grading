import {doc,writeBatch,updateDoc,deleteDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';
import {ref,uploadBytes,deleteObject} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-storage.js';
import {httpsCallable} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-functions.js';
import {activeNumbers,escapeHtml as esc} from './core.mjs';
import {PAGE_ROLES,ROLE_NAMES,inferPageRole,applyVisualPageResult,groupPages} from './page-grouping.mjs?v=3';

let session=null;
const el=id=>document.getElementById(id);
const label=(v)=>String(v??'—');
const roleOptions=(selected)=>[['unknown','미판별 / 재검토'],...PAGE_ROLES.map(k=>[k,ROLE_NAMES[k]])].map(([key,n])=>'<option value="'+key+'"'+(key===selected?' selected':'')+'>'+esc(n)+'</option>').join('');
async function thumbnail(p,scale=0.36){
 const page=await p.view.getPage(p.pageNo);
 const maxWidth=scale>1.3?1500:scale>0.7?1050:550;
 const vp=page.getViewport({scale:Math.min(scale,maxWidth/page.getViewport({scale:1}).width)});
 const canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(vp.width));canvas.height=Math.max(1,Math.round(vp.height));
 await page.render({canvasContext:canvas.getContext('2d'),canvas,viewport:vp}).promise;
 const image=canvas.toDataURL('image/jpeg',0.72);
 canvas.width=canvas.height=1;
 return image;
}
export function renderFlexibleUpload(ctx){
 const {main,heading,state,ui,toast,ask,nav,safe}=ctx;
 if(!state.classes.length){
   main(heading('UPLOAD ANSWERS','PDF 업로드','먼저 학급을 설정하세요.')+'<div class="panel"><button class="btn primary" id="goSettings">학급 설정</button></div>');
   el('goSettings').onclick=()=>nav('settings');return;
 }
 session=null;
 let selectedFiles=[];
 const c=state.classes.find(x=>x.classNo===ui.classNo)||state.classes[0];
 ui.classNo=c.classNo;ui.startNo=Math.max(c.startNo,Math.min(c.endNo,ui.startNo));
 ui.endNo=Math.max(ui.startNo,Math.min(c.endNo,ui.endNo));
 const choose=state.classes.map(x=>'<option value="'+x.classNo+'"'+(x.classNo===ui.classNo?' selected':'')+'>'+x.classNo+'반</option>').join('');
 main(heading('UPLOAD ANSWERS','답안 PDF 업로드','학생별 1~5장 · 다음 학생 첫 장에서 분리 · STEP별 페이지 자동/수동 정렬')+
 '<div class="panel"><div class="panel-head"><h2>01. 업로드 대상 학생</h2></div>'+
 '<div class="form-grid"><div class="field"><label>학급</label><select id="fuClass">'+choose+'</select></div>'+
 '<div class="field"><label>시작 번호</label><input type="number" id="fuStart" min="'+c.startNo+'" max="'+c.endNo+'" value="'+ui.startNo+'"></div>'+
 '<div class="field"><label>마지막 번호</label><input type="number" id="fuEnd" min="'+c.startNo+'" max="'+c.endNo+'" value="'+ui.endNo+'"></div></div>'+
 '<p class="help-text" id="fuExpected"></p><div class="panel-head"><h2>02. PDF 파일 선택</h2></div>'+
 '<div id="fuDropzone" class="pdf-dropzone" role="button" tabindex="0" aria-label="PDF 파일 여러 개 끌어놓기 또는 클릭해서 추가">'+
 '<strong>⇩ PDF 파일을 여기로 끌어다 놓으세요</strong><span>3반 PDF 3개도 한꺼번에 추가 가능 · 클릭해서 추가 선택</span></div>'+
 '<div class="pdf-file-picker"><input class="control" type="file" id="fuFiles" accept=".pdf,application/pdf" multiple aria-label="PDF 여러 개 선택"></div>'+
 '<div id="fuFileList" class="pdf-file-list" aria-live="polite"></div>'+
 '<p class="help-text">선택한 모든 파일을 표시된 순서대로 연결하여 분석합니다. ↑↓ 버튼으로 순서를 변경할 수 있습니다. 학생당 1~5장입니다.</p>'+ 
 '<label class="pdf-auto-vision"><input type="checkbox" id="fuAutoVision" checked> <span><strong>스캔본의 인쇄 제목·문항·페이지 모양까지 AI가 자동 판별</strong><small>PDF 분석 후 AI 실행 전 개인정보 외부 전송·비용에 관한 확인창이 나타납니다. 동의하지 않으면 AI는 호출되지 않습니다.</small></span></label>'+
 '<div class="sub-actions"><button class="btn primary" id="fuInspect">PDF 장별 분석 시작</button>'+
 '<button class="btn secondary" id="fuAiScan" disabled>↻ AI로 미판별 페이지 다시 분석</button>'+ 
 '<button class="btn secondary" id="fuStopAi" disabled hidden>AI 페이지 판별 중단</button></div>'+
 '<p id="fuStatus" class="help-text" role="status"></p></div>'+
 '<div class="panel" id="fuReview" hidden><div class="panel-head"><h2>03. AI 페이지 판별·학생별 분리 확인</h2></div>'+ 
 '<div id="fuAiProgress" class="pdf-ai-progress" role="status" aria-live="polite">'+
 '<div class="pdf-ai-progress-head"><strong id="fuAiProgressTitle">AI 분석 전</strong><span id="fuAiProgressCount">0/0쪽</span></div>'+
 '<progress id="fuAiProgressBar" max="100" value="0"></progress>'+
 '<div id="fuAiProgressDetail" class="pdf-ai-progress-detail">스캔 PDF는 AI가 인쇄 문항과 레이아웃으로 STEP을 판별합니다.</div>'+
 '<button type="button" class="btn secondary" id="fuRetryVisual" disabled>남은 미판별 페이지 AI 분석 계속</button>'+
 '</div>'+
 '<p class="thin-note">인쇄된 STEP 제목·문항 및 페이지 구조로 AI가 구분합니다. <strong>높음: 자동 분류 / 보통: 확인 권장 / 낮음: 판별 필요</strong>. 학생별 순서·학번·이름은 저장 전 최종 확인하세요.</p>'+ 
 '<label class="mini-check pdf-review-toggle"><input type="checkbox" id="fuOnlyNeedsReview"> 판별 필요·보통 신뢰도 페이지만 보기</label>'+
 '<div class="table-wrap"><table class="small-table flexible-page-table"><thead><tr><th>원본 페이지</th><th>미리보기</th><th>새 학생 시작</th><th>STEP 구분</th><th>판독 메모</th></tr></thead><tbody id="fuPageRows"></tbody></table></div>'+
 '<div class="notice" id="fuGroupSummary"></div>'+
 '<label class="identity-check"><input id="fuConfirm" type="checkbox"> 원본 첫 장의 학번·이름과 학생별 페이지 범위·정렬 결과를 확인했습니다. 업로드 후 채점 화면에서도 첫 장을 다시 확인하겠습니다.</label>'+
 '<div class="sub-actions"><label class="mini-check"><input type="checkbox" id="fuAutoAi"> 저장 후 AI 보조 채점도 실행 (별도 API 비용)</label></div>'+
 '<button class="btn primary" id="fuUpload" disabled>확인한 페이지 구성으로 PDF 저장</button></div>');
 const updateExpected=()=>{
  const cur=state.classes.find(x=>x.classNo===Number(el('fuClass').value));
  const a=Number(el('fuStart').value),b=Number(el('fuEnd').value);
  let nums=[];
  try{nums=activeNumbers(cur,a,b);}catch{}
  el('fuExpected').textContent=cur.classNo+'반 · 결번 제외 '+nums.length+'명 ('+nums.map(n=>n+'번').join(', ')+') · 페이지 수는 1인 최대 5장';
  if(el('fuReview'))el('fuReview').hidden=true;session=null;
 };
 el('fuClass').onchange=()=>{
  const k=state.classes.find(x=>x.classNo===Number(el('fuClass').value));
  el('fuStart').value=k.startNo;el('fuEnd').value=k.endNo;updateExpected();
 };
 el('fuStart').oninput=updateExpected;el('fuEnd').oninput=updateExpected;
 const report=s=>{if(el('fuStatus'))el('fuStatus').textContent=s};
 let analysisBusy=false,visualBusy=false,visualCancel=false;
 const resetReview=()=>{
  session=null;
  el('fuReview').hidden=true;
  el('fuAiScan').disabled=true;
  el('fuUpload').disabled=true;
  el('fuConfirm').checked=false;
 };
 function renderFileList(){
  const list=el('fuFileList'),total=selectedFiles.reduce((n,f)=>n+f.size,0);
  if(!selectedFiles.length){
   list.innerHTML='<p class="thin-note">아직 추가한 PDF가 없습니다. 여러 파일을 한 번에 끌어다 놓거나 선택하세요.</p>';
  }else{
   list.innerHTML='<div class="pdf-file-summary">선택한 PDF <strong>'+selectedFiles.length+'개</strong> · 합계 '+(total/1024/1024).toFixed(1)+'MB · 아래 순서대로 분석</div>'+
     '<ol class="pdf-selected-files">'+selectedFiles.map((file,i)=>
      '<li><div class="pdf-selected-name"><strong>'+esc(file.name)+'</strong><span>'+(file.size/1024/1024).toFixed(1)+'MB</span></div>'+
      '<div class="pdf-file-buttons"><button type="button" class="btn secondary" data-fu-action="up" data-fu-index="'+i+'" '+(i===0?'disabled':'')+' aria-label="'+(i+1)+'번째 파일 위로">↑</button>'+
      '<button type="button" class="btn secondary" data-fu-action="down" data-fu-index="'+i+'" '+(i===selectedFiles.length-1?'disabled':'')+' aria-label="'+(i+1)+'번째 파일 아래로">↓</button>'+
      '<button type="button" class="btn secondary" data-fu-action="remove" data-fu-index="'+i+'" aria-label="'+(i+1)+'번째 파일 삭제">삭제</button></div></li>'
     ).join('')+'</ol><button type="button" class="btn secondary pdf-clear-button" id="fuClearFiles">전체 파일 목록 비우기</button>';
   el('fuClearFiles').onclick=()=>{if(analysisBusy)return;selectedFiles=[];resetReview();renderFileList();report('선택한 파일을 모두 제거했습니다.');};
  }
 }
 function addFiles(fileList){
  if(analysisBusy)throw Error('PDF 분석이 진행 중입니다. 완료 후 파일을 변경하세요.');
  const incoming=Array.from(fileList||[]);
  if(!incoming.length)return;
  const next=[...selectedFiles];
  let duplicates=0;
  for(const file of incoming){
   if(!/\.pdf$/i.test(file.name)||file.size<=0||file.size>50*1024*1024)
    throw Error(file.name+': 비어 있지 않은 50MB 이하의 PDF만 추가할 수 있습니다.');
   if(next.some(f=>f.name===file.name&&f.size===file.size&&f.lastModified===file.lastModified)){duplicates++;continue;}
   next.push(file);
  }
  if(next.length>20)throw Error('PDF는 한 번에 최대 20개까지 추가할 수 있습니다.');
  const total=next.reduce((n,f)=>n+f.size,0);
  if(total>200*1024*1024)throw Error('여러 PDF의 총 크기는 200MB 이하로 나눠서 분석하세요.');
  selectedFiles=next;
  resetReview();renderFileList();
  report('PDF '+selectedFiles.length+'개를 추가했습니다.'+(duplicates?' 중복 '+duplicates+'개 제외.':'')+' 목록 순서대로 분석합니다. 아직 서버에 업로드하지 않았습니다.');
 }
 const picker=el('fuFiles'),dropzone=el('fuDropzone');
 picker.onchange=()=>{const files=Array.from(picker.files||[]);picker.value='';safe(async()=>addFiles(files));};
 dropzone.onclick=()=>{if(!analysisBusy)picker.click();};
 dropzone.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!analysisBusy)picker.click();}};
 for(const type of ['dragenter','dragover']){
  dropzone.addEventListener(type,e=>{e.preventDefault();e.stopPropagation();if(!analysisBusy)dropzone.classList.add('drag-active');});
 }
 for(const type of ['dragleave','dragend']){
  dropzone.addEventListener(type,e=>{e.preventDefault();e.stopPropagation();if(!dropzone.contains(e.relatedTarget))dropzone.classList.remove('drag-active');});
 }
 dropzone.addEventListener('drop',e=>{
  e.preventDefault();e.stopPropagation();dropzone.classList.remove('drag-active');
  safe(async()=>addFiles(e.dataTransfer?.files));
 });
 el('fuFileList').onclick=e=>{
  const button=e.target.closest('button[data-fu-action]');
  if(!button||analysisBusy)return;
  const i=Number(button.dataset.fuIndex),action=button.dataset.fuAction;
  if(!Number.isInteger(i)||i<0||i>=selectedFiles.length)return;
  if(action==='remove')selectedFiles.splice(i,1);
  else if(action==='up'&&i>0)[selectedFiles[i-1],selectedFiles[i]]=[selectedFiles[i],selectedFiles[i-1]];
  else if(action==='down'&&i<selectedFiles.length-1)[selectedFiles[i+1],selectedFiles[i]]=[selectedFiles[i],selectedFiles[i+1]];
  else return;
  resetReview();renderFileList();report('파일 목록을 변경했습니다. 변경된 순서대로 다시 분석하세요.');
 };
 renderFileList();
 function targetNumbers(){
  const k=state.classes.find(x=>x.classNo===Number(el('fuClass').value));
  return activeNumbers(k,Number(el('fuStart').value),Number(el('fuEnd').value));
 }
 function checkGroups(){
  try{
   if(!session)throw Error('파일 분석을 먼저 실행하세요.');
   const nums=targetNumbers();
   if(!nums.length)throw Error('선택한 범위에는 학생이 없습니다.');
   const groups=groupPages(session.pages,nums);
   session.groups=groups;
   const messages=groups.map((g,i)=>{
    const src=g.pages.map(p=>esc(p.fileName)+' '+p.pageNo+'쪽('+esc(ROLE_NAMES[p.role])+')').join(' → ');
    const student=state.roster.find(x=>x.classNo===Number(el('fuClass').value)&&x.number===g.number);
    return '<tr><td>'+(i+1)+'</td><td>'+g.number+'번 '+esc(student?.name||'미등록')+'</td><td>'+g.pages.length+'장</td><td>'+src+'</td><td>'+g.missingRoles.map(x=>esc(ROLE_NAMES[x])).join(', ')+'</td></tr>';
   }).join('');
   const missingStudents=groups.filter(g=>!state.roster.some(x=>x.classNo===Number(el('fuClass').value)&&x.number===g.number));
   el('fuGroupSummary').innerHTML='<strong>'+groups.length+'명 확인 · 총 '+session.pages.length+'장</strong>'+
   '<div class="table-wrap"><table class="small-table"><thead><tr><th>순서</th><th>예상 학생</th><th>장수</th><th>정렬된 원본 페이지</th><th>없어진 장</th></tr></thead><tbody>'+messages+'</tbody></table></div>'+
   (missingStudents.length?'<p class="attention">학생 명단이 없는 번호가 있습니다. 명단을 먼저 등록하세요.</p>':'');
   el('fuUpload').disabled=missingStudents.length>0||!el('fuConfirm').checked;
  }catch(e){
   session.groups=null;
   el('fuGroupSummary').textContent='확인 필요: '+e.message;
   el('fuUpload').disabled=true;
  }
 }

 function updateAiProgress(phase='idle',message=''){
  if(!session)return;
  const pages=session.pages;
  const total=pages.filter(p=>p.needsVisual).length;
  const done=pages.filter(p=>p.needsVisual&&p.visualChecked).length;
  const pending=pages.filter(p=>p.needsVisual&&!p.visualChecked&&!p.manualEdited).length;
  const uncertain=pages.filter(p=>p.visualChecked&&(p.role==='unknown'||p.confidence==='낮음')).length;
  const medium=pages.filter(p=>p.visualChecked&&p.confidence==='보통').length;
  const high=pages.filter(p=>p.visualChecked&&p.confidence==='높음').length;
  const label=el('fuAiProgressTitle'),counter=el('fuAiProgressCount'),bar=el('fuAiProgressBar'),detail=el('fuAiProgressDetail'),retry=el('fuRetryVisual');
  if(!label)return;
  const finished=total-pending;
  const phaseTitle={running:'AI가 인쇄 문항·표·레이아웃을 분석하고 있습니다',done:'AI 페이지 분석 완료',error:'AI 분석 오류 · 중단된 위치부터 재시도 가능',cancel:'AI 페이지 분석 중단',idle:'AI 스캔 페이지 판별 대기',skipped:'AI 분석 동의하지 않음 · 실행되지 않음'};
  label.textContent=phaseTitle[phase]||phaseTitle.idle;
  counter.textContent=finished+'/'+total+'쪽 처리';
  bar.max=Math.max(1,total);
  bar.value=finished;
  detail.textContent=(message?message+' · ':'')+'AI 확실 '+high+'쪽 / AI 확인 권장 '+medium+'쪽 / AI 판별 불확실 '+uncertain+'쪽 / 아직 AI 미분석 '+pending+'쪽';
  if(retry)retry.disabled=analysisBusy||visualBusy||!pages.some(p=>!p.manualEdited&&(p.role==='unknown'||((p.needsVisual||p.confidence==='보통')&&!p.visualChecked)));
 }
 function friendlyAiError(error){
  const raw=String(error?.message||error||'');
  const code=String(error?.code||'');
  if(/401|API 키|failed-precondition/.test(raw))return 'API 키가 유효하지 않거나 서버 설정이 필요합니다. Cloud Shell의 Firebase 함수 상태를 확인하세요.';
  if(/429|resource-exhausted|quota/i.test(raw+' '+code))return 'OpenAI 호출 한도나 크레딧 부족으로 중단되었습니다. 결제/사용 한도를 확인한 후 남은 페이지를 다시 분석하세요.';
  if(/deadline|timeout|시간 초과/i.test(raw+' '+code))return 'AI 응답 시간이 초과됐습니다. 완료된 페이지는 유지됩니다. 남은 페이지를 다시 분석하세요.';
  if(/permission-denied|unauthenticated/i.test(raw+' '+code))return 'Firebase 교사 로그인 또는 AI 함수 권한을 확인하세요.';
  if(/invalid-argument/i.test(raw+' '+code))return '이미지 크기 또는 요청 형식 오류입니다. 오류 메시지를 확인하세요.';
  return raw||'원인을 확인할 수 없습니다. 브라우저 오류와 Firebase Functions 로그를 확인하세요.';
 }
 function updateReviewFilter(){
  const only=el('fuOnlyNeedsReview')?.checked;
  if(!session||!el('fuPageRows'))return;
  el('fuPageRows').querySelectorAll('tr[data-page-index]').forEach(row=>{
   const p=session.pages[Number(row.dataset.pageIndex)];
   row.hidden=!!only&&p.role!=='unknown'&&p.confidence!=='보통'&&p.confidence!=='낮음';
  });
 }
 async function runVisualClassification(){
  if(!session)throw Error('먼저 PDF 장별 분석을 완료하세요.');
  if(visualBusy)throw Error('AI 페이지 판별이 이미 진행 중입니다.');
  const candidates=session.pages.filter(p=>!p.manualEdited&&(p.role==='unknown'||((p.needsVisual||p.confidence==='보통')&&!p.visualChecked)));
  if(!candidates.length){
   report('AI로 분류할 페이지가 없습니다. 이미 STEP이 선택되어 있습니다.');
   updateAiProgress('done');
   return;
  }
  const wasAnalyzing=analysisBusy,scanBtn=el('fuAiScan'),stopBtn=el('fuStopAi');
  visualBusy=true;visualCancel=false;analysisBusy=true;
  el('fuConfirm').checked=false;
  if(scanBtn)scanBtn.disabled=true;
  if(stopBtn){stopBtn.hidden=false;stopBtn.disabled=false;}
  for(const id of ['fuInspect','fuFiles','fuClass','fuStart','fuEnd']){
   const field=el(id);if(field)field.disabled=true;
  }
  let processed=0,high=0,medium=0,unresolved=0;
  updateAiProgress('running','요청한 '+candidates.length+'쪽을 순차 처리합니다.');
  try{
   const callable=httpsCallable(ctx.functions,'inspectPages',{timeout:120000});
   const batchSize=4; // 155쪽처럼 많은 스캔도 한 번에 4쪽씩 보내 timeout/요청량을 줄인다.
   for(let offset=0;offset<candidates.length;offset+=batchSize){
    if(visualCancel)break;
    const chunk=candidates.slice(offset,offset+batchSize);
    const batchNumber=Math.floor(offset/batchSize)+1,totalBatches=Math.ceil(candidates.length/batchSize);
    const progress='AI 스캔 STEP 자동 판별 '+batchNumber+'/'+totalBatches+'회차 · '+processed+'/'+candidates.length+'쪽 완료';
    report(progress);
    updateAiProgress('running',progress);
    const images=[];
    for(const p of chunk)images.push(await thumbnail(p,1.35));
    let results;
    try{
     const response=await callable({images});
     results=response.data?.pages;
     if(!Array.isArray(results)||results.length!==chunk.length)
      throw Error('AI가 응답한 페이지 수가 일치하지 않습니다. '+chunk.length+'쪽을 재분석해야 합니다.');
    }catch(e){
     // 한 묶음 실패 시 이미 성공한 이전 묶음을 유지한다. 인증/한도 오류를 반복 호출하지 않는다.
     const msg=friendlyAiError(e);
     const failedPositions=chunk.map(p=>p.fileName+' '+p.pageNo+'쪽').join(', ');
     throw Error('AI 자동 판별이 '+processed+'/'+candidates.length+'쪽에서 중단됐습니다. '
      +'실패한 원본: '+failedPositions+' · '+msg
      +' · 완료된 STEP은 유지됐습니다. [남은 미판별 페이지 AI 분석 계속]을 누르면 미분석 페이지만 다시 요청합니다.');
    }
    for(let i=0;i<chunk.length;i++){
     const p=chunk[i],success=applyVisualPageResult(p,results[i]);
     processed++;
     if(success){if(p.confidence==='높음')high++;else medium++;}
     else unresolved++;
    }
    drawPageRows();
    const status='진행 '+processed+'/'+candidates.length+'쪽 · AI 높음 '+high
      +' · 보통 '+medium+' · 불확실 '+unresolved;
    report(status);
    updateAiProgress('running',status);
   }
   const finishedMessage=(visualCancel?'AI 분석 중단':'AI 이미지 자동 판별 완료')
      +' · '+processed+'/'+candidates.length+'쪽 처리 · AI 높음 '+high+' / 보통 '+medium
      +' / 판별 불확실 '+unresolved+'쪽. 학생별 첫 장의 이름·학번은 저장 전에 확인하세요.';
   report(finishedMessage);
   updateAiProgress(visualCancel?'cancel':'done',finishedMessage);
  }catch(e){
   const info=friendlyAiError(e);
   report('AI 분석 실패: '+info);
   updateAiProgress('error',info);
   throw e;
  }finally{
   visualBusy=false;
   if(!wasAnalyzing)analysisBusy=false;
   if(stopBtn){stopBtn.hidden=true;stopBtn.disabled=true;}
   if(scanBtn)scanBtn.disabled=!session;
   for(const id of ['fuInspect','fuFiles','fuClass','fuStart','fuEnd']){
    const field=el(id);if(field)field.disabled=analysisBusy;
   }
   updateAiProgress(visualCancel?'cancel':'idle');
  }
 }
 function drawPageRows(){
  if(!session)return;
  el('fuReview').hidden=false;
  el('fuConfirm').checked=false;
  el('fuPageRows').innerHTML=session.pages.map((p,i)=>
   '<tr data-page-index="'+i+'" class="'+(p.confidence==='높음'?'page-ai-high':p.confidence==='보통'?'page-ai-medium':p.role==='unknown'?'page-ai-unknown':'')+'"><td><strong>'+(i+1)+'</strong><small>'+esc(p.fileName)+' · '+p.pageNo+'쪽</small></td>'+
   '<td><img class="scan-thumb" data-preview="'+i+'" src="'+p.thumb+'" alt="PDF '+(i+1)+'쪽 미리보기" title="클릭하여 확대"></td>'+
   '<td><input type="checkbox" data-start="'+i+'"'+(p.start?' checked':'')+'></td>'+
   '<td><select data-role="'+i+'" class="control">'+roleOptions(p.role)+'</select></td>'+
   '<td><span class="page-ai-tag '+(p.manualEdited?'is-text':p.visualChecked?(p.confidence==='높음'?'is-high':p.confidence==='보통'?'is-medium':'is-unknown'):p.role==='unknown'?'is-unknown':'is-text')+'">'+esc(p.manualEdited?'교사 지정':p.visualChecked?(p.confidence==='높음'?'AI 높음':p.confidence==='보통'?'AI 보통':'AI 불확실'):p.role==='unknown'?'판별 필요':'텍스트 판별')+'</span><small class="page-ai-reason">'+esc(p.detected||'직접 확인 필요')+'</small></td></tr>').join('');
  el('fuPageRows').querySelectorAll('[data-start]').forEach(input=>input.onchange=()=>{
   const p=session.pages[Number(input.dataset.start)];p.start=input.checked;
   if(p.start)p.role='front';else if(p.role==='front')p.role='unknown';
   p.manualEdited=true;p.detected='교사가 직접 페이지 시작을 수정함';p.confidence='교사';
   el('fuConfirm').checked=false;drawPageRows();
  });
  el('fuPageRows').querySelectorAll('[data-role]').forEach(input=>input.onchange=()=>{
   const p=session.pages[Number(input.dataset.role)];p.role=input.value;p.start=p.role==='front';
   p.manualEdited=true;p.detected='교사가 직접 STEP을 지정함';p.confidence='교사';
   el('fuConfirm').checked=false;drawPageRows();
  });
  el('fuPageRows').querySelectorAll('[data-preview]').forEach(img=>img.onclick=()=>safe(async()=>{
   const p=session.pages[Number(img.dataset.preview)];
   const url=await thumbnail(p,1.4);
   const modal=document.createElement('div');modal.className='page-zoom-overlay';
   modal.innerHTML='<button type="button" class="btn primary">닫기</button><img src="'+url+'" alt="원본 페이지 확대">';
   document.body.appendChild(modal);modal.onclick=()=>modal.remove();
  }));
  updateReviewFilter();checkGroups();
 }
 function drawUpdatedSelectors(){
  session.pages.forEach((p,i)=>{
   const a=el('fuPageRows').querySelector('[data-start="'+i+'"]');
   const b=el('fuPageRows').querySelector('[data-role="'+i+'"]');
   if(a)a.checked=p.start;if(b)b.value=p.role;
  });
 }
 el('fuConfirm').onchange=checkGroups;
 el('fuOnlyNeedsReview').onchange=updateReviewFilter;
 el('fuStopAi').onclick=()=>{visualCancel=true;report('현재 AI 요청이 끝나면 나머지 페이지 판별을 중단합니다.');};
 el('fuInspect').onclick=()=>safe(async()=>{
  if(session)session=null;
  const files=[...selectedFiles];if(!files.length)throw Error('분석할 PDF 파일을 먼저 추가하세요.');
  const nums=targetNumbers();if(!nums.length)throw Error('학급과 번호 범위를 확인하세요.');
  analysisBusy=true;el('fuInspect').disabled=true;picker.disabled=true;el('fuAiScan').disabled=true;el('fuReview').hidden=true;
  report('PDF '+files.length+'개를 분석할 준비 중입니다. 파일의 용량과 페이지 수에 따라 브라우저에서 처리 시간이 걸릴 수 있습니다.');
  try{
   if(!window.PDFLib?.PDFDocument)throw Error('PDF 분리 라이브러리를 불러오지 못했습니다. Ctrl+F5로 새로고침하세요.');
   if(!ctx.pdfjsLib?.getDocument)throw Error('PDF 미리보기 라이브러리가 준비되지 않았습니다. Ctrl+F5로 새로고침하세요.');
   const pages=[];
   for(let f=0;f<files.length;f++){
    const file=files[f];
    if(!/\.pdf$/i.test(file.name)||file.size>50*1024*1024)throw Error(file.name+': 50MB 이하 PDF만 가능합니다.');
    const data=new Uint8Array(await file.arrayBuffer());
    const edit=await window.PDFLib.PDFDocument.load(data.slice());
    const view=await ctx.pdfjsLib.getDocument({data:data.slice()}).promise;
    if(edit.getPageCount()!==view.numPages)throw Error('PDF 페이지 수가 일치하지 않습니다.');
    if(pages.length+view.numPages>250)throw Error('한 번에 250쪽까지 확인할 수 있습니다. 나눠서 업로드하세요.');
    for(let n=1;n<=view.numPages;n++){
      report('장별 판독 중: '+file.name+' '+n+'/'+view.numPages+'쪽');
      const page=await view.getPage(n);
      let t='';try{t=(await page.getTextContent()).items.map(x=>x.str||'').join(' ')}catch{}
      const role=inferPageRole(t);
      const needsVisual=role==='unknown'||t.replace(/\s/g,'').length<35;
      const p={file,edit,view,fileName:file.name,pageNo:n,role,start:role==='front',
       needsVisual,visualChecked:false,manualEdited:false,confidence:role!=='unknown'?'높음':'미확인',
       detected:role==='unknown'?'이미지 스캔 또는 인쇄문항 확인 필요 · AI 자동 분류 대상':'PDF 텍스트에서 STEP 제목·문항 확인'};
      p.thumb=await thumbnail(p,0.34);
      pages.push(p);
    }
   }
   session={pages,groups:null};
   drawPageRows();el('fuAiScan').disabled=false;
   const n=pages.filter(p=>p.needsVisual).length;
   report('PDF '+files.length+'개 · 총 '+pages.length+'쪽의 미리보기를 생성했습니다. AI 이미지 분류 대상 '+n+'쪽.');
   if(n&&el('fuAutoVision').checked){
    const permitted=await ask('스캔 PDF 이미지 AI 분석 동의',
      '스캔된 답안 '+n+'쪽의 페이지 이미지(학생 이름·학번과 필기 포함)를 외부 OpenAI API에 전송해 STEP 제목·문항·레이아웃을 분석합니다. API 사용료가 발생하며 학교 개인정보 처리·외부 전송 지침을 확인해야 합니다. 실행하시겠습니까?',
      '동의하고 AI 자동 판별');
    if(permitted)await runVisualClassification();
    else report('AI 자동 분류를 건너뛰었습니다. 현재 분류와 페이지 미리보기는 유지했습니다. 필요하면 AI 판별 버튼을 별도로 누를 수 있습니다.');
   }
   else if(n)report('PDF '+files.length+'개, '+pages.length+'쪽 · 이미지 자동 분류 '+n+'쪽이 남았습니다. AI 체크 후 다시 분석하거나 AI 버튼을 사용하세요.');
   else report('PDF '+files.length+'개, '+pages.length+'쪽 · 인쇄된 STEP 문항을 텍스트에서 모두 구분했습니다. 아래 학생별 분리 결과를 확인하세요.');
  }catch(error){report('PDF 장별 분석 실패: '+(error?.message||String(error)));throw error;}
  finally{analysisBusy=false;el('fuInspect').disabled=false;picker.disabled=false;
   for(const id of ['fuClass','fuStart','fuEnd']){const field=el(id);if(field)field.disabled=false;}
   if(el('fuAiScan'))el('fuAiScan').disabled=!session;
  }
 });
 el('fuAiScan').onclick=()=>safe(async()=>{
  if(!session)throw Error('PDF 장별 분석부터 실행하세요.');
  const n=session.pages.filter(p=>!p.manualEdited&&(p.role==='unknown'||((p.needsVisual||p.confidence==='보통')&&!p.visualChecked))).length;
  if(!n){report('AI가 판독할 미확인 페이지가 없습니다. 보통/낮음 결과를 재검토하려면 해당 STEP을 직접 확인해 주세요.');return;}
  if(!await ask('AI 스캔 페이지 판별',
    '확인되지 않은 '+n+'쪽의 이미지(학번·이름·필기 포함)가 외부 OpenAI API로 전송되며 비용이 발생할 수 있습니다. 학교 개인정보·보안 지침에 따라 이용이 허용되는지 확인했습니까?',
    '동의하고 AI 판별'))return;
  await runVisualClassification();
 });
 el('fuUpload').onclick=()=>safe(async()=>{
  if(!session?.groups||!el('fuConfirm').checked)throw Error('페이지 구분과 확인 체크를 먼저 완료하세요.');
  const {db,storage,loadAll}=ctx;
  const cls=Number(el('fuClass').value),start=Number(el('fuStart').value),end=Number(el('fuEnd').value);
  const groups=groupPages(session.pages,targetNumbers());
  await loadAll();
  for(const g of groups){
   if(!state.roster.some(r=>r.classNo===cls&&r.number===g.number))throw Error(cls+'반 '+g.number+'번 명단이 없습니다.');
   if(state.submissions.some(r=>r.classNo===cls&&r.assignedNo===g.number))throw Error(cls+'반 '+g.number+'번은 이미 답안이 등록되어 있습니다.');
  }
  if(!await ask('최종 PDF 업로드','학생 '+groups.length+'명 · 총 '+session.pages.length+'장입니다. 이름 첫 장 기준으로 구분했고, 각 학생 안에서 STEP 순서로 정렬한 PDF를 저장합니다. 맞습니까?','저장'))return;
  el('fuUpload').disabled=true;
  const ids=groups.map(()=>crypto.randomUUID()),batchId=crypto.randomUUID();
  const uploaded=[];
  try{
   const b=writeBatch(db);
   b.set(doc(db,'batches',batchId),{classNo:cls,startNo:start,endNo:end,status:'진행 중',createdAt:serverTimestamp()});
   groups.forEach((g,i)=>{
    b.set(doc(db,'submissions',ids[i]),{
      batchId,classNo:cls,expectedNo:g.number,assignedNo:g.number,
      pdfPath:'submissions/'+ids[i]+'.pdf',sourceName:g.pages[0].fileName,sourcePage:g.pages[0].pageNo,
      sourcePages:g.pages.map(p=>({file:p.fileName,page:p.pageNo,step:p.role})),pageCount:g.pages.length,missingRoles:g.missingRoles,
      identityConfirmed:false,identityStatus:'첫 장 교사 확인 필요',
      recognizedNo:g.pages[0].recognizedNo||'',recognizedName:g.pages[0].recognizedName||'',recognizedConfidence:g.pages[0].confidence||'',
      aiStatus:'AI 미실행',aiGrade:null,aiSummary:'',aiUncertain:[],teacherGrade:null,pointsSnapshot:null,
      finalized:false,status:'uploading',createdAt:serverTimestamp(),updatedAt:serverTimestamp()
    });
   });
   await b.commit();
   for(let i=0;i<groups.length;i++){
    const g=groups[i];
    report((i+1)+'/'+groups.length+'명: '+g.pages.length+'장 정렬하여 저장하는 중…');
    const result=await window.PDFLib.PDFDocument.create();
    for(const p of g.pages){const originals=await result.copyPages(p.edit,[p.pageNo-1]);result.addPage(originals[0]);}
    const bytes=await result.save();
    if(bytes.length>20*1024*1024)throw Error(g.number+'번 PDF가 20MB를 초과합니다.');
    const target='submissions/'+ids[i]+'.pdf';
    await uploadBytes(ref(storage,target),new Blob([bytes],{type:'application/pdf'}),{contentType:'application/pdf'});
    uploaded.push(target);
    await updateDoc(doc(db,'submissions',ids[i]),{status:'ready',updatedAt:serverTimestamp()});
   }
   await updateDoc(doc(db,'batches',batchId),{status:'검토 대기'});
   toast(groups.length+'명 답안 업로드 완료 (장수 1~5장, STEP 정렬)');
   report('업로드 완료, 채점 현황으로 이동합니다.');
   await loadAll();
   if(el('fuAutoAi')?.checked && ctx.analyzeSubmission){
    for(let i=0;i<ids.length;i++){
     report((i+1)+'/'+ids.length+'명 AI 채점 중…');
     try{await ctx.analyzeSubmission(ids[i]);}catch(e){toast('AI 채점 실패: '+e.message,true);break;}
    }
   }
   ui.resultsClass=String(cls);await nav('results');
  }catch(e){
   let cleanupFailed=false;
   for(const p of uploaded){try{await deleteObject(ref(storage,p));}catch{cleanupFailed=true;}}
   for(const id of ids){try{await deleteDoc(doc(db,'submissions',id));}catch{cleanupFailed=true;}}
   try{await deleteDoc(doc(db,'batches',batchId));}catch{cleanupFailed=true;}
   throw Error(e.message+(cleanupFailed?' (일부 자료는 남아 있을 수 있으니 채점 현황에서 확인)':' (업로드 취소됨)'));
  }finally{if(el('fuUpload'))el('fuUpload').disabled=false;}
 });
 updateExpected();
}
