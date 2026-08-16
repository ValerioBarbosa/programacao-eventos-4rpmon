import test from "node:test";
import assert from "node:assert/strict";

import {
  chaveMunicipio, contabilizarEfetivo, extrairEfetivoTexto,
  nomeMunicipio, numeroInteiro, obterEfetivoEstruturado
} from "../core.js";

test("soma cada campo de efetivo de forma independente",()=>{
  const total=contabilizarEfetivo([
    {efetivoConjuntos:235,efetivoMEs:3,efetivoEquinos:3},
    {efetivoConjuntos:5,efetivoMEs:7,efetivoEquinos:4}
  ]);
  assert.deepEqual(total,{conjuntos:240,mes:10,equinos:7});
});

test("mantém compatibilidade com registros de efetivo em texto",()=>{
  assert.deepEqual(extrairEfetivoTexto("2 Conj · 4 MEs · 3 cavalos"),{conjuntos:2,mes:4,equinos:3});
  assert.deepEqual(obterEfetivoEstruturado({efetivo:"6 conjuntos, 8 militares estaduais e 5 equinos"}),{conjuntos:6,mes:8,equinos:5});
});

test("campos estruturados têm prioridade sobre o texto legado",()=>{
  assert.deepEqual(obterEfetivoEstruturado({efetivoConjuntos:1,efetivoMEs:2,efetivoEquinos:3,efetivo:"99 Conj · 99 MEs · 99 equinos"}),{conjuntos:1,mes:2,equinos:3});
});

test("normaliza números inválidos sem criar efetivo negativo",()=>{
  assert.equal(numeroInteiro(-4),0);
  assert.equal(numeroInteiro("3.9"),3);
  assert.equal(numeroInteiro("inválido"),0);
});

test("unifica municípios com sufixo de estado",()=>{
  assert.equal(nomeMunicipio("Porto Alegre/RS"),"Porto Alegre");
  assert.equal(nomeMunicipio("Dois Irmãos - RS"),"Dois Irmãos");
  assert.equal(chaveMunicipio("  São Gabriel / RS "),"sao gabriel");
});
