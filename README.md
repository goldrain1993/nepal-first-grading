# 네팔 홍수 1차 수행평가 채점 웹앱 v3

**GitHub Pages(화면) + Firebase Authentication / Firestore / Storage(학생 자료) + 선택적 Firebase Cloud Functions(OpenAI 보조 채점)** 구조입니다. 기존 Render용 Python 서버는 필요하지 않습니다. **아직 라이브 사이트는 아니며**, GitHub·Firebase에서 아래 설정을 마치면 HTTPS 주소로 접속할 수 있습니다.

## 엑셀 양식 다운로드 · 학급/명단 자동 등록

- **설정** 또는 **학생 명단** 화면에서 `엑셀 양식 다운로드 (.xlsx)`를 눌러 파일을 받습니다.
- 첫 번째 `학생명단` 시트에 `학년, 반, 번호, 이름` 4개 열로 재학생을 입력합니다. 예시는 `작성안내` 시트에만 있습니다.
- **현재 웹앱은 1학년 전용**입니다. 학년 값이 1이 아닌 행은 오류로 차단하며, 다른 학년을 같은 반에 섞어 등록하지 않습니다.
- 한 반의 **전원 명단**을 입력해야 해당 반의 빈 번호가 결번으로 올바르게 계산됩니다.
- 1~20번은 남학생, 21번부터는 여학생으로 간주합니다. 남·여 시작/끝 번호는 명단에 실제로 존재하는 번호의 최소/최대값으로 계산합니다. 해당 성별 학생이 없으면 `—`로 표시합니다.
- 명단 번호의 최소값을 시작 번호, 최대값을 마지막 번호로 저장하고, 그 사이에 등장하지 않는 번호는 결번으로 자동 설정합니다. 학생 수는 번호 범위에서 결번을 뺀 값입니다.
- 먼저 **엑셀 검사·미리보기**를 눌러 반별 시작/끝 번호, 결번, 학생 수와 기존 명단 변경·삭제 건수를 확인합니다.
- 그다음 **확인 후 학급·명단 저장**을 눌러 Firestore에 반별 설정과 이름을 함께 반영합니다. 엑셀에 없는 다른 반은 삭제하거나 변경하지 않습니다.
- 이미 수행평가 답안이 업로드된 학급은 잘못된 학생 배정 방지를 위해 엑셀 일괄 교체를 차단합니다.
- 엑셀 파일은 브라우저 안에서 읽으며, 원본 엑셀 파일 자체를 GitHub에 업로드하지 않습니다. 실제 학생 자료 등록 전 학교 개인정보 지침을 확인합니다.
- 최대 2MB / 4,500명 / 50개 반, 한 번의 Firestore 변경은 450건 이내로 제한합니다. 한 번에 초과하면 반별로 나눠 등록하세요.

## 2026-11-24 추가: 누락·섞인 PDF와 채점 예외 규칙

### 학생별 PDF 1~5장, 이름 있는 첫 장 기준
- 더는 5쪽씩 기계적으로 분리하지 않습니다. 원본 각 페이지의 STEP을 분석하고, **학번·이름이 있는 STEP 1 첫 장**부터 다음 학생의 첫 장 직전까지를 1명으로 구분합니다. 한 학생에게 1~5장까지 허용합니다.
- 업로드 화면의 **PDF 장별 분석 시작**에서 텍스트 기반 STEP 판별을 수행합니다. 스캔 이미지처럼 텍스트가 없는 페이지는 **AI로 이름·STEP 자동 판별** 버튼을 통해 판별할 수 있습니다. 이 버튼은 Firebase `inspectPages` 함수 배포 및 OpenAI API 비밀키가 필요하며 비용·외부 데이터 전송이 발생합니다.
- 판별이 불확실한 페이지는 무작정 배정하지 않고 **새 학생 시작/STEP**을 교사가 직접 수정해야 합니다. 페이지 썸네일을 누르면 확대하여 볼 수 있습니다.
- 동일 학생 안에서 페이지가 STEP 4 → STEP 2 등의 순서로 섞여 있어도 STEP 1 첫 장 → STEP 1 계속 → STEP 2 → STEP 3 → STEP 4 순으로 정렬해 학생별 PDF를 새로 저장합니다. 누락된 장은 비어 있는 장을 생성하지 않고 **누락된 STEP**으로 기록합니다.
- 학생 수가 지정한 번호 범위(결번 제외)와 맞지 않거나 STEP 중복/미판별, 6장 이상인 경우에는 업로드를 차단합니다. 교사는 원본 이름·학번을 반드시 대조하고, 저장된 답안의 첫 장을 다시 확인해야 점수를 최종 확정할 수 있습니다.

### 평가 예외: STEP 1 선택 데이터, STEP 4 TEST 값
- **STEP 1 데이터뱅크 선택 데이터①②③**: 문항 버전에 따라 기입란이 없으므로 전부 **채점 제외**. 맞았다고 가점하지 않고 틀렸거나 비어 있어도 감점하지 않습니다. 단, 학생이 고른 홍수 O/X 사례, 반례와 분석 근거 등 다른 항목은 기존 기준대로 평가합니다.
- **STEP 4 1번 TEST 값**: `TEST1`~`TEST6`, `1`~`6`이라는 시험 번호 또는 해당 TEST의 실제 센서 측정값을 적은 것을 모두 허용합니다. 유효하지 않은 TEST 번호나 공식 TEST 수치와 맞지 않는 값은 틀린 값으로 처리합니다. 응답 판단은 학생이 선택한 센서·임계값을 일관되게 적용했는지 검토합니다.
- 공식 TEST1~6 수치는 `functions/test-rules.js`에 고정되며, `functions/index.js` AI 채점 프롬프트도 동일한 값을 사용합니다. AI 판독의 TEST 값 검증 결과는 교사 채점 화면에서 확인할 수 있습니다.
- 채점 화면은 1~5쪽만 출력하고, 누락된 STEP 및 원본 페이지의 순서도 함께 표시합니다.

### AI 함수 업데이트 필요
브라우저/GitHub Pages 코드는 main 브랜치 배포로 갱신되지만, **Cloud Functions는 GitHub 업로드만으로 갱신되지 않습니다.** Cloud Shell에서 프로젝트를 확인하고 실행하세요:

```bash
cd nepal-first-grading
git pull origin main
npm install --prefix functions
firebase deploy --only functions:gradeAnswer,functions:inspectPages --project javacafetest06-ef7d9
```

Secret `OPENAI_API_KEY`를 아직 등록하지 않았다면 첫 배포 전에 `firebase functions:secrets:set OPENAI_API_KEY --project javacafetest06-ef7d9`를 실행하세요. 키를 GitHub 또는 브라우저 파일에 입력하지 마세요.
학생 실명·답안은 학교의 개인정보 처리·정보보안 및 외부 AI 전송 허용 기준을 확인하기 전까지 사용하지 마세요. 먼저 가상 답안으로 테스트하세요.

## 학교 학번 체계 · 결번 지원 (2026-11-24 추가)
- 번호 표시는 **남학생 1~20번 / 여학생 21번부터**로 나누며, 학급마다 마지막 번호를 설정합니다.
- **설정 → 학급별 번호 및 결번 설정**에서 쉼표 또는 범위로 결번을 입력합니다. 예: `3, 8, 19-20, 23-25`.
- 결번 번호는 학생 명단에서 회색 칸으로 표시되고, 이름 입력과 CSV 등록 대상으로 사용할 수 없습니다.
- **PDF 업로드는 시작~끝 번호에서 결번을 제외한 실제 학생 수 × 5쪽**이 필요합니다. 예: 18~24번에서 19·20·22번이 결번이면 **18, 21, 23, 24번** 4명분 20쪽입니다.
- **미등록과 결번은 다릅니다.** 이름이 비어 있는 번호는 자동으로 결번 처리하지 않으며, 실수로 이름을 빠뜨린 학생이 있으면 PDF 업로드를 중단합니다.
- 등록된 학생 또는 이미 업로드된 답안이 존재하는 번호는 결번으로 변경하지 못합니다. 기존 채점 기록과 Firebase 프로젝트 설정은 그대로 유지됩니다.
- 각 학생 답안은 순서대로 임시 배정하며 **PDF 첫 페이지의 학번·이름을 교사가 직접 대조**해야 최종 확정할 수 있습니다.

## 구현 기능

- **학급 설정**: 반 개수, 학급별 시작·마지막 번호(1~99), 반 최대 50개
- **학생 명단**: 번호별 교사 직접 입력 및 여러 반의 `반,번호,이름` CSV 일괄 등록(UTF-8/CP949)
- **PDF**: 한 학생의 5쪽 PDF 또는 여러 학생(5쪽씩)의 연속 PDF, 여러 PDF 함께 업로드; 5쪽 배수·인원 일치·등록명단·기존 중복 답안 검증
- **학생 배정**: 지정한 반의 시작 번호부터 순서대로 배정; 학생 1명당 별도 PDF로 분리해 비공개 Firebase Storage에 저장
- **신원 검증**: 각 답안의 첫 번째 페이지를 교사가 반드시 직접 보고 학번·이름을 확인. AI를 사용한 경우 첫 장 자필 식별 결과/불일치를 표시. 번호 맞교환 후 상대 답안도 재확인 필요
- **채점**: 데이터 수집·분석 40점, 문제 해결 전략 선택 30점, 알고리즘 설계 30점. 성취수준(상·중상·중·기초·미제출)과 점수 교사 수정 가능
- **AI 보조 채점(선택)**: Cloud Functions에 OpenAI API Secret이 설정된 경우, 5쪽 이미지를 보내 필기·성취수준을 제안. AI만으로 교사 최종 확정 불가능
- **성적 관리**: 교사 점수·근거 저장 / 최종 확정 및 취소 / 학급별 CSV 내려받기 / 답안 업로드 묶음 삭제
- **보안**: Firebase 이메일 로그인 + 콘솔에서 직접 부여한 교사 UID 권한, Firestore·Storage 접근 제한. API Secret은 브라우저 코드/ GitHub에 저장하지 않음

> **중요:** 수준별 기본 점수(데이터 40/30/20/10/0, 나머지 영역 30/25/20/15/0)는 임시 시범값입니다. 확정된 학교 수행평가 계획의 수준별 배점을 먼저 확인하세요.

## 폴더

```text
nepal_grading_firebase_v3/
├─ docs/                    # GitHub Pages에서 공개되는 HTML/CSS/JS 화면
│  ├─ index.html
│  ├─ app.js
│  ├─ core.mjs
│  ├─ style.css / extras.css
│  └─ firebase-config.js    # Firebase 웹 SDK 설정(비밀키가 아님)
├─ functions/               # Firebase에만 배포되는 AI 서버 함수
│  ├─ index.js
│  └─ package.json
├─ firestore.rules          # 교사 허용목록 기반 Firestore 규칙
├─ storage.rules            # 학생 PDF 비공개 저장 규칙
├─ firebase.json            # Firebase CLI 배포 설정
├─ cors.example.json        # GitHub Pages 접속 도메인에서 PDF를 안전하게 읽기 위한 CORS 예시
├─ 학생명단_양식.csv
└─ tests/smoke.mjs
```

## 0. 실제 학생 자료 전 준비

현재 코드는 **학교 현장 검토용 첫 버전**입니다. 실제 학생 이름·답안·성적을 외부 클라우드 및 AI에 전송하기 전에 학교와 교육청의 개인정보 처리·정보보안·위탁 및 보관 정책을 확인하세요. 승인 전에는 가상 학생과 가상 답안을 이용해 시험하세요. Firebase 프로젝트는 기존 네팔 시뮬레이션 프로젝트와 **분리**하는 것이 안전합니다.

**결제**: 새 Firebase Storage 버킷과 Cloud Functions는 현재 Blaze(사용량 기반) 요금제와 결제 계정 연결이 필요합니다. 무료 사용량 내여도 결제 수단 설정은 별개입니다. 비용 알림을 설정하고 PDF 저장량·함수 호출 횟수를 관리하세요. OpenAI API는 ChatGPT 구독과 별도 과금됩니다.

## 1. Firebase 프로젝트 만들기

1. [Firebase 콘솔](https://console.firebase.google.com/) → **프로젝트 추가** → 채점 웹앱만을 위한 별도 프로젝트 생성.
2. 프로젝트 설정 → **웹 앱 등록** → `firebaseConfig` 객체를 복사하여 `docs/firebase-config.js`의 **값만** 바꿉니다. 이 파일에 OpenAI 키나 서비스 계정 JSON을 넣지 마세요.
3. **Authentication → Sign-in method**: 이메일/비밀번호 제공업체 활성화. **Users**에서 교사 로그인 계정을 생성합니다. 회원가입 UI는 없으므로 교사만 관리자가 직접 생성합니다.
4. **Authentication → Settings → Authorized domains**에서 `YOUR_GITHUB_USERNAME.github.io`를 추가합니다. (`https://`나 저장소 경로는 제외)
5. **Firestore Database** 생성, **Cloud Storage** 사용 설정 및 버킷 생성. 학생 자료를 시험할 동안 다른 사용자가 접근하지 않도록 규칙을 아래대로 배포합니다.
6. Authentication의 교사 계정을 클릭하여 **User UID**를 복사합니다. Firestore에서 `teachers` 컬렉션을 만들고 문서 ID를 정확히 **그 UID**로 지정합니다. 문서 필드 예시: `role` (string): `teacher`. 이 문서는 **관리자 콘솔 또는 Admin SDK로만** 만들 수 있고 일반 웹앱에서 생성되지 않습니다. 로그인해도 이 문서가 없다면 접근이 차단됩니다.

## 2. Firebase 보안 규칙 먼저 배포

로컬 PC에서 Node.js 및 [Firebase CLI](https://firebase.google.com/docs/cli) 설치 후 프로젝트 루트(`firebase.json`이 있는 폴더)에서:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules,storage
```

`firebase use --add`에서 앞서 만든 Firebase 프로젝트를 선택하세요. 콘솔에서 기존에 사용하던 프로젝트가 아닌지 확인하세요. **다른 Firebase 프로젝트에 배포하면 그 프로젝트의 기존 보안 규칙을 바꿉니다.** 따라서 별도 프로젝트를 권장합니다.

Storage 규칙은 Firestore의 `teachers` 문서 존재 여부를 확인합니다. 최초 배포 시 Storage 규칙에서 Firestore 참조를 위한 권한 활성화 안내가 나올 수 있습니다. Firebase 콘솔의 권한 안내를 따라야 합니다.

## 3. Storage CORS 등록 (PDF 미리보기 필수)

이 웹앱은 PDF 원본을 로그인한 브라우저에서 `getBlob()`으로 읽습니다. 따라서 Storage 버킷에 **CORS 정책**이 필요합니다.

1. `cors.example.json`의 `YOUR_GITHUB_USERNAME`을 본인 GitHub 아이디로 바꾸고 파일명을 `cors.json`으로 저장합니다.
2. Cloud SDK 설치 후 아래처럼 **본인 Firebase Storage 버킷 이름**으로 실행합니다. 버킷 이름은 `docs/firebase-config.js`의 `storageBucket` 값과 일치해야 합니다.

```bash
gsutil cors set cors.json gs://YOUR_PROJECT_ID.firebasestorage.app
```

버킷이 기존 형식(`*.appspot.com`)이라면 실제 버킷명을 사용하세요. 기존 다른 서비스에 영향을 주지 않도록 새 버킷·프로젝트를 권장합니다. CORS 미설정 시 업로드는 되더라도 PDF 원본을 채점 화면에서 불러오는 과정이 실패할 수 있습니다.

## 4. GitHub Pages로 웹사이트 공개

1. [GitHub](https://github.com/)에서 새 저장소 예: `nepal-grading` 생성.
2. 프로젝트의 모든 코드 파일을 **루트**에 업로드합니다. `/docs` 폴더가 그대로 있어야 합니다. 실제 학생 PDF, 학생 명단 실자료, OpenAI 키, 서비스 계정 키는 절대 GitHub에 업로드하지 마세요.
3. 저장소 **Settings → Pages → Build and deployment → Deploy from a branch**를 선택하고 Branch: `main`, Folder: `/docs`를 지정하고 저장합니다.
4. 배포 후 GitHub Pages에서 안내하는 URL로 접속합니다. 주소 형식은 `https://YOUR_GITHUB_USERNAME.github.io/nepal-grading/`입니다. 실제 주소는 GitHub가 확인해 준 뒤에 사용하세요.

**GitHub 계정 요금제 주의:** GitHub Free에서는 Pages를 일반적으로 **Public 저장소**로 배포합니다. 비공개 저장소 Pages는 GitHub Pro/Team 등 해당 요금제에서 지원합니다. 코드 저장소가 Public이어도 학생 PDF·실제 명단·성적은 GitHub에 저장하면 안 됩니다. **Firebase 서버의 교사 전용 권한 규칙으로 보호**해야 합니다. 웹사이트 HTML 자체는 인터넷 누구나 볼 수 있어도 로그인 없이는 학생 정보에 접근할 수 없도록 구현했습니다.

## 5. 선택: AI 채점 함수 배포

**AI 없이도** PDF 분리·저장, 첫 페이지 교사 확인, 수동 채점, CSV 출력이 가능합니다. AI가 필요해지면 다음을 실행합니다.

```bash
cd functions
npm install
cd ..
firebase functions:secrets:set OPENAI_API_KEY
firebase deploy --only functions:gradeAnswer
```

`OPENAI_API_KEY` 값은 CLI의 Secret 입력으로 등록합니다. **`docs/firebase-config.js`·GitHub 저장소·브라우저에는 절대 넣지 않습니다.** 학생 PDF 5쪽을 브라우저에서 임시 JPEG로 변환한 다음 Cloud Function에 전송하고, 서버 함수가 OpenAI API에 전달합니다. API 사용에 따른 외부 처리·비용이 발생하므로 먼저 운영 지침을 확인하세요.

함수는 기본 `asia-northeast3`(서울) 지역으로 배포되도록 설정되어 있습니다. AI 모델은 `functions/index.js`의 `gpt-4.1-mini`이며 모델·사용 요금은 API 사정에 따라 변경될 수 있습니다.

## 6. 운영 순서

1. GitHub Pages 주소 접속 → 교사 계정 로그인.
2. **설정**: 1~11반 등 반별 시작·마지막 번호 저장 / 성취수준 점수 확인.
3. **학생 명단**: 번호별 이름 입력 또는 `반,번호,이름` CSV 등록.
4. **PDF 업로드**: 학급과 시작·마지막 번호 지정 → PDF 선택 → 5쪽 단위로 검증·분리 후 저장.
5. **채점 현황**: 학생 답안 클릭 → **1쪽 원본에서 이름·학번을 교사 직접 확인**. AI가 실행된 경우 AI 결과와 대조. 불일치 시 번호 변경·맞교환 가능.
6. AI 보조 채점이 필요하면 버튼 실행(또는 업로드 시 옵션). AI 제안점을 근거로 확인하고 교사가 각 영역의 수준·근거 수정 후 **점수·근거 저장**.
7. **최종 점수 확정** → CSV 내려받기. 확정 후 수정하려면 확정 취소.

### 파일별 조건

- **학생당 정확히 5쪽**을 전제로 합니다. PDF 내부의 답안 순서는 반드시 5쪽씩 인접해야 합니다.
- PDF 여러 개를 선택하면 브라우저 파일 선택 순서대로 처리하므로 **파일 이름 정렬과 실제 답안 순서를 반드시 대조**하세요.
- 지정 학생 수와 업로드한 PDF 5쪽 그룹 수가 다르면 거부합니다.
- 기존 번호에 답안이 있으면 중복 업로드를 거부합니다. 업로드 묶음 삭제 시 확정된 성적이 있으면 먼저 확정을 취소해야 합니다.
- AI가 이름을 일치한다고 판단했더라도 신원은 자동 확정되지 않습니다. 원본 첫 장을 교사가 직접 보아야 합니다.
- PDF의 경우 1개 업로드 파일 최대 50MB, 학생 1명으로 분리한 PDF 최대 20MB; AI JPEG는 총 약 7.5MB까지 보냅니다.
- 첫 장 불일치가 발견되면 선택 학생 번호를 변경할 수 있으며, 이미 배정된 학생과 번호 맞교환하면 상대 학생의 신원 확인이 무효화됩니다.

## 알려진 제한 사항

- 현 버전은 **교사 1명 혹은 동일 권한을 가진 소수 교사**를 위한 단일 학교 단위입니다. 학생·보호자 접속, 권한별 감사 로그, 학생 자료 자동 파기·보존기한 관리, 원본 암호화 키 별도 관리, 다중 평가회차 구분은 아직 지원하지 않습니다.
- **PDF 5쪽씩 분리**는 브라우저에서 수행합니다. 악의적으로 변조된 PDF, 페이지 누락, 다른 학생 답안이 중간에 끼어드는 경우 자동으로 완벽히 찾아내지 못하므로 수동 확인은 필수입니다.
- Firebase Storage `getBlob()`을 사용하므로 CORS 및 정상 네트워크가 필요합니다. 현재 GitHub Pages에 호스팅해도 Firebase 서비스 설정 없이는 동작하지 않습니다.
- AI가 손글씨를 잘못 읽거나 틀린 평가를 제안할 수 있습니다. 교사가 원본을 보고 최종 채점해야 합니다.
- CSV를 일반 스프레드시트로 열 때 수식 인젝션을 줄이도록 일부 문자 접두 처리가 적용됩니다. CSV는 학교 보안 정책에 따라 보관하세요.
- 자동 백업·외부 백업, 요청별 사용량 한도, 성적 감사 기록은 정식 운영 전 추가 권장합니다.

## 테스트

```bash
node tests/smoke.mjs
node --check docs/app.js
node --check functions/index.js
```

> 테스트는 계산·CSV·5쪽 배정 및 문법 검증용입니다. Firebase 계정/키가 없는 상태에서는 실제 Firebase 업로드/AI 호출을 끝까지 통합 시험할 수 없습니다. 배포 후 가상학생 테스트를 반드시 수행하세요.

## 공식 기술 자료

- [Firebase 웹 SDK](https://firebase.google.com/docs/web/setup)
- [Firebase 보안 규칙](https://firebase.google.com/docs/rules)
- [Firebase Storage 브라우저 PDF/CORS](https://firebase.google.com/docs/storage/web/download-files)
- [Firebase Cloud Functions 호출형 함수](https://firebase.google.com/docs/functions/callable)
- [GitHub Pages 배포](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
