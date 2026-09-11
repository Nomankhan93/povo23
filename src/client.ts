import {createClient} from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL, key=import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured=Boolean(url&&key&&!key.startsWith('replace-'));
export const db=configured?createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}}):null;
export async function rpc(name:string,args:Record<string,unknown>){if(!db)throw Error('Supabase is not configured');const {data,error}=await db.rpc(name,args);if(error)throw error;return data;}
