import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {ApiError,apiRequest,setCsrfToken} from '../lib/api-client';
import {SignInPage} from '../features/auth/SignInPage';
import {GeneralSettings} from '../features/settings/GeneralSettings';
import type {Preferences} from '../features/settings/GeneralSettings';
import {text} from '../locales/zh-CN';
interface Me{user:{id:string;username:string};csrfToken:string;preferences:Preferences}
export function App(){
 const client=useQueryClient();
 const me=useQuery({queryKey:['me'],retry:false,queryFn:async()=>{try{const result=await apiRequest<Me>('/me');setCsrfToken(result.csrfToken);return result}catch(error){if(error instanceof ApiError&&error.status===401){setCsrfToken('');return null}throw error}}});
 const logout=useMutation({mutationFn:()=>apiRequest('/auth/logout',{method:'POST'}),onSuccess:()=>{setCsrfToken('');client.clear();client.setQueryData(['me'],null)}});
 if(me.isPending)return <main className="setup"><p role="status">{text.checking}</p></main>;
 if(me.isError)return <main className="setup"><h1>{text.unavailable}</h1><button onClick={()=>void me.refetch()}>{text.retry}</button></main>;
 if(!me.data)return <SignInPage onSignedIn={()=>void client.invalidateQueries({queryKey:['me']})}/>;
 return <main className="workspace"><header className="workspace-header"><div className="brand">{text.brand}<span>.</span></div><div><span className="username">{me.data.user.username}</span><button disabled={logout.isPending} onClick={()=>logout.mutate()}>{text.logout}</button></div></header><p className="eyebrow">{text.eyebrow}</p><h1>{text.greeting}</h1><p className="description">{text.setupNote}</p>{logout.isError&&<p className="error" role="alert">{logout.error.message}</p>}<GeneralSettings key={me.data.user.id} preferences={me.data.preferences} onSaved={()=>void client.invalidateQueries({queryKey:['me']})}/><footer>{text.footer}</footer></main>;
}
