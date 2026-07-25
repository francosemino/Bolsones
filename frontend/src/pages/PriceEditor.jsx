import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { money, fmtDateTime } from "../lib/format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Search, Save, History, Tag as TagIcon } from "lucide-react";
import { toast } from "sonner";

export default function PriceEditor() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [changes, setChanges] = useState({}); // id -> new_price
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

  const setPrice = (id, val) => setChanges({ ...changes, [id]: val });
  const dirtyCount = Object.entries(changes).filter(([id, v]) => {
    const p = products.find(x => x.id === id);
    return p && Math.abs(Number(v) - Number(p.sale_price)) > 0.01;
  }).length;

  const saveAll = async () => {
    const items = Object.entries(changes)
      .map(([id, v]) => ({ id, sale_price: Number(v) }))
      .filter(it => {
        const p = products.find(x => x.id === it.id);
        return p && !isNaN(it.sale_price) && Math.abs(it.sale_price - Number(p.sale_price)) > 0.01;
      });
    if (!items.length) return toast.info("No hay cambios para guardar");
    setSaving(true);
    try {
      const { data } = await api.patch("/products/bulk-prices", items);
      toast.success(`${data.updated} precios actualizados`);
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
          <p className="text-sm text-gray-500 mt-1">Editá varios precios y guardá todo de una · {products.length} productos</p>
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

      <div className="card-soft overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50/70 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3 font-medium">PLU</th>
              <th className="text-left px-4 py-3 font-medium">Producto</th>
              <th className="text-left px-4 py-3 font-medium">Venta</th>
              <th className="text-right px-4 py-3 font-medium">Precio actual</th>
              <th className="text-right px-4 py-3 font-medium">Nuevo precio</th>
              <th className="text-right px-4 py-3 font-medium">Δ</th>
              <th className="text-right px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const nv = changes[p.id] ?? p.sale_price;
              const diff = Number(nv) - Number(p.sale_price);
              const changed = Math.abs(diff) > 0.01;
              return (
                <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-mono-display text-gray-600">{p.plu || "—"}</td>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{p.sale_mode === "per_weight" ? `/kg` : `/u`}</td>
                  <td className="px-4 py-3 text-right font-mono-display text-gray-500">{money(p.sale_price)}</td>
                  <td className="px-4 py-3 text-right">
                    <Input
                      type="number"
                      value={nv}
                      onChange={(e) => setPrice(p.id, e.target.value)}
                      className={`text-right font-mono-display h-9 w-32 ml-auto ${changed ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5" : ""}`}
                      data-testid={`price-input-${p.id}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-mono-display">
                    {changed && (
                      <span className={diff > 0 ? "text-emerald-600" : "text-red-600"}>
                        {diff > 0 ? "+" : ""}{money(diff)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => showHistory(p)} title="Historial">
                      <History className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-gray-500">Sin productos</td></tr>}
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
