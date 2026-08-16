import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..", "..");
const distEmbedded = join(packageRoot, "dist-embedded");
const require = createRequire(import.meta.url);
const jazzToolsPackageRoot = dirname(require.resolve("jazz-tools/package.json"));
const brokerWorkerPath = join(jazzToolsPackageRoot, "dist", "worker", "jazz-broker-worker.js");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function extOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i === -1 ? "" : path.slice(i);
}

test.describe("inspector overlay (embedded, own worker connection end-to-end)", () => {
  test.beforeAll(() => {
    if (!existsSync(join(distEmbedded, "embedded.html"))) {
      execFileSync("pnpm", ["run", "build:embedded"], {
        cwd: packageRoot,
        stdio: "inherit",
      });
    }
  });

  test("embedded inspector opens its own worker connection from the published host handle", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    // The host and embedded Inspector must construct their SharedWorker from the
    // exact same URL. Serve the worker shipped by the pinned jazz-tools package
    // at a stable URL instead of allowing Vite to expose a node_modules path
    // whose rewriting differs across the host and embedded bundles.
    await page.route("**/__jazz/test-broker-worker.js", async (route) => {
      const body = await readFile(brokerWorkerPath);
      await route.fulfill({
        contentType: "text/javascript; charset=utf-8",
        body,
      });
    });

    await page.route("**/__jazz/embedded/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const rel =
        pathname.replace(/^.*\/__jazz\/embedded\/?/, "").replace(/^\/+/, "") || "embedded.html";
      const filePath = join(distEmbedded, rel);
      try {
        const body = await readFile(filePath);
        await route.fulfill({
          contentType: MIME[extOf(filePath)] ?? "application/octet-stream",
          body,
        });
      } catch {
        await route.fulfill({ status: 404, body: "Not found" });
      }
    });

    await page.goto("/tests/browser/overlay-host.html");

    try {
      await expect(page.getByText("Host ready")).toBeVisible({ timeout: 20_000 });
    } catch (error) {
      const body = await page.locator("body").innerText().catch(() => "<unavailable>");
      throw new Error(
        [
          "Overlay host did not become ready.",
          `body=${JSON.stringify(body)}`,
          `pageErrors=${JSON.stringify(pageErrors)}`,
          `consoleErrors=${JSON.stringify(consoleErrors)}`,
        ].join("\n"),
        { cause: error },
      );
    }

    const inspector = page.frameLocator('iframe[title="jazz-inspector"]');

    const brokerWorkerUrl = await page.evaluate(
      () =>
        (
          window as unknown as {
            __jazzInspectorHost?: {
              getConnectionConfig(): { runtimeSources?: { brokerWorkerUrl?: string } };
            };
          }
        ).__jazzInspectorHost?.getConnectionConfig().runtimeSources?.brokerWorkerUrl,
    );
    expect(brokerWorkerUrl).toBe(new URL("/__jazz/test-broker-worker.js", page.url()).href);

    await expect(inspector.getByText("Connecting…")).toBeHidden({ timeout: 30_000 });

    await expect(inspector.getByRole("link", { name: "Data Explorer" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(inspector.getByRole("link", { name: "View todos data" })).toBeVisible({
      timeout: 30_000,
    });

    await inspector.getByRole("link", { name: "Subscriptions" }).click();
    await expect(inspector.getByRole("cell", { name: "todos", exact: true })).toBeVisible({
      timeout: 30_000,
    });
  });
});
