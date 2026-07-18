import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { EmailSchema, PasswordSchema } from "./schemas";
import { verifyTurnstile } from "./turnstile";
import { authLimiter, getClientIp } from "./rate-limit";

export const login = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        email: EmailSchema,
        password: PasswordSchema,
        turnstileToken: z.string().min(1, "Verificação de segurança obrigatória"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const ip = getClientIp(request);

    const rl = authLimiter.check(ip);
    if (!rl.allowed) {
      throw new Error("Muitas tentativas de login. Aguarde um minuto.");
    }

    const turnstileOk = await verifyTurnstile(data.turnstileToken, ip);
    if (!turnstileOk) {
      throw new Error("Falha na verificação de segurança. Recarregue e tente novamente.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: auth, error } = await supabaseAdmin.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error || !auth.session) {
      throw new Error("E-mail ou senha inválidos.");
    }

    const { data: user } = await supabaseAdmin
      .from("users")
      .select("is_active")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (!user?.is_active) {
      await supabaseAdmin.auth.admin.signOut(auth.user.id);
      throw new Error("Usuário inativo. Procure o administrador.");
    }

    return {
      accessToken: auth.session.access_token,
      refreshToken: auth.session.refresh_token,
    };
  });
