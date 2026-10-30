# Microsoft Partner Center — Preparação da Submissão
**App:** Cadastro Clínico · **Guia de trabalho** (manter atualizado junto com `log.txt`)

---

## 1. Identidade do pacote (já configurada em `CadastroClinicoMSIX/Package.appxmanifest`)

| Campo | Valor |
|---|---|
| Package/Identity/Name | `wavizo.CadastroClnico` |
| Package/Identity/Publisher | `CN=57BB464E-553F-45B6-A4ED-B253157408EB` |
| Package/Properties/PublisherDisplayName | `wavizo` |
| Package Family Name (PFN) | `wavizo.CadastroClnico_c5p81jb0en0bm` |
| Package SID | `S-1-15-2-2847593193-4293426457-1784438407-1723172423-4006318822-2270365518-2666157207` |
| Store ID | `9P88RMK5TDSB` |
| Versão | `1.0.16.0` — **política da Store: o 4º campo (revisão) SEMPRE 0** (erro: *"não é permitido ... número de revisão diferente de zero"*). Incrementar o **3º campo** a cada upload: `1.0.8.0` → `1.0.9.0` → `1.0.10.0` → `1.0.13.0` → `1.0.15.0` → `1.0.16.0` (30/10/2026, ícones unificados; alinhado ao Android 1.0.16 / versionCode 20) → próxima: `1.0.17.0`... (nunca reutilizar versões já enviadas, mesmo que reprovadas). O `package.json` está em **1.0.16** (segue o app web/Android) |
| Arquitetura | `ProcessorArchitecture="x64"` no Identity (era `Neutral` — colidia o nome completo entre uploads e não descrevia o conteúdo x64) |

**DisplayName:** o `Package/Properties/DisplayName` do manifesto deve bater **exatamente** com o nome reservado na Store: `Cadastro Clínico` (com acento). O `build.ps1` lê/escreve o manifesto em UTF-8 explícito sem BOM — se fosse lido como ANSI, o Partner Center rejeitaria com erro *"nome de exibição que você não reservou: Cadastro ClÃ­nico"* (mojibake, corrigido em 05/10/2026).

Repositórios:
- Windows (MSIX): https://github.com/wavizo-bot/CadastroClinicoMSIX.git
- Android/Web: https://github.com/wavizo-bot/CadastroClinico.git

## 2. Política de privacidade (obrigatória nesta submissão)

**Resposta em Properties → "Este produto acessa, coleta ou transmite informações pessoais?": SIM.**
(Motivo honesto: o app *armazena* dados pessoais digitados pelo usuário — nome, CPF/CNS, endereço — no IndexedDB local. Não *transmite* nada a servidores.) Com "Sim", o Partner Center **exige a URL da política de privacidade**.

- **Arquivo-fonte:** `client/public/politica-privacidade.html` (vira `dist/public/politica-privacidade.html` no build; citada Android + Windows)
- **URL PUBLICADA (usar no Partner Center):**
  `https://wavizo-bot.github.io/CadastroClinico/politica-privacidade.html`
  (GitHub Pages do repositório principal, servido a partir de `docs/`; a página também fica em `/app/` para uso offline)
- **Campo no Partner Center:** Properties → Privacy policy URL (`https://` acima)
- **Declaração para o campo de texto / notas (copiar e colar):**

> O Cadastro Clínico não coleta, não transmite e não compartilha dados pessoais com terceiros. Não há conta, login, servidor, analytics, anúncios ou SDKs de terceiros. Os dados digitados pelo usuário (fichas de clientes) ficam somente no armazenamento local do dispositivo (IndexedDB cifrado com AES-GCM e chave gerada no próprio dispositivo). O app funciona offline; a internet é usada apenas (a) para baixar um arquivo .rar/.zip/.csv que o próprio usuário indica no recurso opcional "Importar da URL" e (b) para abrir links externos opcionais (ex.: WhatsApp) por ação do usuário. Nenhuma ficha é enviada a servidores. O usuário pode apagar todos os dados a qualquer momento no app (Banco de Dados → Reiniciar) ou desinstalando. Contato de privacidade: mmr05@hotmail.com. Política completa: https://wavizo-bot.github.io/CadastroClinico/politica-privacidade.html.

**Manutenção da URL:** a página é publicada a partir de `docs/` no branch `main` do repositório principal (`wavizo-bot/CadastroClinico`). Atualizações: editar a fonte em `client/public/politica-privacidade.html`, copiar para `docs/` (e para as cópias do build) e fazer push; o Pages reconstrói em ~1 min. **Pages ativo em `main` / `docs` desde 29/10/2026** (build do commit `9d22ddd`; HTTPS forçado). URL verificada com HTTP 200 e conteúdo idêntico à fonte local. A URL publicada anteriormente em outro repositório não deve mais ser usada.

## 3. Checklist de submissão no Partner Center

Ordem das telas (docs Microsoft, app MSIX): **Pricing and availability → Properties → Age ratings → Packages → Store listings → Submission options → Submit for certification**.

### 3.1 Pricing and availability
- Preço: **Grátis** (sem compras internas, sem anúncios)
- Mercados: todos (padrão), data de disponibilidade: automática

### 3.2 Properties
- **Categoria:** `Productivity` (Produtividade) — mesma família usada na Play ("Produtividade / Ferramentas"). Não usar Saúde.
- Subcategoria/Secundária: opcional
- **"Este produto acessa, coleta ou transmite informações pessoais?": Sim** → colar **Privacy policy URL** (seção 2)
- Website: opcional; Contato/suporte: **mmr05@hotmail.com**
- Product declarations: "depende de drivers não-Microsoft" = **Não**; "testado para acessibilidade" = Não (se não testou); "suporta caneta" = Não
- **Notes for certification (copiar e colar):**
  > Aplicativo 100% offline que carrega interface de arquivos locais embutidos no pacote (WebView2). A capacidade `internetClient` é usada apenas (a) para baixar um arquivo .rar/.zip/.csv que o próprio usuário indica no recurso opcional "Importar da URL" e (b) para abrir links externos opcionais (WhatsApp) por ação do usuário. Nenhum cadastro é transmitido a servidores. Sem backend, sem anúncios, sem compras.
- System requirements: nenhuma exigência especial (WebView2 Runtime já é pré-instalado no Win 10/11 atualizado)
- Restricted capabilities: **nenhuma** declarada

### 3.3 Age ratings (IARC — todas as perguntas obrigatórias)
- **Reutilizar o rating da Google Play:** se o Play Console já gerou um ID IARC (Configurações → Classificação de conteúdo), escolha "fornecer meu rating ID" e evite refazer o questionário.
- Senão, responder o questionário: categoria **Productivity/Business**; sem violência, sem conteúdo sexual, sem drogas/armas, sem apostas, sem linguagem ofensiva, sem conteúdo gerado por usuários, sem navegador interto/compras, sem médico/instrutivo. Público-alvo: adultos (18+).

### 3.4 Packages
- Gerar o pacote nesta máquina: `.\msix\build.ps1` (**já funciona**: .NET 8 SDK + `makeappx` do Windows SDK — Visual Studio não é necessário)
- Upload do `.msix` gerado em **`msix\dist\wavizo.CadastroClnico_1.0.16.0_x64.msix`** (formato aceito pelo Partner Center junto com .msixbundle/.msixupload; o tamanho exato é informado ao final do `build.ps1`)
- **Não precisa assinar**: a Microsoft re-assina o pacote após a certificação (docs: *App package requirements for MSIX app*)
- **Upload:** se o submission já tem um `.msix` antigo, o Partner Center pode reclamar de nome completo duplicado. Nesse caso: apagar as entradas antigas em Packages **e** subir o arquivo novo (versão incrementada) — nunca dois pacotes com versão/arquitetura iguais e conteúdo diferente
- Arquitetura: **x64 autocontido** (não exige .NET na máquina do usuário); para cobrir ARM64 no futuro, gerar variante `-r win-arm64`
- "What's new in this version" (limite 1500 caracteres) — texto pronto para a **1.0.16.0** (30/10/2026):

  > Ícones unificados em todas as plataformas: o mesmo símbolo do Cadastro Clínico agora aparece no Android (ícone adaptativo/redondo), na Microsoft Store, no instalador Windows, na barra de título e na barra de tarefas. A janela do Windows usa o ícone do próprio executável, com barra de título moderna. O restante continua igual: interface adaptada às bordas e ao teclado, importação em lote (CSV, TSV, TXT, RAR e ZIP) e "Importar da URL", banco cifrado no dispositivo (AES-GCM), sem conta, nuvem, anúncios ou analytics. Termos de uso e política de privacidade revisados (v1.1). O código segue otimizado com R8 full mode.

### 3.5 Store listings (por idioma: pt-BR)
- **Nome (obrigatório):** Cadastro Clínico
- **Descrição (obrigatória, ≤10.000):** reaproveitar `PLAY_STORE_LISTING.txt` (seção "Descrição completa"), trocando "aparelho" por "aparelho/computador" e acrescentando "funciona também no Windows via Microsoft Store".
- **Recursos/Features (≤20 itens, ≤200 caracteres cada)** — sugestão pronta:
  1. 100% offline — sem conta, sem login, sem nuvem; dados só no seu dispositivo
  2. Fichas completas: nome, mãe, nascimento, endereço, CNS/CPF e telefones
  3. Atalho opcional para WhatsApp com um toque
  4. Território por ruas e equipes com faixas, pares/ímpares e listas
  5. Funcionamento da unidade com setores organizados
  6. Importação de CSV modelo de 3 arquivos cruzados (CNS/CPF/nome+nascimento)
  7. Exportação em JSON único para você compartilhar do seu jeito
  8. Criptografia local AES-GCM com chave gerada no dispositivo
  9. Senha opcional de 4 caracteres escolhida por você
  10. Leitura óptica local (Tesseract embutido) — imagem nunca sai do dispositivo
- **Screenshots (obrigatório ≥1, recomendado 4+):** PNG, **mínimo 1366×768**, máx 3840×2160, ≤50 MB, paisagem ou retrato, até 10 desktop. Capturas reais com dados fictícios em `docs/img/` (1366×768) e versões PNG em `msix/listing/screenshots/` — subir home, pacientes, ficha, território, equipe e banco.
- **1:1 App tile icon (300×300 PNG):** pronto em `msix/listing/store-tile-300x300.png`
- Store logos extras: opcionais (recomendados para boa exibição)

### 3.6 Submission options
- Notas de certificação: opcional (o texto da seção 3.2 já cobre)
- Publicação: automática após certificação (ou agendar)

## 4. Pendências antes de submeter

| # | Pendência | Status |
|---|---|---|
| 1 | ~~Instalar .NET 8 SDK e rodar `.\msix\build.ps1`~~ | **CONCLUÍDO** — pacote gerado e validado: `msix/dist/wavizo.CadastroClnico_1.0.15.0_x64.msix` (74,1 MB, 29/10/2026); smoke test do app OK |
| 2 | Capturar screenshots desktop (1366×768+, até 10) do app compilado | **CONCLUÍDO (capturas reais)** — `docs/img/` (WebP) e `msix/listing/screenshots/` (PNG 1366×768) com dados fictícios; subir as 6 principais no Partner Center |
| 3 | ~~Publicar `politica-privacidade.html` em URL HTTPS~~ | **CONCLUÍDO (29/10/2026)** — Pages ativo em `main` / `docs` (build `9d22ddd`, HTTPS forçado); URL testada com HTTP 200: https://wavizo-bot.github.io/CadastroClinico/politica-privacidade.html |
| 4 | Confirmar/obter o rating IARC (reaproveitar ID da Play) | Pendente (conta Partner Center) |
| 5 | Incrementar versão no manifesto a cada nova submissão | Rotina |
| 6 | ~~Atualizar repo Windows com conteúdo unificado~~ | **CONCLUÍDO** — push `c7d679e` em 05/10/2026 (web/ removida, msix/ + política no ar) |

## 5. Arquivos de apoio

- `msix/listing/store-tile-300x300.png` — tile 300×300 gerado do logo
- `msix/CadastroClinicoMSIX/Assets/*.png` — todos os logos do manifesto (gerados em 05/10/2026: StoreLogo 50×50, Square44x44, Square150x150, Wide310x150, SplashScreen 620×300 — StoreLogo era JPEG renomeado, corrigido)
- `PLAY_STORE_LISTING.txt` — textos da listagem (fonte para seção 3.5)
- `PLAY_DATA_SAFETY.txt` — respostas equivalentes da Play (base para seções 2 e 3.3)
- `client/public/politica-privacidade.html` — política de privacidade (fonte única)
- **Log de diagnóstico do app (Windows):** `%LOCALAPPDATA%\CadastroClinico\msix-webview.log` — registra se o WebView2 renderizou (`nav OK {root:N, text:N}`); útil se a Store reprovar de novo

## 6. Histórico de certificação

| # | Data | Retorno | Causa | Correção |
|---|---|---|---|---|
| 1 | 06/10/2026 | *"does not display any content after launch"* (Surface Laptop 4, build 26200.9457) | App navegava por `file://`; `/assets/...` (caminho absoluto) virava `file:///assets` e módulos ES eram bloqueados por CORS em origem opaca → página em branco desde sempre | `MainForm.cs` agora usa `SetVirtualHostNameToFolderMapping("cadclinico.app", web)` + `https://cadclinico.app/index.html`; verificado com teste de instalação real do `.msix` (renderização `root:2, text:214`) |
| 2 | 06/10/2026 | *"dois pacotes com o nome completo wavizo.CadastroClnico_1.0.7.0_Neutral_ ... conteúdos diferentes"* | Pacote antigo (mojibake) ainda no submission + novo upload com mesma versão e arquitetura `Neutral` | `ProcessorArchitecture="x64"` + bump de versão; apagar entradas antigas em Packages antes de subir o novo |
| 3 | 06/10/2026 | *"não é permitido ... número de revisão diferente de zero ... especifica 1.0.7.1"* | Versão incrementada no 4º campo (revisão) — proibido pela Store | 4º campo = `0` sempre; incrementar o 3º campo: `1.0.8.0` |

**Pacote atual:** `msix/dist/wavizo.CadastroClnico_1.0.16.0_x64.msix` (build 30/10/2026 — ícones unificados, barra de título com o ícone do app; sem assinatura, a Store re-assina) — remover entradas antigas em *Packages* e enviar este.
