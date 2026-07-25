import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { money, fmtDateTime } from "../lib/format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Repeat, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function Reclassify() {
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [p, h] = await Promise.all([api.get("/products", { params: { active_only: true } }), api.get("/reclassifications")]);
    setProducts(p.data); setHistory(h.data);
  };
  useEffect(() => { load(); }, []);

  const productMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);
  const source = productMap[sourceId];

  useEffect(() => {
    if (source?.reclassification_target_id && !targetId) setTargetId(source.reclassification_target_id);
  }, [sourceId]); // eslint-disable-line

  const target = productMap[targetId];
  const qty = Number(quantity || 0);
  const loss = source && target ? Math.max(0, (source.sale_price - target.sale_price) * qty) : 0;

  const submit = async () => {
    if (!sourceId || !targetId || !qty) return toast.error("Completá los datos");
    if (sourceId === targetId) return toast.error("Origen y destino iguales");
    setSaving(true);
    try {
      await api.post("/reclassify", {
        source_product_id: sourceId,
        target_product_id: targetId,
        quantity: qty,
        reason,
      });
      toast.success("Reclasificación aplicada");
      setQuantity(""); setReason("");
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="label-uppercase">Inventario</div>
        <h1 className="text-3xl sm:text-4xl font-semibold mt-1 flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
          <Repeat className="w-7 h-7" /> Reclasificar producto
        </h1>
        <p className="text-sm text-gray-500 mt-1">Degradá un producto a uno más barato antes de decomisar. Recuperás valor y trackeás la pérdida real.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-soft p-5 space-y-4">
          <div className="label-uppercase">Origen (más caro)</div>
          <div>
            <Label>Producto</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger data-testid="reclassify-source-select"><SelectValue placeholder="Elegir producto" /></SelectTrigger>
              <SelectContent>
                {products.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} {p.plu && `(${p.plu})`} · Stock: {p.current_stock} {p.unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {source && (
            <div className="text-sm text-gray-600 space-y-1">
              <div>Precio actual: <span className="font-mono-display font-semibold">{money(source.sale_price)}/{source.unit}</span></div>
              <div>Stock disponible: <span className="font-mono-display">{source.current_stock} {source.unit}</span></div>
            </div>
          )}

          <div className="flex items-center justify-center py-2">
            <ArrowRight className="w-6 h-6 text-gray-400" />
          </div>

          <div className="label-uppercase">Destino (más barato)</div>
          <div>
            <Label>Producto destino</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger data-testid="reclassify-target-select"><SelectValue placeholder="Elegir destino" /></SelectTrigger>
              <SelectContent>
                {products.filter(p => p.id !== sourceId).map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} {p.plu && `(${p.plu})`} · {money(p.sale_price)}/{p.unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {source?.reclassification_target_id && targetId === source.reclassification_target_id && (
              <div className="text-xs text-emerald-600 mt-1">Sugerencia automática del producto origen</div>
            )}
          </div>

          <div>
            <Label>Cantidad a mover ({source?.unit || "kg"})</Label>
            <Input
              type="number"
              step="0.001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="text-xl font-mono-display h-12"
              data-testid="reclassify-qty-input"
            />
          </div>
          <div>
            <Label>Motivo</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: perdió firmeza" />
          </div>

          {source && target && qty > 0 && (
            <div className="border-t border-gray-200 pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-gray-600"><span>Valor original:</span><span className="font-mono-display">{money(source.sale_price * qty)}</span></div>
              <div className="flex justify-between text-gray-600"><span>Valor destino:</span><span className="font-mono-display">{money(target.sale_price * qty)}</span></div>
              <div className="flex justify-between font-semibold text-orange-700 pt-1 border-t border-gray-100">
                <span>Pérdida por reclasificación:</span>
                <span className="font-mono-display" data-testid="reclassify-loss">{money(loss)}</span>
              </div>
            </div>
          )}

          <Button
            className="w-full bg-[hsl(var(--primary))] h-11"
            onClick={submit}
            disabled={saving || !sourceId || !targetId || !qty}
            data-testid="reclassify-submit-btn"
          >
            <Repeat className="w-4 h-4 mr-1.5" /> {saving ? "Aplicando..." : "Aplicar reclasificación"}
          </Button>
        </div>

        <div className="card-soft p-5">
          <div className="label-uppercase mb-3">Últimas reclasificaciones</div>
          {history.length === 0 ? (
            <div className="text-sm text-gray-500 py-6 text-center">Sin reclasificaciones registradas</div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto scrollbar-thin">
              {history.map(r => (
                <div key={r.id} className="border border-gray-200 rounded-md p-3 text-sm">
                  <div className="flex items-center gap-2 text-gray-600 text-xs">
                    <span>{r.source_product_name}</span>
                    <ArrowRight className="w-3 h-3" />
                    <span>{r.target_product_name}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="font-mono-display">{r.quantity} {r.unit}</span>
                    <span className="text-orange-700 font-semibold font-mono-display">-{money(r.loss_amount)}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{fmtDateTime(r.created_at)} · {r.user_name}</div>
                  {r.reason && <div className="text-xs text-gray-600 mt-0.5 italic">"{r.reason}"</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
