# Auth — Possíveis melhorias

## UX

- **Esqueci minha senha**: não há fluxo de recuperação de senha. Adicionar link "Esqueceu a senha?" que envie email de reset ou permita reset via admin
- **Loading state mais rico**: botão mostra spinner, mas o formulário inteiro poderia ter feedback visual mais robusto (ex: desabilitar campos enquanto carrega)
- **Mostrar domínio no placeholder**: o email já usa `@gpabr.com`, mas poderia exibir o domínio como sufixo fixo no input (igual ao admin faz), evitando erros de digitação
- **Auto-focus no email ao carregar a página**

## Segurança

- **Rate limiting**: não há proteção contra tentativas brutas de login. Adicionar debounce no servidor ou captcha após N tentativas
- **Mensagem de erro genérica**: atualmente "E-mail ou senha inválidos" (bom), mas confirmar se não vaza informação de usuário existente vs inexistente
- **Log de tentativas**: registrar tentativas de login com falha para auditoria

## Funcionalidades

- **Login com magic link** como alternativa (era a implementação original, refatorada para email/senha)
- **Lembrar email**: checkbox "Lembrar de mim" que persiste o email no localStorage
- **Sessão expirada**: redirecionar para `/auth?next=/rota-atual` quando token expirar, em vez de mostrar erro genérico
- **2FA** para admins (futuro)

## Técnico

- **Debounce no submit**: proteger contra duplo clique que poderia criar sessões concorrentes
- **Teste de conectividade**: mostrar feedback se o Supabase estiver inacessível (ex: banner "Servidor temporariamente indisponível")
- **SSR**: rota está com `ssr: false` — intencional, mas vale documentar o motivo
