import {createClient} from '@supabase/supabase-js';
import type {Database} from './database.types';
const url=import.meta.env.VITE_SUPABASE_URL, key=import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured=Boolean(url&&key&&!key.startsWith('replace-'));
export const db=configured?createClient<Database>(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}}):null;
type Functions=Database['public']['Functions'];
export async function rpc<N extends keyof Functions>(name:N,args:Functions[N]['Args']):Promise<Functions[N]['Returns']>{if(!db)throw Error('Supabase is not configured');const {data,error}=await db.rpc(name,args);if(error)throw error;return data as Functions[N]['Returns'];}
