'use strict';
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {defineSecret}=require('firebase-functions/params');
const admin=require('firebase-admin');
admin.initializeApp();
const OPENAI_API_KEY=defineSecret('OPENAI_API_KEY');
const AREAS=['data','strategy','algorithm'];
const LEVELS=['상','중상','중','기초','미제출'];
const PROMPT=`당신은 대한민국 중학교 1학년 정보 교사의 수행평가 채점 보조자입니다. 학생의 네팔 홍수 조기경보 시스템 종이 수행평가 5쪽의 손글씨를 그대로 읽고, 근거에 따라 성취수준을 제안합니다. 학생 개인 식별 정보는 1쪽에서만 판독하세요.

[중요한 채점 원칙]
- 빈칸, 근거 누락, 사례 번호/값 누락을 관대하게 추정하지 마세요. 확인할 수 없는 자필은 확실한 오답으로 단정하지 말고 uncertain_fields에 기록하세요.
- 예시와 다른 합리적 센서·임계값도 데이터 근거와 일관성이 있으면 인정합니다.
- 전체 경보 규칙은 '선택한 3개 센서 중 위험 신호가 2개 이상이면 경보' 입니다.
- 1쪽: 데이터 3개 선택, 이유, 데이터뱅크 홍수 O 3건+X 3건의 사례와 선택값. 2쪽: O 사례 2개 이상 근거로 특징, 홍수 X 반례, O/X의 특징과 결론.
- 3쪽: 센서 3개, 각 위험 임계값과 사례 번호·실제 값, 2/3 규칙, 데이터 분석에 연결된 전략 이유.
- 4쪽: 입력·처리·출력, 자연어 알고리즘 5단계 이상 및 2/3 경보 규칙.
- 5쪽: TEST 데이터 기준과 위험 신호 O/X, 위험 신호 개수, 경보/정상 결과, 일관된 이유. 위험 신호 3개인데 정상이라 쓰면 불일치입니다.
- 데이터 영역 40점: 상=적절한 수집 + O/X 6사례 정확 + 반례·수치와 근거를 갖춘 구체적 분석; 중상=수집·비교와 대체로 일관된 분석; 중=기초 데이터와 일부 분석, 근거 부족; 기초=수집은 있으나 의미 있는 비교·분석 부재 또는 심각한 누락; 미제출=해당 영역 기록 없음.
- 전략 영역 30점: 상=센서·임계값 3개와 데이터 사례 실제 값의 구체적 연결 및 2/3 규칙·설명; 중상=기준과 근거 대체로 정합; 중=전략은 선택하나 이유/기준 일부 부족; 기초=전략 단서만 있고 핵심 수치·기준·연결 누락; 미제출=전략 기록 없음.
- 알고리즘 영역 30점: 상=입력·처리·출력, 자연어 5단계 이상, 규칙·시험 일관됨; 중상=대체로 논리적이나 부수적 누락; 중=일부 절차 또는 주요 요소 있지만 구체성 부족; 기초=알고리즘 핵심 절차 누락/시험 결과 모순; 미제출=전체 영역 응답 없음. 입력/처리/출력 일부와 TEST 응답이 있다면 무조건 미제출로 단정하지 마세요.
- 학생이 적은 말과 문항을 그대로 근거로 삼고, 억지로 읽어내지 마세요. 보이지 않는 부분을 만들어 내지 마세요. 개인정보를 피드백 문장에 반복하지 마세요.

JSON 객체 하나만 반환하세요:
{"identity":{"number":null,"name":null,"confidence":"낮음","evidence":"1쪽에 실제 보이는 자필 근거"},"grades":{"data":{"level":"기초","reason":"근거 있는 2~3문장"},"strategy":{"level":"기초","reason":"근거 있는 2~3문장"},"algorithm":{"level":"기초","reason":"근거 있는 2~3문장"}},"summary":"교사용 종합 의견","uncertain_fields":["판독이 불확실한 필기"]}.
level은 상|중상|중|기초|미제출, identity.confidence는 높음|보통|낮음만 허용합니다.`;
function clean(v,max=1000){return String(v??'').slice(0,max)}

exports.gradeAnswer=onCall({region:'asia-northeast3',memory:'512MiB',timeoutSeconds:120,maxInstances:2,secrets:[OPENAI_API_KEY]},async request=>{
  if(!request.auth?.uid)throw new HttpsError('unauthenticated','교사 로그인이 필요합니다.');
  const firebaseDb=admin.firestore();
  const teacher=await firebaseDb.doc(`teachers/${request.auth.uid}`).get();
  if(!teacher.exists)throw new HttpsError('permission-denied','등록된 교사만 AI 채점할 수 있습니다.');
  const {submissionId,images}=request.data||{};
  if(typeof submissionId!=='string'||!/^[-a-f0-9]{30,60}$/i.test(submissionId))throw new HttpsError('invalid-argument','학생 답안 ID가 올바르지 않습니다.');
  const sref=firebaseDb.doc(`submissions/${submissionId}`),snap=await sref.get();
  if(!snap.exists||snap.data().status!=='ready'||snap.data().finalized)throw new HttpsError('failed-precondition','준비된 미확정 답안만 분석할 수 있습니다.');
  if(!Array.isArray(images)||images.length!==5||images.some(v=>typeof v!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v)||v.length>1600000)||images.reduce((a,v)=>a+v.length,0)>7500000)throw new HttpsError('invalid-argument','이미지 5쪽이 필요하며 총 전송 크기는 7.5MB 이하입니다.');
  const file=admin.storage().bucket().file(snap.data().pdfPath);
  const [exists]=await file.exists();if(!exists)throw new HttpsError('failed-precondition','학생 PDF 파일이 없습니다.');
  const secret=OPENAI_API_KEY.value();if(!secret)throw new HttpsError('failed-precondition','OPENAI_API_KEY 비밀키가 설정되지 않았습니다.');
  const content=[{type:'text',text:PROMPT}];images.forEach((src,i)=>{content.push({type:'text',text:`답안 ${i+1}/5쪽`},{type:'image_url',image_url:{url:src,detail:'high'}})});
  let result;try{
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),105000);
    try{const resp=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Authorization':`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',messages:[{role:'user',content}],response_format:{type:'json_object'},max_tokens:2000,temperature:0}),signal:abort.signal});
      const json=await resp.json();if(!resp.ok)throw Error(`OpenAI API 상태 ${resp.status}: ${clean(json?.error?.message,100)}`);result=JSON.parse(json.choices?.[0]?.message?.content||'{}');
    }finally{clearTimeout(timer)}
  }catch(e){throw new HttpsError('unavailable','AI 분석 실패: '+clean(e.message,140))}
  if(!result||typeof result!=='object')throw new HttpsError('internal','AI 결과 형식 오류');
  const grades={};for(const area of AREAS){const g=result.grades?.[area];if(!g||!LEVELS.includes(g.level))throw new HttpsError('internal','AI 성취수준 분석 결과 형식 오류');grades[area]={level:g.level,reason:clean(g.reason,1500)}}
  const id=result.identity||{},recognizedNo=clean(id.number,50).trim(),recognizedName=clean(id.name,80).trim(),confidence=['높음','보통','낮음'].includes(id.confidence)?id.confidence:'낮음';
  const row=snap.data(),expected=await firebaseDb.doc(`roster/${row.classNo}-${row.assignedNo}`).get();
  const numMatches=recognizedNo.replace(/^0+/,'')===String(row.assignedNo),nameMatches=recognizedName.replace(/\s/g,'')===String(expected.data()?.name||'').replace(/\s/g,'');
  const identityStatus=numMatches&&nameMatches?'AI 일치·교사 확인 필요':(recognizedNo&&recognizedName&&confidence!=='낮음'?'AI 불일치':'AI 판독 불확실');
  await sref.update({aiGrade:grades,aiSummary:clean(result.summary,2500),aiUncertain:Array.isArray(result.uncertain_fields)?result.uncertain_fields.slice(0,12).map(v=>clean(v,200)):[],recognizedNo,recognizedName,recognizedConfidence:confidence,identityStatus:row.identityConfirmed?'교사 확인':identityStatus,aiStatus:'AI 완료',updatedAt:admin.firestore.FieldValue.serverTimestamp()});
  return {ok:true,identity:{number:recognizedNo,name:recognizedName,confidence,match:numMatches&&nameMatches},grades};
});
