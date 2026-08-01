# Segurança: resolução de IP e endurecimento da origem (Cloudflare)

Como o Bench GPA descobre o IP real do usuário e o que precisa estar
configurado na infra para esse IP ser **confiável** (não falsificável).

Isso afeta diretamente a **trilha de auditoria** (`audit_log`) e o
**rate-limit** de login, ambos usam `getClientIp`.

## 1. Cadeia de proxy

```
Usuário ──HTTPS──▶ Cloudflare (edge) ──▶ nginx Hestia (:443) ──proxy_pass──▶ Bun SSR (127.0.0.1:3000)
```

O nginx repassa (template `node-ssr`):

```nginx
proxy_set_header X-Real-IP $remote_addr;                     # quem conectou no nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; # cadeia XFF acumulada
```

Como quem "conecta no nginx" é o **edge do Cloudflare**, `$remote_addr`
(logo, `X-Real-IP`) é o **IP do Cloudflare**, não o do usuário. O IP real
vem nos headers que o próprio Cloudflare injeta.

## 2. Como o app resolve o IP

`src/lib/rate-limit.ts` → `getClientIp()` tenta, nesta ordem de confiança:

| Ordem | Header | Cenário |
|-------|--------|---------|
| 1 | `CF-Connecting-IP` | Produção via Cloudflare (padrão) |
| 2 | `True-Client-IP` | Cloudflare Enterprise |
| 3 | `X-Real-IP` | Acesso direto ao nginx (sem CF) |
| 4 | `X-Forwarded-For` (1º salto) | Último recurso |
| N/A | `"unknown"` | Nenhum header disponível |

Ainda normaliza porta (`1.2.3.4:5678`) e IPv4-mapeado em IPv6 (`::ffff:1.2.3.4`).

### Por que NÃO usar `X-Forwarded-For[0]` primeiro

Atrás do Cloudflare, o `X-Forwarded-For` é **falsificável no primeiro salto**:
o CF apenas **acrescenta** o IP do visitante ao header. Se o cliente enviar
`X-Forwarded-For: 9.9.9.9`, o header chega como `9.9.9.9, <IP-real>, <edge-CF>`,
e pegar `[0]` captura o `9.9.9.9` forjado. Por isso os headers próprios do
Cloudflare (`CF-Connecting-IP`), que o CF **sobrescreve**, vêm primeiro.

## 3. Endurecimento da origem (obrigatório para confiar no header)

O `CF-Connecting-IP` só é confiável se **a origem aceitar tráfego apenas do
Cloudflare**. Caso contrário, alguém que acesse o IP da VPS diretamente
(ignorando o CF) pode forjar o header: o nginx o repassaria sem validar.

Há duas camadas complementares. A **camada A** já resolve o essencial; a
**camada B** é defesa adicional.

### Camada A: restringir a origem às faixas do Cloudflare

No template nginx (`node-ssr.tpl` e `.stpl`), dentro do `server { ... }`:

```nginx
# --- Aceita conexão apenas do Cloudflare ---
include /etc/nginx/cloudflare-allow.conf;   # allow <faixas CF>;
deny all;
```

E, de quebra, faça o nginx reescrever `$remote_addr` para o IP real do
visitante (módulo `realip`), para que até `X-Real-IP` fique correto:

```nginx
# --- Faz $remote_addr virar o IP real do visitante ---
include /etc/nginx/cloudflare-realip.conf; # set_real_ip_from <faixas CF>;
real_ip_header CF-Connecting-IP;
```

### Gerar os includes a partir da lista oficial (auto-atualizável)

As faixas do Cloudflare mudam. Em vez de fixar na mão, gere os includes a
partir da API oficial e recarregue o nginx (pode virar uma cron mensal):

```bash
#!/bin/bash
# refresh-cloudflare-ips.sh
set -euo pipefail
IPS="$(curl -fsS https://www.cloudflare.com/ips-v4; echo; curl -fsS https://www.cloudflare.com/ips-v6)"

{ echo "# gerado por refresh-cloudflare-ips.sh, NÃO editar à mão"
  while read -r cidr; do [ -n "$cidr" ] && echo "allow $cidr;"; done <<< "$IPS"
} > /etc/nginx/cloudflare-allow.conf

{ echo "# gerado por refresh-cloudflare-ips.sh, NÃO editar à mão"
  while read -r cidr; do [ -n "$cidr" ] && echo "set_real_ip_from $cidr;"; done <<< "$IPS"
} > /etc/nginx/cloudflare-realip.conf

nginx -t && systemctl reload nginx
```

> Atenção: ao aplicar o `deny all`, garanta que health checks locais usem
> `127.0.0.1` (já permitido pelo `proxy_pass` interno) e adicione um `allow`
> para o seu IP de administração se acessar o Hestia por fora do CF.

### Camada B: Authenticated Origin Pulls (mTLS)

Opcional e mais forte: o Cloudflare apresenta um certificado cliente que o
nginx exige (`ssl_verify_client on;` + CA do Cloudflare). Assim, mesmo quem
souber o IP da VPS não consegue falar com a origem sem o certificado do CF.
Ver docs do Cloudflare: *SSL/TLS → Origin Server → Authenticated Origin Pulls*.

## 4. Verificação rápida

- **Com CF (esperado em prod):** eventos de `audit_log` e chaves de rate-limit
  mostram o IP público do usuário (ex.: `203.0.113.7`).
- **Sem os headers (dev/localhost):** IP aparece como `unknown` (normal).
- **Teste de spoofing:** enviar `X-Forwarded-For: 9.9.9.9` **não** deve mudar o
  IP registrado quando `CF-Connecting-IP` está presente. Coberto por testes em
  `src/lib/rate-limit.test.ts` (`describe("getClientIp")`).
