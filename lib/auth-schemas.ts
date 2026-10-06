/** Sign-in / register validation, shared by the form and the API routes. */
import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Имэйлээ оруулна уу.")
  .max(254)
  .email("Имэйл буруу байна.");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Нууц үгээ оруулна уу.").max(200),
});

export const registerSchema = z.object({
  fullName: z.string().trim().min(1, "Нэрээ оруулна уу.").max(100, "Нэр хэт урт байна."),
  email,
  password: z
    .string()
    .min(8, "Нууц үг дор хаяж 8 тэмдэгт байна.")
    .max(200, "Нууц үг хэт урт байна."),
});
