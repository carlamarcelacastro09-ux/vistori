import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const createInspectionSchema = z.object({
  paidValue: z.number().positive().max(10000),
  plate: z
    .string()
    .transform((v) => v.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .refine((v) => /^[A-Z]{3}\d{4}$/.test(v) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(v), "Placa inválida"),
  vehicleModel: z.string().min(2).transform((v) => v.trim().toUpperCase()),
  vehicleBrand: z.string().min(2).transform((v) => v.trim().toUpperCase()),
  customerDoc: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 11 || v.length === 14, "CPF/CNPJ inválido"),
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
