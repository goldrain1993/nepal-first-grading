'use strict';
// 공식 NepalFlood_TestSet.docx의 TEST 1~6 수치
const TEST_SETS={
  1:{temperature:22.0,rainfall:10,vibration:8.6,waterLevel:3.5,velocity:2.8},
  2:{temperature:18.0,rainfall:88,vibration:2.7,waterLevel:3.6,velocity:3.0},
  3:{temperature:19.0,rainfall:20,vibration:6.5,waterLevel:4.1,velocity:3.4},
  4:{temperature:23.5,rainfall:5,vibration:8.0,waterLevel:2.0,velocity:1.5},
  5:{temperature:16.0,rainfall:72,vibration:2.3,waterLevel:2.7,velocity:2.1},
  6:{temperature:20.5,rainfall:35,vibration:7.0,waterLevel:3.8,velocity:2.9}
};
const SENSORS=['temperature','rainfall','vibration','waterLevel','velocity'];
const sensorNames={
  temperature:['기온','온도','temperature','temp'],
  rainfall:['강우량','강우','비','rain','rainfall'],
  vibration:['진동','vibration'],
  waterLevel:['수위','water','waterlevel','수면'],
  velocity:['유속','velocity','flow','flowrate']
};
function normalizeSensor(raw){
 const s=String(raw??'').replace(/[\s_\-]/g,'').toLowerCase();
 for(const [key,names] of Object.entries(sensorNames))if(names.some(n=>s===n.toLowerCase()))return key;
 return null;
}
function testValueCheck(input,sensor,assignedTestNo=null){
 const raw=String(input??'').trim();
 if(!raw)return {valid:false,reason:'TEST 값 미기재',basis:'none'};
 // 명시적인 TEST 표기와 맨 숫자는 구별한다. 맨 숫자 '3'은
 // TEST 3번일 수도, TEST 2의 유속 3.0m/s일 수도 있다.
 const explicitLabel=raw.match(/^\s*(?:TEST|테스트|T)\s*[-#:]?\s*([1-6])\s*(?:번|호)?\s*$/i)
   ||raw.match(/^\s*([1-6])\s*(?:번|호)\s*$/);
 const bareLabel=raw.match(/^\s*([1-6])\s*$/);
 if(explicitLabel){
   const testNo=Number(explicitLabel[1]);
   if(assignedTestNo!==null&&Number(assignedTestNo)!==testNo)return {valid:false,reason:'배정된 TEST 번호와 다릅니다.',basis:'test-id',testNo};
   return {valid:true,reason:'TEST '+testNo+' 번호로 작성한 정답',basis:'test-id',testNo};
 }
 if(bareLabel&&(assignedTestNo===null||Number(assignedTestNo)===Number(bareLabel[1]))){
   const testNo=Number(bareLabel[1]);
   return {valid:true,reason:'TEST '+testNo+' 번호로 작성한 정답',basis:'test-id',testNo};
 }
 // 맨 숫자가 배정 TEST 번호와 다르더라도, 해당 센서 실측값일 수 있으므로 아래에서 확인한다.
 const cleaned=raw.replace(/\s/g,'').replace(/(?:°C|℃|mm\/h|mm|m\/s|m|0~10)$/i,'').replace(/,/g,'');
 if(!/^[+-]?\d+(?:\.\d+)?$/.test(cleaned))return {valid:false,reason:'유효한 TEST 번호 또는 센서 측정값이 아닙니다.',basis:'unknown'};
 const value=Number(cleaned),sensorId=normalizeSensor(sensor);
 const ids=assignedTestNo===null?[1,2,3,4,5,6]:[Number(assignedTestNo)];
 const matched=[];
 for(const testNo of ids){
   const row=TEST_SETS[testNo];
   if(!row)continue;
   for(const k of sensorId?[sensorId]:SENSORS){
     if(Math.abs(row[k]-value)<0.000001)matched.push({testNo,sensor:k});
   }
 }
 if(!matched.length)return {valid:false,reason:bareLabel?'배정된 TEST 번호와 다르고 해당 센서의 실제 수치도 아닙니다.':'지정 TEST의 해당 센서 수치와 일치하지 않습니다.',basis:'sensor-value',sensor:sensorId,value};
 return {valid:true,reason:'TEST 센서 측정값과 일치',basis:'sensor-value',sensor:sensorId,value,matched};
}
module.exports={TEST_SETS,SENSORS,normalizeSensor,testValueCheck};
