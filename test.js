const fs = require("fs");
const parser = require('./');

const main = async () => {
  const logs = JSON.parse(
    fs.readFileSync("../calibre/reporter/last-run/devtools-logs.json", "utf8")
  );

  let har = await parser.harFromMessages(logs, { debug: true });
  fs.writeFileSync("./har.json", JSON.stringify(har));
};

main();
