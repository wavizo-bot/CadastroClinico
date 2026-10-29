# Padrões replicáveis — Cadastro Clínico → outros projetos (ex.: Acompanha Digital)

> Levantamento de15/10/2026. Tudo abaixo foi implementado e testado no
> Cadastro Clínico e pode ser copiado para outro projeto que use o banco como
> espelho. Aponta também o que MUDA quando o outro projeto tem interações
> locais do usuário (Acompanha Digital).

---

## 1. Conceito central: o banco é um espelho descartável

- Os dados reais são produzidos **em outro sistema**. Este programa só lê,
  organiza e mostra. Nada aqui é original; **perder o banco não é problema** —
  reimporta-se da fonte.
- Por isso a importação é **substituição total**: a seleção atual vira o banco
  inteiro. Nada do banco anterior entra na conta (nada de mesclar antigo com
  novo, nada de tela de confirmação de "novos/alterados").
- Exceção: o que **não é espelho** sobrevive — configurações locais (marca,
  textos de operação da unidade, semente de território).
- Falha de leitura/descriptografia = **zera em silêncio e segue** (sem cerimônia
  de recuperação). Códigos: `dataStore.ts` (`loadPersistedData`), mensagem de
  erro só quando algo evitável falhou.

### Como adaptar no Acompanha Digital

Lá o usuário **faz interações** (registros de visita, anotações, marcações)
por cima do espelho. Regra sugerida:

- **Substituição por entidade**: quando um arquivo novo cobre a entidade X
  inteira (ex.: todas as visitas do mês), ele substitui a X por completo —
  nunca soma com o que havia (mesma lógica do Cadastro Clínico, por entidade
  em vez de banco-geral).
- **Interações locais sobrevivem só se não forem espelho** (forem produzidas
  por este programa/usuário) — e ficam **ancoradas** por `id` ou `data` do
  espelho. Se o espelho novo não contém mais a âncora, **descarta a interação
  órfã** (mesma filosofia: não reter resto de dado morto).
- Isso preserva "zero mescla" do lado do espelho e não perde o trabalho do
  usuário enquanto o espelho ainda cobre aquilo.

---

## 2. Fluxo único de importação (zero cliques após escolher os arquivos)

Fluxo antigo (removido): IMPORTAR → escolher → lista "Arquivos do BI" →
UNIR E IMPORTAR → tela de resumo → CONFIRMAR ATUALIZAÇÃO.

Fluxo novo: **IMPORTAR → escolher → tudo acontece sozinho.**

Regras implementadas (`client/src/pages/Home.tsx`):

1. `handleBiFiles` — lê tudo da seleção (CSVs soltos e o interior de RAR/ZIP)
   com progresso por arquivo; se **todo mundo foi reconhecido** → chama
   `importBiReports` direto. A lista na tela **não aparece** no caminho feliz.
2. Se **algo não foi reconhecido** → lista `Arquivos selecionados` mostrando
   ✔ nos reconhecidos e um seletor de tipo só nos "?" (com instrução escrita
   na própria caixa). Ao escolher o **último** tipo pendente,
   `assignBiType` dispara a importação sozinho — nenhum botão extra.
3. `importBiReports(lista)` — monta o banco novo e `setData(incoming)`:
   pacientes e território vêm **só** da seleção; `unitOperation`, `branding` e
   `territorySeedRevision` são copiados do banco atual (não são espelho).
   Ao final mostra `importMensagem`: *"Importação concluída — banco
   substituído: X paciente(s) e Y rua(s)."*
4. Segurança operacional: `importandoRef` impede dois lotes simultâneos e o
   `<input type=file>` fica `disabled` durante o processo
   (`.import-button:has(input:disabled)` dá o visual).

---

## 3. Progresso sempre visível + processo sobrevive à navegação

Objetivo: usuário de aparelho fraco **nunca** fica sem retorno, e pode sair
da tela que o processo continua.

- **Um estado só**: `importProgresso` (fase + detalhe) + `salvando` (gravação
  automática do IndexedDB). `indicadorProcesso = importProgresso ?? (salvando ? "Gravando…" : null)`.
- **Dois pontos de exibição**:
  - caixa `role="status"` com spinner na própria tela (`.status-box` +
    `.faxina-spin`);
  - **chip no cabeçalho** (`.processando-chip`), que aparece em **qualquer
    tela** porque o `<Header>` é renderizado em todas — testado: usuário foi
    para a home no meio da leitura e o chip mostrava "Lendo 5/10" lá.
- **Pintar entre blocos pesados**: `aguardarQuadro()` (`setTimeout(…, 0)`)
  antes/depois de cada bloco síncrono pesado (papaparse, mapeamento, merge) —
  sem isso, o React não chega a pintar o indicador e a tela congela.
- **O processo não depende da tela**: roda em função async dentro do
  componente pai que permanece montado (Home). Sair e voltar = mesmo estado,
  progresso adiantado.
- Frases usadas (padrão a repetir): `Lendo i/n: arquivo`, `Extraindo i/n:
  arquivo`, `Preparando i/n: arquivo`, `Unindo os cadastros…`, `Aplicando no
  programa…`, `Gravando no dispositivo…`.

---

## 4. RAR/ZIP com senha automática (nunca pede senha ao usuário)

- Senha derivada da **data do dispositivo**: prefixo fixo + mês/ano do
  relógio (tenta mês atual e anterior, cobre download na virada do mês).
  Regra em `client/src/lib/senhaAutomatica.ts`; no fonte o prefixo fica
  **codificado em XOR** (`PREFIXO_CODIFICADO`/`CHAVE_XOR`) para não aparecer
  em busca simples no bundle.
- `rarImport.ts` — node-unrar-js (WASM via `?url`, `wasmBinary`);
  `zipImport.ts` — @zip.js/zip.js com import dinâmico e
  `configure({ useWebWorkers: false })` (WebView2 virtual host).
- Senha errada → mensagem orientando ("Confira se a data do dispositivo…")
  **sem expor a senha**. Arquivos soltos `.csv/.tsv/.txt` seguem iguais.
- A equipe renova o `.zip/.rar` no Drive na virada do mês com a senha nova
  seguindo a mesma regra — o app não muda.

---

## 5. Banco local cifrado com chave AO LADO dos dados (v2)

- Registro `{ version: 2, iv, ciphertext }` em IndexedDB
  (`cadclinico` / `clinic-data` / chave `cadclinico-local-data-encrypted`);
  chave AES-256 **aleatória**, gerada uma única vez e guardada no
  localStorage `cadclinico-db-key`.
- **Sem PBKDF2 no caminho quente**: o formato antigo (v1) derivava a chave de
  PBKDF2 com120.000 iterações em **todo** load/save — centenas de ms em
  aparelho fraco. v2 usa AES-GCM nativo direto (dezenas de ms).
- Migração automática v1→v2 na primeira carga. Registro ilegível/chave perdida
  → apaga e abre vazio (`obterChaveLocal`/`cifrarLocal`/`decifrarLocal`/
  `gravarRegistro`/`apagarRegistro` em `dataStore.ts`).
- A senha opcional de tela **não** participa da cifra (só controla a tela de
  abertura).

---

## 6. Ofuscação do bundle sem castigar aparelho fraco

- `javascript-obfuscator` (devDep) + `scripts/obfuscate-build.mjs` no script
  `build` (roda após `vite build`). Dev server **não** é ofuscado.
- Preset moderado: string array base64 + rotate/shuffle + wrappers +
  selfDefending + numbersToExpressions.
- **Proibido neste app**: control flow flattening e dead code injection —
  ganham pouco e custam CPU nos aparelhos-alvo.
- Resultado: `F2e5b0if`, nomes da regra e constantes da senha **não** acham
  por busca de string no bundle gerado.

---

## 7. Gotchas de teste (como simular aparelho lento sem ter um)

- **Sem devtools remoto** no app instalado: para observar estágios use
  **arquivos grandes de verdade** (5,9 MB → parse de ~0,5–3 s), que dão
  janela para clicar/snapshot entre estágios. Arquivos pequenos terminam
  antes do round-trip do teste.
- Injetar arquivo no app de teste: `fetch` (com `?cb=` anti-cache) →
  `DataTransfer` → `input.files = dt` → `dispatchEvent(new Event('change'))`
  em `label.import-button input[type=file]`.
- `browser.evaluate` só aceita **expressão (IIFE)** — sem top-level
  `await`/`return`/`setTimeout`. No runtime de orquestração também **não há
  setTimeout**: use round-trips como atraso natural.
- RAR com senha para teste: WinRAR CLI `WinRAR.exe a -inul -ibck "-hpSENHA"
  -ep1` (a GUI cria arquivos de forma assíncrona — rechecar após ~2 s).
- PowerShell exige aspas em pacotes `@…`: `pnpm add "@zip.js/zip.js"`.

---

## 8. Roteiro de replicação (passo a passo)

1. Copiar o estado de progresso + chip no cabeçalho + `aguardarQuadro`
   (seção3). É o que muda a percepção "está travado?".
2. Converter o fluxo de importação para **substituição** (seção2); no
   Acompanha Digital, por entidade + âncoras de interação local.
3. Leitura `.rar/.zip` com senha automática (seção4) — libs e mensagens já
   prontas.
4. Cifra do IndexedDB v2 com chave ao lado dos dados (seção5) — copiar
   funções do `dataStore.ts`.
5. Ofuscação no build com o mesmo preset (seção6).
6. Validação: `pnpm check` (tsc) → `pnpm build` → teste do fluxo feliz e do
   fallback com seletor de tipo → reload confere persistência.

---

## Princípio de linguagem (decisão do usuário,15/10/2026)

- **Interface para usuário leigo = o mais simples sempre.** Nada de siglas que
  a pessoa precise explicar a alguém (ex.: botão "IMPORTAR CSVs / ZIP / RAR" →
  **"IMPORTAR"**; "ler os CSVs" → "ler os arquivos"). Antes de escrever um
  rótulo ou mensagem visível, perguntar: um leigo entende sem glossário?
  Erros técnicos só devem citar siglas quando identificam o arquivo que o
  próprio usuário escolheu.

---

## Play Store: R8 + alerta de "otimização DEX" (15/10/2026)

- O Play cobra **qualidade técnica**: cartão vermelho "A otimização de código
  DEX está abaixo do nosso limite… Ofuscação (1%)" — abaixo de 25% em qualquer
  categoria afeta visibilidade/publicação, com prazo para corrigir.
- Causa clássica: `minifyEnabled false` no build Android. Correção nas duas
  versões (Cadástrico Clínico e Acompanha Digital): `minifyEnabled true` +
  `shrinkResources true` no `release` do `android/app/build.gradle` e
  `-keepattributes SourceFile,LineNumberTable` no `proguard-rules.pro`
  (mantém arquivo/linha nos stack traces).
- **Procedimento por envio: nenhum passo manual.** O `mapping.txt` gerado pelo
  R8 vai embutido no AAB em
  `BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map` e o Play
  consome sozinho. Verificação rápida de 30s: abrir o `.aab` como ZIP e procurar
  esse caminho.
- Fallback manual (se o aviso persistir): Play Console → *Testar e lançar* →
  *Pesquisador de pacotes de apps* → seletor da versão → aba *Downloads* →
  seção *Recursos* → upload do `mapping.txt` (arquivo por versão).
- Testar R8 antes de enviar: `gradlew assembleRelease` → APK em
  `android\app\build\outputs\apk\release\` → instalar no aparelho (desinstalar
  antes a versão da Play — assinatura diferente) → testar os fluxos principais →
  reinstalar pela Play.
- Nota: apps só com plugins Capacitor oficiais e sem Cordova passam no R8
  sem regras extras (as regras *consumer* do Capacitor cobrem a ponte JS).

---

## Android: seletor de arquivos não mostra .rar/.zip (15/10/2026)

- Sintoma: no app Android o IMPORTAR não deixava escolher o `.rar` do BI
  (no Windows/navegador funcionava).
- Motivo: no Android o seletor do sistema filtra pelos **tipos MIME** do
  atributo `accept` do `<input type="file">` (o Capacitor repassa via
  `Intent.EXTRA_MIME_TYPES`, ver `BridgeWebChromeClient.getValidTypes()`).
  A lista antiga só tinha `application/vnd.rar` e `application/zip`; o
  sistema/gerenciador de arquivos rotula `.rar` como
  **`application/x-rar-compressed`** (e `.zip` pode vir como
  `application/x-zip-compressed`) → o arquivo ficava oculto.
- Correção: no `accept` incluir **todas as variantes comuns** de MIME:
  `application/zip,application/x-zip-compressed,application/vnd.rar,application/x-rar-compressed,application/x-rar`
  além das extensões (`.zip,.rar`). No desktop o `accept` é ignorado, por
  isso só quebrava no Android.
- Replicar em qualquer projeto Capacitor com `<input accept>` de
  arquivo: nunca confiar em um único MIME para zip/rar; listar as
  variantes `x-...` também.
- Verificação após rebuild: procurar a string nova no JS embarcado
  (atenção: o ofuscador `obfuscate-build.mjs` codifica strings em
  base64 com **alfabeto de caixa trocada** — conferir decodificando com
  `a-zA-Z0-9+/=` invertido, ou buscar o arquivo-fonte antes da ofuscação).

---

## Privacidade: nenhum dado real no código nem no binário

Regra do projeto (obrigatória): a Play Store recebe o programa **vazio**; dados
só entram por importação em tempo de execução. Nenhuma menção a pessoas reais
no código-fonte.

- **Onde dados reais costumam vazar:**
  - Constantes "de exemplo/demo" usadas na lógica (ex.: `DEMO_PATIENT_VALUES` em
    `safeMerge.ts`, que marcava CPF/telefone para substituição na importação).
    Como são importadas por código de produção, **vão dentro do binário**.
  - Arquivos de "seed"/dados iniciais (ex.: `territorySeed.ts` com ruas + equipes
    reais). Se nada importa o arquivo, é **código morto → deletar**.
  - Seção de contato dos termos (e-mail/telefone do desenvolvedor) — permitido a
    pedido do dono, mas é dado pessoal à mostra.
- **Varredura obrigatória antes de publicar** (no `client/src`):
  - CPF: `\d{3}\.?\d{3}\.?\d{3}-?\d{2}`
  - Telefone BR: `\(\d{2}\)\s?\d{4,5}-?\d{4}` ou `\d{2}9?\d{4}\d{4}`
  - Nomes/e-mails pessoais: nome do dono, `@gmail|@hotmail|@outlook`.
- **Testes (`*.test.ts`)** podem usar nomes/CPFs fictícios (JOÃO SOUZA,
  `12345678901`, `11999990001`) — não entram no binário. Só tomar cuidado com
  CPFs "válidos" de exemplo: preferir sempre fictícios óbvios.
- **Confirmação pós-build:** procurar o dado real no JS embarcado
  (`android/app/src/main/assets/public/assets/*.js`). Se aparecer em claro,
  a ofuscação não cobriu; se não aparece, ok.
- Dado de teste **nunca** vai para GitHub nem para loja. GitHub público só
  arquivos essenciais (AAB, docs).

---

## Play Console: versionCode duplicado gera 2 erros de release

Sintomas ao criar release de teste/publicacao:
- "Esta versao nao permite que os usuarios existentes facam a atualizacao para
  os novos pacotes de apps."
- "Esta versao nao adiciona nem remove pacotes de apps."

- Causa: o Play guarda UM AAB por versionCode. Subir um AAB com versionCode que
  ja existe no Console (mesmo com conteudo diferente) impede o calculo do
  caminho de atualizacao -> esses 2 erros. Nao e erro de assinatura nem de AAB.
- Correcao: incrementar o versionCode para um valor NUNCA enviado (ex.: 18 -> 19)
  e garantir que cada versionCode tenha UMA unica build. Nao reutilizar codigo.
- Diagnostico util: se o aparelho ja tem uma build antiga com o mesmo
  versionCode (dumpsys package), e sinal de que aquele codigo "esta gasto".

## Play Console: alerta "OTIMIZACAO DEX" (exigencia de qualidade)

- Alerta vermelho "Requer atencao": "A otimizacao de codigo DEX esta abaixo do
  nosso limite... Ofuscação (1%). Valores abaixo de 25%...". Afeta
  visibilidade/publicacao (diferente do aviso generico de arquivo de desofuscacao).
- Causa: minifyEnabled so com `proguard-android.txt` (ofusca/reduz mas NAO
  otimiza codigo). Precisa do arquivo de otimizacao.
- Correcao: `proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'),
  'proguard-rules.pro'` (alem de minifyEnabled + shrinkResources true). Ativa
  inlining/-allowaccessmodification etc. Resultado: binario menor e mapping maior.
- Risco: otimizacao agressiva pode quebrar a ponte WebView/Capacitor -> OBRIGATORIO
  testar no aparelho fisico (abrir app + fluxo que usa plugin nativo, ex. importacao
  via seletor) antes de publicar. Neste projeto: v19 validada (15804 pacientes).
- mapping.txt/proguard.map continua embutido no AAB (BUNDLE-METADATA) para o
  Console desofuscar stack traces.

---

## Versoes desta entrega

- `package.json` e **1.0.15** (banner "Versao 1.0.15").
- Android (Play Store): versionCode **19** / versionName **1.0.15**
  (18 nao serve: colisao de versionCode no Console; ver padrao acima).
- Artefato: `entregas\play\app-release-vC19-1.0.15.aab` (v18/v17 em `historico\`).
- MSIX (Partner Center) permanece **1.0.13.0** nesta entrega Android.