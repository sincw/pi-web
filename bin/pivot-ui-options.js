"use strict";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseArgs } = require("util");

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function isEnabled(value) {
  return typeof value === "string" && TRUE_VALUES.has(value.trim().toLowerCase());
}

function parseLaunchOptions(args = process.argv.slice(2), env = process.env) {
  const { values: cliArgs } = parseArgs({
    args,
    options: {
      port:      { type: "string", short: "p" },
      hostname:  { type: "string", short: "H" },
      "no-open": { type: "boolean" },
    },
    strict: false,
  });

  return {
    port: cliArgs.port ?? env.PORT ?? "30141",
    hostname: cliArgs.hostname ?? env.HOSTNAME ?? null,
    openBrowser: !cliArgs["no-open"] && !isEnabled(env.PIVOT_UI_NO_OPEN),
  };
}

module.exports = { parseLaunchOptions };
