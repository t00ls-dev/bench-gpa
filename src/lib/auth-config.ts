/**
 * Constantes da sessão e da senha. Ficam juntas aqui porque erram juntas: o
 * cookie, a validade do token e o custo do hash descrevem uma decisão só: como
 * uma sessão nasce, quanto vale e o que custa autenticar.
 *
 * Segue o modelo de `retention.ts`: fonte única, com o porquê de cada valor no
 * próprio arquivo em vez de espalhado por quem consome.
 */

/**
 * Nome do cookie de sessão.
 *
 * Existia como `const SESSION_COOKIE` em auth-api.ts, mas o auth-middleware lia
 * `parsed["session"]` com a string solta: a mesma chave em dois arquivos de
 * auth, mantida em sincronia só por atenção de quem editasse. Renomear de um
 * lado deslogaria todo mundo sem erro de compilação.
 */
export const SESSION_COOKIE = "session";

/**
 * Sessão "normal" (checkbox "Manter conectado" desmarcado no login): desliza a
 * cada request autenticado: cada chamada que passa por `requireAuth` reemite
 * o cookie com um novo prazo de INACTIVITY_TIMEOUT_SECONDS a partir de agora.
 * Fica ociosa esse tempo sem gerar nenhum request e expira.
 */
export const INACTIVITY_TIMEOUT_SECONDS = 60 * 60; // 1h

/**
 * Teto absoluto da sessão "normal", contado a partir do login original
 * (`loginAt` no payload do JWT, não reemitido no slide): existe pra cobrir o
 * caso de um dispositivo em uso contínuo (ex.: terminal fixo numa loja) que
 * nunca ficaria ocioso tempo suficiente pra bater o INACTIVITY_TIMEOUT_SECONDS
 * sozinho. Sem este teto, o slide renovaria pra sempre.
 */
export const SESSION_ABSOLUTE_CAP_SECONDS = 24 * 60 * 60; // 24h

/**
 * Sessão "Manter conectado" (checkbox marcado no login): expiração fixa, sem
 * slide e sem o teto acima: os dois se contradiriam. Mesmo valor que já era o
 * padrão único do sistema antes desta mudança: quem marcar o checkbox não fica
 * pior do que estava, quem não marcar passa a ter uma janela de exposição bem
 * menor (1h ocioso / 24h de uso contínuo, em vez de 7 dias fixos sempre).
 */
export const REMEMBER_ME_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 dias

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
