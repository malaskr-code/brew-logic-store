import { Router, type IRouter, type Request, type Response } from "express";
import { CreateCatalogEntryBody, CreateCatalogEntryResponse, UpdateCatalogEntryBody, UpdateCatalogEntryParams, UpdateCatalogEntryResponse, DeleteCatalogEntryParams, GetCatalogResponse, GetAdminCatalogResponse } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/admin";
import { getCatalog, createCatalogEntry, updateCatalogEntry, deleteCatalogEntry, CatalogInputError, CatalogConflictError } from "../lib/catalog-service";

const router: IRouter = Router();
function respondError(req: Request, res: Response, error: unknown) {
  if (error instanceof CatalogInputError) { res.status(400).json({ error: error.message }); return; }
  if (error instanceof CatalogConflictError) { res.status(409).json({ error: error.message }); return; }
  req.log.error("MongoDB catalog operation failed");
  res.status(503).json({ error: "The catalog is unavailable. Please try again." });
}

router.get("/catalog", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  try { res.json(GetCatalogResponse.parse(await getCatalog())); } catch (error) { respondError(req, res, error); }
});
router.get("/admin/catalog", requireAdmin, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  try { res.json(GetAdminCatalogResponse.parse(await getCatalog())); } catch (error) { respondError(req, res, error); }
});
router.post("/admin/catalog", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateCatalogEntryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Check the catalog fields and prices." }); return; }
  try { res.status(201).json(CreateCatalogEntryResponse.parse(await createCatalogEntry(parsed.data))); } catch (error) { respondError(req, res, error); }
});
router.put("/admin/catalog/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateCatalogEntryParams.safeParse(req.params);
  const parsed = UpdateCatalogEntryBody.safeParse(req.body);
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Check the catalog fields and prices." }); return; }
  try {
    const updated = await updateCatalogEntry(params.data.id, parsed.data);
    if (!updated) { res.status(404).json({ error: "Catalog entry not found." }); return; }
    res.json(UpdateCatalogEntryResponse.parse(updated));
  } catch (error) { respondError(req, res, error); }
});
router.delete("/admin/catalog/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteCatalogEntryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid catalog identifier." }); return; }
  try {
    if (!await deleteCatalogEntry(params.data.id)) { res.status(404).json({ error: "Catalog entry not found." }); return; }
    res.status(204).end();
  } catch (error) { respondError(req, res, error); }
});
export default router;
