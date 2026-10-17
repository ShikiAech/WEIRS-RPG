import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { createCreationHandler,createCompendiumRepository,CreationError } from '../_shared/creation-engine.js';

const url=Deno.env.get('SUPABASE_URL')!;
const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
// Server-only runtime secret. This module is never imported by the web application.
const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const scoped=(token:string)=>createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createCreationHandler({
  async authenticate(token:string){const {data,error}=await scoped(token).auth.getUser(token);return error?null:data.user?.id ?? null;},
  compendium(token:string){return createCompendiumRepository(scoped(token));},
  async recover(_userId:string,request:any,token:string){
    const {data,error}=await scoped(token).rpc('recuperar_criacao_personagem',{p_pedido:request.requestId,p_campanha:request.campaignId,p_nome:request.name,p_rascunho:request.draft,p_previa:request.expectedSheet});
    if(error)throw new CreationError(error.code==='WF001'?'DIVERGED':error.code==='WF002'?'ACCESS':'UNAVAILABLE',error.code==='WF001'?'Esta tentativa já foi usada. Confira suas fichas antes de iniciar outra criação.':error.code==='WF002'?'Seu acesso à campanha não permite recuperar esta ficha.':'Não foi possível consultar a tentativa anterior. Tente novamente.');
    return Array.isArray(data)?data[0]??null:data?.id?data:null;
  },
  async persist(userId:string,request:any,canonical:any){
    const {data,error}=await service.rpc('registrar_criacao_personagem',{p_usuario:userId,p_campanha:request.campaignId,p_nome:request.name,p_pedido:request.requestId,p_rascunho:request.draft,p_conteudo:canonical.content,p_concessoes:canonical.snapshot.contributions});
    if(error)throw new CreationError(error.code==='WF002'?'ACCESS':error.code==='WF001'?'DIVERGED':'UNAVAILABLE',error.code==='WF002'?'Seu acesso à campanha não permite criar personagens.':error.code==='WF001'?'Esta tentativa já foi usada. Revise e inicie uma nova criação.':'Não foi possível gravar a ficha. Tente novamente.');
    const record=Array.isArray(data)?data[0]:data;if(!record?.id)throw new CreationError('UNAVAILABLE','A criação não devolveu uma ficha válida.');return record;
  },
}));
