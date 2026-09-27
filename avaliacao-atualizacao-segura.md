# Avaliação do aplicativo Clínica da Família II

**Data da avaliação:** 22/08/2026  
**Escopo:** regras de atualização do administrativo, acesso, apresentação, pesquisa de pacientes, território e manutenção.

## Síntese executiva

O aplicativo já resolve um problema concreto de trabalho de campo: permitir a consulta local de pessoas, endereço, equipe responsável e informações da unidade sem depender de conexão. A organização por quatro ações principais, o retorno físico do Android e a limitação de resultados favorecem o uso rápido. A maior fragilidade identificada no processo anterior era administrativa: uma importação parcial substituía o registro inteiro e apagava informações já conhecidas. Essa regra foi substituída por uma mesclagem não destrutiva com revisão obrigatória para alterações reais.

Há também duas questões que merecem continuidade. A primeira é de **fidelidade visual**: a abertura atual não reproduz integralmente a composição de logos solicitada no início. A segunda é de **proteção de dados**: a senha silenciosa dificulta o uso casual por terceiros, mas não deve ser entendida como criptografia ou controle corporativo de acesso.

| Área | Situação atual | Prioridade |
|---|---|---|
| Atualização de pacientes | Mesclagem não destrutiva com confirmação de substituições | Alta — concluída nesta versão |
| Atualização territorial | Mesma revisão e confirmação antes de alterar profissionais/equipes | Alta — concluída nesta versão |
| Funcionamento da unidade | Atualização direta, sem confirmação adicional | Conforme definido pelo solicitante |
| Busca em 13.921 registros | Regras de ativação e espera reduzem consultas inúteis | Adequada para a base atual |
| Abertura com logos | Parcialmente divergente da especificação original | Alta — pendente de ajuste visual |
| Proteção de dados locais | Barreira de uso casual, sem criptografia | Alta — requer decisão institucional |

## Nova regra de atualização administrativa

> **Princípio adotado:** um campo vazio na planilha nova não apaga um campo preenchido na base administrativa.

Nas atualizações de pacientes, o painel agora usa CNS como identificador prioritário. Cadastro e CPF reais também podem identificar o mesmo registro; quando não há identificador confiável, nome mais data de nascimento pode ser usado. Se houver apenas um nome e ele corresponder a mais de uma pessoa, a linha não é aplicada por segurança: ela não cria uma duplicidade nem modifica alguém incorretamente.

Quando uma linha adiciona informação onde antes não havia nada, o painel preenche o campo automaticamente. Quando acrescenta um telefone real, ele substitui os dois telefones demonstrativos e passa a compor a lista de telefones da pessoa. Cadastro `975749`, CPF `06626492900`, telefone `11978831938` e telefone `1145890208` são tratados como demonstrativos: sua troca por informação real ocorre sem confirmação.

Quando uma planilha tenta trocar uma informação real já preenchida — por exemplo, endereço, data de nascimento, nome da mãe ou CNS — a importação fica pendente. O painel informa quantas pessoas seriam afetadas, mantém a lista fechada por padrão e oferece o botão para vê-la somente quando necessário. A aplicação só ocorre depois de digitar exatamente **CONFIRMO**. Cancelar abandona toda a importação pendente, sem alterar a base.

| Situação da planilha nova | Resultado no administrativo |
|---|---|
| Campo vazio para uma pessoa já existente | O valor já armazenado é preservado |
| Campo real em branco na base existente | O campo é preenchido automaticamente |
| Telefone real em registro com telefones demonstrativos | Telefones demonstrativos são trocados automaticamente |
| Valor demonstrativo substituído por valor real | Atualização automática, sem confirmação |
| Valor real diferente de outro valor real | Revisão opcional da lista + digitação de `CONFIRMO` |
| Nome repetido, sem CNS/CPF/cadastro e sem data suficiente | Linha não é aplicada por segurança |
| Novo paciente com identificador ou combinação confiável | Novo registro é incluído |

Para **Nosso território**, a identidade do trecho é formada pela rua e pelos limites numéricos. Informações omitidas preservam o que já existe. Alterar médica(o), enfermeira(o), ACS, flor, cor ou código de cor de um trecho existente também exige a mesma revisão e confirmação escrita. Um trecho totalmente novo só é adicionado quando há rua e os três profissionais obrigatórios. Já **Funcionamento da unidade** continua com atualização direta, conforme solicitado, pois os textos são recados simples e podem ser corrigidos com uma nova importação.

## Validação realizada

Foram executados cenários automáticos para conferir que uma atualização apenas de telefone preserva nome da mãe e endereço, remove os telefones demonstrativos ao receber número real e não pede confirmação nesse caso. Também foi validado que uma alteração de endereço aparece na revisão obrigatória, que alteração de ACS aparece na revisão territorial e que um novo trecho territorial incompleto não é criado. A compilação TypeScript e a geração de produção foram concluídas sem erro.

| Verificação | Resultado |
|---|---|
| Complemento de telefone preserva os demais dados do paciente | Aprovado |
| Troca de dados demonstrativos ocorre sem `CONFIRMO` | Aprovado |
| Troca de endereço real aparece para revisão | Aprovado |
| Troca de ACS aparece para revisão | Aprovado |
| Nome ambíguo sem identificador confiável não altera registros | Aprovado |
| Novo território sem equipe completa não é inserido | Aprovado |
| Tipagem e compilação de produção | Aprovadas |

## Avaliação do acesso por senha

A tela silenciosa segue uma ideia coerente com o uso em aparelho compartilhado: não informa se o caractere escolhido estava correto, não expõe progresso e, após erro, deixa de oferecer pistas. A versão atual também garante que os doze caracteres apresentados nos quatro botões sejam distintos.

Entretanto, esse mecanismo é uma **barreira de discrição**, não uma solução de segurança forte. A senha possui quatro posições e o alfabeto evita apenas caracteres ambíguos, resultando em 1.185.921 combinações possíveis. Mais importante: a senha e os dados ficam localmente no aparelho; alguém com controle técnico do telefone, backup do aplicativo ou acesso ao armazenamento do navegador pode não depender da tela de senha. Para dados de saúde, a proteção efetiva deve incluir bloqueio da tela do próprio Android, controle de quem recebe o APK, atualização do sistema e, se a unidade exigir, uma solução institucional com autenticação individual e dados criptografados.

| Aspecto | Avaliação | Observação |
|---|---|---|
| Discrição diante de curiosos | Boa | Não há mensagem de erro, acerto ou número de etapas |
| Resistência a tentativa casual | Moderada | Uma tentativa errada deixa a tela sem pistas úteis |
| Proteção contra acesso técnico ao telefone | Insuficiente | Não há criptografia do banco local nem autenticação por usuário |
| Uso em contexto de saúde pública | Requer procedimento complementar | O aparelho deve permanecer bloqueado e sob responsabilidade definida |

## Apresentação, logos e fidelidade ao pedido inicial

O cabeçalho atual exibe os logos da Clínica da Família e da Prefeitura em uma faixa branca, e a tela permanece visualmente limpa. Isso preserva contraste e identificação institucional. Contudo, a implementação **não reproduz com exatidão** a primeira descrição: os logos deveriam ter uma composição de abertura com posicionamento vertical específico, grande espaço entre eles e uma faixa superior branca com proporções determinadas. Atualmente eles foram reduzidos a um cabeçalho compacto.

Essa divergência não decorre de limitação técnica. Eu tratei a retirada da navegação fixa e a necessidade de acesso silencioso como se justificassem simplificar também a composição dos logos. Foi uma decisão inadequada, pois as duas exigências eram independentes: era possível manter o acesso silencioso e, simultaneamente, respeitar a abertura institucional solicitada. O ponto deve ser corrigido em uma revisão visual dedicada, com uma regra clara de aceitação: definir se os logos aparecem como abertura breve antes do acesso ou se ficam na tela de senha, mas preservando as alturas, os terços de tela e os espaçamentos solicitados.

## Facilidade de uso em campo

O desenho atual favorece consultas repetidas em tela vertical. Os botões principais têm nomes diretos, as páginas internas oferecem retorno e os dados relevantes da ficha estão organizados em blocos curtos. A paginação evita listas grandes demais e a associação visual por cor/flor torna mais rápida a leitura de equipe no resultado.

Há um equilíbrio importante entre rapidez e prevenção de erro. No aplicativo do funcionário, a pessoa consulta e lê; no administrativo, onde uma decisão afeta todos os aparelhos, a nova revisão exige uma confirmação consciente antes de mudar informação real. A lista de substituições não abre automaticamente, evitando uma parede de texto em importações grandes, mas permanece disponível para auditoria antes da decisão.

| Fluxo | Pontos fortes | Atenção recomendada |
|---|---|---|
| Encontrar paciente | Campo único, paginação de cinco, ficha objetiva | Mostrar texto de ajuda curto no administrativo sobre as regras de busca |
| Nosso território | Rua, número, profissional, flor e cor pesquisáveis | Revisar periodicamente trechos sem limite final e intervalos sobrepostos |
| Funcionamento | Acordeões e ordem alfabética | Manter os textos curtos e atualizar por arquivo quando necessário |
| Administrativo | Importação por arquivo ou colagem, exportação única | Fazer uma cópia do JSON antes de importações grandes |

## Pesquisa e desempenho da base local

O objetivo de não fazer buscas instantâneas inúteis foi respeitado por regras específicas. A pesquisa de pacientes só é efetivada após dois segundos sem digitação e apenas quando a consulta se torna significativa: números curtos tratam cadastro; quatro ou mais números também permitem CPF, CNS e telefone; o comando `mãe ` direciona a busca para o nome materno; texto com número é tratado como endereço e exige o número exato; texto comum exige quantidade mínima de caracteres. Os resultados são ordenados por nome e exibidos de cinco em cinco.

Essas regras reduzem buscas acidentais e tornam a intenção mais previsível. Mesmo assim, a base atual continua carregada localmente e cada busca elegível percorre os registros em memória. Para cerca de 13.921 pessoas, a espera de dois segundos e a paginação tornam o comportamento aceitável em aparelhos recentes. Se a base crescer muito ou surgirem aparelhos mais lentos, a melhoria recomendada é criar índices locais para CNS, cadastro, CPF, telefone, palavras do nome e endereço. Isso reduziria o trabalho por pesquisa sem introduzir dependência de internet.

## Recomendações priorizadas

| Prioridade | Próxima ação | Motivo |
|---|---|---|
| 1 | Restaurar fielmente a composição de abertura dos logos | Corrige a principal divergência com o pedido visual original |
| 2 | Testar uma importação real apenas de telefones em cópia do JSON | Confirma o novo fluxo antes de atualizar a base de trabalho |
| 3 | Definir procedimento de guarda dos APKs e aparelhos | Dados de saúde exigem proteção além da senha silenciosa |
| 4 | Criar índices locais se a base ultrapassar o volume atual ou houver lentidão | Mantém a consulta ágil em aparelhos modestos |
| 5 | Incluir exportação de cópia de segurança antes de importação grande | Permite retorno rápido caso uma planilha venha com erro |

## Conclusão

O programa está bem orientado para a rotina de campo: é local, direto e reduz etapas de consulta. A alteração administrativa corrige a falha mais importante observada na importação parcial, tornando o uso mais seguro sem transformar complementos simples em um processo burocrático. A confirmação escrita ficou restrita ao que realmente pode causar perda de qualidade da informação: a troca de um dado real por outro dado real.

O próximo passo mais importante é corrigir a abertura institucional dos logos de acordo com sua instrução original e testar a nova regra com uma planilha real de telefones antes de distribuir uma atualização ampla.
