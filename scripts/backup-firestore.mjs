import {createHash} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";

const configuracao=await readFile(new URL("../firebase-config.js",import.meta.url),"utf8");
const projeto=configuracao.match(/projectId:\s*"([^"]+)"/)?.[1];
const chave=configuracao.match(/apiKey:\s*"([^"]+)"/)?.[1];
if(!projeto || !chave) throw new Error("Configuração pública do Firebase não encontrada.");

function decodificar(valor={}){
  if("nullValue" in valor) return null;
  if("stringValue" in valor) return valor.stringValue;
  if("booleanValue" in valor) return valor.booleanValue;
  if("integerValue" in valor) return Number(valor.integerValue);
  if("doubleValue" in valor) return valor.doubleValue;
  if("timestampValue" in valor) return valor.timestampValue;
  if("referenceValue" in valor) return valor.referenceValue;
  if("bytesValue" in valor) return valor.bytesValue;
  if("geoPointValue" in valor) return valor.geoPointValue;
  if("arrayValue" in valor) return (valor.arrayValue.values||[]).map(decodificar);
  if("mapValue" in valor) return decodificarCampos(valor.mapValue.fields||{});
  return null;
}

function decodificarCampos(campos={}){
  return Object.fromEntries(Object.entries(campos).map(([nome,valor])=>[nome,decodificar(valor)]));
}

const documentos=[];
let token="";
do{
  const url=new URL(`https://firestore.googleapis.com/v1/projects/${projeto}/databases/(default)/documents/eventos`);
  url.searchParams.set("pageSize","300");
  url.searchParams.set("key",chave);
  if(token) url.searchParams.set("pageToken",token);
  const resposta=await fetch(url,{headers:{Accept:"application/json"}});
  if(!resposta.ok) throw new Error(`Falha no backup do Firestore: HTTP ${resposta.status}.`);
  const pagina=await resposta.json();
  for(const documento of pagina.documents||[]){
    documentos.push({
      id:documento.name.split("/").at(-1),
      criadoNoFirestore:documento.createTime,
      atualizadoNoFirestore:documento.updateTime,
      ...decodificarCampos(documento.fields||{})
    });
  }
  token=pagina.nextPageToken||"";
}while(token);

documentos.sort((a,b)=>String(a.id).localeCompare(String(b.id)));
const geradoEm=new Date().toISOString();
const conteudo=JSON.stringify({versao:1,geradoEm,projeto,colecao:"eventos",quantidade:documentos.length,eventos:documentos},null,2)+"\n";
const hash=createHash("sha256").update(conteudo).digest("hex");
const diretorio=resolve("backups");
await mkdir(diretorio,{recursive:true});
await writeFile(resolve(diretorio,"firestore-eventos.json"),conteudo,{mode:0o600});
await writeFile(resolve(diretorio,"firestore-eventos.sha256"),`${hash}  firestore-eventos.json\n`,{mode:0o600});
console.log(`Backup concluído: ${documentos.length} eventos; SHA-256 ${hash}.`);
