import {useEffect,useLayoutEffect,useRef,useSyncExternalStore} from 'react';
import {ActionDialog} from '../components/ui/ActionDialog';

const editors=new Set<{dirty:boolean}>();
const listeners=new Set<()=>void>();
let decision:((leave:boolean)=>void)|null=null;
const notify=()=>listeners.forEach(fn=>fn());
export const hasUnsavedAuthoring=()=>[...editors].some(editor=>editor.dirty);
export function requestAuthoringNavigation():Promise<boolean>{
 if(!hasUnsavedAuthoring())return Promise.resolve(true);
 // Ignore additional navigation gestures while the first decision is open.
 if(decision)return Promise.resolve(false);
 return new Promise(resolve=>{decision=resolve;notify()});
}
function finish(leave:boolean){const resolve=decision;decision=null;notify();resolve?.(leave)}
export function useDirtyAuthoring(dirty:boolean){
 const editor=useRef({dirty});
 useLayoutEffect(()=>{editor.current.dirty=dirty},[dirty]);
 useLayoutEffect(()=>{const item=editor.current;editors.add(item);return()=>{editors.delete(item)}},[]);
 useEffect(()=>{
  if(!dirty)return;
  const leave=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};
  window.addEventListener('beforeunload',leave);
  return()=>window.removeEventListener('beforeunload',leave);
 },[dirty]);
}
export function AuthoringNavigationGuard(){
 const open=useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn)}},()=>Boolean(decision));
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const node=dialog.current;if(!node)return;
  if(open&&!node.open)node.showModal();else if(!open&&node.open)node.close();
 },[open]);
 useEffect(()=>()=>finish(false),[]);
 return <dialog ref={dialog} aria-label="Unsaved authoring changes" onKeyDown={event=>{
  if(event.key!=="Tab")return;
  const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")),first=buttons[0],last=buttons.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
 }} onCancel={event=>{event.preventDefault();finish(false)}} style={{padding:0,border:0,background:'transparent',maxWidth:'100vw',maxHeight:'100vh'}}>
  <ActionDialog open={open} title="Discard unsaved changes?" description="Your template or project draft has unsaved changes. Stay to continue editing or save it before leaving." cancelLabel="Stay / Continue editing" confirmLabel="Discard changes" danger onCancel={()=>finish(false)} onConfirm={()=>finish(true)}/>
 </dialog>;
}

/** Keep the current entry while asking; Stay preserves the forward/back stack. */
export function installAuthoringHistoryGuard(onNavigate:()=>Promise<void>,onError:(error:unknown)=>void){
 let index=Number(history.state?.fieldlanceIndex||0),skip=false;
 let restore: (()=>void)|null=null;
 history.replaceState({...history.state,fieldlanceIndex:index},'',location.href);
 const pop=async()=>{
  if(restore){const done=restore;restore=null;done();return}
  const target=Number(history.state?.fieldlanceIndex||0),delta=target-index;
  if(!skip&&hasUnsavedAuthoring()&&delta!==0){
   await new Promise<void>(resolve=>{restore=resolve;history.go(-delta)});
   if(await requestAuthoringNavigation()){skip=true;history.go(delta)}
   return;
  }
  skip=false;
  try{await onNavigate();index=target}catch(error){
   if(delta!==0)await new Promise<void>(resolve=>{restore=resolve;history.go(-delta)});
   onError(error);
  }
 };
 const sync=()=>{index=Number(history.state?.fieldlanceIndex||0)};
 window.addEventListener('popstate',pop);window.addEventListener('fieldlance-route-written',sync);
 return()=>{window.removeEventListener('popstate',pop);window.removeEventListener('fieldlance-route-written',sync)};
}
