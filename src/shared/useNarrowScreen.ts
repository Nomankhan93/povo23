import {useEffect,useState} from 'react';
export function useNarrowScreen(){
  const [narrow,setNarrow]=useState(()=>window.matchMedia('(max-width: 650px)').matches);
  useEffect(()=>{
    const query=window.matchMedia('(max-width: 650px)');
    const update=()=>setNarrow(query.matches);
    update();query.addEventListener('change',update);
    return()=>query.removeEventListener('change',update);
  },[]);
  return narrow;
}
