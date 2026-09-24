export function slugify(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-PT')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const EXPECTED_COUNTS = Object.freeze({
  routes: 12,
  glossaryGroups: 3,
  glossaryEntries: 19,
  chapter7Areas: 5,
  chapter7Activities: 30,
  chapter8Areas: 5,
  bibliographyEntries: 8,
  tools: 2,
  diagrams: 4,
  dollarSpans: 19,
  validMathSpans: 6,
  currencySpans: 13,
});

export const ROUTES = Object.freeze([
  { id: 'inicio', hash: '#/inicio', label: 'Início', title: 'Kit Agrupamento Sustentável' },
  { id: 'glossario', hash: '#/glossario', label: 'Glossário', title: 'Siglas, Abreviaturas e Glossário' },
  { id: 'indice', hash: '#/indice', label: 'Índice geral', title: 'Índice Geral' },
  { id: 'capitulo-1', hash: '#/capitulo/1', label: 'Capítulo 1', title: 'Capítulo 1: Introdução ao Kit Agrupamento Sustentável' },
  { id: 'capitulo-2', hash: '#/capitulo/2', label: 'Capítulo 2', title: 'Capítulo 2: Os Objetivos de Desenvolvimento Sustentável e o Escutismo' },
  { id: 'capitulo-3', hash: '#/capitulo/3', label: 'Capítulo 3', title: 'Capítulo 3: Guia para uma Sede Sustentável' },
  { id: 'capitulo-4', hash: '#/capitulo/4', label: 'Capítulo 4', title: 'Capítulo 4: Guia para um Acampamento Sustentável' },
  { id: 'capitulo-5', hash: '#/capitulo/5', label: 'Capítulo 5', title: 'Capítulo 5: Como Criar um Projeto ODS' },
  { id: 'capitulo-6', hash: '#/capitulo/6', label: 'Capítulo 6', title: 'Capítulo 6: Como Criar uma Parceria para a Sustentabilidade' },
  { id: 'capitulo-7', hash: '#/capitulo/7', label: 'Capítulo 7', title: 'Capítulo 7: Jogos e Workshops — Oferta Pedagógica' },
  { id: 'capitulo-8', hash: '#/capitulo/8', label: 'Capítulo 8', title: 'Capítulo 8: Espaço Influencers' },
  { id: 'referencias', hash: '#/referencias', label: 'Bibliografia e ferramentas', title: 'Bibliografia, Materiais & Ferramentas' },
]);

export const TOP_LEVEL_MARKERS = Object.freeze({
  title: 'Kit Agrupamento Sustentável',
  publisher: 'Corpo Nacional de Escutas (CNE) — Compromisso 2030',
  fichaTecnica: 'Ficha Técnica',
  glossary: 'Siglas, Abreviaturas e Glossário',
  index: 'Índice Geral',
  references: 'Bibliografia, Materiais & Ferramentas',
});

export const OPENING_FIELDS = Object.freeze([
  'Autores:',
  'Apoio Financeiro:',
  'Apoio Institucional:',
  'Fotos:',
  'Designer:',
  'Edição:',
  'Nota Legal:',
  'Secretaria:',
  'Regra Ecológica de Leitura:',
]);

export const GLOSSARY_GROUPS = Object.freeze([
  {
    title: 'Siglas e Abreviaturas',
    terms: ['CNE:', '$\\text{CO}_2$:', 'GEE:', 'KPI:', 'LED:', 'ODS:', 'ONGD:', 'ONU:', 'PE:'],
  },
  {
    title: 'Estrangeirismos e Conceitos',
    terms: ['Braille:', 'Brainstorming:', 'ColorADD:', 'Eco-labels:', 'Merchandising:', 'Staff:'],
  },
  {
    title: 'Designações Escutistas',
    terms: ['Escuteiro:', 'Subunidade:', 'Secção:', 'Animador:'],
  },
]);

export const CHAPTERS = Object.freeze([
  {
    id: 'capitulo-1',
    heading: 'Capítulo 1: Introdução ao Kit Agrupamento Sustentável',
    indexHeading: 'Capítulo 1: Introdução ao Kit Agrupamento Sustentável',
    route: '#/capitulo/1',
  },
  {
    id: 'capitulo-2',
    heading: 'Capítulo 2: Os Objetivos de Desenvolvimento Sustentável e o Escutismo',
    indexHeading: 'Capítulo 2: Os Objetivos de Desenvolvimento Sustentável e o Escutismo',
    route: '#/capitulo/2',
    subsections: [
      { heading: "2.1 Os ODS e a Agenda 2030", indexHeading: "2.1 Os Objetivos de Desenvolvimento Sustentável (ODS) e os 5 P's" },
      { heading: '2.2 O CNE e os ODS', indexHeading: '2.2 O Corpo Nacional de Escutas (CNE) e os ODS' },
      { heading: '2.3 A OMME e os ODS', indexHeading: '2.3 A Organização Mundial do Movimento Escutista (OMME) e os ODS' },
    ],
  },
  {
    id: 'capitulo-3',
    heading: 'Capítulo 3: Guia para uma Sede Sustentável',
    indexHeading: 'Capítulo 3: Guia para uma Sede Sustentável',
    route: '#/capitulo/3',
    subsections: [
      {
        heading: '3.1 Área Educativa',
        indexHeading: '3.1 Área Educativa',
        items: [
          'Dinamização Regular:',
          'Imaginários de Secção:',
          'Articulação com o Sistema de Progresso:',
          'Ações Práticas Locais:',
          'Formação de Dirigentes:',
        ],
      },
      {
        heading: '3.2 Área Operacional',
        indexHeading: '3.2 Área Operacional (Plano de Ação, Acessibilidade e Gestão de Resíduos)',
        groups: [
          {
            heading: 'Plano de Ação do Agrupamento',
            items: [
              'Definir metas anuais mensuráveis e exequíveis.',
              'Monitorizar e avaliar atividades através de relatórios periódicos.',
              'Comunicar interna e externamente boas práticas e datas comemorativas ambientais.',
            ],
          },
          {
            heading: 'Acessibilidade e Inclusão Física',
            items: [
              'Nivelamento de pisos, instalação de rampas e corredores desimpedidos com largura adequada a cadeiras de rodas.',
              'Instalação de piso tátil para orientação de pessoas cegas ou de baixa visão.',
              'Sinalética interior em fontes de fácil leitura (ex: Arial, Tahoma, Helvetica) com bom contraste visual.',
              'Implementação do código ColorADD para permitir a correta identificação por pessoas daltónicas.',
              'Sanitários amplos dotados de barras de apoio, espelhos inclinados e torneiras tipo alavanca.',
            ],
          },
          {
            heading: 'Eficiência Operacional e Gestão de Recursos',
            items: [
              'Gestão de Material:',
              'Resíduos:',
              'Economia Circular:',
              'Iluminação e Energia:',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'capitulo-4',
    heading: 'Capítulo 4: Guia para um Acampamento Sustentável',
    indexHeading: 'Capítulo 4: Guia para um Acampamento Sustentável (10 Passos)',
    route: '#/capitulo/4',
    steps: [
      'Definição do Plano e Objetivos:',
      "Definição das Atividades e Recursos (5 R's):",
      'Desenvolvimento de Ação Comunitária:',
      'Localização e Hierarquia de Transporte:',
      'Alimentação e Combate ao Desperdício:',
      'Gestão de Resíduos e Recursos Hídricos:',
      'Higiene e Limpeza:',
      'Energia em Campo:',
      'Segurança e Emergência:',
      'Pós-Acampamento e Compensação:',
    ],
    nested: {
      4: [
        'Caminhada a pé ou bicicleta',
        'Transporte público coletivo (comboio, autocarro, barco)',
        'Aluguer coletivo de carrinha/autocarro otimizado',
        'Veículo próprio em regime de boleia partilhada',
      ],
      6: [
        'Duches cronometrados (máximo 5 minutos).',
        'Lavagem de louça em bacias estanques; uso de terra para desengordurar panelas antes de lavar.',
        'Recolha de óleos alimentares usados em garrafas para entrega em oleão.',
      ],
    },
  },
  {
    id: 'capitulo-5',
    heading: 'Capítulo 5: Como Criar um Projeto ODS',
    indexHeading: 'Capítulo 5: Como Criar um Projeto ODS (10 Passos)',
    route: '#/capitulo/5',
    steps: [
      'Passo 1: Identificar o Problema Comunitário',
      'Passo 2: Definir a Solução Concreta',
      'Passo 3: Mapear Recursos (Materiais, Humanos e Financeiros)',
      'Passo 4: Definir Intervenientes, Cargos e Parceiros',
      'Passo 5: Calendarizar (Datas, Locais e Cronograma de Tarefas)',
      'Passo 6: Escolher o Nome do Projeto',
      'Passo 7: Desenhar o Plano de Comunicação e Divulgação',
      'Passo 8: Estabelecer Métricas de Monitorização e Avaliação',
      'Passo 9: Avaliar a Tripla Sustentabilidade (Social, Ambiental, Económica)',
      'Passo 10: Associar formalmente aos ODS de Impacto Direto',
    ],
  },
  {
    id: 'capitulo-6',
    heading: 'Capítulo 6: Como Criar uma Parceria para a Sustentabilidade',
    indexHeading: 'Capítulo 6: Como Criar uma Parceria para a Sustentabilidade',
    route: '#/capitulo/6',
    leadHeading: 'Características e Ciclo de Vida da Parceria Escutista',
    steps: [
      'Passo 1 — Explorar:',
      'Passo 2 — Identificar:',
      'Passo 3 — Acordar:',
      'Passo 4 — Planear:',
      'Passo 5 — Capacitar:',
      'Passo 6 — Implementar:',
      'Passo 7 — Medir:',
      'Passo 8 — Avaliar:',
      'Passo 9 — Institucionalizar ou Terminar:',
      'Passo 10 — Comunicar:',
    ],
  },
  {
    id: 'capitulo-7',
    heading: 'Capítulo 7: Jogos e Workshops — Oferta Pedagógica',
    indexHeading: 'Capítulo 7: Jogos e Workshops — Oferta Pedagógica',
    route: '#/capitulo/7',
  },
  {
    id: 'capitulo-8',
    heading: 'Capítulo 8: Espaço Influencers',
    indexHeading: 'Capítulo 8: Espaço Influencers',
    route: '#/capitulo/8',
  },
]);

export const CHAPTER_2_5P_TABLE = Object.freeze({
  start: 'PrincípioODS CorrespondentesFoco Principal',
  rows: [
    'Pessoas',
    'Prosperidade',
    'Planeta',
    'Paz',
    'Parcerias',
  ],
});

export const CHAPTER_4_DIAGRAM = Object.freeze({
  start: 'Os 10 Passos do Acampamento Sustentável',
  end: 'Definição do Plano e Objetivos:',
});

export const CHAPTER_5_DIAGRAM = Object.freeze({
  start: 'Passo 1: Identificar o Problema Comunitário',
  end: 'Passo 10: Associar formalmente aos ODS de Impacto Direto',
  endInclusive: true,
});

export const CHAPTER_6_DIAGRAM = Object.freeze({
  start: '[1. Explorar] ──> [2. Identificar] ──> [3. Acordar] ──> [4. Planear] ──> [5. Capacitar]',
  end: '[10. Comunicar] <── [9. Institucionalizar/Fim] <── [8. Avaliar] <── [7. Medir] <── [6. Implementar]',
  endInclusive: true,
});

export const CHAPTER_7_DIAGRAM = Object.freeze({
  start: '                  ┌────────────────────────────────────────┐',
  end: '    6 Jogos          6 Jogos       6 Jogos        6 Jogos        6 Jogos',
  endInclusive: true,
});

export const CHAPTER7_AREAS = Object.freeze([
  {
    title: 'Área das Pessoas',
    color: 'people',
    activities: [
      { number: 1, title: 'Dramatização de Realidades' },
      { number: 2, title: 'Jogo Justo (Futebol Desigual)' },
      { number: 3, title: 'O Caminho para a Terra da Igualdade' },
      { number: 4, title: 'Muda os Teus Óculos' },
      { number: 5, title: 'Peixinho das Desigualdades' },
      { number: 6, title: 'Corrida da Saúde' },
    ],
  },
  {
    title: 'Área do Planeta',
    color: 'planet',
    activities: [
      { number: 1, title: 'A Certeza no Caos' },
      { number: 2, title: 'Água: Bem de Todos, para Todos!' },
      { number: 3, title: 'Alterações Climáticas' },
      { number: 4, title: 'Hotéis para Insetos' },
      { number: 5, title: 'Reciclagem 2.0' },
      { number: 6, title: 'Qual o Tamanho da Tua Pegada?' },
    ],
  },
  {
    title: 'Área da Prosperidade',
    color: 'prosperity',
    activities: [
      { number: 1, title: 'Quantos Queres dos Direitos' },
      { number: 2, title: 'E se Eu Não Fosse à Escola?' },
      { number: 3, title: 'Jogo dos Salários' },
      { number: 4, title: 'O Mundo Sem Todos os Empregos' },
      { number: 5, title: 'O Orçamento nas Tuas Mãos' },
      { number: 6, title: 'A Rota do Vestuário' },
    ],
  },
  {
    title: 'Área da Paz',
    color: 'peace',
    activities: [
      { number: 1, title: "Time's Up dos Valores" },
      { number: 2, title: '3 Coisas na Bagagem' },
      { number: 3, title: 'O Novo Planeta' },
      { number: 4, title: 'Qual a Tua Posição?' },
      { number: 5, title: 'Olha a Notícia!' },
      { number: 6, title: 'Representar é Humano' },
    ],
  },
  {
    title: 'Área das Parcerias',
    color: 'partnerships',
    activities: [
      { number: 1, title: 'Jogo do Quim dos ODS' },
      { number: 2, title: 'Jogo da Memória Cooperativo' },
      { number: 3, title: 'O Pacote de Açúcar' },
      { number: 4, title: 'Desenho Estragado dos ODS' },
      { number: 5, title: 'Descobre +ODS' },
      { number: 6, title: 'Negociar na ONU (Simulação de Assembleia Geral)' },
    ],
  },
]);

export const ACTIVITY_FIELDS = Object.freeze([
  'Formato:',
  'Participantes:',
  'Duração:',
  'Materiais:',
  'Dinâmica:',
]);

export const ECONOMICS_TABLE = Object.freeze({
  start: 'Categoria de DespesaCustoPontos de Estatuto Social',
  rows: [
    'Habitação Básica (Sem espaço para dependentes)$100€$1',
    'Habitação Confortável$200€$3',
    'Habitação Espaçosa$500€$5',
    'Alimentação de Sobrevivência (3 refeições)$100€$1',
    'Alimentação Diversificada (Frutas, lanches)$200€$3',
    'Família / Filhos$500€$10',
    'Cuidados de Saúde Privados$200€$5',
    'Acesso a Ensino Superior/Qualificado$200€$5',
    'Passe de Transportes Públicos$50€$2',
    'Viatura Própria Nova$200€$5',
    'Atividades de Lazer / Cultura$50€$ cada4 cada',
  ],
});

export const CHAPTER8_RESOURCES = Object.freeze([
  {
    title: 'Área das Pessoas',
    color: 'people',
    groups: ['Podcasts:', 'Livros:', 'Infanto-Juvenil:', 'Cinema e Animação:'],
  },
  {
    title: 'Área do Planeta',
    color: 'planet',
    groups: ['Podcasts:', 'Livros:', 'Cinema e Documentários:'],
  },
  {
    title: 'Área da Prosperidade',
    color: 'prosperity',
    groups: ['Livros:', 'Cinema e Documentários:', 'TED Talks:'],
  },
  {
    title: 'Área da Paz',
    color: 'peace',
    groups: ['Livros:', 'Cinema e Séries:', 'Música:'],
  },
  {
    title: 'Área das Parcerias',
    color: 'partnerships',
    groups: ['Livros:', 'Cinema:'],
  },
]);

export const REFERENCE_ENTRIES = Object.freeze([
  'Baden-Powell, R. — Escutismo para Rapazes (Edição CNE, 1999).',
  'Instituto Camões, I.P. — Estratégia Nacional de Educação para o Desenvolvimento 2018-2022 (2018).',
  "European Youth Forum — European Youth Organisations' Contributions to the 2030 Agenda (2018).",
  'Instituto Nacional de Estatística (INE) — Objetivos de Desenvolvimento Sustentável: Indicadores para Portugal 2010-2019 (2020).',
  'Rede para o Desenvolvimento — Os Municípios e os ODS: Manual de Ação Local para a Transformação Global (2020).',
  'World Commission on Environment and Development — Our Common Future (Relatório Brundtland) (1987).',
  'Secretaria Internacional do CNE — Parcerias: Objetivos, colaboração, corresponsabilidade e aprendizagem (2015).',
  'Organização das Nações Unidas — Resolução A/RES/70/1: Transforming our World — The 2030 Agenda for Sustainable Development (2015).',
]);

export const TOOL_ENTRIES = Object.freeze([
  'Plataforma Oficial dos ODS em Portugal: ods.pt',
  'Calculadora Oficial da Pegada Ecológica: footprintcalculator.org',
]);

export const INDEX_ENTRIES = Object.freeze([
  { text: CHAPTERS[0].indexHeading, target: '#/capitulo/1' },
  { text: CHAPTERS[1].indexHeading, target: '#/capitulo/2' },
  { text: CHAPTERS[1].subsections[0].indexHeading, target: '#/capitulo/2', anchor: '2-1-os-ods-e-a-agenda-2030' },
  { text: CHAPTERS[1].subsections[1].indexHeading, target: '#/capitulo/2', anchor: '2-2-o-cne-e-os-ods' },
  { text: CHAPTERS[1].subsections[2].indexHeading, target: '#/capitulo/2', anchor: '2-3-a-omme-e-os-ods' },
  { text: CHAPTERS[2].indexHeading, target: '#/capitulo/3' },
  { text: CHAPTERS[2].subsections[0].indexHeading, target: '#/capitulo/3', anchor: '3-1-area-educativa' },
  { text: CHAPTERS[2].subsections[1].indexHeading, target: '#/capitulo/3', anchor: '3-2-area-operacional' },
  { text: CHAPTERS[3].indexHeading, target: '#/capitulo/4' },
  { text: CHAPTERS[4].indexHeading, target: '#/capitulo/5' },
  { text: CHAPTERS[5].indexHeading, target: '#/capitulo/6' },
  { text: CHAPTERS[6].indexHeading, target: '#/capitulo/7' },
  ...CHAPTER7_AREAS.map((area) => ({
    text: `${area.title} (6 Atividades)`,
    target: '#/capitulo/7',
    anchor: `area-${slugify(area.title)}`,
  })),
  { text: CHAPTERS[7].indexHeading, target: '#/capitulo/8' },
  { text: TOP_LEVEL_MARKERS.references, target: '#/referencias' },
]);

export const VALID_MATH = Object.freeze([
  String.raw`\text{CO}_2`,
  String.raw`40-60\text{ s}`,
  String.raw`\text{O}^-`,
  String.raw`2\text{ mm}`,
  String.raw`10\text{ mm}`,
  String.raw`50\% + 1`,
]);

export const EXTERNAL_DOMAINS = Object.freeze(['ods.pt', 'footprintcalculator.org']);
