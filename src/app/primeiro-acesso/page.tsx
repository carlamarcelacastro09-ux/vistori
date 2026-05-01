import { redirect } from "next/navigation";

/** Mantido só para links antigos — o cadastro agora está na própria tela /login */
export default function PrimeiroAcessoRedirectPage() {
  redirect("/login");
}
