import json
import re
import csv


def normaliza_placa(placa: str) -> str:
    s = placa.strip().upper().replace("-", "")
    return s


def extrair_placa(desc: str) -> str:
    desc = desc.upper()
    # procura padrão com hífen ou sem: 3 letras + 4 alfanuméricos
    match = re.search(r"\b([A-Z]{3}[-\s]?[A-Z0-9]{4})\b", desc)
    if match:
        p = match.group(1).replace("-", "").replace(" ", "")
        return p
    match = re.search(r"\b([A-Z]{3}[0-9][A-Z][0-9]{2})\b", desc)
    if match:
        return match.group(1)
    return ""


def processar(json_path: str, db_path: str, out_csv: str, out_diverg: str):
    notas = json.load(open(json_path, encoding="utf-8"))

    # Normaliza nNFSe e placa
    for n in notas:
        chave = n.get("chave", "")
        if len(chave) >= 23:
            n["nfseNumber"] = str(int(chave[-23:-14]))
        desc = n.get("modelo", "")
        placa = extrair_placa(desc) if "PLACA" in desc.upper() or "-" in desc else n.get("placa", "")
        n["placa"] = normaliza_placa(placa)

    # Salva CSV normalizado
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["nfseNumber", "nDps", "data", "cpf", "nome", "placa", "modelo", "chave"])
        for n in notas:
            w.writerow([n["nfseNumber"], n["nDps"], n["data"], n["cpf"], n["nome"], n["placa"], n.get("modelo", ""), n["chave"]])

    banco = json.load(open(db_path, encoding="utf-8"))
    banco_by_nfse = {x["nfseNumber"]: x for x in banco}
    emissor_by_nfse = {n["nfseNumber"]: n for n in notas}

    divergencias = []
    for n in notas:
        b = banco_by_nfse.get(n["nfseNumber"])
        if not b:
            divergencias.append({
                "nfseNumber": n["nfseNumber"],
                "problema": "NOTA_NO_EMISSOR_NAO_ENCONTRADA_NO_BANCO",
                "emissor": f"{n['data']} | {n['cpf']} | {n['placa']} | {n['modelo']}",
                "banco": "-",
            })
            continue
        if b["placa"].upper().replace("-", "") != n["placa"]:
            divergencias.append({
                "nfseNumber": n["nfseNumber"],
                "problema": "PLACA_DIFERENTE",
                "emissor": f"{n['data']} | {n['cpf']} | {n['placa']}",
                "banco": f"{b['data']} | {b['cpf']} | {b['placa']} | {b['modelo']}",
            })

    for b in banco:
        if not emissor_by_nfse.get(b["nfseNumber"]):
            divergencias.append({
                "nfseNumber": b["nfseNumber"],
                "problema": "NOTA_NO_BANCO_NAO_ENCONTRADA_NO_EMISSOR",
                "emissor": "-",
                "banco": f"{b['data']} | {b['cpf']} | {b['placa']}",
            })

    with open(out_diverg, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["nfseNumber", "problema", "emissor", "banco"])
        w.writeheader()
        w.writerows(divergencias)

    print(f"Notas emissor: {len(notas)}")
    print(f"Notas banco: {len(banco)}")
    print(f"Divergências: {len(divergencias)}")
    print(f"CSV normalizado: {out_csv}")
    print(f"Relatório: {out_diverg}")


if __name__ == "__main__":
    processar("notas-emissor-todas.json", "inspecoes-banco.json", "notas-emissor-normalizadas.csv", "divergencias-notas.csv")
