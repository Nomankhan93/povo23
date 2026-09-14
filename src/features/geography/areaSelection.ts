import type {Geo} from './model';
export const areaKinds=['province','division','district','taluka','uc','village','ward'];
export const operatingKinds=['district','taluka','uc','village','ward'];
export const areaLabels:Record<string,string>={province:'Province / Territory',division:'Division',district:'District',taluka:'Taluka / Tehsil',uc:'Union Council',village:'Village',ward:'Ward'};
export function areaPath(id:string|null,rows:Geo[]):Geo[]{
 const path:Geo[]=[],seen=new Set<string>();let key=id;
 while(key){const node=rows.find(g=>g.id===key);if(!node||seen.has(key))return [];seen.add(key);path.unshift(node);key=node.parent_id}
 return path;
}
export function selectableArea(id:string|null,rows:Geo[]){
 const path=areaPath(id,rows);
 return path.length>0&&path[0].kind==='province'&&path.every((g,i)=>g.active&&areaKinds.includes(g.kind)&&(i===0||areaKinds.indexOf(g.kind)>areaKinds.indexOf(path[i-1].kind)));
}
export function areaOptions(parent:string|null,rows:Geo[]){return rows.filter(g=>g.parent_id===parent&&selectableArea(g.id,rows)).sort((a,b)=>a.name.localeCompare(b.name,'en',{sensitivity:'base',numeric:true})||a.id.localeCompare(b.id))}
export function areaCaption(id:string,rows:Geo[]){return areaPath(id,rows).map(g=>g.name).join(' / ')||`Saved area (${id})`}
export function addOperatingArea(selected:string[],id:string|null,rows:Geo[]){
 if(!id||selected.includes(id)||selected.length>=100||!selectableArea(id,rows)||!operatingKinds.includes(rows.find(g=>g.id===id)?.kind||''))return selected;
 return [...selected,id];
}
