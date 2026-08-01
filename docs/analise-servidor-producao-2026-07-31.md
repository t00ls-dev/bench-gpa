# Análise geral do servidor de produção (31/07/2026)

Levantamento do estado da VPS (`sv1.t00ls.dev`, 1 núcleo, 1,9GB RAM,
compartilhada com `cepeg.t00ls.dev` e `t00ls.dev` via HestiaCP), pedido fora do
escopo da auditoria técnica do repositório (`auditoria-tecnica-2026-07-31.md`,
que cobre só o código). Dados coletados via SSH direto na VPS, comandos
somente-leitura.

## Recursos

| Métrica                      | Valor                                                    | Leitura                                                |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| Load average                 | 0.06 / 0.02 / 0.00                                       | Ocioso                                                 |
| Memória                      | 944Mi usado / 1.9Gi (987Mi disponível, 1.1Gi buff/cache) | Saudável                                               |
| Swap                         | 426Mi / 2.0Gi em uso                                     | Normal para esta VPS, já documentado em `continuar.md` |
| Disco (`/`)                  | 14G/20G usado (70%), 5.7G livres                         | Atenção, não crítico, sem muita folga                 |
| Uptime                       | 10 dias (na data da coleta)                              | N/A                                                      |
| Kernel/OS                    | Debian 12 (bookworm), `6.1.0-51-cloud-amd64`             | N/A                                                      |
| Atualizações de SO pendentes | 0 (inclusive segurança)                                  | Em dia                                                 |

Maiores consumidores de disco: `/home/admin` 2.5G (837M são
`node_modules` de `gpa.t00ls.dev`), `/var/lib/mysql` 1.8G, `/home/debian`
1.3G, `/root` 903M, `/var/log` 579M.

## Aplicação (bench-gpa)

- PM2: `online`, ~95MB RAM, 0% CPU, sem crash loop (confirmado em sessão
  anterior, ver `medicao-performance.md`/`continuar.md`).
- MariaDB é o maior consumidor de RAM do servidor inteiro: 364MB (18,4% do
  total), 190min de CPU acumulados nos 10 dias de uptime. Esperado para o
  tamanho do banco (`admin_gpa` = 732,7MB).
- `innodb_buffer_pool_size` continua em 128MB (default de fábrica) contra um
  banco de 732MB. **Não é achado novo**: é a mesma questão do "piso de I/O"
  já documentada em `continuar.md` (item 1, "decisão do usuário, não
  técnica"): a VPS não tem memória livre real para aumentar sem arriscar os
  outros dois sites.

## Backup

- Funcionando: HestiaCP + Backblaze B2. Último backup no dia da coleta
  (31/07, 05:12).
- **Retenção de só 1 cópia** (`v-list-user admin` → `BACKUPS: 1/1`). Se o
  backup mais recente sair corrompido ou for feito durante um estado ruim do
  banco, não há histórico para recuperar de um dia anterior. Só existe
  "hoje". Considerar aumentar a retenção (config do Hestia, não deste repo).

## Segurança: dois achados abertos

### 1. Origem aceita tráfego direto, bypassando o Cloudflare

Testado na hora: `curl` direto para o IP da VPS (`192.99.246.57:443`, via
`--resolve`) retorna `200` normalmente em `/auth`, sem passar pelo
Cloudflare. `iptables`/CSF do Hestia liberam 80/443 para `0.0.0.0/0`, sem
restringir às faixas de IP do Cloudflare.

**Impacto real, não teórico**: `getClientIp()`
(`src/lib/rate-limit.ts`) confia em `CF-Connecting-IP`. Um atacante que
descubra o IP real do servidor pode bater direto na origem, pular o
WAF/DDoS do Cloudflare **e** forjar esse header, contornando o rate limit
por IP inteiro (inclusive o balde por conta adicionado em 31/07 continua
válido, já que aquele é por e-mail, não por IP, mas o balde por IP vira
decorativo). Esse risco já estava anotado em comentário no próprio código
(`rate-limit.ts`, função `getClientIp`) desde antes desta sessão, nunca
endereçado na infraestrutura.

**Correção** (fora do escopo de código deste repo, é config de VPS):
restringir 80/443 no firewall (iptables direto ou `v-add-firewall-rule` do
Hestia) às faixas de IP do Cloudflare
(https://www.cloudflare.com/ips/), ou configurar Authenticated Origin
Pulls (mTLS entre Cloudflare e a origem). Ambas exigem atualizar a lista de
IPs periodicamente (Cloudflare publica atualizações raras, mas publica).

### 2. `fail2ban` ativo mas sem nenhum jail configurado

`systemctl is-active fail2ban` → `active`, mas
`fail2ban-client status` → `Number of jail: 0`. O serviço roda, mas não
bloqueia nada, nem SSH, nem tentativas de login na aplicação. Hoje não é
urgente (só 1 tentativa de login SSH falha nos últimos 7 dias, sem sinal de
brute-force ativo), mas é uma rede de segurança que existe só de nome.

**Correção**: configurar ao menos o jail `sshd` (padrão do fail2ban,
normalmente já vem pronto em `/etc/fail2ban/jail.d/`, só precisa ser
habilitado) e considerar um jail para `/auth` da aplicação lendo
`audit_log` (`action = 'auth.login_failed'`) ou o log de acesso do nginx.

## Outros sites do VPS

`sv1.t00ls.dev`, `cepeg.t00ls.dev`, `t00ls.dev`: todos ativos (`200`),
sem sinal de problema, disco pequeno (1-16 unidades Hestia cada, ordens de
grandeza abaixo de `gpa.t00ls.dev`).

## Pendente para retomar

Nenhum dos dois achados de segurança foi corrigido nesta sessão. Ambos são
mudança de infraestrutura da VPS (firewall/Hestia), não de código do
repositório, e o usuário pediu para só documentar por ora. Ordem sugerida
para quando for retomar:

1. Jail `sshd` do fail2ban: trivial, esforço baixo, zero risco de quebrar
   acesso (SSH já usa chave, não senha).
2. Restringir 80/443 às faixas de IP do Cloudflare: esforço baixo, risco
   médio se a lista de IPs do Cloudflare mudar sem ninguém atualizar a regra
   (o site ficaria inacessível até corrigir); vale documentar um processo de
   revisão periódica junto com a mudança.
