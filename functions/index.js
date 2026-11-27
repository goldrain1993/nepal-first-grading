'use strict';
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {defineSecret}=require('firebase-functions/params');
const admin=require('firebase-admin');
const {testValueCheck}=require('./test-rules');
const {auditGradingProposal}=require('./grading-validation');
admin.initializeApp();
const OPENAI_API_KEY=defineSecret('OPENAI_API_KEY');
const AREAS=['data','strategy','algorithm'];
const LEVELS=['상','중상','중','기초','미제출'];
const PROMPT="당신은 대한민국 중학교 1학년 정보 교사의 네팔 홍수 경보 수행평가 AI 채점 보조자입니다. 학생 종이 답안은 1~5장일 수 있고 원본 누락 페이지가 있을 수 있습니다.\nPDF는 학생별 STEP 1 첫 장 → STEP 1 계속 → STEP 2 전략 → STEP 3 알고리즘 → STEP 4 TEST 순서로 정렬돼 있으며, 일부 단계 페이지가 없을 수 있습니다. 없는 페이지의 답을 추측하지 말고 판독 불가 항목으로 기록하세요.\n전제: 고른 3개 센서 중 위험 기준 이상인 센서가 2개 이상이면 대피 경보, 1개 이하이면 정상. 학생이 고른 센서와 기준을 일관되게 적용했는지가 중요합니다.\nSTEP 1: 데이터 3개 선택과 이유, 홍수 O사례 3개·X사례 3개 선정 및 사례번호/홍수여부, 이어지는 특징·반례·결론을 평가합니다.\n***중요: STEP 1 데이터뱅크 '선택 데이터 ①·②·③' 칸은 수행평가지에 따라 있거나 없습니다. 선택 데이터 수치를 적었는지, 맞게/틀리게 적었는지는 아예 채점하지 않습니다. 빈칸/오답 감점 금지, 정답 가점 금지. 오직 해당 칸은 평가 대상에서 제외합니다.***\nSTEP 2: 학생이 선택한 센서 3개, 위험 임계값과 데이터 근거, 사례번호/값, 2/3 규칙 및 합리적인 이유.\nSTEP 3: 입력·처리·출력, 자연어 알고리즘 5단계 이상, 임계값 판단과 2/3 규칙의 일관성.\nSTEP 4: TEST 하나(1~6번)를 받아 TEST 값과 위험 신호 O/X, 위험 신호 수, 경보/정상 및 근거를 씁니다.\n***STEP 4의 'TEST 값'은 표현이 애매하므로 다음 두 방식 모두 정답 처리: (1) 학생에게 배정된 TEST 번호: TEST1~TEST6 혹은 숫자 1~6, (2) 배정받은 TEST에 해당하는 센서 관측값. 어떠한 방식이든 추가 가점 없음. 유효한 TEST 번호도 아니고 6개 TEST 데이터에 존재하는 센서값도 아니면 틀림. 배정 테스트 번호가 확실한 경우 그 번호와 대응하는 센서값을 확인. 확실하지 않다면 임의로 할당하지 말고 불확실로 표시하세요.***\n실제 공식 TEST 데이터: 기온 ℃ / 강우량 mm/h / 진동 0~10 / 수위 m / 유속 m/s\nTEST 1: 22.0 / 10 / 8.6 / 3.5 / 2.8\nTEST 2: 18.0 / 88 / 2.7 / 3.6 / 3.0\nTEST 3: 19.0 / 20 / 6.5 / 4.1 / 3.4\nTEST 4: 23.5 / 5 / 8.0 / 2.0 / 1.5\nTEST 5: 16.0 / 72 / 2.3 / 2.7 / 2.1\nTEST 6: 20.5 / 35 / 7.0 / 3.8 / 2.9\n주의: TEST별 경보 정답은 고정되어 있지 않음. 학생이 선택한 3개 센서의 위험 기준에 따라 위험 신호를 세어 판단합니다.\n영역: data(40점), strategy(30점), algorithm(30점). 각 영역마다 독립적으로 상/중상/중/기초/미제출 중 단 한 수준을 제안하고, 영역별 실제 학생 필기 근거를 구체적으로 적으세요. 세 영역 모두 동일한 수준을 기본값으로 두지 마세요. 학생마다 같은 수준이나 60점으로 고정하지 마세요. 단, 서로 다른 영역에서 실제로 같은 수준이라는 근거가 확인되면 동일 수준 자체를 금지하는 것은 아닙니다.\n채점수준 공통 판정 규칙:\n- 상: 해당 영역의 핵심 요소를 모두 충족하고 판단·설명이 정확하고 일관됨.\n- 중상: 핵심 요소 대부분을 충족하지만 부분적인 근거 부족, 작은 생략 또는 비핵심 오류가 있음.\n- 중: 일부 핵심 요소를 충족하고 유의미한 시도가 있으나 주요 근거·설명·논리 중 하나 이상이 부족함.\n- 기초: 핵심 요소를 상당 부분 누락했거나 판단·논리 오류가 크고 충분한 근거가 없음. 필기가 있다는 사실만으로 중을 주지 말 것.\n- 미제출: 실제 문항 페이지에서 답이 전혀 없는 것이 확인된 경우만 해당. 스캔 글씨가 안 읽히거나 페이지가 없을 때는 판독불가로 표시하고 미제출로 감점하지 말 것.\ndata: (1) 센서 3개 선택 및 선택 이유, (2) 홍수 O 3개·X 3개 사례 판단, (3) 관측 특징, 반례, 데이터 기반 결론을 각각 평가. 데이터뱅크 '선택 데이터' 칸은 무조건 평가 제외.\nstrategy: (1) 센서 3개의 위험 임계값, (2) 관련 사례번호·관측값을 통한 근거, (3) 위험 신호 2개 이상 경보 규칙 및 선택 이유를 평가.\nalgorithm: (1) 입력·처리·출력 구조, (2) 실제 구현 가능한 자연어 절차 5단계 이상, (3) 센서 임계값·위험 신호 합산·경보 결정의 논리적 일치와 STEP 4 TEST 결과를 평가.\n각 reason에는 확인된 학생 답변의 구체적인 특징 1개 이상과 부족하거나 잘한 요소 1개 이상을 서술하세요. '전반적으로 보통' 또는 '근거'처럼 학생별 특징 없는 일반 문구 금지. 판단이 애매하면 불확실 필드에 구체적으로 명시하고 없는 내용을 지어내지 마세요.\n이미지에 없는 답은 만들지 마세요. 이름은 첫 장에서만 판독하고 채점 근거에는 개인정보를 반복하지 마세요.\n반드시 단일 JSON 객체 하나만 반환하세요. 필요 최상위 필드: identity, grades, summary, uncertain_fields, assigned_test_no, test_entries.\nidentity: {number: 첫 장의 학번을 읽은 문자열(없으면 빈 문자열), name: 읽은 이름(없으면 빈 문자열), confidence: 높음 또는 보통 또는 낮음}.\ngrades: {data:{level,reason},strategy:{level,reason},algorithm:{level,reason}}. level에는 '상','중상','중','기초','미제출' 중 실제 판단에 근거한 정확히 한 값을 넣고, 각 reason에는 학생이 작성한 실제 답의 구체적 근거를 넣으세요.\nsummary: 전체 채점 의견을 담은 문자열. uncertain_fields: 판독이 불확실한 사항들의 문자열 배열. assigned_test_no: TEST 번호를 명확하게 읽었으면 1~6 정수, 아니면 null. test_entries: [{sensor:읽은 센서명 문자열,value:실제 기입 문자열}] 배열.\n위 필드 설명은 출력 형식이며 답안 예시나 특정 점수의 권장값이 아닙니다. 프롬프트 문구를 학생 답변으로 복사하지 마세요.\ntest_entries에는 STEP 4 TEST 값 칸에서 실제 읽은 각 행의 센서 이름과 기입한 문자열을 기록하고, 배정 TEST 번호가 명확히 확인될 때만 assigned_test_no를 1~6으로 기록하세요. 불확실하면 null. level은 상|중상|중|기초|미제출, confidence는 높음|보통|낮음입니다.\n[세부 평가 증거 필수]\n학생별 9개 요소를 먼저 평가한 다음 수준을 정하세요. 인쇄된 문제·예시·이 지시문은 학생 답안이 아닙니다. 60점이나 '중'을 기본값으로 두거나 점수 분포를 인위적으로 변경하지 마세요. 동점이 합당하면 그대로 두세요.\n각 영역 grades.data/strategy/algorithm은 level,reason뿐 아니라 checks 객체를 반드시 포함합니다. checks의 각 항목은 {status,page,observed} 형태입니다. status는 '충족'/'부분'/'미충족'/'판독불가'입니다. page는 학생 PDF의 실제 페이지 번호(1부터 시작), 판독불가일 때는 null 가능. observed는 실제 손글씨에서 확인한 센서명·사례번호·숫자·설명·절차, 또는 해당 문항 답란이 비어 있는 구체적인 사실입니다. 문항 인쇄 텍스트를 답안으로 인용하지 마세요.\n'미충족'은 해당 페이지를 직접 확인해 답변이 없거나 핵심 오류가 확인된 경우에만 사용합니다. 페이지가 누락되거나 필기가 흐리면 판독불가이며 추측해 감점하지 않습니다.\ndata.checks: selection(3개 센서 선택과 이유, 단 STEP1 데이터뱅크 '선택 데이터' 수치 기입 여부 완전히 제외), cases(홍수 O 3·X 3 사례번호와 홍수여부), inference(관측 특징·반례·데이터 근거·결론).\nstrategy.checks: thresholds(선택 3개 센서의 위험 기준값), grounds(관측 사례·실제 측정값을 통한 기준 근거), rule(위험 2개 이상 경보 규칙과 이유).\nalgorithm.checks: io(입력·처리·출력), steps(실행 가능한 자연어 5단계 이상), test(STEP3과 STEP4의 TEST 번호·센서값·위험 신호 수·경보 결과의 일관성).\n상=3개 핵심 요소 모두 충족, 중상=대부분 충족하되 작은 부족, 중=일부 핵심 요소는 했으나 주요 부족, 기초=대부분 부족 또는 중대한 판단 오류, 미제출=실제 확인한 문항이 모두 빈칸. 각 영역 reason에는 실제 학생 필기의 구체적인 관찰과 수준을 정한 이유를 20글자 이상 설명하세요.\n판독하지 못한 항목은 반드시 판독불가입니다. 모든 세 영역에 3개씩 총 9개 checks를 빠짐없이 내보내세요. 형식 예시(실제 학생 판정이 아님): grades.data.checks.selection={\"status\":\"부분\",\"page\":1,\"observed\":\"강우량·수위·진동을 선택했으나 진동 선택 이유가 없다\"}.";
function clean(v,max=1000){return String(v??'').slice(0,max)}

function openAiFailure(e,task){
 const status=Number(e?.apiStatus)||0;
 if(status===401)return new HttpsError('failed-precondition','OpenAI API 키 인증 실패(401): 공식 OpenAI Platform에서 발급한 키를 Firebase Secret에 새로 등록하고 두 AI 함수를 재배포하세요.');
 if(status===403)return new HttpsError('permission-denied','OpenAI API 접근 거부(403): 프로젝트의 모델 사용 권한과 API 키 권한을 확인하세요.');
 if(status===429)return new HttpsError('resource-exhausted','OpenAI API 요청 제한 또는 크레딧 부족(429): OpenAI Platform의 결제·사용 한도를 확인하세요.');
 if(status===400)return new HttpsError('failed-precondition','OpenAI API 요청 형식 오류(400): 모델·API 접근 설정을 확인하세요.');
 if(status>=500)return new HttpsError('unavailable','OpenAI API 서버 응답 오류('+status+'): 잠시 후 다시 시도하세요.');
 return new HttpsError('unavailable',task+' 실패: AI 서버 통신 오류가 발생했습니다. Firebase 함수 로그를 확인하세요.');
}

exports.gradeAnswerV2=onCall({region:'asia-northeast3',memory:'512MiB',timeoutSeconds:120,maxInstances:2,secrets:[OPENAI_API_KEY]},async request=>{
  if(!request.auth?.uid)throw new HttpsError('unauthenticated','교사 로그인이 필요합니다.');
  const firebaseDb=admin.firestore();
  const teacher=await firebaseDb.doc(`teachers/${request.auth.uid}`).get();
  if(!teacher.exists)throw new HttpsError('permission-denied','등록된 교사만 AI 채점할 수 있습니다.');
  const {submissionId,images}=request.data||{};
  if(typeof submissionId!=='string'||!/^[-a-f0-9]{30,60}$/i.test(submissionId))throw new HttpsError('invalid-argument','학생 답안 ID가 올바르지 않습니다.');
  const sref=firebaseDb.doc(`submissions/${submissionId}`),snap=await sref.get();
  if(!snap.exists||snap.data().status!=='ready'||snap.data().finalized)throw new HttpsError('failed-precondition','준비된 미확정 답안만 분석할 수 있습니다.');
  if(!Array.isArray(images)||(images.length<1||images.length>5)||images.some(v=>typeof v!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v)||v.length>1600000)||images.reduce((a,v)=>a+v.length,0)>7500000)throw new HttpsError('invalid-argument','이미지 1~5쪽이 필요하며 총 전송 크기는 7.5MB 이하입니다.');
  const file=admin.storage().bucket().file(snap.data().pdfPath);
  const [exists]=await file.exists();if(!exists)throw new HttpsError('failed-precondition','학생 PDF 파일이 없습니다.');
  const secret=OPENAI_API_KEY.value();if(!secret)throw new HttpsError('failed-precondition','OPENAI_API_KEY 비밀키가 설정되지 않았습니다.');
  const content=[{type:'text',text:PROMPT}];images.forEach((src,i)=>{content.push({type:'text',text:`답안 ${i+1}/${images.length}쪽`},{type:'image_url',image_url:{url:src,detail:'high'}})});
  let result;try{
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),105000);
    try{const resp=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Authorization':`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',messages:[{role:'user',content}],response_format:{type:'json_object'},max_tokens:6000,temperature:0}),signal:abort.signal});
      const json=await resp.json();if(!resp.ok){const err=new Error('OpenAI API 호출 실패');err.apiStatus=resp.status;throw err;}result=JSON.parse(json.choices?.[0]?.message?.content||'{}');
    }finally{clearTimeout(timer)}
  }catch(e){if(e instanceof HttpsError)throw e;throw openAiFailure(e,'AI 채점')}
  if(!result||typeof result!=='object')throw new HttpsError('internal','AI 결과 형식 오류');
   let audit;
   try{audit=auditGradingProposal(result,{pageCount:images.length,missingRoles:snap.data().missingRoles});}
   catch(e){throw new HttpsError('failed-precondition','AI 채점 근거가 충분하지 않아 점수를 저장하지 않았습니다. '+clean(e.message,160));}
   const {grades,checks,reviewReasons}=audit;
  const assignedTestNo=Number.isInteger(Number(result.assigned_test_no))&&Number(result.assigned_test_no)>=1&&Number(result.assigned_test_no)<=6?Number(result.assigned_test_no):null;
  const testChecks=Array.isArray(result.test_entries)?result.test_entries.slice(0,5).map(e=>{
    const sensor=clean(e.sensor,50),value=clean(e.value,100),check=testValueCheck(value,sensor,assignedTestNo);
    return {sensor,value,valid:check.valid,reason:check.reason,basis:check.basis};
  }):[];
  const id=result.identity||{},recognizedNo=clean(id.number,50).trim(),recognizedName=clean(id.name,80).trim(),confidence=['높음','보통','낮음'].includes(id.confidence)?id.confidence:'낮음';
  const row=snap.data(),expected=await firebaseDb.doc(`roster/${row.classNo}-${row.assignedNo}`).get();
  const numMatches=recognizedNo.replace(/^0+/,'')===String(row.assignedNo),nameMatches=recognizedName.replace(/\s/g,'')===String(expected.data()?.name||'').replace(/\s/g,'');
  const identityStatus=numMatches&&nameMatches?'AI 일치·교사 확인 필요':(recognizedNo&&recognizedName&&confidence!=='낮음'?'AI 불일치':'AI 판독 불확실');
   // 누락/판독불가가 있는 답안을 추측해 점수화하지 않는다. 교사 확정점수는 수정하지 않는다.
   const commitIfUnfinalized=async fields=>firebaseDb.runTransaction(async tx=>{
     const latest=await tx.get(sref);
     if(!latest.exists||latest.data().finalized||latest.data().status!=='ready'||latest.data().pdfPath!==row.pdfPath)
       throw new HttpsError('failed-precondition','재채점 중 답안이 변경되거나 점수가 확정되었습니다. AI 결과를 저장하지 않았습니다.');
     tx.update(sref,fields);
   });
   const auditFields={aiChecks:checks,aiReviewReasons:reviewReasons,
     aiSummary:clean(result.summary,2500),
     aiUncertain:Array.isArray(result.uncertain_fields)?result.uncertain_fields.slice(0,12).map(v=>clean(v,200)):[],
     recognizedNo,recognizedName,recognizedConfidence:confidence,
     identityStatus:row.identityConfirmed?'교사 확인':identityStatus,
     testValueChecks:testChecks,aiError:'',updatedAt:admin.firestore.FieldValue.serverTimestamp()};
   if(reviewReasons.length){
     await commitIfUnfinalized({...auditFields,aiCandidateGrade:grades,aiStatus:'교사 확인 필요'});
     return {ok:true,gradingVersion:2,reviewRequired:true,reviewReasons,identity:{number:recognizedNo,name:recognizedName,confidence,match:numMatches&&nameMatches}};
   }
   await commitIfUnfinalized({...auditFields,aiGrade:grades,aiCandidateGrade:null,aiStatus:'AI 완료'});
   return {ok:true,gradingVersion:2,reviewRequired:false,identity:{number:recognizedNo,name:recognizedName,confidence,match:numMatches&&nameMatches},grades};
});


// 학생 이름이 있는 첫 장과 STEP을 이미지에서 판독하는 AI 페이지 분류기.
// 교사의 직접 실행/확인 필요, 스캔본 이미지가 외부 AI에 전송됨.

// 오류 진단에서는 학생 이름, 학번, PDF 이미지 또는 OpenAI 키 문자열을 기록하지 않는다.
function logInspectFailure(stage,err){
 const safe={stage,type:String(err?.name||'Error').slice(0,50),
  code:String(err?.code||'').slice(0,90),
  apiStatus:Number(err?.apiStatus)||undefined,
  causeCode:String(err?.cause?.code||'').slice(0,90)};
 console.error('INSPECT_PAGES_DIAGNOSTIC',safe);
}
function httpError(status){
 const e=new Error('OpenAI returned error status');
 e.apiStatus=status;
 return e;
}

exports.inspectPages=onCall({
 region:'asia-northeast3',memory:'512MiB',timeoutSeconds:120,maxInstances:2,secrets:[OPENAI_API_KEY]
},async request=>{
 let stage='firebase-auth';
 try{
  if(!request.auth?.uid)throw new HttpsError('unauthenticated','교사 로그인이 필요합니다.');
  stage='firestore-teacher-check';
  const teacher=await admin.firestore().doc('teachers/'+request.auth.uid).get();
  if(!teacher.exists)throw new HttpsError('permission-denied','등록된 교사 권한을 찾지 못했습니다.');
  stage='firebase-secret';
  const secret=OPENAI_API_KEY.value();
  if(!secret)throw new HttpsError('failed-precondition','OPENAI_API_KEY 비밀키가 등록되지 않았습니다.');

  // 155쪽 스캔 파일을 다시 분석하지 않고 인증/네트워크/모델 사용가능 여부만 확인.
  // 진단에는 학생 이미지와 개인정보가 사용되지 않는다.
  if(request.data?.diagnose===true){
    stage='openai-network';
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const models=await fetch('https://api.openai.com/v1/models/gpt-4.1-mini',{
        method:'GET',headers:{Authorization:'Bearer '+secret},signal:controller.signal
      });
      if(!models.ok)throw httpError(models.status);
    }finally{clearTimeout(timer);}
    stage='openai-text-inference';
    const controller2=new AbortController(),timer2=setTimeout(()=>controller2.abort(),20000);
    try{
      const response=await fetch('https://api.openai.com/v1/chat/completions',{
        method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},
        body:JSON.stringify({model:'gpt-4.1-mini',messages:[{role:'user',content:'Reply OK.'}],max_tokens:8,temperature:0}),
        signal:controller2.signal
      });
      if(!response.ok)throw httpError(response.status);
    }finally{clearTimeout(timer2);}
    return {ok:true,auth:'ok',firestore:'ok',secret:'ok',openai:'ok',model:'gpt-4.1-mini'};
  }

  stage='image-validation';
  const images=request.data?.images;
  if(!Array.isArray(images)||images.length<1||images.length>6||
      images.some(v=>typeof v!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v)||v.length>1500000)||
      images.reduce((sum,v)=>sum+v.length,0)>8000000)
    throw new HttpsError('invalid-argument','한 번에 1~6쪽, 이미지당 1.5MB 이하로 전송하세요.');

  const content=[{type:'text',text:[
    '역할: 중학교 1학년 네팔 홍수 조기경보 시스템 수행평가의 인쇄된 5종 양식을 페이지 이미지로 판별한다. 반드시 **각 이미지의 실제 인쇄 제목, 문항 번호, 표/칸 배치**를 보고 분류한다.',
    '실제 학생 답안은 손글씨가 있어도 페이지 역할을 알 수 있고, 일부 장이 빠지거나 서로 순서가 바뀔 수 있다. 학생당 1~5장이다. 페이지 번호/전달 순서나 5장 묶음으로 추정하지 말라.',
    '모든 장에 공통으로 인쇄되는 상단의 중학교 1학년 정보/네팔 홍수 조기경보 시스템 수행평가라는 머리글은 구분 근거가 아니다.',
    'front = STEP 1. 데이터 수집·분석 [40점], 첫 학생 페이지. 학번·이름을 쓰는 칸이 있고, 문항 1 '+
      '"홍수를 판단할 때 중요하다고 생각하는 데이터 3가지", 문항 2 "왜 이 3가지를 골랐나요?", 문항 3 "데이터뱅크에서 홍수 O 사례 3개와 홍수 X 사례 3개" 및 사례/홍수 O/X 표가 있다.',
    'data-cont = STEP 1 계속 - 데이터에서 특징 찾기. 문항 4 "홍수 O 사례를 보고 발견한 특징", 문항 5 "값 하나만 높지만 홍수 X인 사례" (반례), 문항 6 "데이터 분석 결과를 쉬운 말로 정리" 및 ①②③④의 설명 칸이 있다.',
    'strategy = STEP 2. 문제 해결 전략 선택 [30점]. 사용할 센서 3개 선택, 표 "선택한 센서 / 위험 기준값 / 근거 사례 / 그 사례에서 본 값" 3줄, 위험 신호 2개 이상 경보 규칙과 이유 작성란이 있다.',
    'algorithm = STEP 3. 알고리즘 설계 [30점]. "입력·처리·출력" 3행 표와 자연어 알고리즘 ①~⑦ 순서(센서값 확인→위험 신호 세기→경보/정상)가 있다.',
    'test = STEP 4. 내 알고리즘 시험하기. "센서 / TEST 값 / 내 위험 기준 / 위험 신호?" 표와 O/X 체크칸, 문항 2 위험 신호 개수, 문항 3 경보/정상, 문항 4 판단 이유 및 제출 전 마지막 확인 체크 목록이 있다.',
    '한 장에 STEP 글자가 희미하거나 보이지 않아도 **위 문항 번호·표 배치·선택지 모양**과 일치하면 해당 role로 분류한다. 학번/이름 칸이 실제로 있는지는 front의 보조 단서이며 손글씨 이름이 읽혀야만 front로 인정하는 것은 아니다.',
    'confidence 높음: 위 인쇄 문항 제목이나 고유 표의 형태가 분명하게 일치. 보통: 형태/문항 일부만 확인되어 다른 단계일 가능성이 조금 있음. 낮음: 인쇄가 심하게 잘렸거나 알아볼 근거가 부족함.',
    'unknown은 정말로 문항·레이아웃 어느 쪽으로도 구분할 수 없는 장에만 사용한다. 자신이 분류한 근거(눈에 보이는 문항/표)를 reason 1문장으로 적는다. 내용을 지어내면 안 된다.',
    'studentNo/studentName은 front 장에 직접 쓰인 학번·이름이 확실히 읽히는 경우만 기록하고, 다른 장에서는 무조건 빈 문자열. 성별 등은 추측하지 않는다.',
    '입력 이미지마다 순서대로 결과를 1개씩 반환하며 pages 배열의 길이는 입력 이미지 수와 반드시 동일해야 한다.',
    'JSON 객체 하나로 반환: {"pages":[{"role":"front","studentNo":"","studentName":"","confidence":"높음","reason":"학번 이름 칸 및 데이터뱅크 O/X 표"}]}',
    'role는 front|data-cont|strategy|algorithm|test|unknown, confidence는 높음|보통|낮음 중 하나.'
  ].join('\n')}];
  images.forEach((src,i)=>{
    content.push({type:'text',text:'원본 페이지 '+(i+1)});
    content.push({type:'image_url',image_url:{url:src,detail:'high'}});
  });
  stage='openai-image-inference';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),95000);
  let result;
  try{
    const resp=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},
      body:JSON.stringify({model:'gpt-4.1-mini',messages:[{role:'user',content}],response_format:{type:'json_object'},max_tokens:1800,temperature:0}),
      signal:controller.signal
    });
    if(!resp.ok)throw httpError(resp.status);
    const data=await resp.json();
    stage='openai-image-response';
    result=JSON.parse(data.choices?.[0]?.message?.content||'{}');
  }finally{clearTimeout(timer);}
  stage='response-validation';
  if(!Array.isArray(result.pages)||result.pages.length!==images.length)
    throw new HttpsError('failed-precondition','AI 페이지 분류 결과 개수가 일치하지 않습니다.'); 
  const allowed=['front','data-cont','strategy','algorithm','test','unknown'];
  return {pages:result.pages.map(p=>({
    role:allowed.includes(p.role)?p.role:'unknown',
    studentNo:clean(p.studentNo,24),
    studentName:clean(p.studentName,60),
    confidence:['높음','보통','낮음'].includes(p.confidence)?p.confidence:'낮음',
    reason:clean(p.reason,120)
  }))};
 }catch(error){
  logInspectFailure(stage,error);
  if(error instanceof HttpsError)throw error;
  if(error?.apiStatus)throw openAiFailure(error,'AI 페이지 분석');
  if(error?.name==='AbortError')throw new HttpsError('deadline-exceeded','AI 진단/분석 단계 '+stage+'에서 요청 시간이 초과됐습니다.');
  throw new HttpsError('internal','AI 서버 내부 오류 발생 단계: '+stage+'. Cloud Run 로그에서 INSPECT_PAGES_DIAGNOSTIC을 확인하세요.');
 }
});
