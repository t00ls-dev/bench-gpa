# Auditoria jurídica, independência e tratamento de informações

**Projeto:** Bench GPA  
**Data da auditoria:** 03/09/2026  
**Situação:** proposta para decisão, correção técnica e validação institucional  
**Escopo:** código, banco de dados, configurações, infraestrutura documentada, interface, funcionalidades e documentação existentes

Este documento registra uma avaliação técnica com consequências jurídicas e
documentais. Não constitui parecer jurídico profissional e não substitui a
avaliação das áreas competentes da companhia ou de profissional habilitado.

As minutas incluídas ao final não devem ser publicadas como textos definitivos
antes do preenchimento dos campos pendentes, da avaliação institucional sobre o
uso das informações e marcas e da correção dos riscos técnicos priorizados.

## 1. Resumo executivo

O Bench GPA é uma aplicação independente de apoio a consultas, filtros,
agregações, análises e apresentação de informações operacionais e comerciais.
Foi desenvolvida voluntariamente e por iniciativa própria de um colaborador do
Grupo Pão de Açúcar, fora da infraestrutura da companhia.

O sistema utiliza informações corporativas provenientes de fontes oficiais da
companhia às quais o colaborador possui acesso no exercício de suas atividades.
O acesso profissional a essas informações está confirmado como contexto. Não há,
porém, autorização institucional comprovada para o armazenamento, processamento,
transferência, reprodução ou compartilhamento dessas informações na
infraestrutura externa utilizada pelo Bench GPA. Essa ausência de evidência não
prova, por si só, irregularidade, mas impede afirmar autorização, homologação ou
aprovação institucional.

Também não existe autorização expressa para o uso de nomes e logotipos
relacionados ao GPA. O uso nunca foi expressamente permitido nem negado. A
ausência de negativa não equivale a autorização. Como a interface atual utiliza
logo, nome, cores associadas à marca e instalação como aplicativo, existe risco
de aparência de oficialidade. Recomenda-se desidentificação visual enquanto não
houver manifestação expressa.

O sistema possui controles técnicos relevantes:

- autenticação com senha protegida por hash;
- sessão em cookie `HttpOnly`, seguro em produção e com revogação no servidor;
- separação entre os perfis `user` e `admin`;
- autorização administrativa aplicada no servidor;
- validação de entradas;
- limitação de requisições por IP e por conta em fluxos sensíveis;
- cabeçalhos de segurança;
- registro de eventos de autenticação e administração;
- retenção de 180 dias para dados analíticos de vendas;
- PDFs temporários vinculados ao usuário autenticado.

O modelo de acesso confirmado é global dentro do grupo autenticado. Todo usuário
autenticado pode consultar os dados analíticos disponíveis. Análises salvas podem
ser visualizadas por qualquer usuário autenticado que possua a URL ou o QR Code.
Somente o proprietário pode editar ou excluir a análise. Esse comportamento é
intencional e não é classificado como falha de autorização. Deve ser explicado
de modo claro na interface e nos documentos.

Os principais riscos atuais são:

1. ausência de autorização institucional comprovada para o tratamento externo de
   informações corporativas;
2. aparência de ferramenta oficial decorrente do uso de marca sem aviso de
   independência;
3. indefinição do responsável pelo tratamento e do canal de privacidade;
4. lacunas de retenção para usuários, auditoria, logs, telemetria e backups;
5. possibilidade de monitoramento externo receber dados operacionais, IPs e
   conteúdo exibido em situações de erro;
6. fluxo de primeiro acesso baseado em um único identificador;
7. dependência de configuração para ativar o desafio de segurança em produção;
8. riscos de disponibilidade relacionados ao tamanho e à concorrência de
   requisições de PDF e ao limite documentado no proxy;
9. necessidade de confirmar a restrição da origem de produção e a confiabilidade
   dos cabeçalhos usados para identificar o IP do usuário.

A estrutura documental recomendada é simples:

1. Termos de Uso, Independência e Responsabilidade.
2. Aviso de Privacidade e Proteção de Dados.
3. Aviso curto de independência na interface.

Não se recomenda documento público separado sobre Segurança da Informação. Os
textos destinados ao usuário devem explicar os controles em nível suficiente,
sem revelar arquitetura, configurações ou detalhes úteis a exploração.

## 2. Funcionamento atual relevante do Bench GPA

### 2.1 Funcionalidades e acessos

| Funcionalidade           | Acesso efetivo      | Evidência principal                                                           |
| ------------------------ | ------------------- | ----------------------------------------------------------------------------- |
| Login                    | Público             | `src/routes/auth.tsx` e `src/lib/auth-api.ts`                                 |
| Primeiro acesso          | Público             | `src/routes/first-access.tsx` e `src/lib/auth-api.ts`                         |
| Troca de senha           | Usuário autenticado | `src/routes/change-password.page.tsx`                                         |
| Dashboard e rankings     | Usuário autenticado | `src/lib/dashboard.functions.ts`                                              |
| Análise de produto       | Usuário autenticado | `src/lib/product.functions.ts`                                                |
| Análise por área         | Usuário autenticado | `src/lib/area.functions.ts`                                                   |
| Previsão de venda        | Usuário autenticado | `src/lib/production.functions.ts`                                             |
| Análises salvas          | Usuário autenticado | `src/lib/saved-area-analyses.functions.ts`                                    |
| QR Code e URL de análise | Usuário autenticado | `src/lib/saved-area-qr-code.ts`                                               |
| PDFs de área e previsão  | Usuário autenticado | `src/hooks/use-area-pdf-export.ts` e `src/hooks/use-production-pdf-export.ts` |
| Upload de planilhas      | Administrador       | `src/lib/upload.functions.ts`                                                 |
| Gestão de usuários       | Administrador       | `src/lib/admin-users.functions.ts`                                            |
| Auditoria e diagnóstico  | Administrador       | `src/lib/admin-system.functions.ts`                                           |
| Documentação interna     | Administrador       | `src/lib/admin-docs.functions.ts`                                             |

As únicas páginas de uso público são login e primeiro acesso. As páginas de
negócio dependem de sessão válida. Rotas administrativas também redirecionam
usuários comuns, mas a proteção relevante está nas funções do servidor, que
verificam novamente a condição de administrador.

### 2.2 Consultas e transformações

O Dashboard apresenta venda total, evolução diária, ranking de lojas e rankings
por níveis da hierarquia comercial. A página Produto apresenta histórico,
comparação entre lojas e médias por data ou dia da semana. A página Área permite
compor filtros hierárquicos, produtos, loja e período, salvar uma análise e
exportar o resultado. A página Previsão calcula referências a partir de
ocorrências anteriores do mesmo dia da semana.

Os cálculos, filtros, previsões, agregações e formas de apresentação são próprios
do Bench GPA. Não devem ser descritos como cálculos ou manifestações oficiais da
companhia. Quando houver divergência, a fonte oficial deve prevalecer.

### 2.3 Análises salvas e compartilhamento autenticado

Uma análise salva possui proprietário, nome, descrição, loja e produtos. Sua URL
contém um UUID não sequencial. O QR Code contém somente essa URL, não os dados da
análise.

A regra de negócio confirmada pelo responsável pelo projeto é:

- qualquer usuário autenticado que receba a URL ou o QR Code pode visualizar a
  análise;
- usuários sem sessão não conseguem abrir a página;
- somente o proprietário pode editar ou excluir;
- somente administradores podem transferir a propriedade para outra conta ativa
  que já tenha concluído o primeiro acesso;
- a transferência preserva UUID, URL, QR Code, loja, descrição e composição, e o
  proprietário anterior perde as permissões de edição e exclusão;
- o link funciona como localizador compartilhável no grupo autenticado, não como
  mecanismo autônomo de autenticação;
- o UUID não amplia o acesso de uma pessoa que não possua conta válida.

As dez áreas abertas mais recentemente ficam registradas por até 30 dias no
navegador e separadas pelo identificador do usuário. O histórico armazena somente
o UUID e a data da visita, pode ser limpo manualmente e não duplica a análise. Os
dados atuais da área continuam sendo obtidos do servidor.

Essa regra precisa ser mantida coerente no backend, na interface, em `/howto` e
nos documentos destinados aos usuários.

### 2.4 Exportações existentes

Foram encontradas estas formas de retirada de informações da interface:

- PDF da análise por área;
- PDF da previsão;
- PDF para impressão do QR Code;
- download do QR Code em SVG e PNG;
- URL permanente de análise salva;
- cópia manual das informações exibidas, inerente ao uso do navegador.

Não foram encontradas exportações CSV ou XLSX, integração com compartilhamento
nativo do dispositivo, uso da API de clipboard ou endpoint público de dados.

Após o download, PDFs, imagens e capturas deixam o controle técnico da sessão. A
permissão original do usuário pode ser revogada sem que arquivos já salvos em
outros dispositivos sejam automaticamente recolhidos.

## 3. Fluxo e classificação das informações

### 3.1 Fluxo real

```text
Fontes oficiais da companhia
→ obtenção e exportação por colaborador com acesso profissional
→ importação administrativa no Bench GPA
→ validação e staging temporário
→ armazenamento no banco de dados
→ agregações, classificação atual e cálculos próprios
→ cache temporário
→ visualização por usuários autenticados
→ eventual PDF, QR Code ou URL compartilhada entre usuários autenticados
```

Existe também uma importação operacional por linha de comando no servidor. Ela é
voltada à administração da infraestrutura e não passa pela autorização da
interface.

### 3.2 Categorias e classificação

| Categoria                | Exemplos                                        | Classificação sugerida                                    |
| ------------------------ | ----------------------------------------------- | --------------------------------------------------------- |
| Identificação de usuário | Nome, username, matrícula                       | Dado pessoal e dado de conta                              |
| Credencial               | Hash de senha e token de sessão                 | Informação de segurança restrita                          |
| Controle de acesso       | Role, status, versão de token                   | Informação administrativa restrita                        |
| Auditoria                | IP, usuário, ação, alvo, data e detalhe         | Dado pessoal e registro de segurança                      |
| Dados comerciais         | Loja, produto, categoria, data e valor de venda | Informação corporativa potencialmente confidencial        |
| Dados derivados          | Rankings, médias, previsões e agregações        | Informação corporativa derivada                           |
| Análises salvas          | Nome, descrição, loja, produtos e proprietário  | Conteúdo de trabalho vinculado ao usuário                 |
| Exportações              | PDFs e imagens de QR Code                       | Cópia destacável da informação correspondente             |
| Telemetria               | Erros, traces, replay em erro e IP              | Dado técnico com possível conteúdo pessoal ou corporativo |
| Estado local             | Filtros, lojas selecionadas e produtos recentes | Preferência local com possível contexto operacional       |

Não foi encontrada coleta intencional de dados pessoais sensíveis definidos no
artigo 5º, II, da Lei nº 13.709/2018. Isso não impede que arquivos importados,
textos livres ou telemetria contenham informação pessoal inesperada. O schema
esperado deve continuar limitado às colunas necessárias.

### 3.3 Armazenamento e cópias

- O banco de dados relacional é o armazenamento persistente principal.
- Dados recebidos passam por tabela de staging e são consolidados em agregados.
- Tabelas derivadas mantêm universo de produtos e hierarquia de filtros.
- O servidor mantém cache em memória por períodos curtos, em geral entre 60 e
  300 segundos.
- O navegador mantém cache de consulta e algumas preferências em armazenamento
  local.
- PDFs podem permanecer temporariamente no servidor por aproximadamente 60
  segundos para permitir download com nome adequado.
- A documentação operacional registra backup externo do banco, mas não comprova
  a configuração atual, criptografia, prazo, acesso ou teste de restauração.
- Logs locais e telemetria externa podem criar cópias adicionais de informações
  técnicas ou de contexto.

### 3.4 Retenção e exclusão

| Categoria                        | Situação atual                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------- |
| Vendas e agregados               | Purga após 180 dias                                                               |
| Registro de importação           | Purga alinhada aos 180 dias                                                       |
| Staging                          | Removido após finalização ou limpeza do fluxo                                     |
| Arquivo importado pela interface | Interpretado no navegador, sem upload do XLSX bruto                               |
| Inbox operacional                | Sucesso pode ser apagado; falhas, duplicados e importação direta podem permanecer |
| PDF temporário                   | TTL nominal de 60 segundos e limpeza periódica                                    |
| Análise salva                    | Mantida até exclusão pelo proprietário                                            |
| Usuário                          | Sem exclusão ou anonimização implementada                                         |
| Auditoria                        | Sem prazo definido                                                                |
| Heartbeat                        | Um registro atualizado por job, sem histórico crescente por execução              |
| Logs de aplicação e proxy        | Prazo não comprovado                                                              |
| Telemetria externa               | Prazo não comprovado                                                              |
| Backup                           | Prazo e propagação de exclusão não comprovados                                    |
| Histórico local de áreas         | Até 10 itens por usuário, com expiração após 30 dias                              |
| Demais dados locais do navegador | Sem expiração controlada pela aplicação                                           |

Não é adequado afirmar que todos os dados são apagados após 180 dias. Esse prazo
se refere aos dados analíticos de vendas e registros associados definidos na
rotina de purga.

## 4. Autenticação, autorização e roles

### 4.1 Autenticação e sessão

Os controles confirmados incluem:

- senha protegida por bcrypt;
- JWT assinado;
- cookie `HttpOnly`, `SameSite=Lax` e `Secure` em produção;
- sessão comum deslizante por uma hora de inatividade, com limite absoluto de 24
  horas;
- opção de manutenção da sessão por sete dias;
- consulta de status ativo e versão de token no banco;
- revogação de sessões por incremento da versão do token;
- expiração de senha e fluxo de troca obrigatória;
- limitação de tentativas por IP e por conta;
- mensagens genéricas em pontos destinados a reduzir enumeração de contas.

Evidências principais: `src/lib/session.ts`, `src/lib/auth-config.ts`,
`src/lib/auth-api.ts` e `src/lib/auth-middleware.ts`.

O primeiro acesso utiliza somente username ou matrícula como identificação de
uma conta ainda sem senha. O fluxo possui limitação de tentativas e desafio de
segurança quando habilitado, mas oferece garantia de identidade inferior à
autenticação com credencial previamente estabelecida. Recomenda-se avaliar token
temporário individual emitido pelo administrador.

### 4.2 Roles

Existem somente dois perfis:

- `user`: consultas, filtros, análises, previsões, análises salvas e exportações;
- `admin`: todas as capacidades de `user`, mais importação, usuários, auditoria,
  diagnóstico e documentos internos.

Não existe restrição por loja, região, setor, cargo ou unidade. O princípio de
menor privilégio é aplicado às operações administrativas, mas não há escopo
individual dentro dos dados analíticos.

A decisão confirmada é que todo usuário autenticado pode consultar o conjunto de
dados analíticos disponibilizado pelo sistema. Essa decisão deve ser avaliada
institucionalmente, pois o código não demonstra que cada conta deveria receber
acesso global.

### 4.3 Autorização no servidor

As funções de negócio analisadas usam middleware de autenticação e limitação de
requisições. Funções administrativas também verificam a role no servidor. Assim,
ocultar botões não é o único controle.

Análises salvas adotam regras distintas por operação:

- criação associa a análise ao usuário autenticado;
- listagem mostra somente as análises criadas pelo próprio usuário;
- leitura por URL ou QR Code é permitida a qualquer usuário autenticado;
- edição e exclusão validam o proprietário;
- transferência exige administrador, valida a conta destinatária e registra o
  ator, o proprietário anterior e o novo proprietário na auditoria.

Esse modelo é consistente com a decisão atual, desde que seja comunicado aos
usuários e preservado por testes.

### 4.4 Pontos de atenção

- A autorização administrativa pode permanecer em cache por até cinco minutos.
  Alterações feitas pelo fluxo normal invalidam o cache, mas alterações externas
  ao fluxo podem ter propagação tardia.
- Um administrador não pode remover o próprio acesso, mas pode remover o acesso
  de outro administrador. Não há invariável garantindo ao menos um administrador
  ativo.
- A revogação de uma conta impede novos acessos, mas não recolhe PDFs ou capturas
  já exportados.

## 5. Segurança relacionada ao escopo

### 5.1 Medidas confirmadas

Há evidência técnica suficiente para afirmar, com redação prudente, que são
adotadas medidas destinadas à proteção das informações. Foram encontrados:

- autenticação e autorização no servidor;
- revogação de sessões;
- hash de credenciais;
- validação de entradas e limites de lote;
- limitação de requisições;
- Content Security Policy com nonce;
- HSTS, bloqueio de frames, `nosniff` e política restritiva de permissões;
- respostas HTML e PDF com diretivas contra armazenamento intermediário;
- isolamento do download temporário de PDF por usuário;
- auditoria de autenticação e operações administrativas;
- logs e monitoramento de erros;
- deploy com validações, migrations anteriores à ativação, troca atômica e
  rollback por health check.

Essas medidas não justificam afirmações como “totalmente seguro”, “risco
inexistente” ou “impossível de ser acessado”.

### 5.2 Limitações relevantes

#### Desafio de segurança dependente de configuração

`src/lib/turnstile.ts` considera o recurso desabilitado quando a secret não está
presente. A proteção de boot atual rejeita bypass explícito em produção, mas não
rejeita necessariamente a ausência da secret. Login e primeiro acesso poderiam
ficar somente com rate limiting nessa configuração.

#### Confiança no IP e acesso à origem

Documentação operacional anterior registra que a origem aceitava acesso direto e
que um cabeçalho usado para representar o IP real poderia ser informado pelo
cliente fora do caminho esperado. O estado atual precisa ser verificado na
infraestrutura. Enquanto isso, não se deve tratar o limite por IP como barreira
isolada suficiente.

#### Requisições grandes

O endpoint de PDF aceita até 50 MB por arquivo e monta buffers em memória. Não há
orçamento agregado de bytes ou concorrência. A documentação também registrou
limite de corpo do proxy superior à memória disponível para o processo. É
necessário confirmar e adequar o estado atual.

#### Dependências

O CI bloqueia vulnerabilidades críticas, mas permite que auditorias com
vulnerabilidades altas prossigam. Cada resultado precisa ser avaliado quanto à
execução em produção, explorabilidade e atualização disponível. O termo jurídico
não é instrumento para compensar dependência vulnerável.

#### Secrets e permissões

O arquivo de ambiente é protegido contra leitura pública, mas permite leitura ao
grupo do serviço web. Deve-se confirmar se todos os membros desse grupo precisam
desse acesso. A documentação técnica anterior também menciona secrets que teriam
existido no histórico Git; a rotação e remoção histórica não puderam ser
confirmadas apenas pelo estado atual.

#### Telemetria

O monitoramento de servidor evita cookies, headers, corpos de requisição,
informações automáticas de usuário e variáveis de stack. Contudo, permite
parâmetros de URL e dados de consultas ao banco. O navegador coleta replay apenas
quando ocorre erro e envia logs de warning e error. O túnel de monitoramento
adiciona o IP real ao evento.

É necessária revisão de minimização, mascaramento, acesso e retenção no provedor
de monitoramento.

## 6. Privacidade e LGPD

### 6.1 Incidência possível

O sistema trata dados relacionados a pessoas naturais, como nome, username,
matrícula, IP, histórico de acesso e autoria de análises. Portanto, há matéria
relevante para avaliação sob a Lei nº 13.709/2018.

O código não define:

- quem atua como controlador ou operador;
- qual base legal sustenta cada finalidade;
- quem recebe solicitações de titulares;
- quais contratos regulam provedores;
- se existe transferência internacional aplicável;
- quais prazos de retenção foram aprovados;
- como exclusões se propagam para logs, backups e telemetria.

Esses pontos dependem de decisão humana e avaliação jurídica. Não devem ser
preenchidos por inferência técnica.

### 6.2 Finalidades tecnicamente observadas

- criação e administração de contas;
- autenticação e controle de acesso;
- proteção de sessão e revogação;
- auditoria de login, segurança e administração;
- atribuição de importações e análises salvas;
- diagnóstico de erros e disponibilidade;
- manutenção de preferências locais de navegação.

### 6.3 Minimização

Os identificadores de usuário têm finalidade operacional clara. A auditoria
mantém IP e username desnormalizado para preservar rastreabilidade. Entretanto,
não existe prazo para esses registros. O campo livre de detalhe de auditoria e o
replay de erro merecem atenção porque podem receber conteúdo além do estritamente
necessário.

Recomenda-se inventário interno de campos, finalidade, acesso e prazo antes de
publicar afirmação ampla de minimização.

### 6.4 Direitos e solicitações

Não existe fluxo funcional para exclusão ou anonimização de usuário. Contas podem
ser inativadas. O sistema também não oferece painel de solicitação de direitos.
Isso não exige necessariamente uma interface nova, mas requer um canal e um
procedimento operacional definidos quando a legislação for aplicável.

## 7. Uso de marcas e aparência de oficialidade

O sistema utiliza logotipos relacionados ao GPA nas páginas públicas e privadas,
nome associado à companhia, cor predominante relacionada à identidade visual e
manifesto instalável como aplicativo.

Não há aviso visível informando que o projeto é independente e não oficial. Essa
combinação pode levar um usuário razoável a interpretar o Bench GPA como solução
oficial, homologada ou patrocinada.

A situação humana confirmada é:

- o uso da marca nunca foi expressamente autorizado;
- o uso também nunca foi expressamente negado;
- não existe evidência suficiente para declarar aprovação, homologação ou
  consentimento institucional.

### 7.1 Recomendação de desidentificação visual

Enquanto não houver manifestação expressa, recomenda-se:

1. remover os logotipos do GPA da interface e dos artefatos;
2. criar identidade visual própria e claramente distinta;
3. avaliar a substituição do nome “Bench GPA” por nome neutro;
4. inserir aviso curto de independência no login e no ambiente autenticado;
5. evitar expressões que apresentem o sistema como produto corporativo oficial;
6. manter referência textual à origem das informações somente quando necessária
   para transparência e contexto.

Essa recomendação não pressupõe infração de marca. É uma medida de redução de
risco diante da ausência de autorização e da aparência atual.

### 7.2 Desidentificação visual não anonimiza dados

Remover marca, nome ou logo não altera a natureza das informações processadas.
Dados de venda por loja, produto e período podem continuar confidenciais mesmo
sem referência visual à companhia.

Da mesma forma, anonimizar nomes de usuários não substitui eventual autorização
necessária para armazenar ou processar informações corporativas. São problemas
distintos.

## 8. Riscos encontrados e severidades

### 8.1 Alto: tratamento externo sem autorização comprovada

1. **Encontrado:** dados corporativos são armazenados e processados em
   infraestrutura não oficial, sem autorização institucional comprovada.
2. **Onde:** fluxo de importação, banco, deploy e contexto confirmado pelo
   responsável.
3. **Comportamento:** dados oficiais são transformados e disponibilizados a
   usuários autenticados.
4. **Impacto:** conflito potencial com políticas internas, confidencialidade,
   segurança, propriedade da informação ou regras de tratamento.
5. **Evidência:** código de importação e armazenamento; declaração humana de que
   não existe autorização.
6. **Tratamento jurídico:** indispensável, mas Termos não substituem autorização.
7. **Correção técnica:** pode depender das condições impostas pela companhia.
8. **Recomendação:** suspender alegações de regularidade institucional e solicitar
   avaliação formal das áreas competentes.

### 8.2 Alto: aparência de oficialidade e uso de marca não confirmado

1. **Encontrado:** logos, nome associado e identidade visual sem aviso de
   independência.
2. **Onde:** login, primeiro acesso, troca de senha, cabeçalho e manifesto.
3. **Comportamento:** apresentação visual semelhante a aplicação oficial.
4. **Impacto:** interpretação equivocada sobre autoria, homologação e suporte.
5. **Evidência:** `public/brand/`, páginas de autenticação e layout autenticado.
6. **Tratamento jurídico:** aviso de independência e titularidade das marcas.
7. **Correção técnica:** recomendada.
8. **Recomendação:** desidentificação visual até autorização expressa.

### 8.3 Alto: limites de disponibilidade para requisições grandes

1. **Encontrado:** PDF de até 50 MB em memória e limite elevado documentado no
   proxy.
2. **Onde:** `src/server.ts` e documentação de infraestrutura.
3. **Comportamento:** requisições concorrentes podem aumentar memória e disco.
4. **Impacto:** lentidão, reinício ou indisponibilidade.
5. **Evidência:** montagem integral de chunks e ausência de orçamento agregado.
6. **Tratamento jurídico:** somente limitação prudente de disponibilidade.
7. **Correção técnica:** recomendada.
8. **Recomendação:** reduzir limites e controlar concorrência ou bytes agregados.

### 8.4 Alto: proteção de IP dependente da origem

1. **Encontrado:** documentação registra possibilidade de acesso direto e
   cabeçalho de IP forjável.
2. **Onde:** documentação de segurança e resolução de IP.
3. **Comportamento:** limitação por IP pode ser contornada fora do proxy esperado.
4. **Impacto:** enfraquecimento de defesa contra abuso.
5. **Evidência:** testes operacionais históricos, estado atual não reconfirmado.
6. **Tratamento jurídico:** não exige cláusula específica.
7. **Correção técnica:** sim, se o estado persistir.
8. **Recomendação:** restringir origem e aceitar headers somente de proxies
   confiáveis.

### 8.5 Médio: primeiro acesso com identificador único

1. **Encontrado:** username ou matrícula permite definir a senha inicial de conta
   pendente.
2. **Onde:** `src/lib/auth-api.ts`.
3. **Comportamento:** identificador funciona como prova inicial de posse.
4. **Impacto:** tomada de conta se o identificador for conhecido antes do usuário.
5. **Evidência:** consulta por um dos dois identificadores e definição de senha.
6. **Tratamento jurídico:** não prometer verificação forte de identidade.
7. **Correção técnica:** recomendada.
8. **Recomendação:** token de ativação temporário emitido pelo administrador.

### 8.6 Médio: retenção incompleta

1. **Encontrado:** apenas parte dos dados possui prazo implementado.
2. **Onde:** purga de agregados, schema de auditoria, logs e backups.
3. **Comportamento:** usuários, auditoria e cópias externas podem permanecer por
   tempo indefinido.
4. **Impacto:** retenção excessiva e dificuldade de exclusão.
5. **Evidência:** ausência de jobs e política abrangente.
6. **Tratamento jurídico:** Aviso deve delimitar, sem inventar prazo.
7. **Correção técnica:** após definição de política.
8. **Recomendação:** tabela interna de retenção por finalidade e custo operacional.

### 8.7 Médio: telemetria e replay em erro

1. **Encontrado:** IP, query params, dados de consulta e replay de erro podem ser
   enviados a provedor externo.
2. **Onde:** `src/client.tsx`, `src/lib/instrument-server.ts` e `src/server.ts`.
3. **Comportamento:** coleta ocorre quando o monitoramento está configurado.
4. **Impacto:** divulgação não intencional de dados pessoais ou corporativos.
5. **Evidência:** opções de coleta e túnel de monitoramento.
6. **Tratamento jurídico:** Aviso de Privacidade.
7. **Correção técnica:** revisão de minimização e mascaramento.
8. **Recomendação:** reduzir campos, revisar replay, acesso e retenção.

### 8.8 Médio: exportações fora do controle da sessão

1. **Encontrado:** PDFs podem ser armazenados e encaminhados após o download.
2. **Onde:** exportação de Área, Previsão e QR Code.
3. **Comportamento:** sessão protege geração e download, não a cópia final.
4. **Impacto:** compartilhamento indevido de informação corporativa.
5. **Evidência:** geração client-side e download local.
6. **Tratamento jurídico:** dever de uso adequado e confidencialidade.
7. **Correção técnica:** avisos e auditoria recomendados.
8. **Recomendação:** classificar o arquivo, informar usuário e data de geração.

### 8.9 Baixo: compartilhamento de análise dentro do grupo autenticado

1. **Encontrado:** URL ou QR Code permite leitura por qualquer usuário logado.
2. **Onde:** `src/lib/saved-area-analyses.functions.ts`.
3. **Comportamento:** leitura global autenticada, edição e exclusão pelo dono.
4. **Impacto:** usuário pode encaminhar uma composição além do destinatário
   pretendido, mas somente contas válidas entram no sistema.
5. **Evidência:** autenticação na leitura e ownership nas mutações.
6. **Tratamento jurídico:** explicar claramente a regra.
7. **Correção técnica:** não, pois é comportamento deliberado.
8. **Recomendação:** teste de regressão e aviso contextual ao gerar QR Code.

## 9. Inconsistências entre comportamento e proteção pretendida

| Proteção pretendida                          | Situação                                    | Inconsistência                                        | Ação necessária                                           |
| -------------------------------------------- | ------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| Projeto independente e não oficial           | Verdadeiro no contexto, ausente na UI       | Aparência atual pode sugerir oficialidade             | Inserir aviso e desidentificar visualmente                |
| Informações vindas de fontes oficiais        | Confirmado                                  | Não significa autorização irrestrita de tratamento    | Declarar distinção nos Termos                             |
| Acesso restrito a usuários autenticados      | Confirmado para dados de negócio            | Primeiro acesso é público por necessidade             | Redação deve ressalvar os fluxos públicos de autenticação |
| Usuário acessa apenas o permitido à sua role | Parcial                                     | Role restringe administração, não escopo de dados     | Descrever modelo global real                              |
| Análises salvas vinculadas à conta           | Parcial                                     | Propriedade controla gestão, não visualização         | Atualizar `/howto` e Termos                               |
| QR Code não contorna autenticação            | Confirmado                                  | Nenhuma                                               | Manter controle e testes                                  |
| Dados não são públicos                       | Confirmado no app                           | Arquivos exportados podem circular fora dele          | Informar responsabilidade após exportação                 |
| Retenção de 180 dias                         | Confirmado apenas para vendas e importações | Outros registros não possuem prazo                    | Delimitar a afirmação                                     |
| Medidas de segurança são adotadas            | Confirmado                                  | Há limitações e controles dependentes de configuração | Usar linguagem prudente                                   |
| Uso de marca é autorizado                    | Não confirmado                              | Nunca permitido nem negado                            | Não afirmar; solicitar autorização                        |
| Tratamento externo é autorizado              | Não confirmado                              | Responsável informou inexistência de autorização      | Solicitar avaliação institucional                         |

## 10. Mudanças técnicas recomendadas

### Prioridade 1

1. Tornar o desafio de segurança obrigatório em produção quando fizer parte do
   modelo de proteção, falhando o boot se a secret necessária estiver ausente.
2. Verificar a origem de produção, restringir acesso direto e confiar em headers
   de IP somente quando enviados por proxies autorizados.
3. Reduzir o limite de corpo do proxy e impor orçamento de concorrência ou bytes
   agregados no endpoint de PDF.
4. Revisar coleta de query params, dados de SQL, IP e replay em erro no
   monitoramento.
5. Avaliar e tratar vulnerabilidades altas de dependências com base em
   explorabilidade, sem ignorá-las automaticamente no CI.

### Prioridade 2

1. Substituir primeiro acesso por token individual, temporário e revogável.
2. Definir e implementar retenção para auditoria, logs, contas, telemetria e
   backups.
3. Criar procedimento de anonimização ou exclusão de contas quando aplicável.
4. Registrar geração ou download de relatórios na auditoria, se a necessidade de
   rastreabilidade for confirmada.
5. Garantir ao menos um administrador ativo.
6. Revisar membros e necessidade de leitura do grupo que acessa `.env`.
7. Criar testes que registrem a regra de compartilhamento autenticado:
   visualização por terceiro autenticado permitida, edição e exclusão negadas.

### Dependente de autorização institucional

1. Adequar hospedagem, armazenamento, backup e controles às condições definidas
   pela companhia.
2. Aplicar eventual escopo de acesso por loja, área, cargo ou unidade.
3. Suspender ou limitar importações caso essa seja a orientação institucional.
4. Implementar classificação corporativa em dados e relatórios.

## 11. Mudanças de UI e UX recomendadas

1. Remover temporariamente logos relacionados ao GPA e adotar identidade própria.
2. Avaliar nome neutro para o projeto.
3. Inserir aviso curto de independência no login, primeiro acesso e rodapé.
4. Adicionar links públicos para Termos e Aviso de Privacidade.
5. Informar no diálogo de QR Code que qualquer usuário autenticado com o link
   poderá visualizar a análise.
6. Informar que somente o proprietário pode editar ou excluir a análise.
7. Adicionar aos PDFs, após validação institucional:
   - classificação definida para a informação;
   - usuário gerador;
   - data e hora;
   - caráter auxiliar;
   - orientação de conferência na fonte oficial.
8. Evitar modal, banner bloqueante ou aceite obrigatório enquanto os documentos
   não forem aprovados e não houver justificativa concreta para registrar aceite.

## 12. Estrutura jurídica e documental recomendada

Recomenda-se separar em dois documentos públicos:

1. **Termos de Uso, Independência e Responsabilidade:** natureza do projeto,
   finalidade auxiliar, regras de acesso, compartilhamento, exportações, marcas e
   limitações juridicamente razoáveis.
2. **Aviso de Privacidade e Proteção de Dados:** dados pessoais, finalidades,
   provedores, segurança, retenção, direitos e contato.

Informações técnicas detalhadas de segurança, infraestrutura, backup e fluxo de
dados devem permanecer em documentação interna. Não é necessário criar Política
de Segurança pública separada.

## 13. Matriz “Afirmação jurídica × Evidência técnica”

| Afirmação jurídica                                           | Evidência técnica                                               | Situação                                | Risco | Ação necessária                                         |
| ------------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------- | ----- | ------------------------------------------------------- |
| O Bench GPA é iniciativa independente                        | Contexto confirmado pelo responsável; hospedagem própria        | Confirmado                              | Baixo | Pode constar                                            |
| O Bench GPA não é ferramenta oficial                         | Não há evidência de homologação; contexto confirmado            | Confirmado quanto à situação atual      | Médio | Exibir aviso claro                                      |
| O GPA homologou ou patrocinou o projeto                      | Nenhuma evidência                                               | Não confirmado                          | Alto  | Não afirmar                                             |
| O desenvolvedor representa o GPA no projeto                  | Nenhuma evidência                                               | Não confirmado                          | Alto  | Declarar ausência de representação no âmbito do projeto |
| Os dados vêm de fontes oficiais da companhia                 | Fluxo de importação e contexto confirmado                       | Confirmado                              | Médio | Usar formulação genérica, sem nomear sistemas internos  |
| O acesso profissional autoriza tratamento externo irrestrito | Nenhuma evidência; responsável confirma ausência de autorização | Não confirmado                          | Alto  | Não afirmar; solicitar avaliação                        |
| Dados de negócio exigem autenticação                         | Rotas e server functions protegidas                             | Confirmado                              | Baixo | Pode constar                                            |
| Todo usuário autenticado pode consultar dados analíticos     | Funções analíticas não aplicam escopo individual                | Confirmado                              | Médio | Registrar como regra e validar institucionalmente       |
| Administradores possuem operações adicionais                 | `assertAdmin` no servidor                                       | Confirmado                              | Baixo | Pode constar                                            |
| Análises salvas são privadas e exclusivas do dono            | Leitura aceita qualquer usuário autenticado                     | Contradito pela implementação e decisão | Médio | Não usar                                                |
| Análises podem ser vistas por autenticados com URL ou QR     | Rota e função autenticadas                                      | Confirmado                              | Baixo | Explicar nos Termos e `/howto`                          |
| Apenas o dono edita ou exclui análise                        | Ownership aplicado em update e delete                           | Confirmado                              | Baixo | Pode constar                                            |
| QR Code concede acesso público                               | Rota exige sessão                                               | Contradito pela implementação           | Baixo | Não usar                                                |
| Exportações continuam protegidas após download               | Arquivo é salvo no dispositivo                                  | Contradito pela implementação           | Médio | Informar responsabilidade do usuário                    |
| Todos os dados são apagados em 180 dias                      | Purga cobre apenas categorias determinadas                      | Parcialmente confirmado                 | Médio | Delimitar categorias                                    |
| Senhas são armazenadas em texto aberto                       | Schema e bcrypt mostram hash                                    | Contradito pela implementação           | Alto  | Informar apenas que senha é protegida por hash          |
| São adotadas medidas de proteção                             | Auth, autorização, CSP, rate limit e auditoria                  | Confirmado                              | Médio | Usar linguagem não absoluta                             |
| O sistema é invulnerável ou sempre disponível                | Nenhuma implementação pode garantir                             | Não confirmado                          | Alto  | Não afirmar                                             |
| Dados nunca são enviados a provedores                        | Monitoramento, desafio, backup e deploy usam provedores         | Contradito pela implementação           | Alto  | Aviso de Privacidade deve reconhecer provedores         |
| O uso de marcas está autorizado                              | Nunca permitido nem negado                                      | Não confirmado                          | Alto  | Solicitar autorização ou remover uso                    |
| A LGPD não se aplica                                         | Há nome, matrícula, IP e logs vinculados                        | Contradito como afirmação absoluta      | Alto  | Avaliação jurídica e Aviso de Privacidade               |

## 14. Texto jurídico completo proposto

Os textos abaixo são minutas. Os campos entre colchetes precisam de definição e
o conteúdo deve ser validado antes da publicação.

### 14.1 Termos de Uso, Independência e Responsabilidade

# Termos de Uso, Independência e Responsabilidade

**Versão proposta:** 1.0  
**Vigência:** [DEFINIR DATA]  
**Responsável pelo Bench GPA:** [DEFINIR IDENTIFICAÇÃO]  
**Contato:** [DEFINIR CANAL]

#### 1. Objeto

O Bench GPA é uma ferramenta auxiliar de consulta, organização, análise e
apresentação de informações operacionais e comerciais.

O uso do Bench GPA está sujeito a estes Termos, às regras de acesso aplicáveis e
às políticas internas que eventualmente incidam sobre os usuários e as
informações tratadas.

#### 2. Natureza independente

O Bench GPA é uma iniciativa independente, desenvolvida voluntariamente e por
iniciativa própria de um colaborador.

O Bench GPA não constitui ferramenta oficial do Grupo Pão de Açúcar e não
representa manifestação institucional da companhia. O vínculo profissional do
desenvolvedor não implica, por si só, homologação, patrocínio, aprovação, suporte
técnico ou responsabilidade técnica da companhia pelo projeto.

Eventual utilização durante atividades profissionais não transforma
automaticamente o Bench GPA em sistema oficial.

#### 3. Caráter auxiliar

O Bench GPA possui caráter auxiliar e complementar. Não substitui fontes
oficiais, sistemas corporativos, procedimentos internos, políticas aplicáveis,
orientações formais ou decisões de responsáveis competentes.

Em caso de divergência, inconsistência ou dúvida, as fontes oficiais da companhia
prevalecem.

Análises, filtros, agregações, previsões, relatórios e formas de apresentação
produzidos pelo Bench GPA são funcionalidades próprias da ferramenta e não devem
ser automaticamente atribuídos à companhia.

#### 4. Origem e uso das informações

O Bench GPA pode tratar informações corporativas provenientes de fontes oficiais
da companhia às quais determinados colaboradores tenham acesso no exercício de
suas atividades.

O acesso profissional a uma informação não significa, por si só, autorização
irrestrita para copiar, armazenar, transferir, reproduzir, compartilhar ou tratar
essa informação por outros meios.

Cada usuário deve utilizar o Bench GPA somente para finalidades legítimas,
compatíveis com suas atribuições, permissões, deveres de confidencialidade,
políticas internas e orientações institucionais aplicáveis.

#### 5. Acesso e credenciais

As funcionalidades de negócio do Bench GPA são restritas a usuários autenticados.
Cada usuário deve:

1. manter suas credenciais sob sigilo;
2. utilizar somente sua própria conta;
3. não compartilhar senha ou sessão;
4. encerrar a sessão em dispositivos compartilhados;
5. comunicar suspeitas de acesso indevido ao canal indicado;
6. respeitar as permissões e finalidades aplicáveis às informações.

O acesso pode ser suspenso, limitado ou revogado quando necessário para proteção
do sistema, das informações, dos usuários ou de regras aplicáveis.

#### 6. Perfis e escopo de acesso

O Bench GPA possui perfis de usuário e administrador. Usuários acessam as
funcionalidades analíticas disponibilizadas. Administradores possuem, além
dessas, funções de importação, gestão de usuários, auditoria e diagnóstico.

No modelo atual, usuários autenticados podem consultar o conjunto de informações
analíticas disponibilizado no sistema. A existência de acesso técnico não elimina
as obrigações individuais de necessidade, finalidade, confidencialidade e uso
adequado.

#### 7. Análises salvas, links e QR Codes

Uma análise salva é vinculada à conta que a criou para fins de gestão. Somente o
proprietário pode editá-la ou excluí-la.

A URL e o QR Code da análise funcionam como atalhos compartilháveis. Qualquer
usuário autenticado no Bench GPA que receba o respectivo link ou QR Code poderá
visualizar a análise.

O link e o QR Code não eliminam a necessidade de autenticação, não criam conta e
não concedem acesso a pessoa que não possua credencial válida.

O usuário deve compartilhar links e QR Codes somente quando necessário e apenas
com pessoas autorizadas a utilizar o Bench GPA e as informações correspondentes.

Administradores podem transferir a propriedade de uma análise para outra conta
ativa que já tenha concluído o primeiro acesso. A transferência mantém a mesma
análise, URL, QR Code e composição. O proprietário anterior deixa de poder editar
ou excluir, sem perder a possibilidade geral de visualização concedida aos
usuários autenticados.

#### 8. Uso adequado e confidencialidade

O usuário compromete-se a:

1. utilizar informações somente para finalidades legítimas e relacionadas às
   suas atribuições;
2. evitar acesso, exportação ou compartilhamento desnecessário;
3. não tentar contornar autenticação, autorização, limites ou controles de
   segurança;
4. não acessar funções administrativas sem a respectiva permissão;
5. não utilizar as informações para fins ilícitos, pessoais, concorrenciais
   indevidos ou incompatíveis com regras aplicáveis;
6. verificar informações críticas nas fontes oficiais antes de utilizá-las em
   decisões operacionais.

#### 9. Exportações

O Bench GPA pode permitir a geração de relatórios, PDFs, imagens e QR Codes.

Após o download, o arquivo poderá ser armazenado, copiado, impresso ou encaminhado
fora do controle técnico direto do Bench GPA. O usuário permanece responsável por
proteger o arquivo e compartilhá-lo somente quando houver necessidade e
permissão.

A geração ou posse de um arquivo não concede ao destinatário autorização adicional
sobre as informações nele contidas.

#### 10. Disponibilidade e segurança

São adotadas medidas técnicas e operacionais destinadas à proteção da
confidencialidade, integridade e disponibilidade das informações. Nenhum sistema,
entretanto, está livre de riscos técnicos, operacionais ou de segurança.

O Bench GPA pode sofrer alterações, indisponibilidades, interrupções, falhas,
limitações de capacidade ou descontinuidade. O usuário não deve depender
exclusivamente da ferramenta para atividades críticas ou validações que devam
ocorrer nas fontes oficiais.

#### 11. Limitações de responsabilidade

O responsável pelo Bench GPA responde pelas obrigações que lhe sejam atribuídas
pela legislação aplicável. Estes Termos não afastam direitos ou responsabilidades
que não possam ser legalmente excluídos ou limitados.

Dentro dos limites permitidos pela legislação, não se assume responsabilidade
por decisões tomadas exclusivamente com base em análises próprias da ferramenta,
por divergências em relação às fontes oficiais, pelo uso indevido de credenciais
ou arquivos pelo usuário, nem por eventos fora do controle razoável do projeto.

A companhia não assume automaticamente responsabilidade pela manutenção,
disponibilidade ou funcionamento do Bench GPA apenas em razão do vínculo
profissional do desenvolvedor ou da origem corporativa das informações.

#### 12. Marcas

Nomes, marcas, logotipos e sinais distintivos relacionados ao Grupo Pão de Açúcar
pertencem aos respectivos titulares.

Eventual referência a esses elementos possui finalidade de identificação e
contextualização e não implica, por si só, propriedade, cessão, patrocínio,
homologação, aprovação ou oficialização do Bench GPA.

A forma de utilização poderá ser alterada ou removida conforme orientação dos
titulares ou das áreas competentes.

#### 13. Privacidade

O tratamento de dados pessoais relacionado ao Bench GPA é descrito no Aviso de
Privacidade e Proteção de Dados.

#### 14. Alterações

Estes Termos poderão ser atualizados para refletir mudanças técnicas, legais,
operacionais ou de segurança. A versão vigente permanecerá disponível na
interface. Alterações relevantes deverão ser comunicadas de forma adequada.

#### 15. Contato

Dúvidas sobre uso, segurança, privacidade ou estes Termos devem ser encaminhadas
para [DEFINIR CANAL].

### 14.2 Aviso de Privacidade e Proteção de Dados

# Aviso de Privacidade e Proteção de Dados

**Versão proposta:** 1.0  
**Vigência:** [DEFINIR DATA]  
**Responsável:** [DEFINIR IDENTIFICAÇÃO E PAPEL]  
**Contato:** [DEFINIR CANAL]

#### 1. Objetivo

Este Aviso explica como o Bench GPA trata dados pessoais necessários à
autenticação, segurança, administração, operação, suporte e uso de suas
funcionalidades.

#### 2. Dados tratados

O Bench GPA pode tratar:

1. nome, username, matrícula e perfil de acesso;
2. hash da senha, sem armazenamento da senha em texto aberto;
3. registros de login, logout, alterações administrativas e eventos de
   segurança;
4. endereço IP, data, hora e informações técnicas necessárias à segurança e
   auditoria;
5. identificadores e conteúdo vinculados a análises salvas;
6. filtros, lojas selecionadas e produtos recentes mantidos localmente no
   navegador;
7. dados técnicos de erro, desempenho e uso quando o monitoramento estiver
   habilitado.

O sistema também trata informações operacionais e comerciais necessárias às
funcionalidades. Essas informações podem não constituir dados pessoais por si
só, mas devem ser protegidas conforme sua natureza, contexto e regras aplicáveis.

#### 3. Finalidades

Os dados podem ser tratados para:

1. criar, autenticar, administrar e proteger contas;
2. controlar acesso e permissões;
3. registrar eventos de segurança e administração;
4. investigar falhas, abusos e incidentes;
5. gerar, manter e recuperar análises salvas;
6. operar, manter e corrigir o sistema;
7. cumprir obrigações legais ou preservar direitos quando aplicável.

#### 4. Análises salvas

Análises salvas contêm identificador do proprietário, nome, descrição, loja e
produtos selecionados. A conta proprietária controla edição e exclusão.

Outros usuários autenticados poderão visualizar uma análise quando receberem seu
link ou QR Code. O compartilhamento não elimina a necessidade de autenticação.

O navegador mantém, por até 30 dias, uma lista local com no máximo dez áreas
recentemente visitadas para cada usuário. A lista contém somente o identificador
da área e a data da visita, não é sincronizada entre dispositivos, pode ser
removida pelo usuário e não concede acesso adicional à análise.

#### 5. Provedores e compartilhamento

O Bench GPA pode utilizar provedores de infraestrutura, proteção contra abuso,
monitoramento, desenvolvimento, implantação e backup.

Dados serão compartilhados com esses provedores somente quando necessário às
finalidades operacionais, de segurança, manutenção ou cumprimento de obrigação
aplicável, observadas as definições e responsabilidades que vierem a ser
formalmente estabelecidas.

O registro interno de provedores, categorias de dados, localização, acesso e
retenção deve ser mantido na documentação técnica e não precisa expor detalhes de
arquitetura ao usuário.

#### 6. Segurança

São adotadas medidas técnicas e operacionais destinadas a reduzir riscos de
acesso não autorizado, perda, alteração, divulgação indevida ou indisponibilidade.
Essas medidas incluem autenticação, controle de acesso, proteção de sessão,
validação de entradas, limitação de requisições, registros de auditoria e
monitoramento.

Nenhuma medida elimina integralmente todos os riscos. Usuários também devem
proteger credenciais, dispositivos, links e arquivos exportados.

#### 7. Retenção

Os dados devem ser mantidos somente pelo período necessário às finalidades,
segurança, cumprimento de obrigações e preservação de direitos.

Dados analíticos de vendas e registros de importação relacionados possuem prazo
operacional de 180 dias no sistema. Esse prazo não se aplica automaticamente a
contas, análises salvas, auditoria, logs, telemetria ou backups.

Os prazos dessas demais categorias serão definidos em política interna após
avaliação de finalidade, necessidade, custo operacional e requisitos aplicáveis.

#### 8. Direitos dos titulares

Quando a legislação for aplicável, titulares poderão solicitar informações,
correção ou outras providências previstas em lei por meio de [DEFINIR CANAL].

Solicitações poderão depender de confirmação de identidade, obrigações de
preservação de registros, segurança, prevenção a fraude ou definição de
responsabilidades entre as partes envolvidas.

#### 9. Atualizações

Este Aviso poderá ser atualizado para refletir mudanças nas finalidades,
funcionalidades, medidas de segurança, provedores ou legislação. A versão vigente
permanecerá disponível na interface.

## 15. Avisos curtos

### 15.1 Independência

> O Bench GPA é uma iniciativa independente e não constitui ferramenta oficial
> do GPA. Utilize-o como apoio e confirme informações relevantes nas fontes
> oficiais.

### 15.2 Link e QR Code

> Links e QR Codes podem ser abertos por qualquer usuário autenticado do Bench
> GPA. Compartilhe-os somente quando necessário e com pessoas autorizadas a
> utilizar o sistema.

### 15.3 Exportação

> Este arquivo foi gerado por uma ferramenta auxiliar. Proteja seu conteúdo e
> confira informações críticas nas fontes oficiais.

## 16. Locais recomendados para apresentação

| Local                         | Conteúdo                                        | Forma recomendada                   |
| ----------------------------- | ----------------------------------------------- | ----------------------------------- |
| Login                         | Aviso curto e links para documentos             | Texto discreto abaixo do formulário |
| Primeiro acesso               | Aviso curto e links                             | Texto abaixo da definição de senha  |
| Rodapé autenticado            | Aviso curto, Termos e Privacidade               | Linha permanente sem bloqueio       |
| Página pública de Termos      | Texto completo                                  | Acesso sem autenticação             |
| Página pública de Privacidade | Texto completo                                  | Acesso sem autenticação             |
| Diálogo de QR Code            | Regra de visibilidade autenticada               | Próximo aos botões de download      |
| PDFs                          | Caráter auxiliar, usuário, data e classificação | Rodapé do documento                 |
| `/howto`                      | Uso auxiliar, compartilhamento e exportação     | Seções adequadas à role             |

Não se recomenda aceite obrigatório neste momento. Ele só deve ser considerado
depois da aprovação dos documentos, definição do responsável e demonstração de
uma finalidade concreta para registrar versão, data e usuário que aceitou.

## 17. Alterações recomendadas em `/howto`

A segregação atual de conteúdo está adequada: usuários comuns recebem instruções
analíticas e administradores recebem conteúdo adicional por carregamento
condicional.

O conteúdo de `/howto` deve refletir estes pontos:

1. substituir “Análises salvas ficam vinculadas à sua conta” por:

   > Você administra as análises que criar. Qualquer usuário autenticado que
   > receba o link ou QR Code poderá visualizá-las, mas somente o proprietário
   > poderá editar ou excluir.

2. incluir orientação de que o sistema é auxiliar e fontes oficiais prevalecem;
3. explicar que PDFs deixam o controle da sessão após o download;
4. orientar compartilhamento somente com usuários autorizados;
5. manter importação, usuários, auditoria, diagnóstico e documentação interna
   fora do conteúdo entregue a usuários comuns.
6. informar somente a administradores que eles podem transferir propriedade para
   outra conta elegível.

## 18. Alterações recomendadas na documentação técnica

Criar ou atualizar documentação interna sobre:

1. inventário de dados, finalidade, acesso e retenção;
2. fluxo de dados e cópias temporárias;
3. provedores, contratos, localização e exclusão;
4. backup, criptografia, acesso, retenção e teste de restauração;
5. configuração e minimização do monitoramento;
6. firewall, origem, proxy confiável e resolução de IP;
7. limites de request, memória e concorrência de PDF;
8. rotação de secrets e confirmação sobre histórico Git;
9. procedimento para incidente e preservação de evidências;
10. procedimento de inativação, anonimização ou exclusão de usuário;
11. regra formal de compartilhamento autenticado de análises;
12. eventual autorização institucional de dados e marcas, quando obtida.

Detalhes internos de arquitetura e segurança devem permanecer nessa documentação,
não nos Termos ou Aviso público.

## 19. Pendências que dependem de decisão humana

1. Identificação pública do responsável pelo Bench GPA.
2. E-mail ou canal para suporte, segurança e privacidade.
3. Decisão sobre continuidade de importação enquanto a autorização é avaliada.
4. Nome neutro e identidade visual substituta.
5. Definição de classificação dos dados e relatórios.
6. Confirmação de que todas as contas autenticadas devem possuir acesso global.
7. Prazo de retenção para contas, auditoria, logs, telemetria e backups.
8. Procedimento para solicitações relativas a dados pessoais.
9. Necessidade de auditoria de exportações.
10. Necessidade futura de aceite explícito e versionado.

## 20. Pontos dependentes de autorização ou avaliação externa

Devem ser encaminhados às áreas institucionais competentes ou a assessor jurídico:

1. autorização para armazenar e processar informações corporativas em
   infraestrutura externa;
2. requisitos de segurança, retenção, backup e resposta a incidentes;
3. autorização ou condições de uso de nome, marcas e logotipos;
4. definição dos papéis e bases legais relacionados à LGPD;
5. condições para uso por outros colaboradores durante o trabalho;
6. escopo de usuários e dados que cada conta poderá acessar;
7. requisitos para exportação, impressão e compartilhamento;
8. obrigações contratuais e transferências relacionadas a provedores;
9. validação final dos Termos e do Aviso de Privacidade;
10. eventual homologação, incorporação, restrição ou descontinuidade do projeto.

## 21. Minuta de solicitação de avaliação e autorização

**Assunto: Solicitação de avaliação e autorização para uso do Bench GPA**

Desenvolvi, por iniciativa própria e de forma voluntária, o Bench GPA, uma
ferramenta auxiliar para consulta, análise e apresentação de informações
operacionais e comerciais.

A ferramenta não utiliza infraestrutura corporativa para hospedagem e não
pretende substituir sistemas, fontes ou procedimentos oficiais. As informações
utilizadas são provenientes de fontes oficiais da companhia, acessíveis no
exercício das atividades profissionais, e são importadas para possibilitar
consultas, filtros, agregações, análises e relatórios auxiliares.

Solicito avaliação das áreas competentes sobre:

1. a possibilidade de armazenar e processar essas informações na infraestrutura
   utilizada pelo Bench GPA;
2. os requisitos de segurança, privacidade, retenção, backup, controle de acesso
   e exportação aplicáveis;
3. a necessidade de adequações técnicas ou operacionais antes de qualquer
   utilização continuada;
4. a possibilidade e as condições de uso do nome, marcas e logotipos relacionados
   ao GPA na interface;
5. a necessidade de formalização, homologação, termo de responsabilidade ou outra
   providência institucional;
6. a adequação do modelo em que usuários autenticados acessam o conjunto global
   de dados analíticos e podem visualizar análises recebidas por link ou QR Code.

Até eventual manifestação formal, o Bench GPA será tratado como iniciativa
independente, sem alegação de homologação, patrocínio ou representação
institucional.

Posso apresentar o fluxo de dados, os controles de acesso e segurança existentes,
as funcionalidades e a documentação técnica necessária para a avaliação.

## 22. Ordem de execução recomendada

1. Definir responsável e canal de contato.
2. Enviar a solicitação de avaliação institucional.
3. Iniciar desidentificação visual enquanto não houver autorização de marca.
4. Corrigir os riscos técnicos de prioridade alta que independem da resposta
   institucional.
5. Definir retenção e minimização com base nas finalidades aprovadas.
6. Ajustar `/howto`, QR Code e PDFs para refletir o compartilhamento autenticado.
7. Revisar as minutas conforme a resposta institucional e avaliação jurídica.
8. Somente então publicar Termos, Aviso de Privacidade e aviso curto na interface.
