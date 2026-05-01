import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL não configurado.");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL || "admin@pissarro.local").toLowerCase();
  const password =
    process.env.SEED_ADMIN_PASSWORD || (process.env.NODE_ENV === "production" ? "" : "123456");
  if (!password) {
    throw new Error("SEED_ADMIN_PASSWORD não configurado.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return;

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      email,
      name: "Administrador",
      role: "ADMIN",
      passwordHash,
    },
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    await prisma.$disconnect();
    throw e;
  });
