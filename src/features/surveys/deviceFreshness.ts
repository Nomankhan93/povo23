export type Freshness = {usable:boolean;label:string};
export function deviceFreshness(downloadedAt:string,validUntil:string,blocked?:string,now=Date.now()):Freshness {
  if(blocked)return{usable:false,label:'Access needs refresh: '+blocked};
  const downloaded=Date.parse(downloadedAt),expires=Date.parse(validUntil);
  if(!Number.isFinite(downloaded)||!Number.isFinite(expires)||expires<=downloaded||downloaded>now+300000)return{usable:false,label:'Download metadata is invalid; reconnect and refresh'};
  if(now>=expires)return{usable:false,label:'Downloaded access expired; reconnect and refresh'};
  return{usable:true,label:'Downloaded '+new Date(downloaded).toLocaleString()+' · refresh before '+new Date(expires).toLocaleString()};
}
