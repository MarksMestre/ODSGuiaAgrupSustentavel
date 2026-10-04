# Kit Agrupamento Sustentável

Edição digital interativa do guia **Kit Agrupamento Sustentável**, construída com HTML5, CSS e módulos JavaScript sem framework de interface.

## Para quem edita o conteúdo

Não é preciso saber programar.

1. Edite o ficheiro Word em [`source/`](./source) (ou o `file.md`, para o texto do guia).
2. Faça duplo clique em [`run.cmd`](./run.cmd).
3. O site abre no browser.

O `run.cmd` instala o que falta, gera as fichas de jogo, valida o conteúdo e abre o site. Se algo correr mal, a mensagem diz o ficheiro e o que fazer; o relatório completo fica em `build/content-report.json`.

Para mudar o Progresso Pessoal, edite [`content.progress.json`](./content.progress.json) com qualquer editor de texto. Os valores válidos estão listados por `npm run progress:keys`.

Dois atalhos no site: a tecla `/` foca a pesquisa a partir de qualquer página, e o botão **Procurar no guia** no topo da barra lateral faz o mesmo. Cada jogo tem uma ficha para impressão, com a mesma identidade visual do site.

## Fonte de conteúdo

[`file.md`](./file.md) é a fonte editorial do guia. O texto é importado sem transformação e o parser em [`src/content/parser.js`](./src/content/parser.js) conserva offsets, texto bruto e ordem de leitura.

Os marcadores estruturais verificados do documento achatado estão em [`src/content/source-map.js`](./src/content/source-map.js). Se a fonte for alterada, atualize primeiro esse mapa de forma deliberada e execute a verificação de conteúdo; não edite `dist/` para corrigir conteúdo.

O Capítulo 8 (Espaço Influencers) fica na fonte mas **não é publicado**: o parser corta-o no limite do capítulo e regista o trecho como excluído, para que nada se perca sem que entre no site.

Os documentos Word em [`source/`](./source) alimentam a geração das fichas de jogo; não são eles a fonte do texto do guia.

## Requisitos

- Node.js 22.12 ou superior
- npm 10 ou superior
- Python 3.11 ou superior (só para gerar as fichas de jogo; `run.cmd` instala as dependências)

## Desenvolvimento local

```powershell
npm install
npm run dev
```

O Vite apresenta o endereço local no terminal. A aplicação utiliza rotas `#/...`, pelo que funciona em qualquer alojamento estático sem regras de reescrita.

## Verificação e produção

```powershell
npm run check:content
npm test
npm run build
npm run smoke
npm run preview
```

`npm run validate` corre tudo em conjunto. `npm run smoke` percorre o site como um utilizador (navegação, Capítulo 7, página de jogo, filtros) e falha se algo não responder.

Para executar toda a verificação em conjunto:

```powershell
npm run validate
```

`check:content` reconcilia os 31 493 bytes da fonte, confirma contagens e ordem, valida os quatro diagramas, tabelas, expressões TeX, valores monetários, IDs, destinos do índice, URLs e ativos. Confirma também que o Capítulo 8 está ausente do site, que as 30 fichas existem com as linhas do molde pela ordem, e que o mapeamento de progresso só usa jogos e trilhos que existem. `test` cobre parsing, segurança, renderização, rotas, pesquisa, filtros, tema, gaveta, impressão, contraste e Progresso Pessoal. `build` gera a versão de produção em `dist/`; os plugins do Vite incluem uma cópia de `file.md` (fallback sem JavaScript) e as 60 fichas de jogo.

## Geração das fichas de jogo

O Capítulo 7 é gerado a partir de `file.md` e de `source/gamesSource.docx`:

```powershell
npm run content:build   # gera as 30 fichas .md e .html + content/games-map.json
npm run content:check   # valida as fontes sem escrever
npm run content:report  # mostra o último relatório
```

As linhas de cada ficha vêm do molde `source/games/00GameSheetTemplate.docx`,
lido em tempo de execução: acrescentar uma linha ao molde é suficiente para a
ficha a ter. A numeração de cada jogo é permanente e vive em
`content/games-map.json`, por isso reordenar o Word não renumera as fichas.

As **instruções** mantêm a hierarquia do Word: os níveis e o tipo de lista de
cada passo são lidos do próprio documento (`w:numPr` e `numbering.xml`), pelo
que as personagens de um jogo aparecem como marcas dentro do passo que as traz,
e uma «Parte 2» recomeça a numeração. O material de apoio — baralhos de cartas,
listas de perguntas, listas de recursos — é reconhecido e fica fora das
instruções; para o incluir, ver `nestedGameRule` em `content.config.json`.

A ficha `.html` para impressão usa as mesmas cores, margens de impressão e tipos
de letra do sítio: são lidos de `src/styles.css` no momento da geração, para que
uma alteração de cor no tema não deixe as 60 fichas para trás.

`scripts/content/` tem os módulos do pipeline; `scripts/build_content.py` é o
único ponto de entrada. `content.config.json` é o único ficheiro a editar para
mudar caminhos ou nomes — não é preciso abrir Python.

## Progresso Pessoal

A taxonomia (quais `Secção → Área → Trilho` existem, e os descritores de cada
um) é buscada na folha do CNE no momento da construção:

```powershell
npm run progress:refresh   # vai buscar a folha e escreve build/progress-taxonomy.json
npm run progress:keys      # lista os valores válidos, por Secção
npm run progress:check     # valida content.progress.json sem ir à rede
npm run progress:degrade   # confirma que o site funciona sem qualquer dado
```

A folha não envia cabeçalhos CORS, por isso a leitura só pode ser feita aqui e
não no navegador. `build/progress-taxonomy.json` é gerado e nunca editado à mão.

O mapeamento **jogo → trilhos** vive em `content.progress.json` e é escrito por
um dirigente: a folha diz quais são os trilhos, não quais se aplicam a cada
jogo. É um ficheiro opcional e pode ficar vazio.

Nenhum destes passos é obrigatório para construir o site. Sem taxonomia ou sem
mapeamento, o bloco de Progresso Pessoal não aparece e o guia funciona na
mesma — `npm run progress:degrade` verifica exactamente isso.

## Estrutura principal

- [`index.html`](./index.html): shell semântico, controlos e fallback sem JavaScript.
- [`src/main.js`](./src/main.js): importação da fonte, parsing, renderização e inicialização.
- [`src/content/parser.js`](./src/content/parser.js): recuperação estrutural sem perdas.
- [`src/content/renderer.js`](./src/content/renderer.js): DOM seguro, tabelas, cartões e matemática.
- [`src/content/interactions.js`](./src/content/interactions.js): rotas, pesquisa, filtros, tema, progresso e impressão.
- [`src/content/games.js`](./src/content/games.js): jogos gerados, rotas `#/jogo/{n}` e fichas.
- [`src/content/progress.js`](./src/content/progress.js): junta a taxonomia ao mapeamento; degrada sem dados.
- [`src/styles.css`](./src/styles.css): design responsivo, temas, acessibilidade e impressão.
- [`scripts/build_content.py`](./scripts/build_content.py): pipeline das fichas de jogo.
- [`scripts/progress/build-progress.mjs`](./scripts/progress/build-progress.mjs): taxonomia e validação do progresso.
- [`scripts/check-content.mjs`](./scripts/check-content.mjs): verificação independente de paridade.
- [`tests/`](./tests/): testes Vitest com ambiente DOM.

## Fluxo de paridade editorial

1. Atualize [`file.md`](./file.md) como fonte original.
2. Ajuste apenas os marcadores estruturais necessários em [`src/content/source-map.js`](./src/content/source-map.js).
3. Execute `npm run check:content` e corrija qualquer divergeência de contagem, cobertura ou ordem.
4. Execute `npm test` e `npm run build`.
5. Não copie nem reescreva conteúdo diretamente nos componentes visuais.
