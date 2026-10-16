import type { CompendiumRepository } from '../contracts/character-creation';
import type { SheetRecord } from '../contracts/sheets';
import { CreationError, validCreationRequest, validateCreationRequest, type CreationRequest } from './server';
export interface CreationServerDependencies {
  authenticate(token:string):Promise<string|null>;
  compendium(token:string):CompendiumRepository;
  persist(userId:string,request:CreationRequest,canonical:ReturnType<typeof validateCreationRequest>):Promise<SheetRecord>;
}
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
export function createCreationHandler(deps:CreationServerDependencies) {
  const reply=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers});
  return async(request:Request)=>{
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='POST')return reply(405,{message:'Método indisponível.'});
    const token=/^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization')??'')?.[1];
    if(!token)return reply(401,{message:'Entre novamente para criar o personagem.'});
    try{
      const userId=await deps.authenticate(token);
      if(!userId)return reply(401,{message:'Entre novamente para criar o personagem.'});
      const reader=request.body?.getReader();if(!reader)return reply(400,{message:'Envie os dados de criação.'});
      let total=0;const chunks:Uint8Array[]=[];
      while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>512*1024){await reader.cancel();return reply(413,{message:'Os dados de criação excedem o limite permitido.'});}chunks.push(value);}
      const bytes=new Uint8Array(total);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
      let body:unknown;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply(400,{message:'Envie dados de criação válidos.'});}
      if(!validCreationRequest(body))return reply(400,{code:'INVALID',message:'Revise os dados de criação.'});
      const catalog=await deps.compendium(token).getCreationCatalog(body.draft);
      const canonical=validateCreationRequest(catalog,body);
      const record=await deps.persist(userId,body,canonical);
      return reply(200,{record});
    }catch(error){
      if(error instanceof CreationError)return reply(error.code==='ACCESS'?403:error.code==='DIVERGED'?409:error.code==='INVALID'?400:503,{code:error.code,message:error.message,problems:error.problems});
      return reply(503,{code:'UNAVAILABLE',message:'Não foi possível concluir a criação. Seus dados foram preservados; tente novamente.'});
    }
  };
}
