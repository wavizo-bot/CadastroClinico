# Cadastro Clínico — Pacote MSIX (Microsoft Store)

Wrapper C# WinForms + WebView2 que empacota o app web do projeto para a Microsoft Store.

## Estrutura (dentro de `Cadastro Clinico/`)

- `msix/CadastroClinicoMSIX/` — projeto C# WinForms (.NET 8) com WebView2
- `msix/CadastroClinicoMSIX/Assets/` — ícones usados pelo pacote MSIX
- `msix/CadastroClinicoMSIX.sln` — solution do Visual Studio
- `msix/build.ps1` — build completo (web + MSIX)

O conteúdo web não é versionado aqui: o `.csproj` referencia `dist/public/` (gerado por `pnpm run build`) e o copia para `web/` no diretório de saída automaticamente.

## Pré-requisitos

- Windows 10/11
- .NET 8 SDK
- Windows SDK 10.x (`makeappx.exe` — já presente em `Windows Kits\10\bin`)
- Node.js + pnpm
- WebView2 Runtime (pré-instalado no Windows 10/11 atualizado)

**Não precisa** de Visual Studio: o empacotamento é feito por `makeappx` no próprio script.

## Build

Na raiz do projeto:

```powershell
.\msix\build.ps1
```

Pipeline do script:

1. `pnpm run build` — gera `dist/public/`
2. `dotnet publish` — app autocontido (self-contained) `win-x64`
3. Monta o layout em `msix/bin/msix-layout/` (exe + `web/` + `Assets/` + `AppxManifest.xml` com `$targetnametoken$` resolvido)
4. `makeappx pack` — gera **`msix/dist/wavizo.CadastroClnico_<versão>_x64.msix`**
5. Validação: descompacta e confere identidade, exe, `web/index.html` e ícones

O conteúdo web não é versionado aqui: o `.csproj` referencia `dist/public/` e leva os arquivos para `web/` no diretório de saída.

## Ícones

- `Assets/app-icon.ico` (16–256 px, ícone do exe) — gerar/regenerar com `powershell -File msix\tools\make-icon.ps1`
- Logos do manifesto (StoreLogo 50×50, Square44x44, Square150x150, Wide310x150, SplashScreen 620×300) — PNGs versionados em `Assets/`

## Identidade do Pacote

- **Nome:** wavizo.CadastroClnico
- **Publisher:** CN=57BB464E-553F-45B6-A4ED-B253157408EB
- **PublisherDisplayName:** wavizo
- **PFN:** wavizo.CadastroClnico_c5p81jb0en0bm
- **Package SID:** S-1-15-2-2847593193-4293426457-1784438407-1723172423-4006318822-2270365518-2666157207
- **Store ID:** 9P88RMK5TDSB

## Submissão na Microsoft Store

1. Gere o pacote MSIX com `.\msix\build.ps1`
2. Acesse o [Microsoft Partner Center](https://partner.microsoft.com/)
3. Selecione o app com ID `9P88RMK5TDSB`
4. Em "Packages", envie o `.msix` gerado em `msix/dist/`
5. Complete a listagem (guia: [`PARTNER_CENTER.md`](./PARTNER_CENTER.md)) e envie para certificação

**Assinatura:** o pacote pode ser enviado **sem assinatura** — a Store re-assina com certificado Microsoft após a certificação (docs Microsoft: *App package requirements for MSIX app*).

## Notas

- O pacote é **x64 autocontido** (não exige .NET instalado na máquina do usuário) — ~73 MB
- Teste local: `msix/bin/msix-layout/CadastroClinicoMSIX.exe` roda direto do layout
- Não há backend no pacote MSIX; os dados ficam locais (localStorage/IndexedDB)
- O app MSIX é estático: sem servidor Node.js
