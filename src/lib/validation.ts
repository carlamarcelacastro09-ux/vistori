import { z } from "zod";

export function isValidCpf(cpf: string) {
  const clean = cpf.replace(/\D/g, "");
  if (clean.length !== 11 || /^\d{11}$/.test(clean) === false) return false;
  if (new Set(clean).size === 1) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(clean[i]) * (10 - i);
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(clean[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(clean[i]) * (11 - i);
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  return digit === parseInt(clean[10]);
}

export function isValidCnpj(cnpj: string) {
  const clean = cnpj.replace(/\D/g, "");
  if (clean.length !== 14 || /^\d{14}$/.test(clean) === false) return false;
  if (new Set(clean).size === 1) return false;
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(clean[i]) * weights1[i];
  let digit = sum % 11;
  digit = digit < 2 ? 0 : 11 - digit;
  if (digit !== parseInt(clean[12])) return false;
  sum = 0;
  for (let i = 0; i < 13; i++) sum += parseInt(clean[i]) * weights2[i];
  digit = sum % 11;
  digit = digit < 2 ? 0 : 11 - digit;
  return digit === parseInt(clean[13]);
}

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const createInspectionSchema = z.object({
  paidValue: z.number().positive().max(10000),
  noteValue: z.number().positive().max(10000).default(25),
  plate: z
    .string()
    .transform((v) => v.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .refine((v) => /^[A-Z]{3}\d{4}$/.test(v) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(v), "Placa inválida"),
  vehicleModel: z.string().min(2).transform((v) => v.trim().toUpperCase()),
  vehicleBrand: z.string().min(2).transform((v) => v.trim().toUpperCase()),
  customerDoc: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 11 || v.length === 14, "CPF/CNPJ inválido")
    .refine((v) => (v.length === 11 ? isValidCpf(v) : isValidCnpj(v)), "CPF/CNPJ com dígitos verificadores inválidos"),
  customerName: z.string().min(3).transform((v) => v.trim().toUpperCase()),
  cep: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 8, "CEP inválido"),
  street: z.string().min(3).transform((v) => v.trim().toUpperCase()),
  number: z.string().min(1).transform((v) => v.trim().toUpperCase()),
  district: z.string().min(2).transform((v) => v.trim().toUpperCase()),
  city: z.string().min(2).transform((v) => v.trim().toUpperCase()),
});

export const updateInspectionSchema = z.object({
  date: z.string().min(1).optional(),
  status: z.enum(["AGUARDANDO", "EMITIDA", "LANCADO", "ERRO"]).optional(),
  paidValue: z.number().positive().max(10000).optional(),
  noteValue: z.number().positive().max(10000).optional(),
  nfseNumber: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  plate: z.preprocess(
    (val) => (typeof val === "string" ? val.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : undefined),
    z.string().optional(),
  ),
  vehicleModel: z.preprocess(
    (val) => (typeof val === "string" ? val.trim().toUpperCase() : undefined),
    z.string().min(2).optional(),
  ),
  vehicleBrand: z.preprocess(
    (val) => (typeof val === "string" ? val.trim().toUpperCase() : undefined),
    z.string().min(2).optional(),
  ),
  customerDoc: z.preprocess(
    (val) => (typeof val === "string" ? val.replace(/\D/g, "") : undefined),
    z.string().optional(),
  ),
  customerName: z.preprocess(
    (val) => (typeof val === "string" ? val.trim().toUpperCase() : undefined),
    z.string().min(3).optional(),
  ),
  cep: z.preprocess(
    (val) => (typeof val === "string" ? val.replace(/\D/g, "") : undefined),
    z.string().optional(),
  ),
  street: z.preprocess(
    (val) => (typeof val === "string" ? val.trim().toUpperCase() : undefined),
    z.string().min(3).optional(),
  ),
  number: z.preprocess(
    (val) => (typeof val === "string" ? val.trim().toUpperCase() : undefined),
    z.string().min(1).optional(),
  ),
  district: z.preprocess(
    (val) => (typeof val === "string" ? val.trim().toUpperCase() : undefined),
    z.string().min(2).optional(),
  ),
  city: z.preprocess(
    (val) => (typeof val === "string" ? val.trim().toUpperCase() : undefined),
    z.string().min(2).optional(),
  ),
}).superRefine((data, ctx) => {
  if (data.plate !== undefined && !/^[A-Z]{3}\d{4}$/.test(data.plate) && !/^[A-Z]{3}\d[A-Z]\d{2}$/.test(data.plate)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Placa inválida", path: ["plate"] });
  }
  if (data.customerDoc !== undefined) {
    const d = data.customerDoc;
    if (d.length !== 11 && d.length !== 14) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "CPF/CNPJ inválido", path: ["customerDoc"] });
    } else if (d.length === 11 ? !isValidCpf(d) : !isValidCnpj(d)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "CPF/CNPJ com dígitos verificadores inválidos", path: ["customerDoc"] });
    }
  }
  if (data.cep !== undefined && data.cep.length !== 8) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "CEP deve ter 8 dígitos", path: ["cep"] });
  }
});
