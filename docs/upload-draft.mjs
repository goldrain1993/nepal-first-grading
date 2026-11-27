// 교사별 브라우저 임시 작업 저장. 서버 업로드 전에는 학생 파일을 Firebase로 보내지 않는다.
// PDF 원본은 1회 저장, AI 판독 결과/학생 번호 선택은 소량 메타데이터로 따로 갱신한다.
const DB_NAME='nepal-first-grading-upload-draft';
const STORE='records';
const VERSION=1;
function db(){
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined')return reject(Error('이 브라우저는 임시 저장을 지원하지 않습니다.'));
  const request=indexedDB.open(DB_NAME,VERSION);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error('임시 저장소를 열 수 없습니다.'));
 });
}
async function record(owner,kind,action,value){
 if(!owner)throw Error('교사 로그인이 필요합니다.');
 const database=await db();
 try{
  return await new Promise((resolve,reject)=>{
   const transaction=database.transaction(STORE,action==='read'?'readonly':'readwrite');
   const store=transaction.objectStore(STORE);
   const key=owner+':'+kind;
   const request=action==='read'?store.get(key):action==='delete'?store.delete(key):store.put(value,key);
   request.onsuccess=()=>{if(action==='read')resolve(request.result??null);};
   transaction.oncomplete=()=>{if(action!=='read')resolve(true);};
   transaction.onerror=()=>reject(transaction.error||request.error||Error('임시 데이터 저장 실패'));
   transaction.onabort=()=>reject(transaction.error||Error('임시 데이터 저장 중단'));
  });
 }finally{database.close();}
}
export async function readUploadDraft(owner){
 const [files,progress]=await Promise.all([record(owner,'files','read'),record(owner,'progress','read')]);
 return {files:files||[],progress:progress||null};
}
export function storeUploadFiles(owner,files){return record(owner,'files','write',files);}
export function storeUploadProgress(owner,progress){return record(owner,'progress','write',progress);}
export async function clearUploadDraft(owner){
 await Promise.all([record(owner,'files','delete'),record(owner,'progress','delete')]);
}
