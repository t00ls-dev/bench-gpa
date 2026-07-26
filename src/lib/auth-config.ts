/**
 * Constantes da sessão e da senha. Ficam juntas aqui porque erram juntas: o
 * cookie, a validade do token e o custo do hash descrevem uma decisão só — como
 * uma sessão nasce, quanto vale e o que custa autenticar.
 *
 * Segue o modelo de `retention.ts`: fonte única, com o porquê de cada valor no
 * próprio arquivo em vez de espalhado por quem consome.
 */

/**
 * Nome do cookie de sessão.
 *
 * Existia como `const SESSION_COOKIE` em auth-api.ts, mas o auth-middleware lia
 * `parsed["session"]` com a string solta — a mesma chave em dois arquivos de
 * auth, mantida em sincronia só por atenção de quem editasse. Renomear de um
 * lado deslogaria todo mundo sem erro de compilação.
 */
export const SESSION_COOKIE = "session";

/**
 * Validade da sessão, em segundos. Vale para o `expiresIn` do JWT e para o
 * `maxAge` do cookie — os dois têm de ser o mesmo número, senão o cookie
 * sobrevive ao token (usuário "logado" que toma 401 a cada ação) ou morre antes
 * dele (deslogado sem motivo aparente).
 *
 * `JWT_EXPIRY` no ambiente sobrepõe. O default de 7 dias vivia em três lugares:
 * aqui, no `ecosystem.config.cjs` (como a string mágica "604800") e no
 * `.env.example`. O do PM2 vencia em produção, o que tornava este default letra
 * morta lá e vivo em dev — divergência fácil de não perceber. O ecosystem
 * deixou de ter default próprio: se a variável não estiver no `.env`, o PM2 não
 * injeta nada e este valor passa a valer em todos os ambientes.
 */
export const JWT_EXPIRY_SECONDS = Number(process.env.JWT_EXPIRY) || 7 * 24 * 60 * 60;

/**
 * Custo do bcrypt. Estava repetido em `createUser`, `resetPassword` e no script
 * de criação do admin de teste.
 *
 * NÃO aumentar sem medir: a VPS tem um núcleo só, e o bcrypt é deliberadamente
 * caro em CPU. Cada incremento dobra o tempo de hash, e como login e criação de
 * usuário são síncronos no mesmo processo que serve as telas, o custo aparece
 * como lentidão geral, não como lentidão do login.
 */
export const BCRYPT_COST = 12;
