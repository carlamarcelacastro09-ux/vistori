import { prisma } from "@/lib/db";

const plates = [
  "DZV8B15", "FJW7E26", "NRU2A16", "CEP2I41", "CGC5A76", "TCL5J47", "FNF7489",
  "MMC3A74", "EYV0C99", "EIZ7105", "BKD0B14", "EVB3J47", "PUI6A05", "SYZ4G16",
  "BKD2D52", "GEL8B04", "DYC9G10", "BXC4E46", "EDZ3I74", "QPB7E51", "SIV2J47",
  "GIL3G14", "UAI6D63", "FMC9B77", "DUA4783", "CVW9J70", "BXN1554", "GHO2220",
  "DVG0A69", "FQZ6720", "CZI6574", "QXQ7D74", "SBZ5J45", "FQN7468", "FPR3D60",
  "ETB3H47", "QQA0H72", "CEC1I16", "DGK5G85", "GIN6H60", "BHK2335", "BPZ9B86",
  "FOH3F63", "HHW4A36", "EDA4180", "RVR0D17", "DBU4G00", "DYN6E82", "CMU4315",
  "OBB13", "BRY7J69", "ESE3G64", "ESX5278", "HJW0J23", "FSV2C90", "DSR0J08",
  "FXZ7D70", "TDH6J40", "EAK7B46", "DVX8J08", "EYQ0E16", "DCI5F94", "DWX0H42",
  "DUG8J82", "EMM8A04", "FJQ0B93", "CDO5153", "BGN7B65", "CFU5A10", "BYV3E71",
  "CTA8C42", "ERM0H53", "SUM7J85", "TKF2I30", "BRQ9E00", "FWF1F90", "DKX8B08",
  "ESV5C20", "CYU6D53", "BUE0E72", "BHI4J30", "FCI3B90", "EKJ5408", "CAY4A86",
  "DQT8556", "GNF", "FPM0G20", "CBG4B44", "FNO7E05", "EKF9B80", "EQQ8266",
  "TCW6C21", "KRB6330", "DKN3C87", "BPX9B86", "FSZ2H45", "DXG5I32", "BTG9565",
  "DQF8F56", "EIO7I72", "DQM5A49", "FJW5096", "DND4J04", "BSH9265", "SWG8F75",
  "DLE8383", "PZL5005", "BHF2D24", "GBU2C07", "DQX9G98", "CZG0A78", "FMP0E98",
  "CID6F60", "CBC0H96", "FDS6339", "EEG4H12", "DFZ7733", "DOY9D07", "EAS2F47",
  "DDD0979", "POV3G12", "BKS3G70", "BPR1A48", "FRI3I95", "CTE5J08", "UDP2B39",
  "RDN9F85", "JAQ3F09", "TCG2D47", "DQP4294", "HJS0962", "CCN0217", "EPS5E68",
  "GIX2D20", "GES7A17", "BGD4B46", "CQO5A42", "EGN6E00", "FKB0698", "FQA4610",
  "GSG40", "QPU1E42", "BRE2E20", "CKH6D43", "EPR0G93", "DHF4H33", "DCB6362",
  "BPS2G80", "FDE0G87", "FSS9907", "EOU6I32", "BZT1236", "IIZ3733", "EPS3402",
  "FWP1F34", "QQF1E75", "GEJ7F70", "EOB9B13", "DHF4296", "BSE3279", "EPX7D03",
  "DXN4874", "BWN6J49", "HND7F14", "DJC1899", "GEX1D20", "DTD4A21", "CHB6643",
  "DDY8D97", "ERF3J55", "CQO9J69", "KYV7768", "CKV5F70", "BTQ0H37", "BXZ7F10",
  "DBE4493", "HJC6248", "EOR3H52", "TKB5G59", "FSZ9A16", "TMH3B92", "EAF1185",
  "ETU9849", "EOF7E19", "FGN1938", "FAA5E90", "REZ9E39", "EMD1907", "FEB7I25",
  "NFI4334", "SWC8G49", "FZN2I91", "GDK8C37", "DFY3540", "CXK9F67", "FYV5J86",
  "DGC3J98", "GDO0F87", "FNZ5B26", "CEH7314", "DJG6G00", "DIF4G13", "GIF1C02",
  "GFR1I29", "HFU9H17", "BPW0H19", "DGW6E65", "EYZ5E87", "CFE0C04", "EEI1357",
  "DGC5I78", "EHY2F06", "NDJ8734", "FDF2I27", "DBU5A30", "NAB3488", "DAO8131",
  "DAO8132", "EAL1B89", "ENO9I49", "NDY8B95", "CFT4E98", "FQY2E01", "TJA1B48",
  "MQU4413", "DLV3A31", "DTH1C45",
];

async function main() {
  const rows = await prisma.inspection.findMany({
    where: {
      vehicle: {
        plate: { in: plates },
      },
    },
    include: {
      vehicle: true,
      customer: true,
      job: true,
    },
  });

  const byPlate = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    if (r.vehicle) {
      byPlate.set(r.vehicle.plate, r);
    }
  }

  const result = {
    emitida: [] as string[],
    lancado: [] as string[],
    erro: [] as string[],
    processando: [] as string[],
    fila: [] as string[],
    aguardando: [] as string[],
    naoEncontrado: [] as string[],
  };

  for (const plate of plates) {
    const row = byPlate.get(plate);
    if (!row) {
      result.naoEncontrado.push(plate);
      continue;
    }
    const status = row.status;
    const nf = row.nfseNumber || "";
    const job = row.job;
    const line = `${plate} | ${status} | NF: ${nf} | Job: ${job?.status || "sem job"}${row.errorMessage ? " | Erro: " + row.errorMessage.slice(0, 40) : ""}`;

    if (status === "EMITIDA" || status === "LANCADO") result.lancado.push(line);
    else if (status === "ERRO") result.erro.push(line);
    else if (job?.status === "PROCESSANDO") result.processando.push(line);
    else if (job?.status === "FILA") result.fila.push(line);
    else result.aguardando.push(line);
  }

  console.log(`\n=== RESUMO ===`);
  console.log(`Lançadas/emitidas: ${result.lancado.length}`);
  console.log(`Erro: ${result.erro.length}`);
  console.log(`Processando: ${result.processando.length}`);
  console.log(`Fila: ${result.fila.length}`);
  console.log(`Aguardando: ${result.aguardando.length}`);
  console.log(`Não encontradas no banco: ${result.naoEncontrado.length}`);

  if (result.lancado.length) console.log(`\n--- Lançadas/emitidas ---\n${result.lancado.join("\n")}`);
  if (result.erro.length) console.log(`\n--- Erro ---\n${result.erro.join("\n")}`);
  if (result.processando.length) console.log(`\n--- Processando ---\n${result.processando.join("\n")}`);
  if (result.fila.length) console.log(`\n--- Fila ---\n${result.fila.join("\n")}`);
  if (result.aguardando.length) console.log(`\n--- Aguardando ---\n${result.aguardando.join("\n")}`);
  if (result.naoEncontrado.length) console.log(`\n--- Não encontradas no banco ---\n${result.naoEncontrado.join("\n")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
