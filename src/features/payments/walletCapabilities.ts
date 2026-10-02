import {useEffect,useState} from 'react';
import {rpc} from '../../lib/supabase/client';

export function useWalletCapabilities(revision=0){
 const [state,setState]=useState({loading:true,sandboxEnabled:false,error:false});
 useEffect(()=>{let live=true;setState({loading:true,sandboxEnabled:false,error:false});
  void rpc('wallet_capabilities',{}).then(value=>{
   const data=value as {sandbox_enabled?:boolean;enrollment_available?:boolean};
   if(live)setState({loading:false,sandboxEnabled:data.sandbox_enabled===true&&data.enrollment_available===true,error:false});
  }).catch(()=>{if(live)setState({loading:false,sandboxEnabled:false,error:true})});
  return()=>{live=false};
 },[revision]);
 // A production bundle never exposes simulated ownership as enrollment.
 return {...state,enrollmentAvailable:import.meta.env.DEV&&state.sandboxEnabled&&!state.loading};
}
