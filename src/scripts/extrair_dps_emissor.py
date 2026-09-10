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

OUTPUT_JSON = "notas-emissor-nacional.json"
OUTPUT_CSV = "notas-emissor-nacional.csv"
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


def extract_dps(detail_html: str) -> str:
    soup = BeautifulSoup(detail_html, "html.parser")

    # Encontra a seção "Identificação do DPS" e pega o primeiro
    # <div class="form-group"> com label "Número"
    dps_section = soup.find(lambda tag: tag.name and tag.get_text(strip=True).lower() == "identificação do dps")
    if dps_section:
        for div in dps_section.find_all_next("div", class_="form-group"):
            label = div.find("label", class_="control-label")
            if label and label.get_text(strip=True).lower() == "número":
                value_span = div.find("span", class_="form-control-static")
                if value_span:
                    return value_span.get_text(strip=True)

    # fallback geral: procura o primeiro div com label "Número" + span com número
    for div in soup.find_all("div", class_="form-group"):
        label = div.find("label", class_="control-label")
        if label and label.get_text(strip=True).lower() == "número":
            value_span = div.find("span", class_="form-control-static")
            if value_span:
                return value_span.get_text(strip=True)
    return ""


def extract_nps_from_href(href: str) -> str:
    # href termina com chave de acesso; nNFSe fica no final da chave
    chave = href.split("/")[-1]
    match = re.search(r"0{6}(\d{3})\d{14}$", chave)
    return str(int(match.group(1))) if match else ""


def main():
    cert = load_cert()
    session = requests.Session()
    session.cert = cert

    print("Autenticando...")
    r = session.get("https://certificado.nfse.gov.br/EmissorNacional/Certificado", timeout=60)
    print("Login:", r.status_code, r.url)

    if "Dashboard" not in r.url and "Login" in r.url:
        raise Exception("Não conseguiu autenticar. Verifique o certificado.")

    notas = []
    page_num = 1
    while True:
        url = f"https://www.nfse.gov.br/EmissorNacional/Notas/Emitidas?pg={page_num}&datainicio=01/01/2026&datafim=10/09/2026&page=1"
        print(f"\nPágina {page_num}: {url}")
        r = session.get(url, timeout=60)
        if r.status_code != 200:
            print("  status:", r.status_code)
            break

        soup = BeautifulSoup(r.text, "html.parser")
        tabela = soup.find("table", {"class": "table"})
        if not tabela:
            print("  tabela não encontrada")
            break

        linhas = tabela.find("tbody")
        if not linhas:
            print("  tbody não encontrado")
            break

        trs = linhas.find_all("tr")
        print(f"  {len(trs)} linhas")
        if not trs:
            break

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

            # acessa detalhe
            detail_url = f"https://www.nfse.gov.br{href}"
            print(f"  Nota {nfse_number}: {detail_url}")
            rd = session.get(detail_url, timeout=60)
            n_dps = extract_dps(rd.text) if rd.status_code == 200 else ""

            notas.append({
                "nfseNumber": nfse_number,
                "nDps": n_dps,
                "data": data,
                "cpf": cpf,
                "nome": nome,
                "chave": href.split("/")[-1],
            })

            print(f"    nNFSe {nfse_number} | nDPS {n_dps} | {data} | {cpf}")
            time.sleep(0.5)

        # Avança para a próxima página pelo parâmetro ?page=
        page_num += 1

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(notas, f, indent=2, ensure_ascii=False)

    with open(OUTPUT_CSV, "w", encoding="utf-8") as f:
        f.write("nfseNumber,nDps,data,cpf,nome,chave\n")
        for n in notas:
            f.write(f"{n['nfseNumber']},{n['nDps']},{n['data']},{n['cpf']},\"{n['nome']}\",{n['chave']}\n")

    print(f"\nTotal notas extraídas: {len(notas)}")
    print(f"JSON: {OUTPUT_JSON}")
    print(f"CSV: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
