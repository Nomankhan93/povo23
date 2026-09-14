let flush:(()=>Promise<void>)|null=null;
export function registerActiveDraft(callback:()=>Promise<void>) {flush=callback;return ()=>{if(flush===callback)flush=null}}
export async function flushActiveDraft(){await flush?.()}
