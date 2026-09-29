import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {FieldOperationsMap} from '../../../src/features/maps/FieldOperationsMap';
import '../../../src/styles/design-system.css';
window.mapCalls=[];window.denyMap=false;
const views=new Map();
function Fixture(){
 const [source,setSource]=useState(null),[owner,setOwner]=useState('alice');
 return <><button onClick={()=>{setOwner('bob');setSource(null);}}>Switch owner</button>{source?<><p>Selected source: {source}</p><button onClick={()=>setSource(null)}>Back to map</button></>:<FieldOperationsMap key={owner} projectId="project" geographies={[]} viewStateStore={views} viewStateKey={owner+':project'} onOpenSource={row=>setSource(row.source_context_id)}/>}</>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);
