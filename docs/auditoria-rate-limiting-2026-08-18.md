# Auditoria de rate limiting, 18/08/2026

## Status

Análise concluída em 18/08/2026 sobre o commit `d1cc783` e a release de
produção `20260818113700-d1cc783`. Os achados abaixo preservam o estado
observado naquele ponto.

Em 18/08/2026, o usuário autorizou um lote de correções de baixo risco,
publicado no commit `1cd1f04` e na release `20260818195445-1cd1f04`:

- [x] Aplicar no backend os limites de linhas, chunks, lojas e produtos.
- [x] Limitar campos de autenticação e limpar o balde por conta após sucesso.
- [x] Limpar PDFs expirados no boot e periodicamente.
- [x] Fazer o teste de limpeza do limiter exercitar o timer real.

Na revisão subsequente do contrato de importação:

- [x] Validar `--chunk-size` no CLI entre 1 e 1.000.

Em 19/08/2026, o usuário decidiu que importações simultâneas devem ser
bloqueadas, em vez de aumentar os limites para suportar concorrência:

- [x] Serializar app e CLI com uma lease global persistida no MariaDB.
- [x] Renovar a lease por chunk e liberar ao finalizar ou cancelar.
- [x] Expirar importações abandonadas após 10 minutos sem atividade.
- [x] Reconciliar a contagem real do staging antes de substituir agregados.
- [x] Aplicar lojas e produtos somente na transação final, sem mutação parcial
  em importações canceladas ou inválidas.

Continuam adiados os ajustes de infraestrutura, `Retry-After`, concorrência de
PDFs e capacidade acumulada de PDFs. Nenhum achado restante representa
autorização para alterar nginx, firewall, Cloudflare ou dados de produção.

## Escopo

A auditoria cobriu:

- Algoritmo em memória, janelas, limites por IP e globais.
- Entrada geral de server functions e middlewares internos.
- Login, primeiro acesso, troca de senha, `getMe` e logout.
- Upload, chunks, retries, filas e limites de arquivo.
- Geração, armazenamento temporário e download de PDFs.
- SSR, assets, version check e túnel do Sentry.
- Comportamento com dois usuários em IPs distintos e sob o mesmo NAT.
- Configuração real de nginx e firewall na VPS, em modo somente leitura.
- Testes existentes e serialização de erro do TanStack Start.
- Uso de números fixos no código, documentação e infraestrutura.

## Resumo executivo

O algoritmo central está correto para a topologia atual do PM2, `fork` com
uma instância. Requisições bloqueadas por IP não consomem o orçamento global,
e a saturação global não cria chaves novas no mapa.

O uso normal de dashboard, filtros, consultas e administração por dois
usuários fica longe dos tetos. Os riscos mais relevantes estão fora da
aritmética básica do contador:

1. A origem aceita conexão HTTPS direta e o app confia em um header de IP que
   pode ser falsificado nesse caminho.
2. O nginx aceita corpos de até 1 GB, acima do limite de memória do processo.
3. Uploads grandes simultâneos sob o mesmo NAT não cabem nos limites atuais.
4. O retry de upload não trata `429` nem respeita a janela de bloqueio.
5. O `Retry-After` configurado dentro de server functions é descartado pelo
   serializador de erro atual do TanStack Start.
6. O fluxo de PDF limita requisições, mas não concorrência, memória ou bytes
   temporários acumulados.

## Configuração atual

Todos os tiers abaixo usam janela fixa de 60 segundos. O balde por conta usa
15 minutos.

| Tier | Por IP | Global | Tráfego |
| --- | ---: | ---: | --- |
| SSR | 300 | 1.500 | HTML, assets e rotas não classificadas |
| Server functions | 300 | 1.500 | Toda requisição para `/_serverFn/` |
| API | 300 | 1.000 | Middleware interno da maioria das server functions |
| Upload | 250 | 500 | Início, chunks e finalização da importação |
| Auth | 10 | 40 | Login, primeiro acesso e troca de senha |
| PDF | 10 | 50 | POST e GET de `/api/pdf-download` |
| Monitoramento | 60 | 300 | POST para `/monitoring` |
| Conta | 10 por 15 min | Desativado na prática | Login e primeiro acesso por conta |

Cada server function remota consome o tier externo `serverFn` e depois seu
tier interno, `api`, `upload` ou `auth`. Não é incremento duplicado do mesmo
contador: são duas proteções independentes com escopos diferentes.

## Dois usuários simultâneos

### Uso comum

Uma entrada normal no sistema, login e carregamento do dashboard consomem,
por usuário, aproximadamente:

- Uma ou duas requisições HTML, além dos assets.
- Duas a oito server functions remotas.
- Cerca de oito chamadas do tier API.
- Uma tentativa do tier Auth.

Dois usuários sob o mesmo NAT continuam muito abaixo de `300/min` nos tiers
SSR, Server Functions e API. Consultas, filtros, navegação, login correto e
administração comum não são o cenário preocupante.

### Upload

Com chunk de 1.000 linhas, uma tentativa usa:

```text
ceil(linhas / 1.000) + begin + finalize
```

| Cenário | Chamadas |
| --- | ---: |
| Arquivo diário normal, cerca de 48 mil linhas | 50 |
| Arquivo máximo, 200 mil linhas | 202 |
| Dois arquivos normais | 100 |
| Um máximo e um normal | 252 |
| Dois máximos | 404 |
| Um máximo com três tentativas completas | 606 |

Em IPs diferentes, dois arquivos máximos usam 202 chamadas por IP e 404 do
global de Upload, portanto cabem numa única tentativa.

Sob o mesmo NAT, um arquivo máximo e um arquivo normal já precisam de 252
chamadas para um teto de 250. Dois arquivos máximos precisam de 404 chamadas e
também ultrapassam o teto de 300 do tier Server Functions.

O retry atual reinicia o arquivo inteiro até duas vezes, totalizando três
tentativas, e espera sempre 1,5 segundo. Uma resposta `429` não é distinguida
de outros erros e a janela de um minuto não é respeitada.

### PDF

Uma exportação normal usa duas requisições do tier PDF:

1. POST do blob.
2. GET da URL temporária.

O limite de `10/IP/min` permite cinco exportações por minuto por IP. Sob o
mesmo NAT, essa capacidade é compartilhada pelos dois usuários. O Firefox
pode buscar a URL mais de uma vez; nesse caso uma exportação usa três
requisições, e apenas três exportações completas ficam garantidas na janela.

### Autenticação

Em IPs diferentes e contas diferentes, cada usuário tem até dez tentativas
por minuto, limitado a quarenta globalmente.

Sob o mesmo NAT, os dois usuários compartilham dez tentativas por minuto. Por
exemplo, cinco erros de cada usuário bloqueiam a próxima tentativa de ambos
até a janela expirar. O balde por conta também conta tentativas válidas e não
é limpo depois de um login bem-sucedido.

## Achados

### 1. Alto: origem direta permite falsificar o IP do limiter

Verificação feita na VPS em 18/08/2026:

- `192.99.246.57` respondeu `200` em HTTPS direto para o host
  `gpa.t00ls.dev`, sem passar pelo Cloudflare.
- A mesma origem respondeu `200` com `CF-Connecting-IP` arbitrário.
- O firewall possui regra aberta para portas `80` e `443`.
- O nginx define `X-Real-IP`, mas não remove nem sobrescreve
  `CF-Connecting-IP` antes de encaminhar a requisição.
- `getClientIp()` confia primeiro em `CF-Connecting-IP`.

Um cliente direto pode trocar o header a cada requisição. Isso contorna os
limites por IP e permite alcançar os limites globais usando uma única origem
real. O balde por conta e os circuit breakers globais continuam existindo,
portanto não é bypass total.

Decisão futura necessária: restringir a origem às faixas do Cloudflare,
habilitar Authenticated Origin Pulls ou sobrescrever headers não confiáveis no
nginx. Essa ação altera infraestrutura e sempre exige autorização explícita.

### 2. Alto: limite de corpo HTTP é maior que a memória do processo

O nginx está configurado com:

```text
client_max_body_size 1024m
```

O PM2 reinicia o app ao atingir 512 MB. O rate limit controla número de
requisições, não bytes. Uma requisição permitida pode ser recebida e parseada
antes de o Zod rejeitar campos ou arrays grandes.

Decisão futura necessária: definir limites de corpo por rota. O PDF precisa
de um teto diferente das server functions comuns. Uma redução global sem
exceção quebraria PDFs legítimos maiores.

### 3. Alto: contrato de upload não inclui concorrência e retries

O teste atual prova apenas que uma tentativa máxima, 202 chamadas, cabe no
tier Upload de 250. Ele não modela:

- O tier externo Server Functions de 300.
- Dois usuários sob o mesmo NAT.
- Fila com múltiplos arquivos.
- Até três tentativas por arquivo.
- Falha tardia, depois de quase todos os chunks.

Os números atuais não são inadequados para uso comum, mas não garantem os
cenários legítimos acima.

### 4. Alto: `Retry-After` interno é descartado

`src/lib/rate-limit-response.ts` chama `setResponseStatus(429)`, chama
`setResponseHeader("Retry-After", ...)` e lança `Error`.

No pacote instalado do TanStack Start,
`server-functions-handler.ts` captura esse erro e cria uma nova `Response`
com apenas `Content-Type` e o header interno de serialização. A camada de
integração preserva `Set-Cookie` em respostas de erro, mas não copia headers
comuns do evento.

Consequência: o status `429` é preservado, mas `Retry-After` não chega ao
cliente nos bloqueios internos. O 429 externo de `src/server.ts` está correto
porque constrói uma `Response` diretamente.

O teste atual só comprova que o mock de `setResponseHeader` foi chamado. Ele
não passa pela serialização HTTP real do framework.

### 5. Alto: PDF limita frequência, não capacidade acumulada

O máximo atual é 50 MB por PDF. Durante o POST, o servidor mantém os chunks e
depois copia tudo para um novo `Uint8Array`. Uma requisição máxima pode manter
aproximadamente 100 MB de bytes vivos antes de considerar overhead do runtime.
O GET lê o arquivo completo novamente.

Não há limite de uploads PDF concorrentes nem orçamento global por bytes. Dez
POSTs grandes do mesmo IP ainda cabem no tier por frequência.

O armazenamento em `/tmp` remove expirados somente quando outro PDF é
armazenado. Em 18/08/2026 havia 280 KB de PDFs expirados desde 17/08. O volume
observado era pequeno, mas confirma que uma última rajada pode permanecer no
disco indefinidamente.

### 6. Médio: limites de importação só são obrigatórios no cliente

A interface aplica 200 mil linhas e envia chunks de 1.000 linhas. O backend
não aplica teto para:

- `total_rows`.
- Quantidade de linhas em `rows`.
- Quantidade de lojas.
- Quantidade de produtos.

O limite de arquivo de 10 MB existe somente em
`src/components/upload-dropzone.tsx`. O CLI compartilha o tamanho padrão do
chunk, mas permite `--chunk-size` sem validar zero, negativo, `NaN` ou um valor
grande demais.

### 7. Médio: campos de autenticação não têm tamanho máximo

`identifier` e `password` validam apenas tamanho mínimo. O identificador de
uma conta inexistente também vira chave do limiter por 15 minutos. A auditoria
grava `actor_username` em uma coluna `VARCHAR(60)` sem truncar ou rejeitar o
input antes.

O risco inclui memória desnecessária, erro de banco na tentativa de registrar
a falha e processamento de corpos muito maiores que o domínio aceita.

### 8. Médio: bloqueio de login ainda produz banco, logs e Sentry

Quando o tier Auth bloqueia uma tentativa, o handler grava `audit_log` antes
de lançar o erro 429. A exceção também passa pelo logging da server function e
pode ser capturada pelo Sentry.

Uma rejeição deveria ser barata. Com IPs falsificados, o tier externo permite
até 1.500 entradas de server functions por minuto antes do circuito global.
Registrar cada rejeição individualmente transforma bloqueio em I/O de banco,
log e observabilidade.

### 9. Médio: sucesso não limpa o balde por conta

O balde é consumido antes de validar a senha e não é limpo após sucesso. Dez
logins válidos em 15 minutos podem bloquear o 11º. Login e primeiro acesso
compartilham o mesmo balde.

Limpar o balde após autenticação ou primeiro acesso bem-sucedido preservaria a
proteção contra falhas anteriores sem penalizar logins válidos repetidos.

### 10. Médio: não existe telemetria por tier

O sistema não registra, por tier:

- Consumo da janela.
- Quantidade de bloqueios.
- IPs próximos do teto.
- Concorrência e bytes de PDF.
- Motivo do `429`.

Os limites foram avaliados por capacidade teórica. Os logs disponíveis na VPS
não permitem reconstruir tráfego real por rota com qualidade suficiente.
Alterar números sem essa visibilidade continua sendo uma decisão por cálculo,
não por medição de produção.

### 11. Baixo: teste de limpeza não exercita o timer

O teste chamado `cleanup removes expired entries` avança o relógio e chama
`check()` novamente. O próprio `check()` substitui a entrada expirada, então o
teste continuaria passando se o timer de limpeza fosse removido.

## Hardcoded: avaliação

Um número fixo não é um problema por si só. Para políticas de segurança e
capacidade, manter valores no código pode ser melhor que usar variáveis de
ambiente:

- A mudança passa por revisão, teste, commit e deploy.
- Todos os ambientes usam a mesma política conhecida.
- Não existe alteração silenciosa na VPS.
- Testes podem importar e validar o mesmo contrato.

Transformar todos os limites em variáveis de ambiente aumentaria o risco de
divergência entre cliente, servidor, testes e documentação. Não há necessidade
atual de políticas diferentes por ambiente.

O hardcode passa a ser ruim quando:

- O mesmo valor é repetido em lugares independentes.
- Dois números relacionados podem mudar sem um teste falhar.
- O backend não aplica o contrato exibido pela interface.
- Mensagens repetem o número manualmente.
- Não existe justificativa, medição ou cenário de capacidade.

### Classificação recomendada

| Tipo de valor | Local recomendado |
| --- | --- |
| Tiers e janelas de rate limit | Configuração de código central, tipada e versionada |
| Linhas, chunk, arquivo e retries de importação | Configuração compartilhada do domínio de importação |
| Bytes, TTL, concorrência e capacidade de PDF | Configuração server-side do domínio de PDF |
| Polling, debounce e timeout locais | Constantes locais nomeadas |
| Credenciais e diferenças reais de ambiente | Variáveis de ambiente |
| Limites de conexão e corpo na origem | Configuração versionada de infraestrutura |

Os números em `RATE_LIMITS` não são um problema apenas por serem hardcoded. O
problema atual é que Upload, Server Functions, tamanho máximo, chunks e retries
formam um contrato distribuído que não é validado como conjunto.

## Opções para decisão futura

### Opção A: correção mínima de segurança

- Bloquear origem direta ou tornar os headers confiáveis no nginx.
- Reduzir o limite de corpo das server functions.
- Preservar `Retry-After` nos 429 internos.
- Adicionar máximos de tamanho aos campos de autenticação.

Vantagem: reduz os riscos exploráveis sem recalibrar a experiência de uso.

### Opção B: segurança e dois usuários sob NAT

Inclui a opção A e também:

- Recalibrar Upload e Server Functions para concorrência legítima.
- Fazer retries respeitarem `429` e `Retry-After`.
- Aplicar no backend os limites de linhas e chunk.
- Revisar capacidade efetiva de PDF por exportação, não apenas por request.

Vantagem: resolve os cenários de bloqueio legítimo identificados.

### Opção C: capacidade medida

Inclui a opção B e também:

- Telemetria agregada de bloqueios e consumo por tier.
- Medição de tamanho real dos PDFs.
- Medição de chamadas e duração de uploads reais.
- Recalibração posterior baseada em produção.

Vantagem: substitui estimativas por dados. Custa mais trabalho e não é
necessária para corrigir primeiro os riscos confirmados.

## Ordem sugerida caso o tema seja retomado

1. Corrigir confiança de IP e tamanho de corpo.
2. Corrigir resposta HTTP 429 e teste de integração.
3. Corrigir contrato e retry de upload.
4. Aplicar limites de importação no backend e validar o CLI.
5. Limitar capacidade acumulada e limpar arquivos do PDF por timer ou no boot.
6. Limitar campos de autenticação e limpar o balde após sucesso.
7. Tornar rejeições de auth baratas e agregadas.
8. Adicionar telemetria antes de nova recalibração numérica.

## Critério para reabrir

Revisar esta auditoria quando ocorrer uma das condições:

- O usuário decidir garantir dois uploads grandes simultâneos sob o mesmo NAT.
- Aparecer um `429` legítimo em uso normal.
- A VPS ganhar mais usuários, instâncias ou núcleos.
- O PM2 sair de `fork` com uma instância.
- Houver mudança no proxy, Cloudflare ou exposição da origem.
- O tamanho real dos PDFs se aproximar de 50 MB.
- O tema de segurança da origem for priorizado.

Até lá, o assunto permanece documentado e adiado, sem ação automática.
