# Programação Operacional 4º RPMon

Aplicação web para centralizar a consulta e a administração da programação de eventos e atividades operacionais do 4º RPMon.

## Visão geral

O sistema organiza a agenda operacional em uma interface única. Usuários podem consultar, pesquisar e filtrar eventos, enquanto membros autorizados utilizam uma área administrativa para manter as informações atualizadas.

## Funcionalidades

- Consulta da programação por dia, semana, mês, próximos 30 dias ou ano
- Atalhos para hoje, esta semana e próximos eventos
- Seleção dinâmica do ano de referência
- Pesquisa textual de eventos
- Filtros por tipo de evento e esquadrão
- Recolhimento dos eventos passados no mês atual
- Limpeza rápida dos filtros
- Indicadores com resumo dos resultados
- Painel operacional com totais de hoje, semana, próximos 30 dias, esquadrões e tipos
- Detalhes completos do evento em uma janela acessível
- Link individual, compartilhamento por WhatsApp e cópia rápida
- Exportação individual para calendários no formato `.ics`
- Abertura do endereço no Google Maps
- Instalação como PWA no iPhone, Android e computador
- Atualização de dados em tempo real
- Área administrativa com autenticação
- Cadastro, edição e exclusão de eventos
- Suporte a eventos de um ou vários dias
- Impressão e compartilhamento da agenda
- Interface responsiva para celular e computador
- Estados de carregamento, erro e ausência de resultados
- Elementos de acessibilidade e suporte a movimento reduzido
- Proteção contra indexação por mecanismos de busca
- Backup automático local para usuários P3 e exportação manual em JSON
- Duplicação, arquivamento, alertas de conflito e filtros de auditoria

## Tecnologias

- HTML5
- CSS3
- JavaScript com módulos ES
- Firebase Authentication
- Cloud Firestore

## Arquitetura e funcionamento

A aplicação separa a visualização pública da área administrativa. Os eventos são armazenados no Cloud Firestore e atualizados em tempo real por meio de listeners. O Firebase Authentication controla o acesso às operações administrativas.

O código inclui compatibilidade com registros antigos, tratamento de conteúdo antes da exibição e estados de carregamento para melhorar a experiência de uso.

## Estrutura principal

- `index.html`: visualização pública da agenda
- `admin.html`: interface administrativa
- `app.js`: regras da aplicação e integração com o Firebase
- `firebase-config.js`: configuração dos serviços Firebase
- `style.css`: estilos e comportamento responsivo
- `manifest.webmanifest` e `sw.js`: instalação e cache do aplicativo
- `firestore.rules`: regras recomendadas de leitura pública e escrita autenticada
- `robots.txt`: instrução para não indexar o site

## Como executar

1. Clone este repositório.
2. Crie ou selecione um projeto no Firebase.
3. Configure o Firebase Authentication e o Cloud Firestore.
4. Informe a configuração do projeto em `firebase-config.js`.
5. Sirva os arquivos com um servidor HTTP local.
6. Abra a URL fornecida pelo servidor.

## Segurança do Firebase

As regras versionadas em `firestore.rules` mantêm a leitura pública da agenda, exigem autenticação para criar ou alterar eventos e impedem exclusões físicas. Para ativá-las no projeto Firebase:

```bash
firebase login
firebase use agenda-4rpmon
firebase deploy --only firestore:rules
```

O arquivo `firebase.json` também permite usar o Firebase Hosting, mas a publicação atual continua compatível com GitHub Pages e mantém o endereço existente.

> `robots.txt` e a metatag `noindex` reduzem a descoberta por buscadores, mas não transformam o endereço público em área sigilosa.

## PWA e cache

O service worker guarda somente os arquivos da interface. Os eventos continuam vindo do Firestore. No iPhone, use **Compartilhar → Adicionar à Tela de Início**. No Android ou computador, utilize o botão **Instalar** ou o menu do navegador.

## Backup

Quando um usuário P3 está autenticado, a última versão recebida do Firestore é armazenada automaticamente no navegador. O botão **Baixar backup JSON** gera uma cópia portátil dos registros ativos e arquivados. Para uma política institucional de recuperação de desastre, configure também exportações agendadas no Google Cloud.

> Nunca publique senhas, chaves privadas ou credenciais administrativas no repositório. A configuração pública de cliente do Firebase deve ser protegida por regras adequadas de autenticação e acesso no Firestore.

## Autor

Desenvolvido por [Valério Barbosa](https://github.com/ValerioBarbosa).
