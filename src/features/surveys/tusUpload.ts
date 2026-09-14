/** TUS 1.0, sequential chunks. Upload URL and bytes are durably persisted by the caller. */
export function safeUploadUrl(raw:string,endpoint:string) {
  const url=new URL(raw,endpoint),base=new URL(endpoint);
  if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname+'/'))throw Error('Untrusted resumable upload location');
  return url.href;
}
export async function resumeTus(options:{endpoint:string;token:()=>Promise<string>;bytes:Uint8Array;mime:string;objectName:string;url?:string;saveUrl:(url:string)=>Promise<void>;progress:(offset:number)=>Promise<void>;fetcher?:typeof fetch}) {
  const f=options.fetcher||fetch;
  const request=async(url:string,init:RequestInit)=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
    try{return await f(url,{...init,redirect:'error',signal:controller.signal,headers:{...init.headers,'Tus-Resumable':'1.0.0',Authorization:`Bearer ${await options.token()}`}})}finally{clearTimeout(timer)}
  };
  let url=options.url?safeUploadUrl(options.url,options.endpoint):'',offset=0;
  if(url){
    const response=await request(url,{method:'HEAD'});
    if(response.status===404||response.status===410){url='';await options.saveUrl('')}
    else {if(!response.ok)throw Error(`Upload HEAD failed (${response.status}); sign in/retry or refresh project access`);offset=Number(response.headers.get('Upload-Offset'));if(!response.headers.has('Upload-Offset')||!Number.isSafeInteger(offset)||offset<0||offset>options.bytes.length)throw Error('Invalid resumable upload offset')}
  }
  if(!url){
    const metadata={bucketName:'survey-capture',objectName:options.objectName,contentType:options.mime,cacheControl:'3600'};
    const response=await request(options.endpoint,{method:'POST',headers:{'Upload-Length':String(options.bytes.length),'Upload-Metadata':Object.entries(metadata).map(([k,v])=>`${k} ${btoa(v)}`).join(',')}});
    if(response.status!==201||!response.headers.get('Location'))throw Error(`Upload creation failed (${response.status}); retry after checking access`);
    url=safeUploadUrl(response.headers.get('Location')!,options.endpoint);
    await options.saveUrl(url); // A failed durable write must stop before transmitting bytes.
  }
  await options.progress(offset);
  while(offset<options.bytes.length){
    const end=Math.min(offset+6*1024*1024,options.bytes.length);
    const response=await request(url,{method:'PATCH',headers:{'Content-Type':'application/offset+octet-stream','Upload-Offset':String(offset)},body:new Blob([options.bytes.slice(offset,end)])});
    if(response.status!==204)throw Error(`Upload interrupted (${response.status}); original upload retained for HEAD recovery`);
    const next=Number(response.headers.get('Upload-Offset'));
    if(!response.headers.has('Upload-Offset')||next!==end)throw Error('Unexpected upload offset; verify server state on retry');
    offset=next;await options.progress(offset);
  }
}
