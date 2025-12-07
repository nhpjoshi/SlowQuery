const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const readline = require("readline");

// ---------- Generic CLI question helper ----------
function askQuestion(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// ---------- Get threshold (durationMillis) ----------
async function getThresholdFromArgsOrPrompt() {
  const arg = process.argv[2];

  if (arg && !isNaN(Number(arg))) {
    const val = Number(arg);
    console.log(`Using threshold from CLI argument: ${val} ms`);
    return val;
  }

  const answer = await askQuestion(
    "Enter slow query duration threshold in ms (example: 500): "
  );
  const num = Number(answer);

  if (isNaN(num) || num <= 0) {
    console.log("Invalid threshold. Defaulting to 500ms.");
    return 500;
  }

  console.log(`Using threshold: ${num} ms`);
  return num;
}

// ---------- Get projectId (GROUP_ID) ----------
async function getProjectIdFromArgsOrPrompt() {
  const arg = process.argv[3];

  if (arg) {
    console.log(`Using projectId from CLI argument: ${arg}`);
    return arg;
  }

  const answer = await askQuestion("Enter Atlas Project ID (GROUP_ID): ");
  const projectId = answer.trim();

  if (!projectId) {
    console.log("No projectId entered. Exiting.");
    process.exit(1);
  }

  console.log(`Using projectId: ${projectId}`);
  return projectId;
}

// ---------- Get 'since' (epoch ms) based on HOURS ----------
async function getSinceMsFromArgsOrPrompt() {
  const arg = process.argv[4];

  if (arg && !isNaN(Number(arg))) {
    const hours = Number(arg);
    if (hours > 0) {
      const sinceMs = Date.now() - hours * 60 * 60 * 1000;
      console.log(
        `Using 'since' from CLI: now - ${hours} hours → ${sinceMs} (epoch ms)`
      );
      return { sinceMs, hours };
    }
  }

  const answer = await askQuestion(
    "Look back how many HOURS for slow queries? (blank = last 24h default): "
  );
  const trimmed = answer.trim();

  if (!trimmed) {
    console.log("No lookback specified → API default (previous 24 hours).");
    return { sinceMs: null, hours: null };
  }

  const hours = Number(trimmed);
  if (isNaN(hours) || hours <= 0) {
    console.log("Invalid hours → using API default (previous 24 hours).");
    return { sinceMs: null, hours: null };
  }

  const sinceMs = Date.now() - hours * 60 * 60 * 1000;
  console.log(`Using 'since' = now - ${hours} hours → ${sinceMs} (epoch ms)`);

  return { sinceMs, hours };
}

// ---------- Run shell with MODE=LIST_PROCESSES ----------
function listProcesses(projectId) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "slow_queries.sh");

    const child = spawn("bash", [scriptPath], {
      env: {
        ...process.env,
        GROUP_ID: projectId,
        MODE: "LIST_PROCESSES",
      },
    });

    let stdoutData = "";
    let stderrData = "";

    child.stdout.on("data", (data) => (stdoutData += data.toString()));
    child.stderr.on("data", (data) => (stderrData += data.toString()));

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdoutData);
      } else {
        reject(new Error(`LIST_PROCESSES error:\n${stderrData}`));
      }
    });
  });
}

// ---------- Run shell with MODE=FETCH_SLOW ----------
function fetchSlowForProcess(projectId, processId, sinceMs) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "slow_queries.sh");

    const env = {
      ...process.env,
      GROUP_ID: projectId,
      MODE: "FETCH_SLOW",
      PROCESS_ID: processId,
    };

    if (sinceMs != null) {
      env.SINCE_MS = String(sinceMs);
    }

    const child = spawn("bash", [scriptPath], { env });

    let stdoutData = "";
    let stderrData = "";

    child.stdout.on("data", (data) => (stdoutData += data.toString()));
    child.stderr.on("data", (data) => (stderrData += data.toString()));

    child.on("close", (code) => {
      if (code === 0) resolve(stdoutData);
      else
        reject(new Error(`FETCH_SLOW error for ${processId}:\n${stderrData}`));
    });
  });
}

// ---------- Group processes by clusterName ----------
function groupProcessesByCluster(raw) {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{") && l.endsWith("}"));

  const clusters = {};

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);

      if (!obj.id) continue;

      const clusterName = obj.clusterName || "UNKNOWN_CLUSTER";

      if (!clusters[clusterName]) clusters[clusterName] = [];
      clusters[clusterName].push({
        id: obj.id,
        typeName: obj.typeName,
        userAlias: obj.userAlias,
      });
    } catch {
      console.log("Skipping invalid process JSON line...");
    }
  }

  return clusters;
}

// ---------- Let user choose a cluster ----------
async function chooseCluster(clusters) {
  const names = Object.keys(clusters);

  if (names.length === 0) throw new Error("No clusters found.");

  console.log("\nAvailable clusters:");
  names.forEach((name, idx) => {
    console.log(`${idx + 1}) ${name}  (${clusters[name].length} processes)`);
  });

  const ans = await askQuestion("\nSelect a cluster number: ");
  const idx = Number(ans) - 1;

  if (isNaN(idx) || idx < 0 || idx >= names.length) {
    throw new Error("Invalid cluster selection.");
  }

  const chosen = names[idx];
  console.log(`\nSelected cluster: ${chosen}`);

  return { clusterName: chosen, processes: clusters[chosen] };
}

// ---------- Parse slow queries ----------
function extractSlowQueries(rawText, threshold) {
  const results = [];

  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{") && l.endsWith("}"));

  for (const line of lines) {
    try {
      const outer = JSON.parse(line);

      const inner = JSON.parse(outer.line);

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
    const projectId = await getProjectIdFromArgsOrPrompt();
    const { sinceMs, hours } = await getSinceMsFromArgsOrPrompt();

    console.log("\nListing processes...");
    const processRaw = await listProcesses(projectId);

    const clusters = groupProcessesByCluster(processRaw);
    const { clusterName, processes } = await chooseCluster(clusters);

    let allSlow = [];

    for (const p of processes) {
      console.log(`\nFetching slow queries for process ${p.id}`);
      const slowRaw = await fetchSlowForProcess(projectId, p.id, sinceMs);
      const extracted = extractSlowQueries(slowRaw, threshold);
      allSlow = allSlow.concat(extracted);
    }

    console.log(
      `\nFound ${allSlow.length} slow queries (> ${threshold} ms)${
        hours ? ` in last ${hours} hours` : " (default last 24h)"
      }.`
    );

    allSlow.sort((a, b) => b.durationMillis - a.durationMillis);

    const safeCluster = clusterName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const suffix =
      hours != null ? `${threshold}_${hours}h` : `${threshold}_24hDefault`;

    const outputFile = path.join(
      __dirname,
      `slow_queries_${safeCluster}_${suffix}.json`
    );

    fs.writeFileSync(outputFile, JSON.stringify(allSlow, null, 2));
    console.log(`\nSaved → ${outputFile}`);
  } catch (err) {
    console.error("\nError:", err.message);
  }
}

if (require.main === module) main();
