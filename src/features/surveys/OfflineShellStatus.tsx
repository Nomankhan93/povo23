import {useEffect,useState} from 'react';
export function OfflineShellStatus(){
 const [text,setText]=useState(import.meta.env.DEV?'Development mode: offline reload requires a production build/preview on the same origin.':'Checking offline app files…');
 useEffect(()=>{
   if(import.meta.env.DEV)return;
   let live=true;
   const check=async()=>{
     if(!('serviceWorker' in navigator)){setText('Offline reload is unavailable in this browser. Keep the app open.');return}
     const reg=await navigator.serviceWorker.getRegistration('/');
     if(live)setText(reg?.waiting?'An app update is waiting. Finish sync and close all FieldLance tabs before reopening.':reg?.active?'Offline app files installed. Download your assigned projects before leaving connectivity.':'App files are not installed yet. Stay online and reload once before field use.');
   };
   void check();const timer=window.setInterval(()=>void check(),5000);
   return()=>{live=false;window.clearInterval(timer)};
 },[]);
 return <p role="status">{text}</p>;
}
