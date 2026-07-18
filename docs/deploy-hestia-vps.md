# Deploy: Bench GPA no Hestia VPS

> Domínio: `gpa.t00ls.dev` — servidor `sv1.t00ls.dev` (Hestia CP)

## Arquitetura

```
Usuário ──HTTPS──▶ Hestia nginx (:80/:443)
                    └── proxy reverso (:3000)
                         └── Bun SSR (PM2)
                              └── MariaDB 11.4 (:3306, localhost)
```

- Sem Apache envolvido
- Sem Supabase
- Auth JWT próprio middleware
- MariaDB local (latência zero)

## Servidor

| Item | Valor |
|---|---|
| OS | Debian 12 (bookworm) |
| CPU | 1 vCPU |
| RAM | 1.9 GB + 4 GB swap |
| Disco | 20 GB (~8 GB livres) |
| IP | `192.99.246.57` |
| Panel | Hestia CP 1.9.6 |
| MariaDB | 11.4.12 (localhost:3306) |
| Node.js | v22.23.1 |
| PHP | 8.3.32 (não usado pelo app, mas disponível) |
| nginx | 1.30.2 (Hestia gerencia) |

## Template nginx: `node-ssr`

Criar dois arquivos no servidor via SSH.

### `/usr/local/hestia/data/templates/web/nginx/node-ssr.tpl`

```nginx
#=========================================================================#
# Node.js SSR Proxy Template                                              #
# https://hestiacp.com/docs/server-administration/web-templates.html      #
#=========================================================================#

server {
    listen      %ip%:%proxy_port%;
    server_name %domain_idn% %alias_idn%;
    error_log   /var/log/%web_system%/domains/%domain%.error.log error;

    include %home%/%user%/conf/web/%domain%/nginx.forcessl.conf*;

    location ~ /\.(?!well-known\/|file) {
        deny all;
        return 404;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /error/ {
        alias %home%/%user%/web/%domain%/document_errors/;
    }

    include %home%/%user%/conf/web/%domain%/nginx.conf_*;
}
```

### `/usr/local/hestia/data/templates/web/nginx/node-ssr.stpl`

```nginx
#=========================================================================#
# Node.js SSR Proxy Template (SSL)                                        #
# https://hestiacp.com/docs/server-administration/web-templates.html      #
#=========================================================================#

server {
    listen      %ip%:%proxy_ssl_port% ssl;
    server_name %domain_idn% %alias_idn%;
    error_log   /var/log/%web_system%/domains/%domain%.error.log error;

    ssl_certificate     %ssl_pem%;
    ssl_certificate_key %ssl_key%;

    # TLS 1.3 0-RTT anti-replay
    if ($anti_replay = 307) { return 307 https://$host$request_uri; }
    if ($anti_replay = 425) { return 425; }

    include %home%/%user%/conf/web/%domain%/nginx.hsts.conf*;

    location ~ /\.(?!well-known\/|file) {
        deny all;
        return 404;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /error/ {
        alias %home%/%user%/web/%domain%/document_errors/;
    }

    proxy_hide_header Upgrade;

    include %home%/%user%/conf/web/%domain%/nginx.ssl.conf_*;
}
```

## Criar subdomínio no Hestia

### Opção 1: CLI (SSH)

```bash
# Adicionar o domínio com template node-ssr
sudo /usr/local/hestia/bin/v-add-web-domain \
  admin "gpa.t00ls.dev" "192.99.246.57" \
  no \
  "" \
  "node-ssr"

# SSL Let's Encrypt
sudo /usr/local/hestia/bin/v-add-letsencrypt-domain admin gpa.t00ls.dev
```

### Opção 2: Hestia Web UI

1. Acessar `https://sv1.t00ls.dev:8083`
2. Login como admin
3. **WEB** → **Add Web Domain**
4. Domain: `gpa.t00ls.dev`
5. IP: `192.99.246.57`
6. Template: selecionar **node-ssr**
7. **Save**
8. Após criar, **SSL** → **Let's Encrypt** → **Add**

## Instalar Bun + PM2

```bash
# Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# PM2
npm install -g pm2
```

## Clonar e configurar o app

```bash
# Ir para o diretório web do Hestia
cd /home/admin/web/gpa.t00ls.dev

# Clonar
git clone https://github.com/pedrorodbit/bench-gpa.git public_html
cd public_html

# Instalar dependências
bun install

# Criar .env
cat > .env << 'ENVEOF'
DB_HOST="localhost"
DB_PORT="3306"
DB_NAME="bench_gpa"
DB_USER="bench_gpa"
DB_PASS="<senha_segura>"
JWT_SECRET="<base64_random_64_chars>"
JWT_EXPIRY="604800"
ENVEOF

# Build
bun run build

# Iniciar com PM2
pm2 start "bun run start" --name bench-gpa
pm2 save
pm2 startup
```

> A porta 3000 será usada pelo Bun SSR. O nginx do Hestia faz proxy reverso.

## Migrar dados do Supabase para MariaDB

### Schema

Criar o banco e rodar o schema SQL:

```sql
-- Conectar no MariaDB
mysql -u root -p

CREATE DATABASE bench_gpa CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'bench_gpa'@'localhost' IDENTIFIED BY '<senha>';
GRANT ALL ON bench_gpa.* TO 'bench_gpa'@'localhost';
FLUSH PRIVILEGES;
\q

# Rodar schema (copiar do scripts/migrate-schema.sql ou do doc)
mysql -u bench_gpa -p bench_gpa < scripts/migrate-schema.sql
```

### Dados

Usar o script `data/seed-from-supabase.php` (PHP já instalado no servidor) para migrar dados do Supabase para o MariaDB local.

```bash
cd /home/admin/web/gpa.t00ls.dev/public_html
php data/seed-from-supabase.php
```

Ou exportar manualmente do Supabase via CSV e importar:

```bash
# Export tables from Supabase
# Import via mysql CLI
mysql -u bench_gpa -p bench_gpa -e "LOAD DATA LOCAL INFILE 'stores.csv' INTO TABLE stores ..."
```

## Variáveis de ambiente (.env)

```env
# Banco
DB_HOST="localhost"
DB_PORT="3306"
DB_NAME="bench_gpa"
DB_USER="bench_gpa"
DB_PASS="<senha>"

# JWT
JWT_SECRET="<base64:64-chars>"
JWT_EXPIRY="604800"

# API (auto-referência para server functions)
API_PHP_URL="http://127.0.0.1:3000"
```

## Verificar deploy

```bash
# App está rodando?
pm2 status

# Testar local
curl http://127.0.0.1:3000/api/health

# Testar via nginx
curl https://gpa.t00ls.dev/api/health

# Logs
pm2 logs bench-gpa
tail -f /var/log/nginx/domains/gpa.t00ls.dev.error.log
```

## Checklist

- [ ] Template `node-ssr.tpl` + `node-ssr.stpl` criados no servidor
- [ ] Subdomínio `gpa.t00ls.dev` criado com template
- [ ] SSL Let's Encrypt ativo
- [ ] Bun instalado
- [ ] PM2 instalado
- [ ] Repositório clonado em `/home/admin/web/gpa.t00ls.dev/public_html`
- [ ] `.env` configurado
- [ ] MariaDB: banco criado, schema rodado
- [ ] Dados migrados do Supabase
- [ ] Build passou (`bun run build`)
- [ ] App rodando com PM2 (`bun run start` na porta 3000)
- [ ] nginx Hestia faz proxy para `127.0.0.1:3000`
- [ ] `https://gpa.t00ls.dev` responde
- [ ] Login/Logout funcional
- [ ] Dashboard com dados
