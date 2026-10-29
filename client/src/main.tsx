import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

/* O Cadastro Clínico não usa service worker. Outra aplicação que rodou nesta
   mesma porta deixou um registro nesta origem e ele passou a interceptar as
   requisições daqui (erro "Response body is already used" no console, vindo do
   service-worker.js antigo). Remove qualquer registro na abertura. */
function removerServiceWorkersAntigos() {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
  void navigator.serviceWorker.getRegistrations()
    .then((registros) => { registros.forEach((registro) => void registro.unregister()); })
    .catch(() => { /* sem permissão ou sem worker: nada a remover */ });
}
removerServiceWorkersAntigos();

createRoot(document.getElementById("root")!).render(<App />);
