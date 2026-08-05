/**
 * Session and password constants. Kept together here because they fail
 * together: the cookie, the token's validity, and the hash cost describe a
 * single decision: how a session is born, how long it's worth, and what
 * authenticating costs.
 *
 * Follows the `retention.ts` pattern: single source, with the why of each
 * value in the file itself instead of scattered across consumers.
 */

/**
 * Session cookie name.
 *
 * Used to exist as `const SESSION_COOKIE` in auth-api.ts, but auth-middleware
 * read `parsed["session"]` with the loose string: the same key in two auth
 * files, kept in sync only by whoever was editing paying attention. Renaming
 * one side would log everyone out with no compile error.
 */
export const SESSION_COOKIE = "session";

/**
 * "Normal" session ("Keep me signed in" checkbox unchecked at login): slides
 * on every authenticated request: every call that goes through `requireAuth`
 * re-issues the cookie with a new deadline of INACTIVITY_TIMEOUT_SECONDS from
 * now. Stays idle that long with no request and expires.
 */
export const INACTIVITY_TIMEOUT_SECONDS = 60 * 60; // 1h

/**
 * Absolute cap on the "normal" session, counted from the original login
 * (`loginAt` in the JWT payload, not re-issued on slide): exists to cover a
 * device in continuous use (e.g. a fixed terminal at a store) that would
 * never sit idle long enough to hit INACTIVITY_TIMEOUT_SECONDS on its own.
 * Without this cap, sliding would renew forever.
 */
export const SESSION_ABSOLUTE_CAP_SECONDS = 24 * 60 * 60; // 24h

/**
 * "Keep me signed in" session (checkbox checked at login): fixed expiry, no
 * sliding and no cap above: the two would contradict each other. Same value
 * that was already the system's single default before this change: whoever
 * checks the box is no worse off than before, whoever doesn't gets a much
 * smaller exposure window (1h idle / 24h continuous use, instead of always
 * a fixed 7 days).
 */
export const REMEMBER_ME_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * bcrypt cost. Used to be repeated in `createUser`, `resetPassword`, and the
 * test-admin creation script.
 *
 * Do NOT increase without measuring: the VPS has a single core, and bcrypt
 * is deliberately CPU-expensive. Each increment doubles the hash time, and
 * since login and user creation are synchronous in the same process that
 * serves the screens, the cost shows up as general slowness, not just
 * login slowness.
 */
export const BCRYPT_COST = 12;
