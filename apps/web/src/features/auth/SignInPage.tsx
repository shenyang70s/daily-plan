import {useState} from 'react';
import {useMutation} from '@tanstack/react-query';
import {apiRequest,setCsrfToken} from '../../lib/api-client';
import {text} from '../../locales/zh-CN';
export function SignInPage({onSignedIn,message=''}:{onSignedIn:()=>void;message?:string}){
 const[username,setUsername]=useState(''),[password,setPassword]=useState('');
 const login=useMutation({mutationFn:()=>apiRequest<{user:{id:string;username:string};csrfToken:string}>('/auth/login',{method:'POST',body:JSON.stringify({username,password})}),onSuccess:value=>{setCsrfToken(value.csrfToken);setPassword('');onSignedIn()}});
 return <main className="signin"><div className="signin-intro"><div className="brand">{text.brand}<span>.</span></div><p className="eyebrow">{text.eyebrow}</p><h1>{text.title}</h1><p className="description">{text.loginDescription}</p></div><form className="login-panel" onSubmit={e=>{e.preventDefault();if(!login.isPending)login.mutate()}}><h2>{text.loginTitle}</h2>{message&&<p role="status" className="help">{message}</p>}<label htmlFor="username">{text.username}</label><input id="username" autoComplete="username" autoCapitalize="none" value={username} maxLength={32} onChange={e=>setUsername(e.target.value)} required autoFocus/><label htmlFor="password">{text.password}</label><input id="password" type="password" autoComplete="current-password" value={password} maxLength={128} onChange={e=>setPassword(e.target.value)} required/>{login.isError&&<p className="error" role="alert">{login.error.message}</p>}<button className="primary" disabled={login.isPending}>{login.isPending?text.loggingIn:text.login}</button><p className="help">{text.accountHelp}</p></form><footer>{text.footer}</footer></main>;
}
