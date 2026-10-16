import test from 'node:test';
import assert from 'node:assert/strict';
import { createCreationHandler } from '../supabase/functions/_shared/creation-engine.js';
import { resolveCreation } from '../packages/character-creation/resolve';
import { fixture,id } from './fixtures/creation';
import { readSheetFile } from '../apps/web/lib/sheet-file';

test('bundled server authenticates callers and saves only its rebuilt projection',async()=>{
 const {catalog,draft}=fixture();const preview=resolveCreation(catalog,draft);let saves=0;
 const handler=createCreationHandler({authenticate:async (token:string)=>token==='test-jwt'?id(900):null,compendium:()=>({getCreationCatalog:async()=>catalog}),persist:async(user:string,request:any,canonical:any)=>{saves++;assert.equal(user,id(900));return {id:request.requestId,conteudo:canonical.content,nome:request.name,versao_esquema:1};}});
 const request={campaignId:id(901),name:'Teste',requestId:id(902),draft,expectedSheet:preview.sheet};
 const send=(body:unknown,token='test-jwt')=>handler(new Request('http://localhost/criar-personagem',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(body)}));
 assert.equal((await send(request,'bad')).status,401);assert.equal(saves,0);
 const forged=structuredClone(request);forged.expectedSheet!.atributos.for.valor=30;assert.equal((await send(forged)).status,409);assert.equal(saves,0);
 assert.equal((await send({...request,draft:{}})).status,400);assert.equal(saves,0);
 assert.equal((await send({...request,irrelevant:'x'.repeat(524289)})).status,413);
 const response=await send(request);assert.equal(response.status,200);assert.equal(saves,1);
 const {record}=await response.json();const imported=readSheetFile(JSON.stringify(record));assert.deepEqual(imported.content.criacao!.draft,draft);
});

