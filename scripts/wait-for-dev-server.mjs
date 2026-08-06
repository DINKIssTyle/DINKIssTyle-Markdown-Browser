import http from "node:http";

const target = new URL(process.argv[2] ?? "http://localhost:9245");
const deadline = Date.now() + 15_000;

function retry(message) {
  if (Date.now() >= deadline) {
    console.error(`Frontend dev server did not become ready: ${message}`);
    process.exit(1);
  }
  setTimeout(probe, 100);
}

function probe() {
  let settled = false;
  const finish = (callback) => {
    if (settled) return;
    settled = true;
    callback();
  };

  const request = http.get(target, (response) => {
    response.resume();
    if (response.statusCode && response.statusCode < 500) {
      finish(() => {
        console.log(`Frontend dev server is ready at ${target}`);
        process.exit(0);
      });
      return;
    }
    finish(() => retry(`HTTP ${response.statusCode ?? "unknown"}`));
  });

  request.setTimeout(500, () => {
    request.destroy();
    finish(() => retry("request timed out"));
  });
  request.on("error", (error) => finish(() => retry(error.message)));
}

probe();
