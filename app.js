import {
  db, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query,
  auth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "./firebase-config.js";

/* ===== CONFIGURAÇÃO ===== */
const ano = 2026;
const nomesMeses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const classesPorTipo = {
  "POLOST": "tipo-01",
  "Operações": "tipo-02",
  "Manifestação Social": "tipo-03",
  "Jogos de Futebol": "tipo-04",
  "Passeio a Cavalo": "tipo-05",
  "Carnaval": "tipo-06",
  "Cavalgadas": "tipo-07",
  "Rodeios": "tipo-08",
  "Dragões, Representações e Outros": "tipo-09",
  "Clarim, Formaturas e Reuniões": "tipo-10",
  "Shows e Eventos": "tipo-11",
  "Empréstimo de VTR ou CAM BOX": "tipo-12",
  "Transporte de Equinos e Provas": "tipo-13",
  "Viagens e Deslocamentos Operacionais": "tipo-14"
};

let eventos = [];
let eventoEmEdicaoId = null;
let eventosFiltradosAtuais = [];
let modoP3 = false;
let primeiraCargaConcluida = false;
let debounceId = null;
let ultimoElementoComFoco = null;

const mesSelecionado = document.getElementById("mesSelecionado");
const pesquisa = document.getElementById("pesquisa");
const filtroTipo = document.getElementById("filtroTipo");
const filtroEsquadrao = document.getElementById("filtroEsquadrao");
const tituloMes = document.getElementById("tituloMes");
const nomeMesResumo = document.getElementById("nomeMesResumo");
const totalEventos = document.getElementById("totalEventos");
const listaEventos = document.getElementById("listaEventos");
const mensagem = document.getElementById("mensagem");

/* Elementos exclusivos do admin.html (podem não existir em index.html) */
const areaAdministrativa = document.getElementById("areaAdministrativa");
const sobreposicaoSenha = document.getElementById("sobreposicaoSenha");
const campoEmail = document.getElementById("campoEmail");
const campoSenha = document.getElementById("campoSenha");
const tituloFormulario = document.getElementById("tituloFormulario");
const botaoSalvar = document.getElementById("botaoSalvar");
const botaoAcessoP3 = document.getElementById("botaoAcessoP3");
const esquadraoEvento = document.getElementById("esquadraoEvento");

function escaparHTML(texto){
  return String(texto || "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function formatarData(data){
  if(!data) return "";
  const [a,m,d] = data.split("-");
  return `${d}/${m}/${a}`;
}

/* Compatibilidade: eventos antigos usavam "data" e "hora" */
function obterDataInicial(evento){
  return evento.dataInicial || evento.data || "";
}
function obterDataFinal(evento){
  return evento.dataFinal || evento.dataInicial || evento.data || "";
}
function obterHoraInicial(evento){
  return evento.horaInicial || evento.hora || "";
}
function obterHoraFinal(evento){
  return evento.horaFinal || "";
}
function obterEsquadrao(evento){
  return evento.esquadrao || "1";
}

function formatarPeriodoData(evento){
  const inicio = obterDataInicial(evento);
  const fim = obterDataFinal(evento);
  if(!inicio) return "";
  return inicio === fim
    ? formatarData(inicio)
    : `${formatarData(inicio)} a ${formatarData(fim)}`;
}

function formatarPeriodoHorario(evento){
  const inicio = obterHoraInicial(evento);
  const fim = obterHoraFinal(evento);
  if(!inicio) return "--:--";
  return fim ? `${inicio} às ${fim}` : inicio;
}

function obterClasseTipo(tipo){
  return classesPorTipo[tipo] || "tipo-outros";
}

function obterClasseEsquadrao(esquadrao){
  return esquadrao === "2" ? "esquadrao-2" : "esquadrao-1";
}

function obterTextoEsquadrao(esquadrao){
  return esquadrao === "2" ? "2º Esquadrão" : "1º Esquadrão";
}

/* ===== LEITURA EM TEMPO REAL DO FIRESTORE ===== */
function iniciarEscutaEventos(){
  if(listaEventos && !primeiraCargaConcluida){
    listaEventos.innerHTML = `<div class="sem-eventos">Carregando eventos...</div>`;
  }
  const referenciaEventos = query(collection(db, "eventos"));
  onSnapshot(referenciaEventos, (instantaneo) => {
    eventos = [];
    instantaneo.forEach((documento) => {
      eventos.push({ id: documento.id, ...documento.data() });
    });
    primeiraCargaConcluida = true;
    renderizar();
  }, () => {
    if(listaEventos){
      listaEventos.innerHTML = `<div class="sem-eventos">Não foi possível carregar os eventos. Verifique sua conexão.</div>`;
    }
  });
}

/* ===== ACESSO P3 (somente admin.html) — via Firebase Authentication ===== */
window.abrirCaixaSenha = function(){
  if(!sobreposicaoSenha) return;
  ultimoElementoComFoco = document.activeElement;
  sobreposicaoSenha.style.display = "flex";
  if(campoEmail) campoEmail.value = "";
  if(campoSenha) campoSenha.value = "";
  (campoEmail || campoSenha)?.focus();
};

window.fecharCaixaSenha = function(){
  if(!sobreposicaoSenha) return;
  sobreposicaoSenha.style.display = "none";
  if(ultimoElementoComFoco) ultimoElementoComFoco.focus();
};

if(sobreposicaoSenha){
  sobreposicaoSenha.addEventListener("click", (evento) => {
    if(evento.target === sobreposicaoSenha) window.fecharCaixaSenha();
  });
  document.addEventListener("keydown", (evento) => {
    if(evento.key === "Escape" && sobreposicaoSenha.style.display === "flex"){
      window.fecharCaixaSenha();
    }
  });
}

window.validarSenha = async function(){
  if(!campoEmail || !campoSenha) return;
  const email = campoEmail.value.trim();
  const senha = campoSenha.value;
  if(!email || !senha){
    alert("Informe e-mail e senha.");
    return;
  }
  try {
    await signInWithEmailAndPassword(auth, email, senha);
    window.fecharCaixaSenha();
  } catch (erro) {
    alert("E-mail ou senha incorretos.");
  }
};

window.sairModoP3 = async function(){
  try {
    await signOut(auth);
  } catch (erro) {
    alert("Não foi possível sair. Tente novamente.");
  }
};

onAuthStateChanged(auth, (usuario) => {
  modoP3 = !!usuario;
  if(!modoP3) cancelarEdicao();
  atualizarPermissoes();
  renderizar();
});

function atualizarPermissoes(){
  const badgeP3 = document.getElementById("badgeP3");
  if(!botaoAcessoP3 || !badgeP3 || !areaAdministrativa) return;
  if(modoP3){
    botaoAcessoP3.style.display = "none";
    badgeP3.style.display = "flex";
    areaAdministrativa.style.display = "block";
  } else {
    botaoAcessoP3.style.display = "inline-block";
    badgeP3.style.display = "none";
    areaAdministrativa.style.display = "none";
  }
}

/* ===== RENDERIZAÇÃO ===== */
function renderizar(){
  const mes = Number(mesSelecionado.value);
  const termo = pesquisa.value.toLowerCase().trim();
  const tipo = filtroTipo.value;
  const esquadrao = filtroEsquadrao ? filtroEsquadrao.value : "todos";

  tituloMes.textContent = `${nomesMeses[mes]} de ${ano}`;
  nomeMesResumo.textContent = nomesMeses[mes];

  const filtrados = eventos.filter(e => {
    const dataInicial = obterDataInicial(e);
    const dataFinal = obterDataFinal(e);
    if(!dataInicial) return false;

    const mesInicial = Number(dataInicial.split("-")[1]) - 1;
    const mesFinal = Number(dataFinal.split("-")[1]) - 1;
    const correspondeMes = mes >= mesInicial && mes <= mesFinal;

    const textoEvento = `${e.nome || ""} ${e.local || ""} ${e.tipo || ""}`.toLowerCase();
    const correspondeTexto = !termo || textoEvento.includes(termo);
    const correspondeTipo = tipo === "todos" || e.tipo === tipo;
    const correspondeEsquadrao = esquadrao === "todos" || obterEsquadrao(e) === esquadrao;

    return correspondeMes && correspondeTexto && correspondeTipo && correspondeEsquadrao;
  }).sort((a,b) => {
    const chaveA = `${obterDataInicial(a)}${obterHoraInicial(a)}`;
    const chaveB = `${obterDataInicial(b)}${obterHoraInicial(b)}`;
    return chaveA.localeCompare(chaveB);
  });

  eventosFiltradosAtuais = filtrados;
  totalEventos.textContent = filtrados.length;
  listaEventos.innerHTML = "";

  if(filtrados.length === 0){
    listaEventos.innerHTML = `<div class="sem-eventos">Nenhum evento encontrado para este mês.</div>`;
    return;
  }

  filtrados.forEach(e => {
    const card = document.createElement("article");
    card.className = `evento-card ${obterClasseTipo(e.tipo)} ${obterClasseEsquadrao(obterEsquadrao(e))}`;

    const acoes = (modoP3 && areaAdministrativa)
      ? `<div class="acoes-card">
          <button class="botao-editar" onclick="iniciarEdicao('${e.id}')">Editar</button>
          <button class="botao-excluir" onclick="excluirEvento('${e.id}')">Excluir</button>
        </div>`
      : "";

    card.innerHTML = `
      <span class="evento-data">${escaparHTML(formatarPeriodoData(e))} · ${escaparHTML(formatarPeriodoHorario(e))}</span>
      <span class="evento-tipo">${escaparHTML(e.tipo)}</span>
      <span class="evento-esquadrao">${escaparHTML(obterTextoEsquadrao(obterEsquadrao(e)))}</span>
      <div class="evento-nome">${escaparHTML(e.nome)}</div>
      <div class="evento-local">${escaparHTML(e.local)}</div>
      ${acoes}
    `;
    listaEventos.appendChild(card);
  });
}

/* ===== CADASTRO / EDIÇÃO / EXCLUSÃO (somente admin.html) ===== */
window.salvarEvento = async function(){
  if(!modoP3){
    alert("Apenas membros do P3 podem incluir ou editar eventos.");
    return;
  }

  const dataInicial = document.getElementById("dataInicial").value;
  const dataFinal = document.getElementById("dataFinal").value || dataInicial;
  const horaInicial = document.getElementById("horaInicial").value;
  const horaFinal = document.getElementById("horaFinal").value;
  const nome = document.getElementById("nomeEvento").value.trim();
  const local = document.getElementById("localEvento").value.trim();
  const tipo = document.getElementById("tipoEvento").value;
  const esquadrao = esquadraoEvento ? esquadraoEvento.value : "1";

  if(!dataInicial || !nome){
    alert("Informe a data inicial e o nome do evento.");
    return;
  }
  if(!dataInicial.startsWith("2026-") || !dataFinal.startsWith("2026-")){
    alert("As datas devem pertencer ao ano de 2026.");
    return;
  }
  if(dataFinal < dataInicial){
    alert("A data final não pode ser anterior à data inicial.");
    return;
  }
  if(dataInicial === dataFinal && horaInicial && horaFinal && horaFinal < horaInicial){
    alert("O horário final não pode ser anterior ao horário inicial.");
    return;
  }

  const dadosEvento = { dataInicial, dataFinal, horaInicial, horaFinal, nome, local, tipo, esquadrao };

  try {
    if(eventoEmEdicaoId){
      await updateDoc(doc(db, "eventos", eventoEmEdicaoId), dadosEvento);
      mensagem.textContent = "Evento atualizado com sucesso.";
    } else {
      await addDoc(collection(db, "eventos"), dadosEvento);
      mensagem.textContent = "Evento adicionado com sucesso.";
    }
    cancelarEdicao();
    mesSelecionado.value = Number(dataInicial.split("-")[1]) - 1;
    renderizar();
  } catch(erro){
    alert("Não foi possível salvar o evento. Verifique sua conexão ou as regras do banco.");
  }
  setTimeout(() => { mensagem.textContent = ""; }, 3000);
};

window.iniciarEdicao = function(id){
  if(!modoP3) return;
  const evento = eventos.find(e => e.id === id);
  if(!evento) return;

  eventoEmEdicaoId = id;
  document.getElementById("dataInicial").value = obterDataInicial(evento);
  document.getElementById("dataFinal").value = obterDataFinal(evento);
  document.getElementById("horaInicial").value = obterHoraInicial(evento);
  document.getElementById("horaFinal").value = obterHoraFinal(evento);
  document.getElementById("nomeEvento").value = evento.nome;
  document.getElementById("localEvento").value = evento.local || "";
  document.getElementById("tipoEvento").value = evento.tipo;
  if(esquadraoEvento) esquadraoEvento.value = obterEsquadrao(evento);
  tituloFormulario.textContent = "Editar evento — P3";
  botaoSalvar.textContent = "Salvar alterações";
  areaAdministrativa.scrollIntoView({ behavior:"smooth" });
};

function cancelarEdicao(){
  eventoEmEdicaoId = null;
  const campos = ["dataInicial","dataFinal","horaInicial","horaFinal","nomeEvento","localEvento"];
  campos.forEach(id => {
    const elemento = document.getElementById(id);
    if(elemento) elemento.value = "";
  });
  if(esquadraoEvento) esquadraoEvento.value = "1";
  if(tituloFormulario) tituloFormulario.textContent = "Adicionar evento — P3";
  if(botaoSalvar) botaoSalvar.textContent = "Adicionar";
}

window.excluirEvento = async function(id){
  if(!modoP3){
    alert("Apenas membros do P3 podem excluir eventos.");
    return;
  }
  if(!confirm("Deseja realmente excluir este evento?")) return;

  try {
    await deleteDoc(doc(db, "eventos", id));
  } catch(erro){
    alert("Não foi possível excluir o evento.");
  }
};

/* ===== COMPARTILHAMENTO E IMPRESSÃO ===== */
window.imprimirAgenda = function(){
  window.print();
};

window.compartilharAgenda = async function(){
  const mes = Number(mesSelecionado.value);
  let texto = `Programação Operacional 4ºRPMon\n${nomesMeses[mes]} de ${ano}\n----------------------------------------\n\n`;

  if(eventosFiltradosAtuais.length === 0){
    texto += "Nenhum evento cadastrado para este mês.";
  } else {
    eventosFiltradosAtuais.forEach((e,indice) => {
      texto += `${indice+1}. ${formatarPeriodoData(e)}`;
      const horario = formatarPeriodoHorario(e);
      if(horario !== "--:--") texto += ` às ${horario}`;
      texto += `\nEvento: ${e.nome}\nTipo: ${e.tipo}\nEsquadrão: ${obterTextoEsquadrao(obterEsquadrao(e))}\n`;
      if(e.local) texto += `Local/observação: ${e.local}\n`;
      texto += "\n";
    });
  }

  const titulo = `Agenda — ${nomesMeses[mes]} de ${ano}`;
  try {
    if(navigator.share){
      await navigator.share({ title: titulo, text: texto });
    } else {
      await navigator.clipboard.writeText(texto);
      alert("Agenda copiada. Cole o conteúdo no WhatsApp ou e-mail.");
    }
  } catch(erro){
    if(erro.name !== "AbortError"){
      alert("Não foi possível compartilhar automaticamente.");
    }
  }
};

/* ===== EVENTOS DE INTERFACE ===== */
mesSelecionado.addEventListener("change", renderizar);
pesquisa.addEventListener("input", () => {
  clearTimeout(debounceId);
  debounceId = setTimeout(renderizar, 200);
});
filtroTipo.addEventListener("change", renderizar);
if(filtroEsquadrao) filtroEsquadrao.addEventListener("change", renderizar);

atualizarPermissoes();
iniciarEscutaEventos();