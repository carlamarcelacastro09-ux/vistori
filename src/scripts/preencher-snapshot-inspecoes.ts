import "dotenv/config";
import { prisma } from "../lib/db";

async function main() {
  const inspections = await prisma.inspection.findMany({
    where: {
      customerDoc: null,
    },
    include: { customer: true, vehicle: true },
  });

  let updated = 0;
  for (const i of inspections) {
    await prisma.inspection.update({
      where: { id: i.id },
      data: {
        customerDoc: i.customer.doc,
        customerName: i.customer.name,
        customerCep: i.customer.cep,
        customerStreet: i.customer.street,
        customerNumber: i.customer.number,
        customerDistrict: i.customer.district,
        customerCity: i.customer.city,
        vehiclePlate: i.vehicle?.plate ?? "",
        vehicleBrand: i.vehicle?.brand ?? "",
        vehicleModel: i.vehicle?.model ?? "",
      },
    });
    updated++;
    if (updated % 50 === 0) console.log(`${updated}/${inspections.length}`);
  }

  console.log(`Total atualizado: ${updated}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
