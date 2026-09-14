import {useId} from 'react';
import type {Geo} from './model';
import {areaPath,areaOptions,areaKinds,areaLabels,areaCaption,selectableArea} from './areaSelection';
export function AreaSelector({rows,value,onChange,title='Area',disabled=false}:{rows:Geo[];value:string|null;onChange:(id:string|null)=>void;title?:string;disabled?:boolean}){
 const hint=useId(),path=areaPath(value,rows),roots=areaOptions(null,rows),valid=selectableArea(value,rows);
 return <fieldset className="area-selector" disabled={disabled} aria-describedby={hint}><legend>{title}</legend><p id={hint}>Choose an area, then narrow it down if needed. Stop at District to cover the whole district. Further levels appear only when configured.</p>
 <div className="area-selector-grid"><label className="field">Province / Territory<select value={path[0]?.id||''} onChange={e=>onChange(e.target.value||null)}><option value="">Choose Province / Territory</option>{roots.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
 {path.map((parent,index)=>{const children=areaOptions(parent.id,rows);return areaKinds.filter(kind=>children.some(g=>g.kind===kind)).map(kind=><label className="field" key={parent.id+kind}>{areaLabels[kind]}<select value={path[index+1]?.kind===kind?path[index+1].id:''} onChange={e=>onChange(e.target.value||parent.id)}><option value="">Whole {parent.name} / no narrower selection</option>{children.filter(g=>g.kind===kind).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>)})}
 </div>{value&&<p className="area-selection-summary" role="status">Selected: {areaCaption(value,rows)}{!valid?' — unavailable for a new selection':''}</p>}{!roots.length&&<p role="status">No active province hierarchy is available. Check Geography configuration.</p>}
 </fieldset>;
}
