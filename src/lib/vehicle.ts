import { prisma } from "@/lib/db";

export async function upsertVehicleByPlate(input: { plate: string; brand: string; model: string }) {
  const existing = await prisma.vehicle.findFirst({
    where: { plate: input.plate },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return prisma.vehicle.update({
      where: { id: existing.id },
      data: { brand: input.brand, model: input.model },
    });
  }

  return prisma.vehicle.create({ data: input });
}
