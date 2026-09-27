// Dados territoriais consolidados a partir da lista de equipes fornecida em 22/08/2026.
const teams = {
  M: { name: "Margarida", color: "#ffffff", colorName: "Branca", doctor: "ITALA", nurse: "SHEILA" },
  L: { name: "Lilás", color: "#7b55a3", colorName: "Violeta", doctor: "MONIZE", nurse: "SANDRELLE" },
  I: { name: "Ipê", color: "#9c5a64", colorName: "Rosé Gold", doctor: "FERNANDA", nurse: "MARIANA" },
  O: { name: "Orquídea", color: "#2f93c7", colorName: "Azul", doctor: "FELIPE", nurse: "ASTENIA" },
  G: { name: "Girassol", color: "#f6c453", colorName: "Amarela", doctor: "HENRIQUE", nurse: "SANDY" },
} as const;

type TeamCode = keyof typeof teams;
type TerritoryRow = [street: string, team: TeamCode, agent: string, rangeStart?: string, rangeEnd?: string];

const rows: TerritoryRow[] = [
  ["AGOSTINHO GERVILHA", "M", "MICHELE"], ["ANTONIO BAGNE", "L", "JANAINA"], ["ANTONIO RODRIGUES MARTINHO", "L", "MARINALVA"],
  ["ARISTIDES PRADO", "L", "JANAINA", "17", "83"], ["ARISTIDES PRADO", "L", "MARINALVA"], ["ARMANDO PEREIRA", "L", "LUCAS", "0", "398"],
  ["ARMANDO SEMENCE", "I", "MAYCON"], ["ATTILIO DE BARROS", "L", "MARINALVA"], ["BENEDITO CUCHARO", "O", "PRISCILA"],
  ["CLARA LIGERI DA SILVA", "L", "JANAINA"], ["DANIEL PELLIZZARI", "I", "MAYCON"],
  ["DARIO BOCCHINO", "L", "JANAINA", "3772", "3860"], ["DARIO BOCCHINO", "G", "MARIA", "1612", "1716"], ["DARIO BOCCHINO", "L", "MARINALVA", "3914", "4080"],
  ["DARIO BOCCHINO", "M", "MICHEL", "26", "360"], ["DARIO BOCCHINO", "M", "MICHEL", "3130", "3750"], ["DARIO BOCCHINO", "G", "VERA", "1726", "2460"], ["DARIO BOCCHINO", "I", "GUILHERME", "2466", "3114"],
  ["DO VARJAO", "G", "ELIENE", "2021", "2559"], ["DO VARJAO", "L", "JANAINA", "3685", "4059"], ["DO VARJAO", "G", "MARIA", "1609", "2019"],
  ["DO VARJAO", "M", "MICHELE", "3321", "3628"], ["DO VARJAO", "I", "VILMA", "2567", "3301"], ["DO VARJAO", "M", "MICHELE", "2960", "2960"], ["DO VARJAO", "M", "MICHELE", "3028", "3028"],
  ["DOMINGOS ROBERTO SCHIAVO", "L", "LUCAS"], ["DOUTOR JOSE MARCUS GNACCARINI THOMAZESKI", "I", "MAYCON"], ["EUCLIDIO FOLGOSI", "O", "JOSILENE"],
  ["FELIZARDO SILVESTRE", "O", "PRISCILA", "109", "109"], ["FELIZARDO SILVESTRE", "O", "RENILDA", "110", "292"], ["FRANCISCO ALVES RODRIGUES", "M", "ADRIELE"], ["FRANCISCO ROVERI", "L", "JANAINA"],
  ["GERALDINA DA SILVA ROCHA PEREIRA", "L", "LUCAS", "0", "436"], ["GERALDINA DA SILVA ROCHA PEREIRA", "M", "MICHEL", "436"],
  ["GERALDO GOMES DE PAULA", "M", "ADRIELE", "464", "778"], ["GERALDO GOMES DE PAULA", "L", "MARCIA", "0", "328"], ["GLAUCIA CRISTINA LOPES VIANA", "I", "MAYCON"],
  ["IDA BERGAMINI BUENO", "O", "PRISCILA", "136", "136"], ["IDA BERGAMINI BUENO", "O", "RENILDA", "127", "274"], ["JOAQUIM GONCALVES NETO", "O", "JOSILENE"],
  ["JOSE BENEDITO CONSTANTINO ROSA", "M", "MICHEL"], ["JOSE COELHO MONIZ", "O", "JOSILENE", "26", "62"], ["JOSE COELHO MONIZ", "O", "PRISCILA", "72", "217"],
  ["JOSE DIAS SOBRINHO", "O", "JOSILENE", "0", "167"], ["JOSE DIAS SOBRINHO", "O", "ANGELA", "167"], ["JOSE RIBEIRO BARBOSA", "L", "MARCIA"], ["JOSE SALCEDO GARCIA", "I", "MAYCON"],
  ["JOSEPHINA RAZERA COSIMATTI", "O", "PRISCILA"], ["JOSIANA MARIA DE JESUS OLIVEIRA", "O", "ANGELA"], ["LAURO PACHECO NETO", "M", "ZENILDA"], ["LORENA ELIZABETH PYLES", "M", "MICHEL"],
  ["LUIZ GONZAGA GIL", "L", "MARINALVA"], ["MADRE TERESA DE CALCUTA", "L", "MARCIA"], ["MARCEL ACCIOLY CAETANO DA SILVA", "O", "JOSILENE"],
  ["MARIANO LATORRE", "L", "MARCIA", "23", "71"], ["MARIANO LATORRE", "L", "MARINALVA", "263", "377"], ["MESIEDES BEGO", "M", "MICHELE"],
  ["NEUSA MARTINS DIAS", "O", "ANGELA"], ["NEUSA MARTINS DIAS", "O", "RENILDA", "22", "122"], ["PASCOAL FERRARI", "L", "MARINALVA"],
  ["PASTOR FRANCESCO CIARAMELLA", "L", "JANAINA", "70", "3685"], ["PASTOR FRANCESCO CIARAMELLA", "L", "LUCAS", "272", "370"], ["PASTOR FRANCESCO CIARAMELLA", "L", "MARCIA", "180", "180"],
  ["PROFESSOR RAYMUNDO FAGGIANO", "L", "MARINALVA"], ["ROGERIO TONETTI", "O", "RENILDA"], ["ROQUE MARCELINO", "L", "MARCIA"], ["RUBENS ANTONIO CURSIO", "L", "MARINALVA"],
  ["THOMAZ LUIZ", "I", "MAYCON"], ["TITO LIVIO MEIRELLES", "M", "MICHEL"], ["ALBERTO RABELLO PORTELLA", "I", "MAYCON"],
];

export const territorySeed = rows.map(([street, teamCode, communityAgent, rangeStart, rangeEnd]) => ({
  street,
  ...(rangeStart ? { rangeStart } : {}),
  ...(rangeEnd ? { rangeEnd } : {}),
  team: { ...teams[teamCode], communityAgent },
}));
