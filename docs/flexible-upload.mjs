import {doc,writeBatch,updateDoc,deleteDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';
import {ref,uploadBytes,deleteObject} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-storage.js';
import {httpsCallable} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-functions.js';
import {activeNumbers,escapeHtml as esc} from './core.mjs';
import {PAGE_ROLES,ROLE_NAMES,inferPageRole,groupPages} from './page-grouping.mjs';

let session=null;
const el=id=>document.getElementById(id);
const label=(v)=>String(v??'—');
const roleOptions=(selected)=>[['unknown','판별 필요'],...PAGE_ROLES.map(k=>[k,ROLE_NAMES[k]])].map(([key,n])=>'<option value="'+key+'"'+(key===selected?' selected':'')+'>'+esc(n)+'</option>').join('');
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
 '<p class="help-text">선택한 모든 파일을 표시된 순서대로 연결하여 분석합니다. ↑↓ 버튼으로 파일 순서를 변경할 수 있습니다. 학생당 1~5장, 스캔본은 AI 또는 교사 확인이 필요합니다.</p>'+
 '<div class="sub-actions"><button class="btn primary" id="fuInspect">PDF 장별 분석 시작</button>'+
 '<button class="btn secondary" id="fuAiScan" disabled>AI로 이름·STEP 자동 판별 (Cloud Functions 배포 필요·비용)</button></div>'+
 '<p id="fuStatus" class="help-text" role="status"></p></div>'+
 '<div class="panel" id="fuReview" hidden><div class="panel-head"><h2>03. 페이지별 분리·정렬 확인</h2></div>'+
 '<p class="notice warn">이름이 적힌 첫 장마다 "새 학생 시작"을 선택하세요. 장마다 STEP을 확인하면 STEP 1 → STEP 1 계속 → STEP 2 → STEP 3 → STEP 4로 자동 정렬합니다. AI 판독이 틀렸을 때는 직접 수정할 수 있습니다.</p>'+
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
 el('fuFiles').onchange=()=>{session=null;el('fuReview').hidden=true;el('fuStatus').textContent='';};
 const report=s=>{if(el('fuStatus'))el('fuStatus').textContent=s};
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
 function drawPageRows(){
  if(!session)return;
  el('fuReview').hidden=false;
  el('fuConfirm').checked=false;
  el('fuPageRows').innerHTML=session.pages.map((p,i)=>
   '<tr><td><strong>'+(i+1)+'</strong><small>'+esc(p.fileName)+' · '+p.pageNo+'쪽</small></td>'+
   '<td><img class="scan-thumb" data-preview="'+i+'" src="'+p.thumb+'" alt="PDF '+(i+1)+'쪽 미리보기" title="클릭하여 확대"></td>'+
   '<td><input type="checkbox" data-start="'+i+'"'+(p.start?' checked':'')+'></td>'+
   '<td><select data-role="'+i+'" class="control">'+roleOptions(p.role)+'</select></td>'+
   '<td>'+esc(p.detected||'직접 확인 필요')+'</td></tr>').join('');
  el('fuPageRows').querySelectorAll('[data-start]').forEach(input=>input.onchange=()=>{
   const p=session.pages[Number(input.dataset.start)];p.start=input.checked;
   if(p.start)p.role='front';else if(p.role==='front')p.role='unknown';
   el('fuConfirm').checked=false;drawUpdatedSelectors();checkGroups();
  });
  el('fuPageRows').querySelectorAll('[data-role]').forEach(input=>input.onchange=()=>{
   const p=session.pages[Number(input.dataset.role)];p.role=input.value;p.start=p.role==='front';
   el('fuConfirm').checked=false;drawUpdatedSelectors();checkGroups();
  });
  el('fuPageRows').querySelectorAll('[data-preview]').forEach(img=>img.onclick=()=>safe(async()=>{
   const p=session.pages[Number(img.dataset.preview)];
   const url=await thumbnail(p,1.4);
   const modal=document.createElement('div');modal.className='page-zoom-overlay';
   modal.innerHTML='<button type="button" class="btn primary">닫기</button><img src="'+url+'" alt="원본 페이지 확대">';
   document.body.appendChild(modal);modal.onclick=()=>modal.remove();
  }));
  checkGroups();
 }
 function drawUpdatedSelectors(){
  session.pages.forEach((p,i)=>{
   const a=el('fuPageRows').querySelector('[data-start="'+i+'"]');
   const b=el('fuPageRows').querySelector('[data-role="'+i+'"]');
   if(a)a.checked=p.start;if(b)b.value=p.role;
  });
 }
 el('fuConfirm').onchange=checkGroups;
 el('fuInspect').onclick=()=>safe(async()=>{
  if(session)session=null;
  const files=[...el('fuFiles').files];if(!files.length)throw Error('PDF 파일을 선택하세요.');
  const nums=targetNumbers();if(!nums.length)throw Error('학급과 번호 범위를 확인하세요.');
  el('fuInspect').disabled=true;el('fuAiScan').disabled=true;el('fuReview').hidden=true;
  try{
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
      let role=inferPageRole(t);let start=role==='front'||n===1;
      if(n===1&&role==='unknown')role='front';
      const p={file,edit,view,fileName:file.name,pageNo:n,role,start,detected:t.trim()?'PDF 텍스트 기준 분류':'스캔본 · AI 또는 교사 확인 필요'};
      p.thumb=await thumbnail(p,0.34);
      pages.push(p);
    }
   }
   session={pages,groups:null};
   drawPageRows();el('fuAiScan').disabled=false;report('총 '+pages.length+'쪽을 읽었습니다. 이름 있는 첫 장과 STEP을 확인하세요. 스캔본은 AI 판별 기능도 사용할 수 있습니다.');
  }finally{el('fuInspect').disabled=false;}
 });
 el('fuAiScan').onclick=()=>safe(async()=>{
  if(!session)throw Error('PDF 분석부터 실행하세요.');
  if(!await ask('AI 페이지 판별','모든 PDF 페이지 이미지가 외부 OpenAI API로 전송됩니다. 학생 개인정보 전송 및 비용 발생 가능성을 확인하셨습니까?','AI 판별 실행'))return;
  const btn=el('fuAiScan');btn.disabled=true;
  try{
   const callable=httpsCallable(ctx.functions,'inspectPages',{timeout:120000});
   for(let offset=0;offset<session.pages.length;offset+=6){
    const chunk=session.pages.slice(offset,offset+6);
    report('AI가 '+(offset+1)+'~'+(offset+chunk.length)+'쪽을 판별하는 중…');
    const images=[];
    for(const p of chunk){images.push(await thumbnail(p,1.6));}
    const response=await callable({images});
    const detected=response.data?.pages||[];
    if(detected.length!==chunk.length)throw Error('AI 응답의 페이지 수가 일치하지 않습니다.');
    for(let j=0;j<chunk.length;j++){
      const item=detected[j],p=chunk[j],recognized=item.role;
      if(PAGE_ROLES.includes(recognized)){
       p.role=recognized;p.start=recognized==='front';
      }else{p.role='unknown';p.start=false;}
      if(offset+j===0){p.start=true;p.role='front';}
      p.detected=(item.confidence||'판별 불확실')+' · '+(item.reason||'')+(item.studentNo?' · 판독번호 '+item.studentNo:'')+(item.studentName?' · 이름 '+item.studentName:'');
      p.recognizedNo=item.studentNo||'';p.recognizedName=item.studentName||'';p.confidence=item.confidence||'';
    }
   }
   drawPageRows();report('AI 페이지 판별이 끝났습니다. 첫 장과 STEP을 교사가 반드시 확인한 후 저장하세요.');
  }finally{if(el('fuAiScan'))el('fuAiScan').disabled=false;}
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
