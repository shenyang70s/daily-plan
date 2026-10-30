import { useQuery } from '@tanstack/react-query';

export function App() {
  const health = useQuery({queryKey: ['system', 'ready'], queryFn: async ({signal}) => {
    const response = await fetch('/api/v1/ready', {signal});
    if (!response.ok) throw new Error('服务尚未就绪');
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object' || !('status' in value) || value.status !== 'ok') throw new Error('无效的服务状态');
    return true;
  }});
  return <main className="setup"><div className="brand">Research Tasks<span>.</span></div><p className="eyebrow">YOUR RESEARCH, IN FOCUS</p><h1>科研任务，从容安排。</h1><p className="description">正式应用的工程基座已建立。登录与任务页面正在实现，当前页面不使用演示身份或虚构任务。</p><section aria-live="polite"><span className={`status-dot ${health.isSuccess?'online':''}`} /><strong>{health.isPending?'正在连接服务…':health.isError?'API 尚未连接':'API 与 SQLite 已就绪'}</strong><p>{health.isError?'请确认 API 已启动，并检查数据库迁移与文件权限。':'当前检查的是服务端真实就绪状态。'}</p>{health.isError&&<button onClick={()=>void health.refetch()}>重新检查</button>}</section><footer>任务、时间、提醒。把注意力留给研究。</footer></main>;
}
