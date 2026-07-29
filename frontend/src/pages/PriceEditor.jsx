import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { money, fmtDateTime } from "../lib/format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Search, Save, History, Tag as TagIcon } from "lucide-react";
import { toast } from "sonner";

// Redondea a la decena más cercana, para no dejar precios de venta como "1483".
const roundNice = (n) => Math.round(n / 10) * 10;

export default function PriceEditor() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  // changes[id] = { sale_price, average_cost, saleTouched }
  const [changes, setChanges] = useState({});
  const [saving, setSaving] = useState(false);
  const [histFor, setHistFor] = useState(null);
  const [history, setHistory] = useState([]);

  const load = async () => setProducts((await api.get("/products", { params: { active_only: true } })).data);
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return products.filter(p =>
      !s || p.name.toLowerCase().includes(s) || (p.plu && p.plu.includes(s))
    );
  }, [products, search]);

  const getRow = (p) => changes[p.id] || { sale_price: p.sale_price, average_cost: p.average_cost, saleTouched: false };

  const detectedMargin = (p) => {
    const cost = Number(p.average_cost);
    if (!cost || cost <= 0) return null;
    return (Number(p.sale_price) - cost) / cost;
  };

  const setCost = (p, newCostStr) => {
    const newCost = Number(newCostStr);
    const cur = getRow(p);
    const next = { ...cur, average_cost: newCostStr };
    if (!cur.saleTouched && !isNaN(newCost) && newCost > 0) {
      const margin = detectedMargin(p);
      if (margin !== null) {
        next.sale_price = String(roundNice(newCost * (1 + margin)));
      }
    }
    setChanges({ ...changes, [p.id]: next });
  };

  const setPrice = (p, newPriceStr) => {
    const cur = getRow(p);
    setChanges({ ...changes, [p.id]: { ...cur, sale_price: newPriceStr, saleTouched: true } });
  };

  const isDirty = (p) => {
    const r = getRow(p);
    const priceChanged = Math.abs(Number(r.sale_price) - Number(p.sale_price)) > 0.01;
    const costChanged = Math.abs(Number(r.average_cost) - Number(p.average_cost)) > 0.01;
    return priceChanged || costChanged;
  };
  const dirtyCount = products.filter(isDirty).length;

  const saveAll = async () => {
    const items = products.filter(isDirty).map(p => {
      const r = getRow(p);
      return { id: p.id, sale_price: Number(r.sale_price), average_cost: Number(r.average_cost) };
    }).filter(it => !isNaN(it.sale_price) && !isNaN(it.average_cost));
    if (!items.length) return toast.info("No hay cambios para guardar");
    setSaving(true);
    try {
      const { data } = await api.patch("/products/bulk-prices", items);
      toast.success(`${data.updated} productos actualizados`);
      setChanges({});
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const showHistory = async (p) => {
    setHistFor(p);
    const { data } = await api.get(`/products/${p.id}/price-history`);
    setHistory(data);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="label-uppercase">Inventario</div>
          <h1 className="text-3xl sm:text-4xl font-semibold mt-1 flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
            <TagIcon className="w-7 h-7" /> Precios rápidos
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Editá costo y venta juntos · al cambiar el costo, el precio de venta se ajusta solo según tu margen habitual · {products.length} productos
          </p>
        </div>
        <Button
          className="bg-[hsl(var(--primary))]"
          disabled={saving || dirtyCount === 0}
          onClick={saveAll}
          data-testid="save-prices-btn"
        >
          <Save className="w-4 h-4 mr-1.5" /> {saving ? "Guardando..." : `Guardar ${dirtyCount > 0 ? `(${dirtyCount})` : ""}`}
        </Button>
      </div>

      <div className="card-soft p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar por nombre o PLU..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="price-search"
          />
        </div>
      </div>

      <div className="card-soft overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50/70 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3 font-medium">PLU</th>
              <th className="text-left px-4 py-3 font-medium">Producto</th>
              <th className="text-right px-4 py-3 font-medium">Costo actual</th>
              <th className="text-right px-4 py-3 font-medium">Nuevo costo</th>
              <th className="text-center px-4 py-3 font-medium">Margen</th>
              <th className="text-right px-4 py-3 font-medium">Venta actual</th>
              <th className="text-right px-4 py-3 font-medium">Nueva venta</th>
              <th className="text-right px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const r = getRow(p);
              const margin = detectedMargin(p);
              const priceChanged = Math.abs(Number(r.sale_price) - Number(p.sale_price)) > 0.01;
              const costChanged = Math.abs(Number(r.average_cost) - Number(p.average_cost)) > 0.01;
              return (
                <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-mono-display text-gray-600">{p.plu || "—"}</td>
                  <td className="px-4 py-3 font-medium">{p.name}<span className="text-xs text-gray-400 ml-1">{p.sale_mode === "per_weight" ? "/kg" : "/u"}</span></td>
                  <td className="px-4 py-3 text-right font-mono-display text-gray-500">{money(p.average_cost)}</td>
                  <td className="px-4 py-3 text-right">
                    <Input
                      type="number"
                      value={r.average_cost}
                      onChange={(e) => setCost(p, e.target.value)}
                      className={`text-right font-mono-display h-9 w-28 ml-auto ${costChanged ? "border-amber-500 bg-amber-50" : ""}`}
                      data-testid={`cost-input-${p.id}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">
                    {margin !== null ? `${(margin * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono-display text-gray-500">{money(p.sale_price)}</td>
                  <td className="px-4 py-3 text-right">
                    <Input
                      type="number"
                      value={r.sale_price}
                      onChange={(e) => setPrice(p, e.target.value)}
                      className={`text-right font-mono-display h-9 w-28 ml-auto ${priceChanged ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5" : ""}`}
                      data-testid={`price-input-${p.id}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => showHistory(p)} title="Historial">
                      <History className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-gray-500">Sin productos</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={!!histFor} onOpenChange={(v) => !v && setHistFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Historial de precios · {histFor?.name}</DialogTitle></DialogHeader>
          {history.length === 0 ? (
            <div className="text-sm text-gray-500 py-6 text-center">Sin cambios registrados</div>
          ) : (
            <div className="space-y-2">
              {history.map(h => (
                <div key={h.id} className="flex justify-between items-center border border-gray-200 rounded p-2 text-sm">
                  <div>
                    <div className="text-xs text-gray-500">{fmtDateTime(h.created_at)}</div>
                    <div className="text-xs text-gray-500">Por {h.user_name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500 line-through font-mono-display">{money(h.old_price)}</div>
                    <div className="font-mono-display font-semibold">{money(h.new_price)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}