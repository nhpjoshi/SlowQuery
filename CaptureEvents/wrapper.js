// wrapper.js
const { spawn } = require("child_process");
const readline = require("readline");
const path = require("path");

// Path to the shell script
const SCRIPT_PATH = path.join(__dirname, "getevent.sh");

// Try to read from CLI args first: node wrapper.js <PROJECT_ID> [CLUSTER_NAME]
let projectId = process.argv[2];
let clusterName = process.argv[3];

function runShellScript(projectId, clusterName) {
  const args = [projectId];
  if (clusterName) {
    args.push(clusterName);
  }

  console.log(`\nRunning: ${SCRIPT_PATH} ${args.join(" ")}`);

  const child = spawn(SCRIPT_PATH, args, {
    stdio: "inherit", // inherit stdio so you see curl output and echo from script
  });

  child.on("error", (err) => {
    console.error("Failed to start shell script:", err.message);
  });

  child.on("exit", (code) => {
    if (code === 0) {
      console.log("Script completed successfully.");
    } else {
      console.error(`Script exited with code ${code}.`);
    }
  });
}

// If PROJECT_ID not provided via CLI, ask interactively
if (!projectId) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question("Enter Atlas Project ID: ", (pid) => {
    projectId = pid.trim();

    if (!projectId) {
      console.error("PROJECT_ID is required. Exiting.");
      rl.close();
      process.exit(1);
    }

    rl.question(
      "Enter Cluster Name (optional, press Enter to skip): ",
      (cname) => {
        clusterName = cname.trim() || undefined;
        rl.close();
        runShellScript(projectId, clusterName);
      }
    );
  });
} else {
  // PROJECT_ID from CLI, cluster name optional
  runShellScript(projectId, clusterName);
}
