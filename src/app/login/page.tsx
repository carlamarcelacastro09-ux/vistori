import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";
import { getUser } from "@/lib/auth";

function driveThumbUrl(id: string, width: number) {
  return `https://drive.google.com/thumbnail?id=${id}&sz=w${width}`;
}

export default async function LoginPage() {
  const user = await getUser();
  if (user) redirect("/");

  const imageIds = [
    "1Ww7O6pqx06_nwUWU_RATUZRb9eNQw5cb",
    "1BKBxvH4L9L77f75aWF8syHqDjbaGXzr5",
    "12NW6mUJsOL65eSOdVksWr8EhTw1_0gzS",
  ] as const;

  const hero = driveThumbUrl(imageIds[0], 2000);
  const tiles = [driveThumbUrl(imageIds[1], 1200), driveThumbUrl(imageIds[2], 1200)];

  return (
    <div className="container-fluid p-0 min-vh-100">
      <div className="row g-0 min-vh-100">
        <div
          className="col-lg-7 d-none d-lg-block"
          style={{
            backgroundImage:
              `linear-gradient(135deg, rgba(0,0,0,0.68), rgba(230,57,70,0.25)), url("${hero}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="h-100 d-flex flex-column justify-content-between p-5">
            <div>
              <div className="d-flex align-items-center gap-3">
                <img
                  src="https://drive.google.com/thumbnail?id=1CrumSftM4zRqGe0jHIs04GGpOsEIITzT&sz=w300"
                  alt="Logo Pissarro Vistorias"
                  style={{
                    width: 64,
                    height: 64,
                    objectFit: "contain",
                    background: "white",
                    borderRadius: 14,
                    padding: 8,
                  }}
                />
                <div>
                  <div className="fw-bold text-white" style={{ fontSize: 22, letterSpacing: 0.3 }}>
                    Pissarro Vistorias
                  </div>
                  <div className="text-white-50">Gestão de vistorias e emissão automatizada de NFS-e</div>
                </div>
              </div>
            </div>

            <div className="row g-3">
              {tiles.map((src) => (
                <div className="col-6" key={src}>
                  <div
                    className="rounded-4 overflow-hidden border border-white border-opacity-25"
                    style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(6px)" }}
                  >
                    <img src={src} alt="Carro" style={{ width: "100%", height: 160, objectFit: "cover" }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="text-white-50" style={{ fontSize: 12 }}>
              Acesso seguro • {new Date().getFullYear()}
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-5 position-relative overflow-hidden" style={{ background: "linear-gradient(180deg, #ffffff, #f4f6f9)" }}>
          <div
            className="position-absolute"
            style={{
              width: 460,
              height: 460,
              borderRadius: "50%",
              background: "radial-gradient(circle at 30% 30%, rgba(230,57,70,0.18), rgba(230,57,70,0))",
              top: -180,
              right: -220,
              filter: "blur(2px)",
            }}
          />
          <div
            className="position-absolute"
            style={{
              width: 520,
              height: 520,
              borderRadius: "50%",
              background: "radial-gradient(circle at 30% 30%, rgba(13,110,253,0.14), rgba(13,110,253,0))",
              bottom: -240,
              left: -260,
              filter: "blur(2px)",
            }}
          />

          <div className="d-lg-none" style={{ background: `linear-gradient(135deg, rgba(0,0,0,0.62), rgba(230,57,70,0.22)), url("${hero}")`, backgroundSize: "cover", backgroundPosition: "center" }}>
            <div className="px-4 py-4">
              <div className="d-flex align-items-center gap-3">
                <img
                  src="https://drive.google.com/thumbnail?id=1CrumSftM4zRqGe0jHIs04GGpOsEIITzT&sz=w300"
                  alt="Logo Pissarro Vistorias"
                  style={{
                    width: 52,
                    height: 52,
                    objectFit: "contain",
                    background: "white",
                    borderRadius: 14,
                    padding: 7,
                  }}
                />
                <div className="text-white">
                  <div className="fw-bold" style={{ fontSize: 18, letterSpacing: 0.2 }}>
                    Pissarro Vistorias
                  </div>
                  <div className="text-white-50" style={{ fontSize: 13 }}>
                    Entre para lançar e acompanhar vistorias
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="d-flex align-items-center justify-content-center p-4 p-md-5" style={{ minHeight: "calc(100vh - 108px)" }}>
            <div className="position-relative" style={{ width: "100%", maxWidth: 440 }}>
              <LoginForm />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
