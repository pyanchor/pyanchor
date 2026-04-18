import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";

import { renderAdminHtml } from "./admin";
import { aiEditConfig } from "./config";
import { cancelAiEdit, getAdminHealth, readAiEditState, startAiEdit } from "./state";
import type { AiEditCancelInput, AiEditStartInput } from "./shared/types";

const app = express();
const runtimeBases = Array.from(new Set([aiEditConfig.runtimeBasePath, aiEditConfig.runtimeAliasPath]));

const setNoStore = (response: Response) => {
  response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
};

const handleError = (response: Response, error: unknown, status = 500) => {
  const message = error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
  setNoStore(response);
  response.status(status).json({ error: message });
};

const serveRuntimeAsset = (fileName: string) => (_request: Request, response: Response) => {
  setNoStore(response);
  response.type("application/javascript");
  response.sendFile(path.join(aiEditConfig.staticDir, fileName));
};

const asyncRoute =
  (handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) =>
  (request: Request, response: Response, next: NextFunction) => {
    void handler(request, response, next).catch(next);
  };

app.disable("x-powered-by");
app.use(express.json({ limit: "128kb" }));

app.get("/healthz", (_request, response) => {
  setNoStore(response);
  response.json({ ok: true });
});

for (const basePath of runtimeBases) {
  app.get(`${basePath}/bootstrap.js`, serveRuntimeAsset("bootstrap.js"));
  app.get(`${basePath}/overlay.js`, serveRuntimeAsset("overlay.js"));

  app.get(
    `${basePath}/api/status`,
    asyncRoute(async (_request, response) => {
      setNoStore(response);
      response.json(await readAiEditState());
    })
  );

  app.post(
    `${basePath}/api/edit`,
    asyncRoute(async (request, response) => {
      setNoStore(response);
      response.json(await startAiEdit(request.body as AiEditStartInput));
    })
  );

  app.post(
    `${basePath}/api/cancel`,
    asyncRoute(async (request, response) => {
      setNoStore(response);
      response.json(await cancelAiEdit(request.body as AiEditCancelInput));
    })
  );
}

app.get(
  "/api/admin/health",
  asyncRoute(async (_request, response) => {
    setNoStore(response);
    response.json(await getAdminHealth());
  })
);

app.get(
  "/api/admin/state",
  asyncRoute(async (_request, response) => {
    setNoStore(response);
    response.json(await readAiEditState());
  })
);

app.get(
  "/",
  asyncRoute(async (_request, response) => {
    setNoStore(response);
    response.type("html").send(renderAdminHtml(await getAdminHealth(), await readAiEditState()));
  })
);

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  handleError(response, error, 500);
});

app.listen(aiEditConfig.port, aiEditConfig.host, () => {
  console.log(`AIG AI edit sidecar listening on http://${aiEditConfig.host}:${aiEditConfig.port}`);
});
