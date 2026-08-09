import {
  db, collection, addDoc, updateDoc, doc, onSnapshot, query,
  serverTimestamp, writeBatch,
  auth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "./firebase-config.js";

const hojeLocal = new Date();
const anoAtual = hojeLocal.getFullYear();
let ano = anoAtual;
const nomesMeses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const classesPorTipo = {
  "POLOST":"tipo-01", "Operações":"tipo-02", "Manifestação Social":"tipo-03",
  "Jogos de Futebol":"tipo-04", "Passeio a Cavalo":"tipo-05", "Carnaval":"tipo-06",
  "Cavalgadas":"tipo-07", "Rodeios":"tipo-08", "Dragões, Representações e Outros":"tipo-09",
  "Clarim, Formaturas e Reuniões":"tipo-10", "Shows e Eventos":"tipo-11",
  "Empréstimo de VTR ou CAM BOX":"tipo-12", "Transporte de Equinos e Provas":"tipo-13",
  "Viagens e Deslocamentos Operacionais":"tipo-14"
};

let eventos = [];
let eventosFiltradosAtuais = [];
let eventosImportacao = [];
let eventoEmEdicaoId = null;
let modoP3 = false;
let primeiraCargaConcluida = false;
let debounceId = null;
let ultimoElementoComFoco = null;
let mostrarPassados = false;

const $ = id => document.getElementById(id);
const mesSelecionado = $("mesSelecionado");
const anoSelecionado = $("anoSelecionado");
const pesquisa = $("pesquisa");
const filtroTipo = $("filtroTipo");
const filtroEsquadrao = $("filtroEsquadrao");
const modoVisualizacao = $("modoVisualizacao");
const dataReferencia = $("dataReferencia");
const tituloMes = $("tituloMes");
const nomeMesResumo = $("nomeMesResumo");
const totalEventos = $("totalEventos");
const listaEventos = $("listaEventos");
const anoResumo = $("anoResumo");
const statusAgenda = $("statusAgenda");
const botaoPassados = $("botaoPassados");
const subtituloAgenda = $("subtituloAgenda");
const rodapeAgenda = $("rodapeAgenda");
const mensagem = $("mensagem");
const areaAdministrativa = $("areaAdministrativa");
const areaImportacao = $("areaImportacao");
const areaAuditoria = $("areaAuditoria");
const atalhosAdministrativos = $("atalhosAdministrativos");
const sobreposicaoSenha = $("sobreposicaoSenha");
const campoEmail = $("campoEmail");
const campoSenha = $("campoSenha");
const tituloFormulario = $("tituloFormulario");
const botaoSalvar = $("botaoSalvar");

function escaparHTML(texto){
  return String(texto ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function normalizar(texto){
  return String(texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
}

function agoraISO(){ return new Date().toISOString(); }
function usuarioAtual(){
  return { uid: auth.currentUser?.uid || "", email: auth.currentUser?.email || "não identificado" };
}

function obterDataInicial(e){ return e.dataInicial || e.data || ""; }
function obterDataFinal(e){ return e.dataFinal || e.dataInicial || e.data || ""; }
function obterHoraInicial(e){ return e.horaInicial || e.hora || ""; }
function obterHoraFinal(e){ return e.horaFinal || ""; }
function obterEsquadrao(e){ return e.esquadrao || "1"; }
function formatarData(data){ if(!data) return ""; const [a,m,d]=data.split("-"); return `${d}/${m}/${a}`; }
function formatarHora(hora){ return hora || "--:--"; }
function chaveDuplicidade(e){ return `${obterDataInicial(e)}|${obterHoraInicial(e)}|${normalizar(e.nome)}`; }
function encontrarDuplicado(evento, ignorarId=""){
  const chave = chaveDuplicidade(evento);
  return eventos.find(e => !e.excluido && e.id !== ignorarId && chaveDuplicidade(e) === chave);
}

function obterClasseTipo(tipo){ return classesPorTipo[tipo] || "tipo-outros"; }
function obterClasseEsquadrao(esq){ return esq === "2" ? "esquadrao-2" : "esquadrao-1"; }
function obterTextoEsquadrao(esq){ return esq === "2" ? "2º Esquadrão" : "1º Esquadrão"; }
function formatarPeriodoHorario(e){
  const inicio=obterHoraInicial(e), fim=obterHoraFinal(e);
  if(!inicio) return "Horário a definir";
  return fim ? `${inicio} às ${fim}` : inicio;
}

function dataLocalISO(data=new Date()){
  const y=data.getFullYear(), m=String(data.getMonth()+1).padStart(2,"0"), d=String(data.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function somarDias(dataISO, dias){
  const data=new Date(`${dataISO}T12:00:00`); data.setDate(data.getDate()+dias); return dataLocalISO(data);
}

function obterAnosDisponiveis(){
  const anos=new Set([anoAtual-1,anoAtual,anoAtual+1,anoAtual+2,ano]);
  eventos.forEach(e=>{
    const inicio=obterDataInicial(e), fim=obterDataFinal(e);
    if(/^\d{4}-/.test(inicio)) anos.add(Number(inicio.slice(0,4)));
    if(/^\d{4}-/.test(fim)) anos.add(Number(fim.slice(0,4)));
  });
  return [...anos].filter(Number.isFinite).sort((a,b)=>a-b);
}

function sincronizarOpcoesAno(){
  if(!anoSelecionado) return;
  const selecionado=ano;
  anoSelecionado.innerHTML=obterAnosDisponiveis().map(valor=>`<option value="${valor}">${valor}</option>`).join("");
  anoSelecionado.value=String(selecionado);
}

function atualizarConfiguracaoAno({preservarData=false}={}){
  const inicio=`${ano}-01-01`, fim=`${ano}-12-31`;
  [dataReferencia,$("dataInicial"),$("dataFinal")].forEach(campo=>{
    if(!campo) return;
    campo.min=inicio; campo.max=fim;
  });
  if(dataReferencia && (!preservarData || !dataReferencia.value.startsWith(`${ano}-`))){
    const mes=Number(mesSelecionado?.value ?? 0)+1;
    dataReferencia.value=ano===anoAtual?dataLocalISO():`${ano}-${String(mes).padStart(2,"0")}-01`;
  }
  if(anoResumo) anoResumo.textContent=String(ano);
  if(subtituloAgenda){
    subtituloAgenda.textContent=areaAdministrativa?`Painel de gerenciamento — P3 · ${ano}`:`Agenda de eventos e atividades — ${ano}`;
  }
  if(rodapeAgenda){
    rodapeAgenda.textContent=areaAdministrativa?`Programação Operacional 4ºRPMon — Painel do P3 · ${ano}`:`Programação Operacional 4ºRPMon — Agenda de eventos de ${ano}`;
  }
  const meta=$("metaDescricao");
  if(meta) meta.content=`Agenda de eventos e atividades do 4ºRPMon — ${ano}.`;
  const ogDescricao=$("ogDescricao");
  if(ogDescricao) ogDescricao.content=`Agenda de eventos e atividades do 4ºRPMon — ${ano}.`;
}

function selecionarAno(valor,{preservarData=false}={}){
  ano=Number(valor)||anoAtual;
  sincronizarOpcoesAno();
  atualizarConfiguracaoAno({preservarData});
}

function atualizarEstadoAtalhos(){
  const modo=modoVisualizacao?.value || "mes", hoje=dataLocalISO();
  const estados={atalhoHoje:modo==="dia"&&dataReferencia?.value===hoje,atalhoSemana:modo==="semana",atalhoProximos:modo==="proximos"};
  Object.entries(estados).forEach(([id,ativo])=>{
    const botao=$(id); if(!botao) return;
    botao.classList.toggle("ativo",ativo); botao.setAttribute("aria-pressed",String(ativo));
  });
}

function irParaResultado(){
  tituloMes?.scrollIntoView({behavior:"smooth",block:"start"});
}

function aplicarAtalho(modo){
  const hoje=dataLocalISO(), anoHoje=Number(hoje.slice(0,4));
  selecionarAno(anoHoje,{preservarData:true});
  if(mesSelecionado) mesSelecionado.value=String(Number(hoje.slice(5,7))-1);
  if(dataReferencia) dataReferencia.value=hoje;
  if(modoVisualizacao) modoVisualizacao.value=modo;
  document.body.dataset.visualizacao=modo;
  mostrarPassados=false; renderizar(); irParaResultado();
}

window.irParaHoje=function(){ aplicarAtalho("dia"); };
window.irParaSemana=function(){ aplicarAtalho("semana"); };
window.irParaProximos=function(){ aplicarAtalho("proximos"); };
window.alternarEventosPassados=function(){ mostrarPassados=!mostrarPassados; renderizar(); };
window.limparFiltros=function(){
  if(pesquisa) pesquisa.value="";
  if(filtroTipo) filtroTipo.value="todos";
  if(filtroEsquadrao) filtroEsquadrao.value="todos";
  if(statusAgenda) statusAgenda.textContent="Filtros removidos.";
  renderizar();
};
window.recarregarAgenda=function(){ window.location.reload(); };

function intervaloVisualizacao(){
  const modo=modoVisualizacao?.value || "mes";
  const mes=Number(mesSelecionado?.value || 0);
  const referencia=dataReferencia?.value || `${ano}-${String(mes+1).padStart(2,"0")}-01`;
  if(modo === "ano") return {inicio:`${ano}-01-01`,fim:`${ano}-12-31`,titulo:`Agenda anual de ${ano}`};
  if(modo === "proximos"){
    const hoje=dataLocalISO(), fim=somarDias(hoje,29);
    return {inicio:hoje,fim,titulo:`Próximos 30 dias · ${formatarData(hoje)} a ${formatarData(fim)}`};
  }
  if(modo === "dia") return {inicio:referencia,fim:referencia,titulo:formatarData(referencia)};
  if(modo === "semana"){
    const d=new Date(`${referencia}T12:00:00`), dia=d.getDay() || 7;
    const inicio=somarDias(referencia,1-dia), fim=somarDias(inicio,6);
    return {inicio,fim,titulo:`Semana de ${formatarData(inicio)} a ${formatarData(fim)}`};
  }
  const inicio=`${ano}-${String(mes+1).padStart(2,"0")}-01`;
  const fim=dataLocalISO(new Date(ano,mes+1,0,12));
  return {inicio,fim,titulo:`${nomesMeses[mes]} de ${ano}`};
}

function iniciarEscutaEventos(){
  renderizarCarregamento();
  onSnapshot(query(collection(db,"eventos")), snapshot => {
    eventos=snapshot.docs.map(documento => ({id:documento.id,...documento.data()}));
    primeiraCargaConcluida=true; sincronizarOpcoesAno(); renderizar(); renderizarAuditoria();
  }, () => {
    primeiraCargaConcluida=true;
    if(statusAgenda) statusAgenda.textContent="Falha ao carregar a programação.";
    if(listaEventos) listaEventos.innerHTML='<div class="estado-agenda estado-erro"><strong>Não foi possível carregar os eventos</strong><span>Verifique sua conexão e tente novamente.</span><button type="button" onclick="recarregarAgenda()">Tentar novamente</button></div>';
  });
}

function renderizarCarregamento(){
  if(statusAgenda) statusAgenda.textContent="Carregando programação...";
  if(!listaEventos) return;
  listaEventos.innerHTML='<div class="carregamento-agenda" aria-hidden="true"><div class="skeleton skeleton-titulo"></div><div class="skeleton-grid"><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div></div></div>';
}

window.abrirCaixaSenha=function(){
  if(!sobreposicaoSenha) return; ultimoElementoComFoco=document.activeElement;
  sobreposicaoSenha.style.display="flex"; if(campoEmail) campoEmail.value=""; if(campoSenha) campoSenha.value="";
  (campoEmail || campoSenha)?.focus();
};
window.fecharCaixaSenha=function(){ if(sobreposicaoSenha) sobreposicaoSenha.style.display="none"; ultimoElementoComFoco?.focus(); };
window.validarSenha=async function(){
  const email=campoEmail?.value.trim(), senha=campoSenha?.value;
  if(!email || !senha){ alert("Informe e-mail e senha."); return; }
  try{ await signInWithEmailAndPassword(auth,email,senha); window.fecharCaixaSenha(); }
  catch{ alert("E-mail ou senha incorretos."); }
};
window.sairModoP3=async function(){ try{ await signOut(auth); }catch{ alert("Não foi possível sair."); } };

if(sobreposicaoSenha){
  sobreposicaoSenha.addEventListener("click",e=>{ if(e.target===sobreposicaoSenha) window.fecharCaixaSenha(); });
  document.addEventListener("keydown",e=>{ if(e.key==="Escape") window.fecharCaixaSenha(); });
}

onAuthStateChanged(auth, usuario => {
  modoP3=!!usuario; if(!modoP3) cancelarEdicao(); atualizarPermissoes(); renderizar();
});

function atualizarPermissoes(){
  const botao=$("botaoAcessoP3"), badge=$("badgeP3");
  if(!botao || !badge || !areaAdministrativa) return;
  botao.style.display=modoP3?"none":"inline-block"; badge.style.display=modoP3?"flex":"none";
  areaAdministrativa.style.display=modoP3?"block":"none";
  if(atalhosAdministrativos) atalhosAdministrativos.style.display=modoP3?"flex":"none";
  if(!modoP3){ if(areaImportacao) areaImportacao.style.display="none"; if(areaAuditoria) areaAuditoria.style.display="none"; }
}

function eventoNoIntervalo(e,inicio,fim){
  return obterDataInicial(e) <= fim && obterDataFinal(e) >= inicio;
}

function metadado(label,valor){ return valor ? `<span class="meta-item"><b>${escaparHTML(label)}:</b> ${escaparHTML(valor)}</span>` : ""; }

function renderizar(){
  if(!listaEventos || !mesSelecionado || !pesquisa || !filtroTipo || !totalEventos) return;
  if(!primeiraCargaConcluida){ renderizarCarregamento(); return; }
  const {inicio,fim,titulo}=intervaloVisualizacao();
  const termo=normalizar(pesquisa.value), tipo=filtroTipo.value, esq=filtroEsquadrao?.value || "todos";
  const hoje=dataLocalISO(), modo=modoVisualizacao?.value || "mes";
  const filtrados=eventos.filter(e=>{
    if(e.excluido || !obterDataInicial(e) || !eventoNoIntervalo(e,inicio,fim)) return false;
    const haystack=normalizar(`${e.nome} ${e.local} ${e.municipio} ${e.observacoes} ${e.ordemServico} ${e.efetivo} ${e.tipo}`);
    return (!termo || haystack.includes(termo)) && (tipo==="todos" || e.tipo===tipo) && (esq==="todos" || obterEsquadrao(e)===esq);
  }).sort((a,b)=>`${obterDataInicial(a)}${obterHoraInicial(a)}`.localeCompare(`${obterDataInicial(b)}${obterHoraInicial(b)}`));
  eventosFiltradosAtuais=filtrados; totalEventos.textContent=filtrados.length;
  if(tituloMes) tituloMes.textContent=titulo;
  if(nomeMesResumo) nomeMesResumo.textContent=modo==="ano"?"Ano completo":titulo;
  if(anoResumo) anoResumo.textContent=modo==="proximos"&&inicio.slice(0,4)!==fim.slice(0,4)?`${inicio.slice(0,4)}–${fim.slice(0,4)}`:String(ano);
  atualizarEstadoAtalhos();
  listaEventos.innerHTML="";
  const temFiltros=!!termo || tipo!=="todos" || esq!=="todos";
  if(!filtrados.length){
    if(statusAgenda) statusAgenda.textContent="Nenhum evento encontrado com os critérios selecionados.";
    listaEventos.innerHTML=`<div class="estado-agenda estado-vazio"><strong>Nenhum evento encontrado</strong><span>${temFiltros?"Tente remover um dos filtros ou pesquisar outro termo.":"Não há eventos cadastrados para este período."}</span>${temFiltros?'<button type="button" onclick="limparFiltros()">Limpar filtros</button>':""}</div>`;
    if(botaoPassados) botaoPassados.hidden=true;
    return;
  }
  const grupos=new Map();
  filtrados.forEach(e=>{ const data=obterDataInicial(e); if(!grupos.has(data)) grupos.set(data,[]); grupos.get(data).push(e); });
  const mesAtual=inicio.slice(0,7)===hoje.slice(0,7);
  const diasPassados=[...grupos.keys()].filter(data=>data<hoje);
  const deveRecolher=modo==="mes"&&mesAtual&&diasPassados.length>0;
  const eventosPassados=diasPassados.reduce((total,data)=>total+(grupos.get(data)?.length||0),0);
  if(botaoPassados){
    botaoPassados.hidden=!deveRecolher;
    botaoPassados.textContent=mostrarPassados?"Recolher eventos passados":`Mostrar ${eventosPassados} ${eventosPassados===1?"evento passado":"eventos passados"}`;
    botaoPassados.setAttribute("aria-pressed",String(mostrarPassados));
  }
  if(statusAgenda){
    const ocultos=deveRecolher&&!mostrarPassados?eventosPassados:0;
    statusAgenda.textContent=`${filtrados.length} ${filtrados.length===1?"evento encontrado":"eventos encontrados"}${ocultos?` · ${ocultos} recolhidos`:""}.`;
  }
  grupos.forEach((itens,data)=>{
    if(deveRecolher&&!mostrarPassados&&data<hoje) return;
    const grupo=document.createElement("section");
    grupo.className=`grupo-dia ${data===hoje?"grupo-hoje":data>hoje?"grupo-futuro":"grupo-passado"}`;
    const tituloDia=document.createElement("div");
    tituloDia.className="cabecalho-dia";
    tituloDia.innerHTML=`<div><span>${data===hoje?"Hoje":data<hoje?"Evento passado":"Agenda do dia"}</span><h3>${escaparHTML(formatarData(data))}</h3></div><strong>${itens.length} ${itens.length===1?"evento":"eventos"}</strong>`;
    grupo.appendChild(tituloDia);
    const grade=document.createElement("div"); grade.className="grade-dia";
    itens.forEach(e=>{
      const card=document.createElement("article");
      card.className=`evento-card ${obterClasseTipo(e.tipo)} ${obterClasseEsquadrao(obterEsquadrao(e))} ${data===hoje?"evento-hoje":""}`;
      if(data===hoje) card.setAttribute("aria-label",`Evento de hoje: ${e.nome||"Evento"}`);
      const acoes=modoP3&&areaAdministrativa?`<div class="acoes-card"><button class="botao-editar" onclick="iniciarEdicao('${e.id}')">Editar</button><button class="botao-excluir" onclick="excluirEvento('${e.id}')">Excluir</button></div>`:"";
      card.innerHTML=`${data===hoje?'<span class="selo-hoje">Hoje</span>':""}<div class="evento-topo"><span class="evento-data">${escaparHTML(formatarPeriodoHorario(e))}</span><span class="evento-tipo">${escaparHTML(e.tipo||"Outros")}</span></div><span class="evento-esquadrao">${escaparHTML(obterTextoEsquadrao(obterEsquadrao(e)))}</span><div class="evento-nome">${escaparHTML(e.nome)}</div><div class="evento-local">${escaparHTML(e.local||"")}</div><div class="evento-metadados">${metadado("Município",e.municipio)}${metadado("OSv/NSv",e.ordemServico)}${metadado("Efetivo",e.efetivo)}${metadado("Observações",e.observacoes)}</div>${acoes}`;
      grade.appendChild(card);
    });
    grupo.appendChild(grade); listaEventos.appendChild(grupo);
  });
}

function lerFormulario(){
  const dataInicial=$("dataInicial")?.value, dataFinal=$("dataFinal")?.value || dataInicial;
  return {
    dataInicial,dataFinal,horaInicial:$("horaInicial")?.value||"",horaFinal:$("horaFinal")?.value||"",
    nome:$("nomeEvento")?.value.trim()||"",local:$("localEvento")?.value.trim()||"",
    municipio:$("municipioEvento")?.value.trim()||"",ordemServico:$("ordemServicoEvento")?.value.trim()||"",
    efetivo:$("efetivoEvento")?.value.trim()||"",observacoes:$("observacoesEvento")?.value.trim()||"",
    tipo:$("tipoEvento")?.value||"",esquadrao:$("esquadraoEvento")?.value||"1"
  };
}

function validarEvento(dados){
  if(!dados.dataInicial || !dados.nome) return "Informe a data inicial e o nome do evento.";
  if(!dados.dataInicial.startsWith(`${ano}-`) || !dados.dataFinal.startsWith(`${ano}-`)) return `As datas devem pertencer a ${ano}.`;
  if(dados.dataFinal < dados.dataInicial) return "A data final não pode ser anterior à inicial.";
  if(dados.dataInicial===dados.dataFinal && dados.horaInicial && dados.horaFinal && dados.horaFinal<dados.horaInicial) return "O horário final não pode ser anterior ao inicial.";
  return "";
}

window.salvarEvento=async function(){
  if(!modoP3){ alert("Apenas membros do P3 podem incluir ou editar eventos."); return; }
  const dados=lerFormulario(), erro=validarEvento(dados); if(erro){ alert(erro); return; }
  const duplicado=encontrarDuplicado(dados,eventoEmEdicaoId||"");
  if(duplicado){ alert(`Possível duplicidade: já existe “${duplicado.nome}” em ${formatarData(obterDataInicial(duplicado))}, às ${formatarHora(obterHoraInicial(duplicado))}.`); return; }
  const usuario=usuarioAtual(), instante=agoraISO();
  try{
    if(eventoEmEdicaoId){
      const atual=eventos.find(e=>e.id===eventoEmEdicaoId) || {};
      const historico=[...(atual.historico||[]),{acao:"editado",em:instante,por:usuario.email,uid:usuario.uid}];
      await updateDoc(doc(db,"eventos",eventoEmEdicaoId),{...dados,atualizadoEm:serverTimestamp(),atualizadoEmISO:instante,atualizadoPor:usuario.email,atualizadoPorUid:usuario.uid,historico});
      if(mensagem) mensagem.textContent="Evento atualizado com sucesso.";
    }else{
      await addDoc(collection(db,"eventos"),{...dados,criadoEm:serverTimestamp(),criadoEmISO:instante,criadoPor:usuario.email,criadoPorUid:usuario.uid,atualizadoEmISO:instante,atualizadoPor:usuario.email,historico:[{acao:"criado",em:instante,por:usuario.email,uid:usuario.uid}]});
      if(mensagem) mensagem.textContent="Evento adicionado com sucesso.";
    }
    cancelarEdicao(); mesSelecionado.value=Number(dados.dataInicial.split("-")[1])-1;
  }catch{ alert("Não foi possível salvar o evento. Verifique sua conexão ou as regras do banco."); }
  setTimeout(()=>{ if(mensagem) mensagem.textContent=""; },3000);
};

window.iniciarEdicao=function(id){
  if(!modoP3) return; const e=eventos.find(item=>item.id===id); if(!e) return; eventoEmEdicaoId=id;
  const valores={dataInicial:obterDataInicial(e),dataFinal:obterDataFinal(e),horaInicial:obterHoraInicial(e),horaFinal:obterHoraFinal(e),nomeEvento:e.nome||"",localEvento:e.local||"",municipioEvento:e.municipio||"",ordemServicoEvento:e.ordemServico||"",efetivoEvento:e.efetivo||"",observacoesEvento:e.observacoes||"",tipoEvento:e.tipo||"POLOST",esquadraoEvento:obterEsquadrao(e)};
  Object.entries(valores).forEach(([idCampo,valor])=>{ if($(idCampo)) $(idCampo).value=valor; });
  if(tituloFormulario) tituloFormulario.textContent="Editar evento — P3"; if(botaoSalvar) botaoSalvar.textContent="Salvar alterações";
  areaAdministrativa?.scrollIntoView({behavior:"smooth"});
};

function cancelarEdicao(){
  eventoEmEdicaoId=null;
  ["dataInicial","dataFinal","horaInicial","horaFinal","nomeEvento","localEvento","municipioEvento","ordemServicoEvento","efetivoEvento","observacoesEvento"].forEach(id=>{ if($(id)) $(id).value=""; });
  if($("esquadraoEvento")) $("esquadraoEvento").value="1";
  if(tituloFormulario) tituloFormulario.textContent="Adicionar evento — P3"; if(botaoSalvar) botaoSalvar.textContent="Adicionar";
}

window.excluirEvento=async function(id){
  if(!modoP3) return; const e=eventos.find(item=>item.id===id); if(!e || !confirm(`Excluir “${e.nome}”? O registro permanecerá na auditoria.`)) return;
  const usuario=usuarioAtual(), instante=agoraISO(), historico=[...(e.historico||[]),{acao:"excluído",em:instante,por:usuario.email,uid:usuario.uid}];
  try{ await updateDoc(doc(db,"eventos",id),{excluido:true,excluidoEm:serverTimestamp(),excluidoEmISO:instante,excluidoPor:usuario.email,historico}); }
  catch{ alert("Não foi possível excluir o evento."); }
};

window.alternarImportacao=function(){
  if(!modoP3 || !areaImportacao) return; areaImportacao.style.display=areaImportacao.style.display==="none"?"block":"none";
  if(areaImportacao.style.display==="block") areaImportacao.scrollIntoView({behavior:"smooth"});
};
window.alternarAuditoria=function(){
  if(!modoP3 || !areaAuditoria) return; areaAuditoria.style.display=areaAuditoria.style.display==="none"?"block":"none";
  if(areaAuditoria.style.display==="block"){ renderizarAuditoria(); areaAuditoria.scrollIntoView({behavior:"smooth"}); }
};

function extrairHorario(texto){
  const faixa=texto.match(/(\d{1,2})h(?::?(\d{2}))?\s*(?:às|as|a|-)\s*(\d{1,2})h(?::?(\d{2}))?/i);
  const hora=(h,m)=>`${String(Number(h)).padStart(2,"0")}:${m||"00"}`;
  if(faixa) return {horaInicial:hora(faixa[1],faixa[2]),horaFinal:hora(faixa[3],faixa[4])};
  const unica=texto.match(/(?:ECD\s*)?(\d{1,2})h(?::?(\d{2}))?/i);
  return {horaInicial:unica?hora(unica[1],unica[2]):"",horaFinal:""};
}
function detectarTipo(texto){
  const t=normalizar(texto);
  if(t.includes("polost")) return "POLOST"; if(t.includes("futebol")) return "Jogos de Futebol";
  if(t.includes("passeio a cavalo")) return "Passeio a Cavalo"; if(t.includes("operacao")) return "Operações";
  if(t.includes("cavalgada")) return "Cavalgadas"; if(t.includes("rodeio")) return "Rodeios";
  if(t.includes("visitacao") || t.includes("visitação")) return "Dragões, Representações e Outros";
  return "Dragões, Representações e Outros";
}
function limparMarcacao(texto){ return texto.replace(/^[\s\-*•]+/,"").replace(/\*/g,"").trim(); }
function analisarTextoProgramacao(texto){
  const linhas=texto.split(/\r?\n/); let contexto=null; const resultado=[];
  linhas.forEach((linha,indice)=>{
    const limpa=limparMarcacao(linha); if(!limpa) return;
    const cab=limpa.match(/Dia\s+(\d{1,2})\/(\d{1,2}).*?\/\s*(\d)[ºo]?\s*Esqd/i);
    if(cab){ contexto={dataInicial:`${ano}-${String(cab[2]).padStart(2,"0")}-${String(cab[1]).padStart(2,"0")}`,esquadrao:cab[3]}; return; }
    if(!contexto) return;
    const partes=limpa.split("|").map(p=>p.trim()).filter(Boolean); if(!partes.length) return;
    const primeiro=partes[0].replace(/^[-–]\s*/,"").trim();
    const horarios=extrairHorario(limpa);
    const ordem=(limpa.match(/\b(?:OSv|NSv)\s*\d+\b/i)||[])[0]||"";
    const efetivos=limpa.match(/\b\d{1,2}\s*(?:Conj|MEs?|Equinos?|equino)\b/gi)||[];
    const municipio=(limpa.match(/[A-Za-zÀ-ÿ ]+\/RS\b/)||[])[0]?.trim()||"";
    const nome=primeiro.replace(/^(POLOST|FUTEBOL|OPERAÇÃO CONVERGÊNCIA|PASSEIO A CAVALO|Visitação)\s*[-–:]?\s*/i,(m)=>m.replace(/\s*[-–:]?\s*$/," - ")).replace(/ - $/,"").trim();
    const evento={...contexto,dataFinal:contexto.dataInicial,...horarios,nome,tipo:detectarTipo(limpa),ordemServico:ordem,efetivo:efetivos.join(" · "),municipio,local:"",observacoes:partes.slice(1).filter(p=>!p.match(/\b(?:OSv|NSv)\s*\d+/i)).join(" · "),linha:indice+1};
    evento.erro=validarEvento(evento); evento.duplicado=!!encontrarDuplicado(evento); resultado.push(evento);
  });
  const chaves=new Set(); resultado.forEach(e=>{ const chave=chaveDuplicidade(e); if(chaves.has(chave)) e.duplicado=true; chaves.add(chave); });
  return resultado;
}

window.analisarImportacao=function(){
  const texto=$("textoImportacao")?.value||""; eventosImportacao=analisarTextoProgramacao(texto);
  const validos=eventosImportacao.filter(e=>!e.erro&&!e.duplicado), duplicados=eventosImportacao.filter(e=>e.duplicado).length;
  if($("resumoImportacao")) $("resumoImportacao").innerHTML=`<strong>${eventosImportacao.length}</strong> linhas reconhecidas · <strong>${validos.length}</strong> válidas · <strong>${duplicados}</strong> duplicidades`;
  if($("previaImportacao")) $("previaImportacao").innerHTML=eventosImportacao.length?`<div class="tabela-responsiva"><table><thead><tr><th>Status</th><th>Data</th><th>Evento</th><th>Horário</th><th>Esquadrão</th></tr></thead><tbody>${eventosImportacao.map(e=>`<tr class="${e.erro||e.duplicado?"linha-alerta":""}"><td>${e.erro?escaparHTML(e.erro):e.duplicado?"Duplicado":"Pronto"}</td><td>${formatarData(e.dataInicial)}</td><td>${escaparHTML(e.nome)}</td><td>${escaparHTML(formatarPeriodoHorario(e))}</td><td>${escaparHTML(obterTextoEsquadrao(e.esquadrao))}</td></tr>`).join("")}</tbody></table></div>`:'<div class="sem-eventos">Nenhum evento reconhecido. Confira o formato dos cabeçalhos “Dia DD/MM / N Esqd”.</div>';
  if($("botaoImportar")) $("botaoImportar").disabled=!validos.length;
};

window.importarEventosAnalisados=async function(){
  if(!modoP3) return; const validos=eventosImportacao.filter(e=>!e.erro&&!e.duplicado);
  if(!validos.length || !confirm(`Importar ${validos.length} eventos válidos?`)) return;
  const batch=writeBatch(db), usuario=usuarioAtual(), instante=agoraISO();
  validos.forEach(({linha,erro,duplicado,...evento})=>{
    const referencia=doc(collection(db,"eventos"));
    batch.set(referencia,{...evento,criadoEm:serverTimestamp(),criadoEmISO:instante,criadoPor:usuario.email,criadoPorUid:usuario.uid,atualizadoEmISO:instante,atualizadoPor:usuario.email,origem:"importação em lote",historico:[{acao:"importado",em:instante,por:usuario.email,uid:usuario.uid}]});
  });
  try{ await batch.commit(); if($("resumoImportacao")) $("resumoImportacao").innerHTML=`<strong>${validos.length} eventos importados com sucesso.</strong>`; eventosImportacao=[]; $("botaoImportar").disabled=true; }
  catch{ alert("Não foi possível concluir a importação. Nenhum evento do lote foi gravado."); }
};

function renderizarAuditoria(){
  const lista=$("listaAuditoria"); if(!lista) return;
  const ordenados=[...eventos].sort((a,b)=>String(b.excluidoEmISO||b.atualizadoEmISO||b.criadoEmISO||"").localeCompare(String(a.excluidoEmISO||a.atualizadoEmISO||a.criadoEmISO||"")));
  lista.innerHTML=ordenados.length?ordenados.map(e=>{
    const historico=e.historico||[{acao:"registro legado",em:e.atualizadoEmISO||e.criadoEmISO||"",por:e.atualizadoPor||e.criadoPor||"não registrado"}];
    return `<details class="item-auditoria"><summary><div><strong>${escaparHTML(e.nome||"Evento sem nome")}</strong><span>${formatarData(obterDataInicial(e))} · ${e.excluido?"Excluído":"Ativo"}</span></div><span>${historico.length} ações</span></summary><ol>${historico.slice().reverse().map(h=>`<li><b>${escaparHTML(h.acao)}</b> por ${escaparHTML(h.por)} <time>${h.em?new Date(h.em).toLocaleString("pt-BR"):"data não registrada"}</time></li>`).join("")}</ol></details>`;
  }).join(""):'<div class="sem-eventos">Nenhum histórico disponível.</div>';
}

function textoAgenda(){
  const {titulo}=intervaloVisualizacao(); let texto=`*PROGRAMAÇÃO OPERACIONAL 4º RPMon*\n${titulo}\n\n`;
  if(!eventosFiltradosAtuais.length) return `${texto}_Nenhum evento neste período._`;
  let dataAnterior="";
  eventosFiltradosAtuais.forEach(e=>{
    const data=obterDataInicial(e); if(data!==dataAnterior){ texto+=`*${formatarData(data)} — ${obterTextoEsquadrao(obterEsquadrao(e))}*\n`; dataAnterior=data; }
    texto+=`• *${e.nome}* | ${formatarPeriodoHorario(e)}`;
    if(e.local) texto+=` | ${e.local}`; if(e.municipio) texto+=` | ${e.municipio}`; if(e.efetivo) texto+=` | ${e.efetivo}`; if(e.ordemServico) texto+=` | *${e.ordemServico}*`; if(e.observacoes) texto+=` | ${e.observacoes}`; texto+="\n";
  }); return texto;
}

window.compartilharWhatsApp=function(){
  const texto=textoAgenda(); window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`,"_blank","noopener,noreferrer");
};

async function carregarJsPDF(){
  if(window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  await new Promise((resolve,reject)=>{ const script=document.createElement("script"); script.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js"; script.onload=resolve; script.onerror=reject; document.head.appendChild(script); });
  return window.jspdf.jsPDF;
}

window.exportarPDF=async function(){
  try{
    const JsPDF=await carregarJsPDF(), pdf=new JsPDF({unit:"mm",format:"a4"});
    const {titulo}=intervaloVisualizacao(); let y=20;
    pdf.setFont("helvetica","bold"); pdf.setFontSize(16); pdf.text("Programação Operacional 4º RPMon",15,y); y+=8;
    pdf.setFont("helvetica","normal"); pdf.setFontSize(10); pdf.text(titulo,15,y); y+=10;
    eventosFiltradosAtuais.forEach(e=>{
      const linhas=pdf.splitTextToSize(`${formatarData(obterDataInicial(e))} · ${formatarPeriodoHorario(e)}\n${e.nome}\n${[e.tipo,obterTextoEsquadrao(obterEsquadrao(e)),e.local,e.municipio,e.efetivo,e.ordemServico,e.observacoes].filter(Boolean).join(" · ")}`,180);
      if(y+linhas.length*5>282){ pdf.addPage(); y=18; }
      pdf.setFont("helvetica","bold"); pdf.text(linhas[0],15,y); y+=5; pdf.setFont("helvetica","normal");
      linhas.slice(1).forEach(l=>{ pdf.text(l,15,y); y+=5; }); y+=4;
    });
    pdf.save(`agenda-4rpmon-${dataLocalISO()}.pdf`);
  }catch{ alert("Não foi possível gerar o PDF. Verifique sua conexão e tente novamente."); }
};

window.imprimirAgenda=function(){ window.print(); };
window.compartilharAgenda=window.compartilharWhatsApp;

mesSelecionado?.addEventListener("change",()=>{
  if(dataReferencia) dataReferencia.value=`${ano}-${String(Number(mesSelecionado.value)+1).padStart(2,"0")}-01`;
  mostrarPassados=false; renderizar();
});
anoSelecionado?.addEventListener("change",()=>{
  selecionarAno(anoSelecionado.value);
  mostrarPassados=false; renderizar();
});
modoVisualizacao?.addEventListener("change",()=>{
  document.body.dataset.visualizacao=modoVisualizacao.value;
  mostrarPassados=false; renderizar();
});
dataReferencia?.addEventListener("change",renderizar);
filtroTipo?.addEventListener("change",renderizar); filtroEsquadrao?.addEventListener("change",renderizar);
pesquisa?.addEventListener("input",()=>{ clearTimeout(debounceId); debounceId=setTimeout(renderizar,180); });

if(mesSelecionado) mesSelecionado.value=String(hojeLocal.getMonth());
selecionarAno(anoAtual);
if(dataReferencia) dataReferencia.value=dataLocalISO();
if(modoVisualizacao) document.body.dataset.visualizacao=modoVisualizacao.value;
iniciarEscutaEventos();
