// 학교 학번 엑셀: 첫 시트 '학생명단'에 학년, 반, 번호, 이름 순서로 입력
import {parseXlsxRosterRows,inferClassesFromRoster} from './core.mjs';

function xlsxLib(){
  if(!globalThis.XLSX)throw Error('엑셀 처리 라이브러리를 불러오지 못했습니다. 새로고침 후 다시 시도하세요.');
  return globalThis.XLSX;
}
export async function readSchoolExcel(file){
  if(!file || !/\.xlsx$/i.test(file.name))throw Error('.xlsx 확장자의 엑셀 파일만 업로드할 수 있습니다.');
  if(file.size>2*1024*1024)throw Error('엑셀 파일 크기는 2MB 이하로 제한합니다.');
  const XLSX=xlsxLib();
  const bytes=await file.arrayBuffer();
  let wb;
  try{wb=XLSX.read(bytes,{type:'array',bookVBA:false,cellFormula:true,sheetRows:5002});}
  catch(e){throw Error('엑셀 파일을 읽을 수 없습니다. 올바른 .xlsx 파일인지 확인하세요.');}
  const sheetName=wb.SheetNames.includes('학생명단')?'학생명단':wb.SheetNames[0];
  const ws=wb.Sheets[sheetName];
  if(!ws)throw Error('엑셀에 읽을 수 있는 시트가 없습니다.');
  if(ws['!ref']&&XLSX.utils.decode_range(ws['!ref']).e.r>=5002)throw Error('학생명단 시트가 5,000행을 초과했습니다.');
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true,blankrows:true});
  // 학번/이름에 수식은 허용하지 않음
  for(let i=0;i<rows.length;i++){
    for(const col of ['A','B','C','D']){
      if(ws[col+(i+1)]?.f)throw Error('엑셀 '+(i+1)+'행의 '+col+'열에 수식이 있습니다. 값으로 붙여 넣어 주세요.');
    }
  }
  const students=parseXlsxRosterRows(rows);
  return {students,classes:inferClassesFromRoster(students),sheetName};
}
export function downloadSchoolExcelTemplate(){
  const XLSX=xlsxLib(), wb=XLSX.utils.book_new();
  const sheet=XLSX.utils.aoa_to_sheet([['학년','반','번호','이름']]);
  sheet['!cols']=[{wch:12},{wch:12},{wch:12},{wch:24}];
  sheet['!autofilter']={ref:'A1:D1'};
  XLSX.utils.book_append_sheet(wb,sheet,'학생명단');
  const guide=XLSX.utils.aoa_to_sheet([
    ['학교 학생 명단 업로드 안내',''],
    ['① 첫 번째 시트인 학생명단의 2행부터 학생을 입력합니다.',''],
    ['② 제목은 반드시 학년, 반, 번호, 이름 순서로 유지하세요.',''],
    ['③ 현재 채점 앱은 1학년 전용입니다. 학년 칸은 모두 1로 입력하세요.',''],
    ['④ 남학생은 번호 1~20, 여학생은 21번부터입니다. 성별 열은 필요하지 않습니다.',''],
    ['⑤ 결번은 해당 번호의 행을 만들지 않습니다.',''],
    ['⑥ 각 반의 학생을 빠짐없이 입력해야 정확한 결번과 실제 학생 수가 계산됩니다.',''],
    ['⑦ 예시(아래 가상 자료)는 업로드되지 않습니다.',''],
    ['학년','반','번호','이름'],
    [1,1,1,'가상학생A'],
    [1,1,3,'가상학생B (2번 결번 예시)'],
    [1,1,21,'가상학생C (여학생 번호)']
  ]);
  guide['!cols']=[{wch:72},{wch:12},{wch:12},{wch:32}];
  XLSX.utils.book_append_sheet(wb,guide,'작성안내');
  const bytes=XLSX.write(wb,{bookType:'xlsx',type:'array',compression:true});
  const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='Nepal_First_Grading_학생명단_엑셀양식.xlsx';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}
