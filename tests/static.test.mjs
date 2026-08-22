import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const arquivos={};
for(const nome of ["index.html","admin.html","app.js","style.css","sw.js","firebase.json","manifest.webmanifest","firestore.rules"]){
  arquivos[nome]=await readFile(new URL(`../${nome}`,import.meta.url),"utf8");
}

function ids(html){ return [...html.matchAll(/\sid="([^"]+)"/g)].map(resultado=>resultado[1]); }
function recurso(html,tipo){
  const padrao=tipo==="script"?/<script[^>]+src="([^"]+)"/:/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/;
  return html.match(padrao)?.[1];
}

test("HTML não contém IDs duplicados nem labels órfãos",()=>{
  for(const nome of ["index.html","admin.html"]){
    const lista=ids(arquivos[nome]);
    assert.equal(new Set(lista).size,lista.length,`${nome} contém ID duplicado`);
    for(const alvo of [...arquivos[nome].matchAll(/<label[^>]+for="([^"]+)"/g)].map(resultado=>resultado[1])){
      assert.ok(lista.includes(alvo),`${nome}: label aponta para #${alvo}, que não existe`);
    }
  }
});

test("páginas e service worker usam as mesmas versões",()=>{
  const scriptPublico=recurso(arquivos["index.html"],"script"), scriptAdmin=recurso(arquivos["admin.html"],"script");
  const estiloPublico=recurso(arquivos["index.html"],"style"), estiloAdmin=recurso(arquivos["admin.html"],"style");
  assert.equal(scriptPublico,scriptAdmin);
  assert.equal(estiloPublico,estiloAdmin);
  assert.match(arquivos["sw.js"],new RegExp(scriptPublico.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.match(arquivos["sw.js"],new RegExp(estiloPublico.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.match(arquivos["sw.js"],/core\.js\?v=20260821-1/);
  assert.match(arquivos["admin.html"],/id="pdfDataInicial"/);
  assert.match(arquivos["admin.html"],/id="pdfDataFinal"/);
  assert.match(arquivos["admin.html"],/<option value="personalizado">Período personalizado<\/option>/);
  assert.match(arquivos["app.js"],/A data inicial não pode ser posterior à data final/);
  assert.match(arquivos["app.js"],/contarNoIntervalo\(filtradosPorCriterios,hoje,hoje\)/);
  assert.match(arquivos["app.js"],/modoVisualizacao\.value="mes"/);
  assert.match(arquivos["app.js"],/tipoEvento"\)\) \$\("tipoEvento"\)\.value="POLOST"/);
  assert.match(arquivos["app.js"],/grupo=`\$\{data\}\|\$\{obterEsquadrao\(e\)\}`/);
});

test("JSON de configuração e manifesto são válidos",()=>{
  assert.doesNotThrow(()=>JSON.parse(arquivos["firebase.json"]));
  assert.doesNotThrow(()=>JSON.parse(arquivos["manifest.webmanifest"]));
});

test("regras mantêm escrita restrita, exclusão física bloqueada e erros privados",()=>{
  assert.match(arquivos["firestore.rules"],/4rpmon-p3@bm\.rs\.gov\.br/);
  assert.match(arquivos["firestore.rules"],/allow delete: if false/);
  assert.match(arquivos["firestore.rules"],/match \/errosCliente\/\{erroId\}/);
  assert.match(arquivos["firestore.rules"],/allow read: if administradorP3\(\)/);
});
