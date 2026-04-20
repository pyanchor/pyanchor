/**
 * Tiny zero-dependency interactive prompt helpers built on
 * node:readline/promises. Pyanchor avoids any new runtime dep on the
 * critical path, so we don't pull in `prompts` / `inquirer` /
 * `@clack/prompts` for the init flow.
 *
 * Scope is intentionally minimal: text input with default + select
 * from a list + yes/no confirm. Anything fancier (multi-select,
 * spinner, group) belongs in a third-party lib if we ever need it.
 *
 * If stdin is not a TTY (CI, piped invocation), every prompt
 * immediately returns the default — same UX as `npm init -y`.
 */

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const isTTY = (): boolean => Boolean(input.isTTY);

/**
 * Ask a free-form question. Returns trimmed input or the default
 * if the user just hits enter.
 */
export async function ask(question: string, defaultValue?: string): Promise<string> {
  if (!isTTY()) return defaultValue ?? "";
  const rl = readline.createInterface({ input, output });
  try {
    const hint = defaultValue ? ` (${defaultValue})` : "";
    const answer = (await rl.question(`? ${question}${hint}: `)).trim();
    return answer || defaultValue || "";
  } finally {
    rl.close();
  }
}

/**
 * Ask a yes/no question. Default is treated as "yes" if not given.
 */
export async function confirm(question: string, defaultYes = true): Promise<boolean> {
  if (!isTTY()) return defaultYes;
  const rl = readline.createInterface({ input, output });
  try {
    const hint = defaultYes ? "Y/n" : "y/N";
    const answer = (await rl.question(`? ${question} (${hint}): `)).trim().toLowerCase();
    if (!answer) return defaultYes;
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

/**
 * Ask the user to pick one item from a list. Returns the selected
 * value or the default. The list is rendered as a numbered menu;
 * the user types the number OR the value itself.
 */
export async function select<T extends string>(
  question: string,
  options: ReadonlyArray<{ value: T; label?: string }>,
  defaultValue?: T
): Promise<T> {
  if (!isTTY()) return defaultValue ?? options[0].value;
  if (options.length === 0) {
    throw new Error("select() requires at least one option");
  }

  console.log(`? ${question}`);
  options.forEach((opt, i) => {
    const marker = opt.value === defaultValue ? "›" : " ";
    const label = opt.label ? ` — ${opt.label}` : "";
    console.log(`  ${marker} ${i + 1}. ${opt.value}${label}`);
  });

  const rl = readline.createInterface({ input, output });
  try {
    while (true) {
      const hint = defaultValue ? ` (${defaultValue})` : "";
      const answer = (await rl.question(`> Pick one${hint}: `)).trim();
      if (!answer && defaultValue) return defaultValue;

      // Numeric index?
      const asNum = Number.parseInt(answer, 10);
      if (Number.isFinite(asNum) && asNum >= 1 && asNum <= options.length) {
        return options[asNum - 1].value;
      }

      // Exact value match?
      const match = options.find((o) => o.value === answer);
      if (match) return match.value;

      console.log(`  → "${answer}" is not one of the options. Pick a number 1–${options.length} or the exact value.`);
    }
  } finally {
    rl.close();
  }
}
