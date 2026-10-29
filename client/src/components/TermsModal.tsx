// Modal bloqueante de aceite de termos — exibido na primeira execução e sempre
// que os termos forem atualizados (TERMS_VERSION). Aceite persistido em
// localStorage (equivale ao arquivo de config em web/MSIX/Capacitor).
import { useEffect, useState } from "react";
import { App } from "@capacitor/app";

// 1.1 (29/10/2026): textos sem placeholders, alinhados aos documentos públicos
// (política, termos e aviso legal), com o recurso opcional "Importar da URL".
export const TERMS_VERSION = "1.1";
const STORAGE_KEY = "cadclinico-terms-acceptance";

type TermsAcceptance = { version: string; acceptedAt: string };

export function isTermsAccepted(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw) as TermsAcceptance;
    return data?.version === TERMS_VERSION;
  } catch {
    return false;
  }
}

function saveTermsAcceptance(): void {
  const data: TermsAcceptance = { version: TERMS_VERSION, acceptedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

type TabContent = { label: string; sections: { title: string; paragraphs: string[] }[] };

const TABS: TabContent[] = [
  {
    label: "Privacidade",
    sections: [
      {
        title: "Quais dados são tratados",
        paragraphs: [
          "O Cadastro Clínico é um organizador offline de fichas. Os dados exibidos — nomes, contatos, endereços, documentos e informações de território — são inseridos ou importados por você, profissional responsável pelo uso.",
          "O aplicativo não cria conta, não pede login, não usa analytics, não exibe anúncios e não vende nem compartilha dados com terceiros.",
          "Você é responsável por ter base legal e autorização para tratar dados de pacientes, nos termos da LGPD (Lei 13.709/2018) e das normas aplicáveis ao seu serviço.",
        ],
      },
      {
        title: "Onde os dados ficam",
        paragraphs: [
          "As fichas ficam no armazenamento local do aparelho (IndexedDB do WebView), cifradas com AES-GCM e uma chave aleatória gerada no próprio dispositivo. No Windows, ficam no perfil do usuário.",
          "Não existe servidor, sincronização em nuvem ou backup automático. Se você exportar um arquivo manualmente, ele passa a ser de sua responsabilidade e deve ser guardado em local seguro.",
          "A senha opcional de 4 caracteres é uma barreira de discrição, não substitui a criptografia do aparelho nem o bloqueio de tela do sistema.",
        ],
      },
      {
        title: "Internet, câmera e permissões",
        paragraphs: [
          "A permissão de internet é usada somente pelo recurso opcional Importar da URL: o app faz uma requisição ao endereço que você colar para baixar o arquivo indicado. Nenhum cadastro é enviado; o servidor vê apenas a requisição, como em qualquer download.",
          "A câmera é usada somente quando você toca em Abrir câmera no Buscador óptico. A leitura do texto (OCR) acontece no próprio aparelho; a imagem não é enviada nem armazenada pelo app.",
          "O app não acessa microfone, contatos, localização, histórico de navegação, lista de apps, biometria ou sensores.",
        ],
      },
      {
        title: "Seus direitos (LGPD/GDPR)",
        paragraphs: [
          "Como os dados ficam no seu aparelho, você exerce acesso, correção, portabilidade e exclusão diretamente no app: edite ou apague fichas, use Reiniciar em Banco de dados ou limpe os dados do aplicativo nas configurações do sistema.",
          "Não mantemos dados pessoais em servidor, portanto não há base remota para consulta ou exclusão. Dúvidas sobre privacidade podem ser enviadas ao contato abaixo.",
        ],
      },
      {
        title: "Contato",
        paragraphs: [
          "E-mail: mmr05@hotmail.com",
          "Telefone / WhatsApp: (11) 97883-1938",
          "Responsável: Cadastro Clínico — projeto independente, não governamental.",
        ],
      },
    ],
  },
  {
    label: "Termos de Uso",
    sections: [
      {
        title: "Como o aplicativo funciona",
        paragraphs: [
          "O Cadastro Clínico apoia a rotina de organização de fichas, a busca de pacientes, a consulta de território por rua/equipe, o funcionamento da unidade e a auditoria de qualidade dos dados (Faxina).",
          "A importação substitui o banco local pelo conjunto selecionado. O app é um espelho de trabalho: mantenha sempre uma cópia segura da fonte oficial e dos arquivos que você importa.",
        ],
      },
      {
        title: "Licença e prazo",
        paragraphs: [
          "A versão atual é distribuída gratuitamente, sem prazo de demonstração e sem cobrança dentro do aplicativo. Não há assinatura, anúncio ou compra embutida.",
          "Se uma versão licenciada vier a ser oferecida, o prazo, o preço e as condições serão informados antes da contratação, sem bloquear retroativamente o uso já iniciado. O contato para licenciamento é o mesmo desta página.",
        ],
      },
      {
        title: "Uso permitido",
        paragraphs: [
          "Uso profissional ou pessoal legítimo, em conformidade com a lei, com o sigilo profissional e com as políticas da instituição onde o serviço é prestado.",
          "Backup dos seus próprios dados, ajuste de configurações, geração de relatórios internos e uso do Buscador óptico para localizar cadastros.",
        ],
      },
      {
        title: "Uso proibido",
        paragraphs: [
          "Usar o aplicativo para qualquer ilicitude, inserir dados de terceiros sem autorização ou base legal, ou tratar dados sensíveis sem as salvaguardas exigidas pela LGPD.",
          "Tentar contornar proteções ou licenciamento, revender, alugar, redistribuir o aplicativo ou realizar engenharia reversa, salvo nos limites expressamente permitidos pela lei.",
          "Usar o app como prontuário oficial, sistema institucional, dispositivo médico ou fonte única de verdade para decisões clínicas.",
        ],
      },
      {
        title: "Propriedade intelectual",
        paragraphs: [
          "O código-fonte, a marca, o layout, os textos e os demais elementos do aplicativo pertencem ao desenvolvedor. A licença de uso não transfere direitos de propriedade intelectual.",
          "Componentes de terceiros mantêm suas próprias licenças, incluindo React, Capacitor, Tesseract.js, unrar/WASM, zip.js e bibliotecas de interface. Os avisos dessas licenças prevalecem sobre este texto no que couber.",
        ],
      },
      {
        title: "Contato para licenciamento",
        paragraphs: [
          "E-mail: mmr05@hotmail.com",
          "Telefone / WhatsApp: (11) 97883-1938",
        ],
      },
    ],
  },
  {
    label: "Aviso Legal",
    sections: [
      {
        title: "Aplicativo independente",
        paragraphs: [
          "O Cadastro Clínico é uma ferramenta privada e independente. Não é, não representa e não possui vínculo com governo, prefeitura, estado, união, SUS, ministério, autarquia ou qualquer órgão público.",
          "Não utiliza brasões, selos oficiais ou identidade governamental. Logotipos exibidos no app são ilustrativos e podem ser substituídos por você.",
        ],
      },
      {
        title: "Não é prontuário nem dispositivo médico",
        paragraphs: [
          "O app não substitui prontuário oficial, sistemas institucionais, registros legais obrigatórios nem o julgamento de um profissional habilitado.",
          "O resultado de buscas, territorialização e Faxina é apoio à decisão e organização. Não é prescrição, diagnóstico, tratamento ou recomendação clínica.",
        ],
      },
      {
        title: "Limites por função não projetada",
        paragraphs: [
          "Não nos responsabilizamos por consequências de uso fora do escopo, como automação de decisões clínicas, emissão de documentos com validade legal, integração não prevista com outros sistemas ou uso como base única de dados.",
        ],
      },
      {
        title: "Limites por uso indevido",
        paragraphs: [
          "O desenvolvedor não se responsabiliza por danos causados por uso indevido, incluindo inserção de dados falsos ou incompletos, compartilhamento do dispositivo ou da senha, cópia indevida de dados exportados e conduta que viole direitos de terceiros ou a legislação.",
        ],
      },
      {
        title: "Dados de terceiros",
        paragraphs: [
          "Quem insere dados de pacientes responde pela origem, pela base legal, pela exatidão e pela guarda desses dados. Recomendamos bloqueio de tela, exportações cifradas e descarte seguro de arquivos antigos.",
        ],
      },
    ],
  },
];

export function TermsGate() {
  const [accepted, setAccepted] = useState(() => isTermsAccepted());
  const [exited, setExited] = useState(false);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    if (accepted) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [accepted]);

  const handleAgree = () => {
    saveTermsAcceptance();
    setAccepted(true);
  };

  const handleExit = async () => {
    try {
      await App.exitApp();
    } catch {
      // Capacitor indisponível (web/desktop) — segue para window.close()
    }
    window.close();
    // Se a janela não fechar (web sem window.open), tela totalmente escurecida.
    setTimeout(() => setExited(true), 250);
  };

  if (exited) return <div className="terms-exit-screen" aria-hidden="true" />;
  if (accepted) return null;

  const active = TABS[tab];

  return (
    <div className="terms-overlay" role="dialog" aria-modal="true" aria-labelledby="terms-title">
      <div className="terms-modal">
        <header className="terms-header">
          <h2 id="terms-title">Termos e Condições de Uso</h2>
          <span className="terms-version">v{TERMS_VERSION}</span>
        </header>

        <nav className="terms-tabs" role="tablist" aria-label="Seções dos termos">
          {TABS.map((t, i) => (
            <button
              key={t.label}
              type="button"
              role="tab"
              aria-selected={tab === i}
              className={`terms-tab${tab === i ? " active" : ""}`}
              onClick={() => setTab(i)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="terms-body">
          {active.sections.map((section) => (
            <section key={section.title}>
              <h3>{section.title}</h3>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>

        <footer className="terms-footer">
          <button type="button" className="terms-exit-btn" onClick={handleExit}>
            Quero sair
          </button>
          <button type="button" className="terms-agree-btn" onClick={handleAgree}>
            Eu concordo
          </button>
        </footer>
      </div>
    </div>
  );
}
