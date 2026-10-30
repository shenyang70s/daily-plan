let csrfToken='';
export function setCsrfToken(token:string):void{csrfToken=token}
export class ApiError extends Error{constructor(readonly status:number,readonly code:string,message:string){super(message)}}
export async function apiRequest<T>(path:string,options:RequestInit={}):Promise<T>{
 const headers=new Headers(options.headers),method=(options.method||'GET').toUpperCase();
 if(options.body)headers.set('Content-Type','application/json');
 if(!['GET','HEAD'].includes(method)&&csrfToken)headers.set('X-CSRF-Token',csrfToken);
 const response=await fetch(`/api/v1${path}`,{...options,headers,credentials:'same-origin'});
 const data:unknown=await response.json();
 if(!response.ok){const error=data&&typeof data==='object'?data as Record<string,unknown>:{};throw new ApiError(response.status,String(error.code||'HTTP_ERROR'),typeof error.message==='string'?error.message:'操作失败，请稍后重试。')}
 return data as T;
}
