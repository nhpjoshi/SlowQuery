const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const readline = require("readline");

// ---------- Ask for threshold or read from CLI ----------
function getThresholdFromArgsOrPrompt() {
  return new Promise((resolve) => {
    const arg = process.argv[2];

    if (arg && !isNaN(Number(arg))) {
      const val = Number(arg);
      console.log(`Using threshold from CLI argument: ${val} ms`);
      return resolve(val);
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(
      "Enter slow query threshold in ms (example: 500): ",
      (answer) => {
        rl.close();
        const num = Number(answer);

        if (isNaN(num) || num <= 0) {
          console.log("Invalid threshold. Defaulting to 500ms.");
          return resolve(500);
        }

        console.log(`Using threshold: ${num} ms`);
        resolve(num);
      }
    );
  });
}

// ---------- Execute the Shell Script ----------
function runSlowQueriesScript() {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "slow_queries.sh");

    const child = spawn("bash", [scriptPath]);

    let stdoutData = "";
    let stderrData = "";

    child.stdout.on("data", (data) => (stdoutData += data.toString()));
    child.stderr.on("data", (data) => (stderrData += data.toString()));

    child.on("close", (code) => {
      if (code === 0) resolve(stdoutData);
      else reject(new Error(`Shell script error:\n${stderrData}`));
    });
  });
}

// ---------- Parse, Unstringify, Filter ----------
function extractSlowQueries(rawText, threshold) {
  const results = [];

  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{") && l.endsWith("}"));

  for (const line of lines) {
    try {
      const outer = JSON.parse(line);
      if (!outer.line) continue;

      const inner = JSON.parse(outer.line); // unstringify JSON log

      const ms = inner?.attr?.durationMillis;

      if (typeof ms === "number" && ms > threshold) {
        results.push({
          namespace: outer.namespace,
          durationMillis: ms,
          log: inner,
        });
      }
    } catch {
      console.log("Skipping invalid JSON line...");
    }
  }

  return results;
}

// ---------- Main ----------
async function main() {
  try {
    const threshold = await getThresholdFromArgsOrPrompt();

    const outputFilename = path.join(
      __dirname,
      `slow_queries_filtered_${threshold}.json`
    );

    console.log("Running shell script...");
    const raw = await runSlowQueriesScript();

    console.log("Filtering results...");
    let queries = extractSlowQueries(raw, threshold);

    console.log(`Found ${queries.length} slow queries (> ${threshold} ms)`);

    // ---------- SORT DESCENDING by durationMillis ----------
    queries.sort((a, b) => b.durationMillis - a.durationMillis);

    // Write sorted results
    fs.writeFileSync(outputFilename, JSON.stringify(queries, null, 2));

    console.log(`Saved sorted results → ${outputFilename}`);
  } catch (err) {
    console.error("Error:", err.message);
  }
}

if (require.main === module) main();

module.exports = { runSlowQueriesScript, extractSlowQueries };
