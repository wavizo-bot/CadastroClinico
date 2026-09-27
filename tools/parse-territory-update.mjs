import fs from "node:fs";

const source = fs.readFileSync("/home/ubuntu/upload/pasted_content_4.txt", "utf8");
const colors = {
  Branca: "#ffffff",
  Violeta: "#7b55a3",
  "Rosé Gold": "#9c5a64",
  Azul: "#2f93c7",
  Amarela: "#f6c453",
};

function parseTsv(input) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "\t" && !quoted) {
      row.push(cell); cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else cell += character;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

const entries = parseTsv(source).slice(1).flatMap((row) => {
  const [name, colorName, nurse, doctor, communityAgent, rangeStart, rangeEnd, rawStreet] = row.map((value) => value.trim().replace(/\s+/g, " "));
  const street = rawStreet.replace(/^DR\.?\s+/i, "DOUTOR ").toUpperCase();
  const team = { name, color: colors[colorName], colorName, doctor, nurse, communityAgent };
  if (/^DO VARJAO, APENAS 2960 E 3028$/i.test(street)) {
    return ["2960", "3028"].map((number) => ({ street: "DO VARJAO", rangeStart: number, rangeEnd: number, team }));
  }
  return [{ street, ...(rangeStart ? { rangeStart } : {}), ...(rangeEnd ? { rangeEnd } : {}), team }];
});

console.log(JSON.stringify(entries, null, 2));
