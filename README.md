# Programação de Eventos — 4º RPMon

Aplicação web para consultar e administrar a agenda de eventos e atividades operacionais do 4º RPMon em 2026.

## Funcionalidades

- Visualização dos eventos organizados por mês.
- Pesquisa por nome, local ou tipo de evento.
- Filtros por categoria e esquadrão.
- Exibição de datas, horários e períodos de duração.
- Compartilhamento e impressão da agenda filtrada.
- Área administrativa autenticada para incluir, editar e excluir eventos.
- Atualização dos dados em tempo real com Cloud Firestore.

## Tecnologias

- HTML5
- CSS3
- JavaScript com módulos ES
- Firebase Authentication
- Cloud Firestore

## Estrutura do projeto

```text
.
├── index.html          # agenda pública
├── admin.html          # área administrativa
├── app.js              # regras da interface e integração com o Firebase
├── firebase-config.js  # inicialização dos serviços Firebase
├── style.css           # estilos e layout responsivo
└── image.png           # identidade visual
```

## Execução local

Como o projeto utiliza módulos JavaScript, execute-o por meio de um servidor web local. Uma opção simples é usar a extensão **Live Server** no Visual Studio Code e abrir `index.html`.

> O acesso administrativo depende de um usuário previamente cadastrado no Firebase Authentication e de regras adequadas no Firestore.

## Segurança e configuração

A configuração pública do SDK do Firebase identifica o projeto, mas a proteção dos dados deve ser garantida pelas regras do Firestore e pelo Firebase Authentication. Não armazene senhas, chaves privadas ou credenciais administrativas no repositório.

## Uso

1. Selecione o mês desejado.
2. Utilize a pesquisa e os filtros para localizar eventos.
3. Use os botões de impressão ou compartilhamento quando necessário.
4. Usuários autorizados podem acessar `admin.html` para gerenciar a agenda.

## Autor

[Valério Barbosa](https://github.com/ValerioBarbosa)

