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
  const arg = process.argv[2]; // node runSlowQueries.js <threshold> <projectId> <lookbackMinutes>

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
  const arg = process.argv[3]; // node runSlowQueries.js <threshold> <projectId> <lookbackMinutes>

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

// ---------- Get 'since' (epoch ms) based on lookback minutes ----------
async function getSinceMsFromArgsOrPrompt() {
  const arg = process.argv[4]; // node runSlowQueries.js <threshold> <projectId> <lookbackMinutes>

  if (arg && !isNaN(Number(arg))) {
    const minutes = Number(arg);
    if (minutes > 0) {
      const sinceMs = Date.now() - minutes * 60 * 1000;
      console.log(
        `Using 'since' from CLI: now - ${minutes} minutes → ${sinceMs} (epoch ms)`
      );
      return { sinceMs, lookbackMinutes: minutes };
    }
  }

  const answer = await askQuestion(
    "Look back how many minutes for slow queries? (blank = last 24h by default from API): "
  );
  const trimmed = answer.trim();

  if (!trimmed) {
    console.log("No lookback specified → API default (previous 24 hours).");
    return { sinceMs: null, lookbackMinutes: null };
  }

  const minutes = Number(trimmed);
  if (isNaN(minutes) || minutes <= 0) {
    console.log("Invalid minutes → using API default (previous 24 hours).");
    return { sinceMs: null, lookbackMinutes: null };
  }

  const sinceMs = Date.now() - minutes * 60 * 1000;
  console.log(
    `Using 'since' = now - ${minutes} minutes → ${sinceMs} (epoch ms)`
  );
  return { sinceMs, lookbackMinutes: minutes };
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
      env.SINCE_MS = String(sinceMs); // used by shell as ?since=<epoch ms>
    }

    const child = spawn("bash", [scriptPath], { env });

    let stdoutData = "";
    let stderrData = "";

    child.stdout.on("data", (data) => (stdoutData += data.toString()));
    child.stderr.on("data", (data) => (stderrData += data.toString()));

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdoutData);
      } else {
        reject(new Error(`FETCH_SLOW error for ${processId}:\n${stderrData}`));
      }
    });
  });
}

// ---------- Group processes by clusterName ----------
function groupProcessesByCluster(raw) {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{") && l.endsWith("}"));

  const clusters = {}; // { [clusterName]: [ {id, typeName, userAlias}, ... ] }

  for (const line of lines) {
    try {
      const obj = JSON.parse(line); // {id, typeName, userAlias, clusterName}
      if (!obj.id) continue;

      const clusterName = obj.clusterName || "UNKNOWN_CLUSTER";

      if (!clusters[clusterName]) clusters[clusterName] = [];
      clusters[clusterName].push({
        id: obj.id,
        typeName: obj.typeName || "UNKNOWN",
        userAlias: obj.userAlias || "UNKNOWN",
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

  if (names.length === 0) {
    throw new Error("No clusters found from processes.");
  }

  console.log(
    "\nAvailable clusters (derived from userAlias before '-shard-'):"
  );
  names.forEach((name, idx) => {
    console.log(
      `${idx + 1}) cluster: ${name}  (processes: ${clusters[name].length})`
    );
  });

  const answer = await askQuestion(
    "\nSelect a cluster to analyse slow queries (enter number): "
  );
  const idx = Number(answer) - 1;

  if (isNaN(idx) || idx < 0 || idx >= names.length) {
    throw new Error("Invalid cluster selection.");
  }

  const chosenName = names[idx];
  const processes = clusters[chosenName];

  console.log(`\nSelected cluster: ${chosenName}`);
  console.log("Processes in this cluster:");
  processes.forEach((p) =>
    console.log(` - ${p.typeName} | ${p.userAlias} | id: ${p.id}`)
  );

  return { clusterName: chosenName, processes };
}

// ---------- Parse slow queries & filter by durationMillis ----------
function extractSlowQueries(rawText, threshold) {
  const results = [];

  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{") && l.endsWith("}"));

  for (const line of lines) {
    try {
      const outer = JSON.parse(line); // has .line and .namespace
      if (!outer.line) continue;

      const inner = JSON.parse(outer.line); // log JSON from MongoDB
      const ms = inner?.attr?.durationMillis;

      if (typeof ms === "number" && ms > threshold) {
        results.push({
          namespace: outer.namespace,
          durationMillis: ms,
          log: inner,
        });
      }
    } catch {
      console.log("Skipping invalid JSON line (slow query)...");
    }
  }

  return results;
}

// ---------- Main ----------
async function main() {
  try {
    const threshold = await getThresholdFromArgsOrPrompt();
    const projectId = await getProjectIdFromArgsOrPrompt();
    const { sinceMs, lookbackMinutes } = await getSinceMsFromArgsOrPrompt();

    console.log("\nListing processes from Atlas...");
    const processRaw = await listProcesses(projectId);

    const clusters = groupProcessesByCluster(processRaw);
    const { clusterName, processes } = await chooseCluster(clusters);

    let allSlowQueries = [];

    for (const p of processes) {
      console.log(`\nFetching slow queries for process: ${p.id}`);
      const slowRaw = await fetchSlowForProcess(projectId, p.id, sinceMs);
      const slowForProcess = extractSlowQueries(slowRaw, threshold);
      allSlowQueries = allSlowQueries.concat(slowForProcess);
    }

    console.log(
      `\nTotal slow queries (> ${threshold} ms) for cluster "${clusterName}"${
        lookbackMinutes ? ` in last ${lookbackMinutes} minutes` : ""
      }: ${allSlowQueries.length}`
    );

    // Sort by durationMillis descending
    allSlowQueries.sort((a, b) => b.durationMillis - a.durationMillis);

    const safeCluster = clusterName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const suffix =
      lookbackMinutes != null
        ? `${threshold}_${lookbackMinutes}m`
        : `${threshold}_24hDefault`;

    const outputFilename = path.join(
      __dirname,
      `slow_queries_cluster_${safeCluster}_${suffix}.json`
    );

    fs.writeFileSync(outputFilename, JSON.stringify(allSlowQueries, null, 2));
    console.log(`\nSaved sorted results → ${outputFilename}`);
  } catch (err) {
    console.error("\nError:", err.message);
  }
}

if (require.main === module) main();

module.exports = {
  listProcesses,
  fetchSlowForProcess,
  extractSlowQueries,
  groupProcessesByCluster,
};
