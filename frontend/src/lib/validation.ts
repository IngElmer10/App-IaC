import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Ingresa tu usuario o número de registro.").max(254),
  password: z.string().min(1, "Ingresa tu contraseña.").max(200),
});

export type LoginValues = z.infer<typeof loginSchema>;
