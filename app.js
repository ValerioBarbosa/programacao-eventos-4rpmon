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
let ultimoElementoComFocoEdicao = null;
let mostrarPassados = false;
let promptInstalacao = null;
let eventoDetalhePendente = new URLSearchParams(window.location.search).get("evento");

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
const botaoCancelarEdicao = $("botaoCancelarEdicao");
const botaoFecharEdicao = $("botaoFecharEdicao");
const modalEdicaoEvento = $("modalEdicaoEvento");
const ancoraFormularioAdministrativo = $("ancoraFormularioAdministrativo");
const gradeIndicadores = $("gradeIndicadores");
const quebraIndicadores = $("quebraIndicadores");
const atualizacaoIndicadores = $("atualizacaoIndicadores");

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

function obterLocalCompleto(e){ return [e.local,e.municipio].filter(Boolean).join(", "); }
function obterEvento(id){ return eventos.find(e => e.id === id && !e.excluido); }
function urlPublicaEvento(e){
  const url=new URL("index.html",window.location.href);
  url.search=""; url.hash=""; url.searchParams.set("evento",e.id); return url.href;
}
function textoEvento(e){
  const linhas=[
    `*${e.nome||"Evento"}*`,
    `${formatarData(obterDataInicial(e))} · ${formatarPeriodoHorario(e)}`,
    e.tipo,
    obterTextoEsquadrao(obterEsquadrao(e)),
    obterLocalCompleto(e),
    e.efetivo&&`Efetivo: ${e.efetivo}`,
    e.ordemServico&&`OSv/NSv: ${e.ordemServico}`,
    e.observacoes,
    urlPublicaEvento(e)
  ];
  return linhas.filter(Boolean).join("\n");
}

async function copiarTexto(texto){
  try{ await navigator.clipboard.writeText(texto); return true; }
  catch{
    const campo=document.createElement("textarea"); campo.value=texto; campo.style.position="fixed"; campo.style.opacity="0";
    document.body.appendChild(campo); campo.select(); const copiado=document.execCommand("copy"); campo.remove(); return copiado;
  }
}

function escaparICS(valor){ return String(valor||"").replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;"); }
function dataICS(data){ return String(data||"").replaceAll("-",""); }
function dataHoraICS(data,hora){ return `${dataICS(data)}T${String(hora||"00:00").replace(":","")}00`; }
function criarICS(e){
  const inicio=obterDataInicial(e), fim=obterDataFinal(e)||inicio, horaInicio=obterHoraInicial(e), horaFim=obterHoraFinal(e);
  const datas=horaInicio
    ? [`DTSTART:${dataHoraICS(inicio,horaInicio)}`,...(horaFim?[`DTEND:${dataHoraICS(fim,horaFim)}`]:[])]
    : [`DTSTART;VALUE=DATE:${dataICS(inicio)}`,`DTEND;VALUE=DATE:${dataICS(somarDias(fim,1))}`];
  return ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//4RPMon//Agenda Operacional//PT-BR","CALSCALE:GREGORIAN","METHOD:PUBLISH","BEGIN:VEVENT",`UID:${escaparICS(e.id)}@agenda-4rpmon`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"")}`,...datas,`SUMMARY:${escaparICS(e.nome)}`,`DESCRIPTION:${escaparICS([e.tipo,obterTextoEsquadrao(obterEsquadrao(e)),e.efetivo,e.ordemServico,e.observacoes,urlPublicaEvento(e)].filter(Boolean).join(" · "))}`,`LOCATION:${escaparICS(obterLocalCompleto(e))}`,"END:VEVENT","END:VCALENDAR"].join("\r\n");
}

function baixarArquivo(nome,conteudo,tipo){
  const url=URL.createObjectURL(new Blob([conteudo],{type:tipo})); const link=document.createElement("a");
  link.href=url; link.download=nome; document.body.appendChild(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function garantirModalDetalhes(){
  let modal=$("modalDetalhesEvento"); if(modal) return modal;
  modal=document.createElement("div"); modal.id="modalDetalhesEvento"; modal.className="sobreposicao modal-evento"; modal.style.display="none";
  modal.setAttribute("role","dialog"); modal.setAttribute("aria-modal","true"); modal.setAttribute("aria-labelledby","modalEventoTitulo");
  modal.innerHTML='<div class="caixa-detalhes"><button class="fechar-detalhes" type="button" aria-label="Fechar detalhes" onclick="fecharDetalhesEvento()">×</button><div id="conteudoDetalhesEvento"></div></div>';
  modal.addEventListener("click",evento=>{ if(evento.target===modal) window.fecharDetalhesEvento(); }); document.body.appendChild(modal); return modal;
}

window.abrirDetalhesEvento=function(id){
  const e=obterEvento(id); if(!e) return;
  const modal=garantirModalDetalhes(), conteudo=$("conteudoDetalhesEvento"), local=obterLocalCompleto(e);
  conteudo.innerHTML=`<span class="evento-tipo ${obterClasseTipo(e.tipo)}">${escaparHTML(e.tipo||"Outros")}</span><h2 id="modalEventoTitulo">${escaparHTML(e.nome||"Evento")}</h2><p class="detalhe-data">${escaparHTML(formatarData(obterDataInicial(e)))} · ${escaparHTML(formatarPeriodoHorario(e))}</p><div class="detalhes-grid">${metadado("Esquadrão",obterTextoEsquadrao(obterEsquadrao(e)))}${metadado("Local",e.local)}${metadado("Município",e.municipio)}${metadado("Efetivo / recursos",e.efetivo)}${metadado("OSv / NSv",e.ordemServico)}${metadado("Observações",e.observacoes)}</div><div class="acoes-detalhes"><button type="button" onclick="copiarLinkEvento('${e.id}')">Copiar link</button><button class="botao-whatsapp" type="button" onclick="compartilharEventoWhatsApp('${e.id}')">WhatsApp</button><button class="botao-secundario" type="button" onclick="adicionarEventoCalendario('${e.id}')">Adicionar ao calendário</button>${local?`<button class="botao-mapa" type="button" onclick="abrirMapaEvento('${e.id}')">Abrir no Google Maps</button><button class="botao-mapa" type="button" onclick="tracarRotaEvento('${e.id}')">Traçar rota</button>`:""}</div>`;
  modal.style.display="flex"; document.body.classList.add("modal-aberto"); modal.querySelector(".fechar-detalhes")?.focus();
};
window.fecharDetalhesEvento=function(){ const modal=$("modalDetalhesEvento"); if(modal) modal.style.display="none"; document.body.classList.remove("modal-aberto"); };
window.copiarLinkEvento=async function(id){ const e=obterEvento(id); if(!e) return; const ok=await copiarTexto(urlPublicaEvento(e)); if(statusAgenda) statusAgenda.textContent=ok?"Link do evento copiado.":"Não foi possível copiar o link."; };
window.compartilharEventoWhatsApp=function(id){ const e=obterEvento(id); if(e) window.open(`https://wa.me/?text=${encodeURIComponent(textoEvento(e))}`,"_blank","noopener,noreferrer"); };
window.adicionarEventoCalendario=function(id){ const e=obterEvento(id); if(!e) return; baixarArquivo(`evento-4rpmon-${obterDataInicial(e)}.ics`,criarICS(e),"text/calendar;charset=utf-8"); };
window.abrirMapaEvento=function(id){ const e=obterEvento(id), local=e&&obterLocalCompleto(e); if(local) window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(local)}`,"_blank","noopener,noreferrer"); };
window.tracarRotaEvento=function(id){ const e=obterEvento(id), local=e&&obterLocalCompleto(e); if(local) window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(local)}`,"_blank","noopener,noreferrer"); };

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
  [dataReferencia,$("dataInicial")].forEach(campo=>{
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

function contarNoIntervalo(lista,inicio,fim){ return lista.filter(e=>eventoNoIntervalo(e,inicio,fim)).length; }
function renderizarIndicadores(filtrados=[]){
  if(!gradeIndicadores || !quebraIndicadores) return;
  const ativos=eventos.filter(e=>!e.excluido&&obterDataInicial(e));
  const hoje=dataLocalISO(), diaSemana=new Date(`${hoje}T12:00:00`).getDay()||7, inicioSemana=somarDias(hoje,1-diaSemana), fimSemana=somarDias(inicioSemana,6), fim30=somarDias(hoje,29);
  const cards=[
    ["Hoje",contarNoIntervalo(ativos,hoje,hoje),"eventos no dia"],
    ["Esta semana",contarNoIntervalo(ativos,inicioSemana,fimSemana),`${formatarData(inicioSemana)} a ${formatarData(fimSemana)}`],
    ["Próximos 30 dias",contarNoIntervalo(ativos,hoje,fim30),`até ${formatarData(fim30)}`],
    ["Resultado atual",filtrados.length,"após período e filtros"]
  ];
  gradeIndicadores.innerHTML=cards.map(([rotulo,valor,detalhe])=>`<article class="indicador-operacional"><span>${escaparHTML(rotulo)}</span><strong>${valor}</strong><small>${escaparHTML(detalhe)}</small></article>`).join("");
  const esquadroes={"1":0,"2":0}, tipos=new Map();
  filtrados.forEach(e=>{ const esq=obterEsquadrao(e); esquadroes[esq]=(esquadroes[esq]||0)+1; tipos.set(e.tipo||"Outros",(tipos.get(e.tipo||"Outros")||0)+1); });
  const principais=[...tipos.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4);
  quebraIndicadores.innerHTML=`<div class="quebra-grupo"><strong>Por esquadrão</strong><span>1º Esquadrão: ${esquadroes["1"]}</span><span>2º Esquadrão: ${esquadroes["2"]}</span></div><div class="quebra-grupo"><strong>Tipos mais frequentes</strong>${principais.length?principais.map(([tipo,total])=>`<span>${escaparHTML(tipo)}: ${total}</span>`).join(""):"<span>Sem eventos no resultado atual</span>"}</div>`;
  if(atualizacaoIndicadores) atualizacaoIndicadores.textContent=`Atualizado às ${new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}`;
}

function registrarBackupAutomatico(){
  if(!auth.currentUser || !eventos.length) return;
  try{
    const payload={versao:1,geradoEm:agoraISO(),usuario:usuarioAtual().email,eventos};
    localStorage.setItem("agenda4rpmon-backup-automatico",JSON.stringify(payload));
  }catch{ /* O navegador pode bloquear armazenamento local. */ }
}

window.baixarBackupJSON=function(){
  if(!modoP3) return;
  const payload={versao:1,geradoEm:agoraISO(),usuario:usuarioAtual().email,eventos};
  baixarArquivo(`backup-agenda-4rpmon-${dataLocalISO()}.json`,JSON.stringify(payload,null,2),"application/json;charset=utf-8");
};

function iniciarEscutaEventos(){
  renderizarCarregamento();
  onSnapshot(query(collection(db,"eventos")), snapshot => {
    eventos=snapshot.docs.map(documento => ({id:documento.id,...documento.data()}));
    primeiraCargaConcluida=true; sincronizarOpcoesAno(); renderizar(); renderizarAuditoria(); registrarBackupAutomatico();
    if(eventoDetalhePendente){ const id=eventoDetalhePendente; eventoDetalhePendente=null; setTimeout(()=>window.abrirDetalhesEvento(id),100); }
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
  modoP3=!!usuario; if(!modoP3) cancelarEdicao(); atualizarPermissoes(); renderizar(); if(modoP3) registrarBackupAutomatico();
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
  renderizarIndicadores(filtrados);
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
      card.setAttribute("aria-label",`${data===hoje?"Evento de hoje: ":"Evento: "}${e.nome||"Evento"}`);
      card.addEventListener("click",()=>window.abrirDetalhesEvento(e.id));
      const localMapa=obterLocalCompleto(e);
      const acoesPublicas=`<div class="acoes-publicas"><button type="button" onclick="event.stopPropagation(); abrirDetalhesEvento('${e.id}')">Detalhes</button><button type="button" onclick="event.stopPropagation(); copiarLinkEvento('${e.id}')">Copiar link</button><button type="button" class="botao-secundario" onclick="event.stopPropagation(); adicionarEventoCalendario('${e.id}')">Calendário</button><button type="button" class="botao-whatsapp" onclick="event.stopPropagation(); compartilharEventoWhatsApp('${e.id}')">WhatsApp</button>${localMapa?`<button type="button" class="botao-mapa" onclick="event.stopPropagation(); abrirMapaEvento('${e.id}')">Mapa</button>`:""}</div>`;
      const acoes=modoP3&&areaAdministrativa?`<div class="acoes-card"><button class="botao-editar" onclick="event.stopPropagation(); iniciarEdicao('${e.id}')">Editar</button><button class="botao-secundario" onclick="event.stopPropagation(); duplicarEvento('${e.id}')">Duplicar</button><button class="botao-excluir" type="button" title="Excluir cartão" aria-label="Excluir cartão" onclick="event.stopPropagation(); excluirEvento('${e.id}')">Excluir</button></div>`:"";
      card.innerHTML=`${data===hoje?'<span class="selo-hoje">Hoje</span>':""}<div class="evento-topo"><span class="evento-data">${escaparHTML(formatarPeriodoHorario(e))}</span><span class="evento-tipo">${escaparHTML(e.tipo||"Outros")}</span></div><span class="evento-esquadrao">${escaparHTML(obterTextoEsquadrao(obterEsquadrao(e)))}</span><div class="evento-nome">${escaparHTML(e.nome)}</div><div class="evento-local">${escaparHTML(e.local||"")}</div><div class="evento-metadados">${metadado("Município",e.municipio)}${metadado("OSv/NSv",e.ordemServico)}${metadado("Efetivo",e.efetivo)}${metadado("Observações",e.observacoes)}</div>${acoesPublicas}${acoes}`;
      grade.appendChild(card);
    });
    grupo.appendChild(grade); listaEventos.appendChild(grupo);
  });
}

function lerFormulario(){
  const dataInicial=$("dataInicial")?.value, dataFinal=dataInicial;
  return {
    dataInicial,dataFinal,horaInicial:$("horaInicial")?.value||"",horaFinal:$("horaFinal")?.value||"",
    nome:$("nomeEvento")?.value.trim()||"",local:$("localEvento")?.value.trim()||"",
    municipio:$("municipioEvento")?.value.trim()||"",ordemServico:$("ordemServicoEvento")?.value.trim()||"",
    efetivo:$("efetivoEvento")?.value.trim()||"",observacoes:$("observacoesEvento")?.value.trim()||"",
    tipo:$("tipoEvento")?.value||"",esquadrao:$("esquadraoEvento")?.value||"1"
  };
}

function validarEvento(dados){
  if(!dados.dataInicial || !dados.nome) return "Informe a data e o nome do evento.";
  if(!dados.dataInicial.startsWith(`${ano}-`)) return `A data deve pertencer a ${ano}.`;
  return "";
}

function eventosConflitam(a,b){
  if(obterEsquadrao(a)!==obterEsquadrao(b)) return false;
  if(obterDataFinal(a)<obterDataInicial(b)||obterDataFinal(b)<obterDataInicial(a)) return false;
  const inicioA=obterHoraInicial(a)||"00:00", fimA=obterHoraFinal(a)||"23:59", inicioB=obterHoraInicial(b)||"00:00", fimB=obterHoraFinal(b)||"23:59";
  return inicioA<fimB&&inicioB<fimA;
}

function encontrarConflitos(evento,ignorarId=""){
  return eventos.filter(e=>!e.excluido&&e.id!==ignorarId&&eventosConflitam(evento,e));
}

function camposRecomendadosPendentes(dados){
  return [["horaInicial","horário inicial"],["local","local"],["municipio","município"],["efetivo","efetivo / recursos"]].filter(([campo])=>!dados[campo]).map(([,rotulo])=>rotulo);
}

window.salvarEvento=async function(){
  if(!modoP3){ alert("Apenas membros do P3 podem incluir ou editar eventos."); return; }
  const obrigatorios=[$("dataInicial"),$("nomeEvento")].filter(Boolean), invalido=obrigatorios.find(campo=>!campo.checkValidity());
  if(invalido){ invalido.reportValidity(); return; }
  const dados=lerFormulario(), erro=validarEvento(dados); if(erro){ alert(erro); return; }
  const duplicado=encontrarDuplicado(dados,eventoEmEdicaoId||"");
  if(duplicado){ alert(`Possível duplicidade: já existe “${duplicado.nome}” em ${formatarData(obterDataInicial(duplicado))}, às ${formatarHora(obterHoraInicial(duplicado))}.`); return; }
  const conflitos=encontrarConflitos(dados,eventoEmEdicaoId||"");
  if(conflitos.length&&!confirm(`Atenção: há ${conflitos.length} possível(is) conflito(s) de horário para o ${obterTextoEsquadrao(obterEsquadrao(dados))}. Salvar mesmo assim?`)) return;
  const pendentes=camposRecomendadosPendentes(dados);
  if(pendentes.length&&!confirm(`Campos recomendados não preenchidos: ${pendentes.join(", ")}. Deseja salvar mesmo assim?`)) return;
  const usuario=usuarioAtual(), instante=agoraISO();
  try{
    if(eventoEmEdicaoId){
      const atual=eventos.find(e=>e.id===eventoEmEdicaoId) || {};
      const camposAlterados=Object.keys(dados).filter(campo=>String(atual[campo]??"")!==String(dados[campo]??""));
      const historico=[...(atual.historico||[]),{acao:"editado",em:instante,por:usuario.email,uid:usuario.uid,camposAlterados}];
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
  const valores={dataInicial:obterDataInicial(e),horaInicial:obterHoraInicial(e),horaFinal:obterHoraFinal(e),nomeEvento:e.nome||"",localEvento:e.local||"",municipioEvento:e.municipio||"",ordemServicoEvento:e.ordemServico||"",efetivoEvento:e.efetivo||"",observacoesEvento:e.observacoes||"",tipoEvento:e.tipo||"POLOST",esquadraoEvento:obterEsquadrao(e)};
  Object.entries(valores).forEach(([idCampo,valor])=>{ if($(idCampo)) $(idCampo).value=valor; });
  if(tituloFormulario) tituloFormulario.textContent="Editar evento — P3"; if(botaoSalvar) botaoSalvar.textContent="Salvar alterações";
  if(botaoCancelarEdicao) botaoCancelarEdicao.hidden=false; if(botaoFecharEdicao) botaoFecharEdicao.hidden=false;
  if(modalEdicaoEvento&&areaAdministrativa){
    ultimoElementoComFocoEdicao=document.activeElement;
    modalEdicaoEvento.appendChild(areaAdministrativa); areaAdministrativa.style.display="block";
    if(!modalEdicaoEvento.open) modalEdicaoEvento.showModal();
    document.body.classList.add("modal-aberto");
    $("dataInicial")?.focus();
  }
};

window.duplicarEvento=function(id){
  if(!modoP3) return; const e=eventos.find(item=>item.id===id); if(!e) return; cancelarEdicao();
  const valores={dataInicial:obterDataInicial(e),horaInicial:obterHoraInicial(e),horaFinal:obterHoraFinal(e),nomeEvento:`${e.nome||"Evento"} (cópia)`,localEvento:e.local||"",municipioEvento:e.municipio||"",ordemServicoEvento:e.ordemServico||"",efetivoEvento:e.efetivo||"",observacoesEvento:e.observacoes||"",tipoEvento:e.tipo||"POLOST",esquadraoEvento:obterEsquadrao(e)};
  Object.entries(valores).forEach(([idCampo,valor])=>{ if($(idCampo)) $(idCampo).value=valor; });
  if(mensagem) mensagem.textContent="Cópia preparada. Revise os dados e clique em Adicionar."; areaAdministrativa?.scrollIntoView({behavior:"smooth"});
};

function cancelarEdicao(){
  eventoEmEdicaoId=null;
  ["dataInicial","horaInicial","horaFinal","nomeEvento","localEvento","municipioEvento","ordemServicoEvento","efetivoEvento","observacoesEvento"].forEach(id=>{ if($(id)) $(id).value=""; });
  if($("esquadraoEvento")) $("esquadraoEvento").value="1";
  if(tituloFormulario) tituloFormulario.textContent="Adicionar evento — P3"; if(botaoSalvar) botaoSalvar.textContent="Adicionar";
  if(botaoCancelarEdicao) botaoCancelarEdicao.hidden=true; if(botaoFecharEdicao) botaoFecharEdicao.hidden=true;
  if(modalEdicaoEvento?.open) modalEdicaoEvento.close();
  if(ancoraFormularioAdministrativo&&areaAdministrativa) ancoraFormularioAdministrativo.after(areaAdministrativa);
  if(areaAdministrativa) areaAdministrativa.style.display=modoP3?"block":"none";
  document.body.classList.remove("modal-aberto");
  ultimoElementoComFocoEdicao?.focus(); ultimoElementoComFocoEdicao=null;
}
window.cancelarEdicao=cancelarEdicao;

botaoCancelarEdicao?.addEventListener("click",cancelarEdicao);
botaoFecharEdicao?.addEventListener("click",cancelarEdicao);
modalEdicaoEvento?.addEventListener("cancel",evento=>{ evento.preventDefault(); cancelarEdicao(); });
modalEdicaoEvento?.addEventListener("click",evento=>{ if(evento.target===modalEdicaoEvento) cancelarEdicao(); });

window.excluirEvento=async function(id){
  if(!modoP3) return; const e=eventos.find(item=>item.id===id); if(!e || !confirm(`Excluir o cartão “${e.nome}” da agenda? O registro permanecerá disponível na auditoria.`)) return;
  const usuario=usuarioAtual(), instante=agoraISO(), historico=[...(e.historico||[]),{acao:"excluído",em:instante,por:usuario.email,uid:usuario.uid}];
  try{ await updateDoc(doc(db,"eventos",id),{excluido:true,excluidoEm:serverTimestamp(),excluidoEmISO:instante,excluidoPor:usuario.email,historico}); }
  catch{ alert("Não foi possível excluir o cartão."); }
};
window.arquivarEvento=window.excluirEvento;

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
  const termo=normalizar($("filtroAuditoriaTexto")?.value||""), status=$("filtroAuditoriaStatus")?.value||"todos";
  const ordenados=eventos.filter(e=>{
    if(status==="ativos"&&e.excluido) return false; if(status==="excluidos"&&!e.excluido) return false;
    const historico=e.historico||[]; const conteudo=normalizar(`${e.nome} ${e.criadoPor} ${e.atualizadoPor} ${historico.map(h=>`${h.acao} ${h.por} ${(h.camposAlterados||[]).join(" ")}`).join(" ")}`);
    return !termo||conteudo.includes(termo);
  }).sort((a,b)=>String(b.excluidoEmISO||b.atualizadoEmISO||b.criadoEmISO||"").localeCompare(String(a.excluidoEmISO||a.atualizadoEmISO||a.criadoEmISO||"")));
  lista.innerHTML=ordenados.length?ordenados.map(e=>{
    const historico=e.historico||[{acao:"registro legado",em:e.atualizadoEmISO||e.criadoEmISO||"",por:e.atualizadoPor||e.criadoPor||"não registrado"}];
    return `<details class="item-auditoria"><summary><div><strong>${escaparHTML(e.nome||"Evento sem nome")}</strong><span>${formatarData(obterDataInicial(e))} · ${e.excluido?"Excluído":"Ativo"}</span></div><span>${historico.length} ações</span></summary><ol>${historico.slice().reverse().map(h=>`<li><b>${escaparHTML(h.acao)}</b> por ${escaparHTML(h.por)}${h.camposAlterados?.length?`<small>Campos: ${escaparHTML(h.camposAlterados.join(", "))}</small>`:""}<time>${h.em?new Date(h.em).toLocaleString("pt-BR"):"data não registrada"}</time></li>`).join("")}</ol></details>`;
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

function textoPDF(valor){
  return String(valor||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/º/g,"o").replace(/ª/g,"a").replace(/[–—]/g,"-").replace(/[^\x20-\x7E]/g," ");
}

function quebrarLinhaPDF(texto,limite=88){
  const palavras=textoPDF(texto).trim().split(/\s+/), linhas=[]; let linha="";
  palavras.forEach(palavra=>{ const candidata=linha?`${linha} ${palavra}`:palavra; if(candidata.length>limite&&linha){ linhas.push(linha); linha=palavra; }else linha=candidata; });
  if(linha) linhas.push(linha); return linhas;
}

function escaparTextoPDF(texto){ return texto.replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)"); }

function criarPDFAgenda(titulo){
  const linhas=[];
  eventosFiltradosAtuais.forEach(e=>{
    linhas.push(...quebrarLinhaPDF(`${formatarData(obterDataInicial(e))} | ${formatarPeriodoHorario(e)} | ${e.nome}`));
    const detalhes=[e.tipo,obterTextoEsquadrao(obterEsquadrao(e)),e.local,e.municipio,e.efetivo,e.ordemServico,e.observacoes].filter(Boolean).join(" | ");
    if(detalhes) linhas.push(...quebrarLinhaPDF(detalhes));
    linhas.push("");
  });
  if(!linhas.length) linhas.push("Nenhum evento neste periodo.");
  const paginas=[]; for(let i=0;i<linhas.length;i+=45) paginas.push(linhas.slice(i,i+45));
  const objetos=["", "<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const idsPaginas=[];
  paginas.forEach((pagina,indice)=>{
    const idPagina=objetos.length, idConteudo=idPagina+1; idsPaginas.push(idPagina);
    const comandos=[`BT /F1 16 Tf 42 806 Td (${escaparTextoPDF(textoPDF("Programação Operacional 4º RPMon"))}) Tj ET`,`BT /F1 10 Tf 42 788 Td (${escaparTextoPDF(textoPDF(titulo))}) Tj ET`];
    pagina.forEach((linha,posicao)=>comandos.push(`BT /F1 9 Tf 42 ${766-posicao*16} Td (${escaparTextoPDF(linha)}) Tj ET`));
    const stream=comandos.join("\n");
    objetos.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${idConteudo} 0 R >>`);
    objetos.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objetos[2]=`<< /Type /Pages /Kids [${idsPaginas.map(id=>`${id} 0 R`).join(" ")}] /Count ${idsPaginas.length} >>`;
  let pdf="%PDF-1.4\n", offsets=[0];
  for(let id=1;id<objetos.length;id++){ offsets[id]=pdf.length; pdf+=`${id} 0 obj\n${objetos[id]}\nendobj\n`; }
  const inicioXref=pdf.length; pdf+=`xref\n0 ${objetos.length}\n0000000000 65535 f \n`;
  for(let id=1;id<objetos.length;id++) pdf+=`${String(offsets[id]).padStart(10,"0")} 00000 n \n`;
  pdf+=`trailer\n<< /Size ${objetos.length} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF`;
  return new Blob([pdf],{type:"application/pdf"});
}

window.exportarPDF=function(){
  try{
    const botao=document.querySelector('button[onclick="exportarPDF()"]'), textoOriginal=botao?.textContent;
    const {titulo}=intervaloVisualizacao(), url=URL.createObjectURL(criarPDFAgenda(titulo)), link=document.createElement("a");
    link.href=url; link.download=`agenda-4rpmon-${dataLocalISO()}.pdf`; document.body.appendChild(link); link.click(); link.remove();
    if(botao){ botao.textContent="PDF gerado"; botao.disabled=true; setTimeout(()=>{ botao.textContent=textoOriginal; botao.disabled=false; },1800); }
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(erro){ console.error("Falha ao gerar PDF",erro); alert("Não foi possível gerar o PDF. Atualize a página e tente novamente."); }
};

window.imprimirAgenda=function(){ window.print(); };
window.compartilharAgenda=window.compartilharWhatsApp;

window.addEventListener("beforeinstallprompt",evento=>{
  evento.preventDefault(); promptInstalacao=evento; const botao=$("botaoInstalar"); if(botao) botao.textContent="Instalar aplicativo";
});
window.addEventListener("appinstalled",()=>{ promptInstalacao=null; const botao=$("botaoInstalar"); if(botao) botao.style.display="none"; });
window.instalarAplicativo=async function(){
  if(window.matchMedia("(display-mode: standalone)").matches){ alert("O aplicativo já está instalado neste aparelho."); return; }
  if(promptInstalacao){ promptInstalacao.prompt(); await promptInstalacao.userChoice; promptInstalacao=null; return; }
  alert("No iPhone: toque em Compartilhar e depois em “Adicionar à Tela de Início”. No Android: abra o menu do navegador e escolha “Instalar aplicativo”.");
};

if("serviceWorker" in navigator){ window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{})); }
document.addEventListener("keydown",evento=>{ if(evento.key==="Escape") window.fecharDetalhesEvento(); });

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
$("filtroAuditoriaTexto")?.addEventListener("input",()=>{ clearTimeout(debounceId); debounceId=setTimeout(renderizarAuditoria,180); });
$("filtroAuditoriaStatus")?.addEventListener("change",renderizarAuditoria);

if(mesSelecionado) mesSelecionado.value=String(hojeLocal.getMonth());
selecionarAno(anoAtual);
if(dataReferencia) dataReferencia.value=dataLocalISO();
if(modoVisualizacao) document.body.dataset.visualizacao=modoVisualizacao.value;
iniciarEscutaEventos();
