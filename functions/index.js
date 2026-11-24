'use strict';
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {defineSecret}=require('firebase-functions/params');
const admin=require('firebase-admin');
const {testValueCheck}=require('./test-rules');
admin.initializeApp();
const OPENAI_API_KEY=defineSecret('OPENAI_API_KEY');
const AREAS=['data','strategy','algorithm'];
const LEVELS=['상','중상','중','기초','미제출'];
const PROMPT="당신은 대한민국 중학교 1학년 정보 교사의 네팔 홍수 경보 수행평가 AI 채점 보조자입니다. 학생 종이 답안은 1~5장일 수 있고 원본 누락 페이지가 있을 수 있습니다.\nPDF는 학생별 STEP 1 첫 장 → STEP 1 계속 → STEP 2 전략 → STEP 3 알고리즘 → STEP 4 TEST 순서로 정렬돼 있으며, 일부 단계 페이지가 없을 수 있습니다. 없는 페이지의 답을 추측하지 말고 판독 불가 항목으로 기록하세요.\n전제: 고른 3개 센서 중 위험 기준 이상인 센서가 2개 이상이면 대피 경보, 1개 이하이면 정상. 학생이 고른 센서와 기준을 일관되게 적용했는지가 중요합니다.\nSTEP 1: 데이터 3개 선택과 이유, 홍수 O사례 3개·X사례 3개 선정 및 사례번호/홍수여부, 이어지는 특징·반례·결론을 평가합니다.\n***중요: STEP 1 데이터뱅크 '선택 데이터 ①·②·③' 칸은 수행평가지에 따라 있거나 없습니다. 선택 데이터 수치를 적었는지, 맞게/틀리게 적었는지는 아예 채점하지 않습니다. 빈칸/오답 감점 금지, 정답 가점 금지. 오직 해당 칸은 평가 대상에서 제외합니다.***\nSTEP 2: 학생이 선택한 센서 3개, 위험 임계값과 데이터 근거, 사례번호/값, 2/3 규칙 및 합리적인 이유.\nSTEP 3: 입력·처리·출력, 자연어 알고리즘 5단계 이상, 임계값 판단과 2/3 규칙의 일관성.\nSTEP 4: TEST 하나(1~6번)를 받아 TEST 값과 위험 신호 O/X, 위험 신호 수, 경보/정상 및 근거를 씁니다.\n***STEP 4의 'TEST 값'은 표현이 애매하므로 다음 두 방식 모두 정답 처리: (1) 학생에게 배정된 TEST 번호: TEST1~TEST6 혹은 숫자 1~6, (2) 배정받은 TEST에 해당하는 센서 관측값. 어떠한 방식이든 추가 가점 없음. 유효한 TEST 번호도 아니고 6개 TEST 데이터에 존재하는 센서값도 아니면 틀림. 배정 테스트 번호가 확실한 경우 그 번호와 대응하는 센서값을 확인. 확실하지 않다면 임의로 할당하지 말고 불확실로 표시하세요.***\n실제 공식 TEST 데이터: 기온 ℃ / 강우량 mm/h / 진동 0~10 / 수위 m / 유속 m/s\nTEST 1: 22.0 / 10 / 8.6 / 3.5 / 2.8\nTEST 2: 18.0 / 88 / 2.7 / 3.6 / 3.0\nTEST 3: 19.0 / 20 / 6.5 / 4.1 / 3.4\nTEST 4: 23.5 / 5 / 8.0 / 2.0 / 1.5\nTEST 5: 16.0 / 72 / 2.3 / 2.7 / 2.1\nTEST 6: 20.5 / 35 / 7.0 / 3.8 / 2.9\n주의: TEST별 경보 정답은 고정되어 있지 않음. 학생이 선택한 3개 센서의 위험 기준에 따라 위험 신호를 세어 판단합니다.\n영역: data 40점, strategy 30점, algorithm 30점. 기존 성취수준 상/중상/중/기초/미제출 중 제안. 빈칸/근거 누락은 추정하지 말고 분명하게 설명합니다.\n중요 채점: data 상=적절한 센서 선택 및 이유 + O/X 6개 사례 판단 + 반례/근거 분석(선택데이터 칸 절대 제외). strategy 상=3센서 임계값과 데이터 근거, 2/3 규칙과 설명. algorithm 상=입력·처리·출력과 5단계 이상 절차, 2/3 규칙 및 TEST 논리 일치. 일부 응답이 있으면 일괄 미제출로 판단하지 말 것.\n이미지에 없는 답은 만들지 마세요. 이름은 첫 장에서만 판독하고 채점 근거에는 개인정보를 반복하지 마세요.\nJSON 객체 하나만 반환:\n{\"identity\":{\"number\":\"\",\"name\":\"\",\"confidence\":\"낮음\"},\"grades\":{\"data\":{\"level\":\"중\",\"reason\":\"근거\"},\"strategy\":{\"level\":\"중\",\"reason\":\"근거\"},\"algorithm\":{\"level\":\"중\",\"reason\":\"근거\"}},\"summary\":\"교사용 의견\",\"uncertain_fields\":[],\"assigned_test_no\":null,\"test_entries\":[{\"sensor\":\"수위\",\"value\":\"3.8\"}]}\ntest_entries에는 STEP 4 TEST 값 칸에서 실제 읽은 각 행의 센서 이름과 기입한 문자열을 기록하고, 배정 TEST 번호가 명확히 확인될 때만 assigned_test_no를 1~6으로 기록하세요. 불확실하면 null. level은 상|중상|중|기초|미제출, confidence는 높음|보통|낮음입니다.";
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
  if(!Array.isArray(images)||(images.length<1||images.length>5)||images.some(v=>typeof v!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v)||v.length>1600000)||images.reduce((a,v)=>a+v.length,0)>7500000)throw new HttpsError('invalid-argument','이미지 1~5쪽이 필요하며 총 전송 크기는 7.5MB 이하입니다.');
  const file=admin.storage().bucket().file(snap.data().pdfPath);
  const [exists]=await file.exists();if(!exists)throw new HttpsError('failed-precondition','학생 PDF 파일이 없습니다.');
  const secret=OPENAI_API_KEY.value();if(!secret)throw new HttpsError('failed-precondition','OPENAI_API_KEY 비밀키가 설정되지 않았습니다.');
  const content=[{type:'text',text:PROMPT}];images.forEach((src,i)=>{content.push({type:'text',text:`답안 ${i+1}/${images.length}쪽`},{type:'image_url',image_url:{url:src,detail:'high'}})});
  let result;try{
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),105000);
    try{const resp=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Authorization':`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',messages:[{role:'user',content}],response_format:{type:'json_object'},max_tokens:3000,temperature:0}),signal:abort.signal});
      const json=await resp.json();if(!resp.ok)throw Error(`OpenAI API 상태 ${resp.status}: ${clean(json?.error?.message,100)}`);result=JSON.parse(json.choices?.[0]?.message?.content||'{}');
    }finally{clearTimeout(timer)}
  }catch(e){throw new HttpsError('unavailable','AI 분석 실패: '+clean(e.message,140))}
  if(!result||typeof result!=='object')throw new HttpsError('internal','AI 결과 형식 오류');
  const grades={};for(const area of AREAS){const g=result.grades?.[area];if(!g||!LEVELS.includes(g.level))throw new HttpsError('internal','AI 성취수준 분석 결과 형식 오류');grades[area]={level:g.level,reason:clean(g.reason,1500)}}
  const assignedTestNo=Number.isInteger(Number(result.assigned_test_no))&&Number(result.assigned_test_no)>=1&&Number(result.assigned_test_no)<=6?Number(result.assigned_test_no):null;
  const testChecks=Array.isArray(result.test_entries)?result.test_entries.slice(0,5).map(e=>{
    const sensor=clean(e.sensor,50),value=clean(e.value,100),check=testValueCheck(value,sensor,assignedTestNo);
    return {sensor,value,valid:check.valid,reason:check.reason,basis:check.basis};
  }):[];
  const id=result.identity||{},recognizedNo=clean(id.number,50).trim(),recognizedName=clean(id.name,80).trim(),confidence=['높음','보통','낮음'].includes(id.confidence)?id.confidence:'낮음';
  const row=snap.data(),expected=await firebaseDb.doc(`roster/${row.classNo}-${row.assignedNo}`).get();
  const numMatches=recognizedNo.replace(/^0+/,'')===String(row.assignedNo),nameMatches=recognizedName.replace(/\s/g,'')===String(expected.data()?.name||'').replace(/\s/g,'');
  const identityStatus=numMatches&&nameMatches?'AI 일치·교사 확인 필요':(recognizedNo&&recognizedName&&confidence!=='낮음'?'AI 불일치':'AI 판독 불확실');
  await sref.update({aiGrade:grades,aiSummary:clean(result.summary,2500),aiUncertain:Array.isArray(result.uncertain_fields)?result.uncertain_fields.slice(0,12).map(v=>clean(v,200)):[],recognizedNo,recognizedName,recognizedConfidence:confidence,identityStatus:row.identityConfirmed?'교사 확인':identityStatus,aiStatus:'AI 완료',testValueChecks:testChecks,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
  return {ok:true,identity:{number:recognizedNo,name:recognizedName,confidence,match:numMatches&&nameMatches},grades};
});
