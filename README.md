# Kit Agrupamento Sustentável

Edição digital interativa do guia **Kit Agrupamento Sustentável**, construída com HTML5, CSS e módulos JavaScript sem framework de interface.

## Fonte de conteúdo

[`file.md`](./file.md) é a única fonte editorial e deve permanecer inalterado durante o desenvolvimento da aplicação. O texto é importado sem transformação e o parser em [`src/content/parser.js`](./src/content/parser.js) conserva offsets, texto bruto e ordem de leitura.

Os marcadores estruturais verificados do documento achatado estão em [`src/content/source-map.js`](./src/content/source-map.js). Se a fonte for alterada, atualize primeiro esse mapa de forma deliberada e execute a verificação de conteúdo; não edite `dist/` para corrigir conteúdo.

## Requisitos

- Node.js 22.12 ou superior
- npm 10 ou superior

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
npm run preview
```

Para executar toda a verificação em conjunto:

```powershell
npm run validate
```

`check:content` reconcilia todos os 31 493 bytes da fonte, confirma contagens e ordem, valida os quatro diagramas, tabelas, expressões TeX, valores monetários, IDs, destinos do índice, URLs e ativos. `test` cobre parsing, segurança, renderização, rotas, pesquisa, filtros, tema, gaveta e impressão. `build` gera a versão de produção em `dist/`; o plugin Vite inclui uma cópia de `file.md` como fallback para visitantes sem JavaScript.

## Estrutura principal

- [`index.html`](./index.html): shell semântico, controlos e fallback sem JavaScript.
- [`src/main.js`](./src/main.js): importação da fonte, parsing, renderização e inicialização.
- [`src/content/parser.js`](./src/content/parser.js): recuperação estrutural sem perdas.
- [`src/content/renderer.js`](./src/content/renderer.js): DOM seguro, tabelas, cartões e matemática.
- [`src/content/interactions.js`](./src/content/interactions.js): rotas, pesquisa, filtros, tema, progresso e impressão.
- [`src/styles.css`](./src/styles.css): design responsivo, temas, acessibilidade e impressão.
- [`scripts/check-content.mjs`](./scripts/check-content.mjs): verificação independente de paridade.
- [`tests/`](./tests/): testes Vitest com ambiente DOM.

## Fluxo de paridade editorial

1. Atualize [`file.md`](./file.md) como fonte original.
2. Ajuste apenas os marcadores estruturais necessários em [`src/content/source-map.js`](./src/content/source-map.js).
3. Execute `npm run check:content` e corrija qualquer divergeência de contagem, cobertura ou ordem.
4. Execute `npm test` e `npm run build`.
5. Não copie nem reescreva conteúdo diretamente nos componentes visuais.
