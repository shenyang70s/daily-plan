import {IncomingMessage,ServerResponse} from 'node:http';
import {Duplex} from 'node:stream';
// Native HTTP serialization over an in-memory socket, without binding a forbidden TCP port.
export function inject(app,{method='GET',path='/',headers={},body}={}){
 return new Promise((resolve,reject)=>{
  const chunks=[];
  const socket=new Duplex({read(){},write(chunk,_encoding,callback){chunks.push(Buffer.from(chunk));callback()}});
  Object.defineProperty(socket,'remoteAddress',{value:'127.0.0.1'});
  const req=new IncomingMessage(socket);req.url=path;req.method=method;req.headers={host:'app.test',...headers};req.httpVersion='1.1';req.httpVersionMajor=1;req.httpVersionMinor=1;req.complete=true;
  const encoded=body===undefined?null:Buffer.from(JSON.stringify(body));
  if(encoded){req.headers['content-type']='application/json';req.headers['content-length']=String(encoded.length)}
  const response=new ServerResponse(req);response.assignSocket(socket);
  const timer=setTimeout(()=>reject(new Error(`HTTP injection timed out: ${method} ${path}; status=${response.statusCode}; finished=${response.writableFinished}; bytes=${chunks.reduce((n,c)=>n+c.length,0)}`)),5000);
  response.on('finish',()=>{clearTimeout(timer);const raw=Buffer.concat(chunks).toString();const text=raw.slice(raw.indexOf('\r\n\r\n')+4);let parsed;try{parsed=JSON.parse(text)}catch{parsed=text}resolve({status:response.statusCode,headers:response.getHeaders(),body:parsed})});
  app.getHttpAdapter().getInstance().handle(req,response,error=>{if(error){clearTimeout(timer);reject(error)}});
  if(encoded)req.push(encoded);req.push(null);
 });
}
