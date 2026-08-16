export function normalizar(texto){
  return String(texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
}

export function nomeMunicipio(valor=""){
  return String(valor??"").replace(/\s*(?:\/|-)\s*RS\s*$/i,"").replace(/\s+/g," ").trim();
}

export function chaveMunicipio(valor=""){ return normalizar(nomeMunicipio(valor)); }

export function numeroInteiro(valor){
  const numero=Number(valor); return Number.isFinite(numero)&&numero>0?Math.trunc(numero):0;
}

export function extrairEfetivoTexto(texto=""){
  const totais={conjuntos:0,mes:0,equinos:0};
  const padroes=[
    ["conjuntos",/(\d+)\s*conj(?:unto)?s?\b/gi],
    ["mes",/(\d+)\s*(?:m\.?\s*e\.?s?|militares?\s+estaduais?)\b/gi],
    ["equinos",/(\d+)\s*(?:equinos?|cavalos?)\b/gi]
  ];
  padroes.forEach(([categoria,padrao])=>{
    for(const correspondencia of String(texto).matchAll(padrao)) totais[categoria]+=numeroInteiro(correspondencia[1]);
  });
  return totais;
}

export function obterEfetivoEstruturado(evento={}){
  const estruturado=["efetivoConjuntos","efetivoMEs","efetivoEquinos"].some(campo=>evento[campo]!==undefined&&evento[campo]!==null&&evento[campo]!=="");
  if(!estruturado) return extrairEfetivoTexto(evento.efetivo||"");
  return {conjuntos:numeroInteiro(evento.efetivoConjuntos),mes:numeroInteiro(evento.efetivoMEs),equinos:numeroInteiro(evento.efetivoEquinos)};
}

export function contabilizarEfetivo(lista=[]){
  return lista.reduce((totais,evento)=>{
    const {conjuntos,mes,equinos}=obterEfetivoEstruturado(evento);
    totais.conjuntos+=numeroInteiro(conjuntos);
    totais.mes+=numeroInteiro(mes);
    totais.equinos+=numeroInteiro(equinos);
    return totais;
  },{conjuntos:0,mes:0,equinos:0});
}
