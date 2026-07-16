import AppShell from "@/components/AppShell";
import { requireUser } from "@/lib/auth";
import NewInspectionForm from "./NewInspectionForm";

export default async function NovaVistoriaPage() {
  const user = await requireUser();

  return (
    <AppShell user={user}>
      <NewInspectionForm />
    </AppShell>
  );
}
