import csv
import json
from collections import Counter

rows = list(csv.DictReader(open("divergencias-notas.csv", encoding="utf-8")))
notas = json.load(open("notas-emissor-todas.json", encoding="utf-8"))
banco = json.load(open("inspecoes-banco.json", encoding="utf-8"))
problemas = Counter(r["problema"] for r in rows)

placas = [r for r in rows if r["problema"] == "PLACA_DIFERENTE"]
nao_no_banco = [r for r in rows if r["problema"] == "NOTA_NO_EMISSOR_NAO_ENCONTRADA_NO_BANCO"]
nao_emissor = [r for r in rows if r["problema"] == "NOTA_NO_BANCO_NAO_ENCONTRADA_NO_EMISSOR"]

nao_banco_nfse = {r["nfseNumber"] for r in nao_no_banco}
por_mes = Counter(n["data"][3:10] for n in notas if n["nfseNumber"] in nao_banco_nfse)

with open("resumo-divergencias.txt", "w", encoding="utf-8") as f:
    f.write("RESUMO DE DIVERGENCIAS\n")
    f.write("======================\n\n")
    f.write(f"Total notas no emissor: {len(notas)}\n")
    f.write(f"Total notas no banco: {len(banco)}\n")
    f.write(f"Total divergencias: {len(rows)}\n\n")
    f.write("Tipos de problema:\n")
    for k, v in problemas.most_common():
        f.write(f"  {k}: {v}\n")
    f.write("\nPlacas diferentes (primeiras 30):\n")
    for r in placas[:30]:
        f.write(f"  nNFSe {r['nfseNumber']} | emissor: {r['emissor']}\n")
        f.write(f"            banco: {r['banco']}\n")
    f.write("\nNotas emissor não no banco por mês:\n")
    for m, v in sorted(por_mes.items()):
        f.write(f"  {m}: {v}\n")
    f.write(f"\nNotas banco não no emissor (primeiras 20):\n")
    for r in nao_emissor[:20]:
        f.write(f"  nNFSe {r['nfseNumber']} | banco: {r['banco']}\n")

print(open("resumo-divergencias.txt", encoding="utf-8").read())
