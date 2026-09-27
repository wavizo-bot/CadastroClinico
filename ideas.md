# Direção visual — Clínica da Família II

## Três caminhos considerados

### Abordagem 1 — Saúde Pública Editorial
**Very Brief Intro:** Uma interface institucional clara, acolhedora e muito legível, com hierarquia editorial, azul-marinho como eixo de confiança e detalhes cromáticos derivados dos logotipos oficiais. A sensação é de serviço público bem organizado, próximo e humano.

**Probability:** 0.07

### Abordagem 2 — Caderno de Território
**Very Brief Intro:** Uma linguagem visual inspirada em mapas de bairro, cadernos de campo e sinalização comunitária, com linhas de percurso, blocos informativos e pequenos marcadores de território. A interface enfatiza orientação e contexto local.

**Probability:** 0.04

### Abordagem 3 — Portal de Acolhimento
**Very Brief Intro:** Uma experiência mais calorosa, com grandes áreas de respiro, ilustrações suaves e uma navegação centrada em tarefas rápidas. A proposta reduz a sensação de sistema burocrático sem perder o caráter institucional.

**Probability:** 0.09

## Abordagem escolhida: Saúde Pública Editorial

### Design Movement
Editorialismo institucional contemporâneo, combinando sinalização cívica, design de informação e princípios de acessibilidade para serviços públicos.

### Core Principles
1. **Clareza antes da decoração:** cada tela deve deixar evidente o que pode ser feito, qual campo está ativo e como retornar.
2. **Confiança sem rigidez:** o azul-marinho estrutura a interface, enquanto acentos cromáticos dos logotipos introduzem proximidade e reconhecimento.
3. **Leitura em camadas:** títulos fortes, textos curtos, etiquetas explícitas e agrupamentos que ajudam a localizar informações rapidamente.
4. **Contato humano:** a interface deve parecer uma ferramenta criada para apoiar o trabalho das equipes, não um formulário genérico.

### Color Philosophy
O branco cria um campo de leitura limpo e reduz a carga visual. O azul-marinho funciona como cor de orientação, contraste e confiança. O azul vivo reforça ações e estados ativos. Amarelo, verde, magenta e laranja aparecem apenas como acentos de identificação, ecoando os arquivos institucionais sem competir com os dados clínicos e territoriais.

### Layout Paradigm
A estrutura parte de uma faixa institucional superior com os dois logotipos lado a lado, seguida por uma linha de navegação horizontal e um conteúdo principal com composição assimétrica: uma coluna de contexto e uma área de tarefa. No celular, as mesmas áreas se reorganizam verticalmente sem esconder ações essenciais.

### Signature Elements
- Uma **linha de divisão azul-marinho** entre a identidade institucional e o espaço de trabalho.
- Pequenos **marcadores de seção** em forma de barra cromática, inspirados na faixa inferior do logotipo da Clínica da Família.
- Cartões com **bordas discretas e sombra baixa**, usando ícones lineares e etiquetas curtas para apoiar a leitura.

### Interaction Philosophy
As interações devem confirmar o gesto sem criar ruído: foco visível, botões com resposta tátil curta, listas com área de toque generosa e resultados que explicam por que apareceram. Toda tela secundária terá retorno explícito para evitar becos sem saída.

### Animation
Entradas de tela usam apenas opacidade e deslocamento vertical curto, com duração entre 180 e 240 ms. Listas podem revelar itens com atraso muito pequeno e progressivo. Estados de foco e seleção devem ser imediatos. A animação não pode esconder conteúdo nem atrapalhar teclado, leitor de tela ou usuários com movimento reduzido.

### Typography System
Títulos usam **Outfit**, com pesos 600 e 700 para uma presença institucional contemporânea. Textos, campos e dados usam **Source Sans 3**, escolhida pela leitura confortável em tamanhos menores. A hierarquia parte de títulos de 32–40 px no desktop, 26–32 px no celular, subtítulos de 18–22 px e corpo de 16–18 px, evitando textos menores que 14 px.

### Brand Essence
Uma ferramenta de apoio para equipes da Clínica da Família II encontrarem pessoas e territórios com rapidez, segurança e contexto local — **clara, cuidadosa, prática**.

### Brand Voice
As manchetes são diretas e tranquilas. Os CTAs descrevem a tarefa em vez de usar linguagem promocional. O microcopy explica o próximo passo e evita jargões desnecessários.

Exemplos:

> **Encontre a pessoa certa antes de seguir o atendimento.**

> **Busque por qualquer dado que você tenha em mãos.**

### Wordmark & Logo
Os logotipos oficiais fornecidos pelo usuário permanecem como a assinatura institucional principal, sempre preservados na proporção original. A interface não recria o nome da unidade em fonte genérica; quando necessário, usa os próprios arquivos oficiais em uma escala claramente visível.

### Signature Brand Color
**Azul Clínica — #123B67**, um azul-marinho limpo e contrastante que conecta confiança institucional, orientação e leitura acessível.

## Decisões de implementação

A primeira entrega será uma prévia web responsiva, adequada para computador e para validação de navegação em telas pequenas. Os dados mostrados na prévia serão claramente identificados como demonstrativos, com a estrutura preparada para receber posteriormente arquivos JSON exportados pelo administrativo. A consulta de pacientes será local nesta etapa, sem dados reais e sem backend.

O botão **Funcionamento da unidade** será apresentado como terceiro acesso visual, mas marcado como próxima etapa enquanto o conteúdo ainda não foi definido.

## Style Decisions

Os acentos derivados dos logotipos aparecem exclusivamente como marcadores estreitos de seção e de tarefa, enquanto o Azul Clínica continua a estruturar a navegação e as ações. A interface administrativa usa os mesmos logotipos e a mesma linha azul-marinho do aplicativo da equipe. A página inicial não recebe título ou texto de contextualização adicional, pois a prioridade de reduzir textos explicativos foi definida pelo usuário.
