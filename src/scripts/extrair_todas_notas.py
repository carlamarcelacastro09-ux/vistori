import os
import re
import json
import time
import requests
from bs4 import BeautifulSoup
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.serialization import pkcs12

PFX_PATH = os.environ.get("CERT_PFX_PATH", r"C:\Users\macar\OneDrive\Desktop\PISSARO VISTORIA AUTOMOTIVA LTDA 1010944009.pfx")
PASSWORD = os.environ.get("CERT_PASSWORD", "1234").encode()

OUTPUT_JSON = "notas-emissor-todas.json"
OUTPUT_CSV = "notas-emissor-todas.csv"
KEY_PATH = "nfse-conferencia/key.pem"
CERT_PATH = "nfse-conferencia/cert.pem"


def load_cert():
    with open(PFX_PATH, "rb") as f:
        pfx_data = f.read()
    private_key, certificate, _ = pkcs12.load_key_and_certificates(pfx_data, PASSWORD)

    os.makedirs(os.path.dirname(KEY_PATH), exist_ok=True)
    with open(KEY_PATH, "wb") as f:
        f.write(private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption()
        ))

    with open(CERT_PATH, "wb") as f:
        f.write(certificate.public_bytes(serialization.Encoding.PEM))

    return (CERT_PATH, KEY_PATH)


def extract_field(soup: BeautifulSoup, label_text: str) -> str:
    for div in soup.find_all("div", class_="form-group"):
        label = div.find("label", class_="control-label")
        if label and label_text.lower() in label.get_text(strip=True).lower():
            span = div.find("span", class_="form-control-static")
            if span:
                return span.get_text(strip=True)
    return ""


def extract_dps(detail_html: str) -> str:
    soup = BeautifulSoup(detail_html, "html.parser")
    return extract_field(soup, "número")


def extract_plate(detail_html: str) -> str:
    soup = BeautifulSoup(detail_html, "html.parser")
    desc = extract_field(soup, "descrição do serviço")
    match = re.search(r" - ([A-Z0-9]{7})$", desc)
    return match.group(1) if match else ""


def extract_model(detail_html: str) -> str:
    soup = BeautifulSoup(detail_html, "html.parser")
    desc = extract_field(soup, "descrição do serviço")
    # formato: VISTORIA AUTOMOTIVA - MODELO - PLACA
    parts = [p.strip() for p in desc.split(" - ")]
    return parts[1] if len(parts) >= 3 else ""


def extract_nps_from_href(href: str) -> str:
    chave = href.split("/")[-1]
    match = re.search(r"0{6}(\d{3})\d{14}$", chave)
    return str(int(match.group(1))) if match else ""


def extract_page(session: requests.Session, datainicio: str, datafim: str, page_num: int):
    url = "https://www.nfse.gov.br/EmissorNacional/Notas/Emitidas"
    params = {"pg": page_num, "datainicio": datainicio, "datafim": datafim, "page": 1}
    r = session.get(url, params=params, timeout=60)

    soup = BeautifulSoup(r.text, "html.parser")
    tabela = soup.find("table", {"class": "table"})
    if not tabela:
        return []

    tbody = tabela.find("tbody")
    if not tbody:
        return []

    trs = tbody.find_all("tr")
    if not trs:
        return []

    notas = []
    for tr in trs:
        link = tr.find("a", href=re.compile(r"/EmissorNacional/Notas/Visualizar/Index/"))
        if not link:
            continue

        href = link.get("href", "")
        nfse_number = extract_nps_from_href(href)
        tds = tr.find_all("td")
        data = tds[0].get_text(strip=True) if tds else ""
        tomador = tds[1].get_text(strip=True) if len(tds) > 1 else ""
        cpf = re.search(r"\d{11}", tomador)
        cpf = cpf.group(0) if cpf else ""
        nome = re.sub(r"\s+", " ", re.sub(r"\d{11}", "", tomador)).strip()

        detail_url = f"https://www.nfse.gov.br{href}"
        rd = session.get(detail_url, timeout=60)
        detail = rd.text if rd.status_code == 200 else ""
        n_dps = extract_dps(detail)
        placa = extract_plate(detail)
        modelo = extract_model(detail)

        notas.append({
            "nfseNumber": nfse_number,
            "nDps": n_dps,
            "data": data,
            "cpf": cpf,
            "nome": nome,
            "modelo": modelo,
            "placa": placa,
            "chave": href.split("/")[-1],
        })

        print(f"    [{datainicio}-{datafim} pg{page_num}] nNFSe {nfse_number} | nDPS {n_dps} | {placa} | {data} | {cpf}")
        time.sleep(0.3)

    return notas


def extract_range(session: requests.Session, datainicio: str, datafim: str):
    notas = []
    page_num = 1
    for _ in range(100):  # safety
        page = extract_page(session, datainicio, datafim, page_num)
        if not page:
            break
        notas.extend(page)
        page_num += 1
    return notas


def save(notas):
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(notas, f, indent=2, ensure_ascii=False)

    with open(OUTPUT_CSV, "w", encoding="utf-8") as f:
        f.write("nfseNumber,nDps,data,cpf,nome,modelo,placa,chave\n")
        for n in notas:
            f.write(f"{n['nfseNumber']},{n['nDps']},{n['data']},{n['cpf']},\"{n['nome']}\",\"{n['modelo']}\",\"{n['placa']}\",{n['chave']}\n")


def main():
    cert = load_cert()
    session = requests.Session()
    session.cert = cert

    print("Autenticando...")
    r = session.get("https://certificado.nfse.gov.br/EmissorNacional/Certificado", timeout=60)
    print("Login:", r.status_code, r.url)

    # Janelas de 30 dias, de 01/03/2026 até 10/09/2026
    janelas = [
        ("01/03/2026", "30/03/2026"),
        ("01/04/2026", "30/04/2026"),
        ("01/05/2026", "31/05/2026"),
        ("01/06/2026", "30/06/2026"),
        ("01/07/2026", "31/07/2026"),
        ("01/08/2026", "30/08/2026"),
        ("01/09/2026", "10/09/2026"),
    ]

    todas = []
    if os.path.exists(OUTPUT_JSON):
        todas = json.load(open(OUTPUT_JSON, encoding="utf-8"))
        print(f"Retomando com {len(todas)} notas salvas")

    for ini, fim in janelas:
        print(f"\nJanela {ini} - {fim}")
        notas = extract_range(session, ini, fim)
        if not notas:
            continue
        for n in notas:
            if not any(x["nfseNumber"] == n["nfseNumber"] and x["chave"] == n["chave"] for x in todas):
                todas.append(n)
        save(todas)
        print(f"  {len(notas)} novas; total {len(todas)}")

    print(f"\nTotal notas extraídas: {len(todas)}")
    print(f"JSON: {OUTPUT_JSON}")
    print(f"CSV: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
