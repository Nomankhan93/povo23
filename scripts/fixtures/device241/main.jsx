import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../../../src/app/App';
import * as survey from '../../../src/features/surveys/offlineSurveyStore';
import * as attendance from '../../../src/features/workforce/attendanceOfflineStore';
import * as lifecycle from '../../../src/features/surveys/fieldDeviceLifecycle';
import {saveAttendanceDownload} from '../../../src/features/workforce/attendanceDownload';
import {assignment,policy} from './client';
window.deviceTest={survey,attendance,lifecycle,seed:async(owner='alice')=>{
 localStorage.setItem('fixture-owner',owner);survey.rememberFieldOwner(owner);
 await saveAttendanceDownload(owner,[assignment()],{rows:[],count:0,summary:{open:0},can_manage:false});
 await survey.putFieldRecord(owner,'bundle','project',{owner_id:owner,project:{id:'project',title:owner+' downloaded survey',governance_version:1},template:{id:'template',version:1},downloaded_at:new Date().toISOString(),valid_until:new Date(Date.now()+86400000).toISOString(),people:[],households:[],responses:[]});
 localStorage.setItem('fixture-ready','yes');
}};
if(localStorage.getItem('fixture-ready'))createRoot(document.getElementById('root')).render(<App/>);
else document.getElementById('root').textContent='Browser fixture ready';
window.addEventListener('load',()=>void navigator.serviceWorker.register('/field-sw.js'));
