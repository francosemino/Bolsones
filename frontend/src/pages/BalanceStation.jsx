import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { money, kg, fmtDateTime } from "../lib/format";
import StateBadge from "../components/StateBadge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Scale, Plus, Search, Send, Trash2, X, ShoppingBag, Percent } from "lucide-react";
import { toast } from "sonner";

/**
 * Balance Station — puesto de balanza (tablet).
 *
 * ⚙ COSTURA A FUTURO (peso automático): el input de "peso" actualmente es manual,
 * pero está preparado para recibir peso desde un canal externo. La función addItem()
 * recibe el peso por parámetro; no le importa si viene del teclado o del WebSocket
 * `/api/ws/scale/{station_id}` (ya montado en el backend). Un conversor Serial→WiFi
 * o app puente publicará el peso ahí y este componente podrá leerlo automáticamente.
 */
export default function BalanceStation() {
  const [stations, setStations] = useState([]);
  const [stationId, setStationId] = useState("");
  const [tickets, setTickets] = useState([]); // abiertos en este puesto
  const [activeId, setActiveId] = useState(null);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [weightInput, setWeightInput] = useState("");
  const [qtyInput, setQtyInput] = useState("1");
  const [discountMode, setDiscountMode] = useState("percent"); // percent | amount
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false); // evita doble-tap / doble-scan en altas y bajas

  const loadStations = async () => {
    const { data } = await api.get("/stations");
    const balanzas = data.filter(s => s.kind === "balanza");
    setStations(balanzas);
    // El puesto guardado en este dispositivo puede haber sido borrado o
    // renombrado desde otra sesión — validamos que siga existiendo antes
    // de confiar en él, para no quedar con una tablet "rota" en silencio.
    const stored = localStorage.getItem("bc_station");
    const storedIsValid = stored && balanzas.some(s => s.id === stored);
    if (storedIsValid) {
      setStationId(stored);
    } else if (balanzas[0]) {
      if (stored) toast.error("El puesto guardado ya no existe. Se seleccionó otro por defecto.");
      setStationId(balanzas[0].id);
      localStorage.setItem("bc_station", balanzas[0].id);
    } else {
      localStorage.removeItem("bc_station");
    }
  };
  const loadProducts = async () => setProducts((await api.get("/products", { params: { active_only: true } })).data);
  const loadTickets = async () => {
    if (!stationId) return;
    const { data } = await api.get("/tickets", { params: { status: "abierto", station_id: stationId } });
    setTickets(data);
    if (data[0] && !activeId) setActiveId(data[0].id);
  };

  useEffect(() => { loadStations(); loadProducts(); }, []);
  useEffect(() => { loadTickets(); /* eslint-disable-next-line */ }, [stationId]);

  // Fix #3: si cambia el ticket activo (ej: atendiendo dos clientes en el
  // mismo puesto), limpiamos el panel de "agregar ítem" para no terminar
  // cargando el pesaje de un cliente en el ticket de otro.
  useEffect(() => {
    setSelectedProduct(null);
    setWeightInput(""); setQtyInput("1");
    setDiscountValue(""); setDiscountReason("");
  }, [activeId]);

  // Fix #4: la tablet queda abierta todo el turno sin recargar la página,
  // así que refrescamos precios/productos cada tanto por si hubo un cambio
  // masivo de precios mientras tanto.
  useEffect(() => {
    const interval = setInterval(loadProducts, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const activeTicket = tickets.find(t => t.id === activeId);

  const changeStation = (v) => {
    setStationId(v);
    localStorage.setItem("bc_station", v);
    setActiveId(null);
  };

  const newTicket = async () => {
    if (!stationId) return toast.error("Elegí un puesto");
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await api.post("/tickets", { station_id: stationId });
      toast.success(`Ticket ${data.code} abierto`);
      await loadTickets();
      setActiveId(data.id);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const filteredProducts = useMemo(() => {
    if (!search) return products.slice(0, 8);
    const s = search.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(s) || (p.plu && p.plu.startsWith(search))
    ).slice(0, 12);
  }, [products, search]);

  const pickProduct = (p) => {
    setSelectedProduct(p);
    setWeightInput(""); setQtyInput("1");
    setDiscountValue(""); setDiscountReason("");
  };

  // 👇 COSTURA a futuro: el peso puede llegar de un canal externo
  // (WebSocket balanza). Este handler es el único punto de entrada.
  const addItem = async () => {
    if (!activeId) return toast.error("Abrí un ticket primero");
    if (!selectedProduct) return toast.error("Elegí un producto");
    const qty = selectedProduct.sale_mode === "per_weight"
      ? Number(weightInput)
      : Number(qtyInput);
    if (!qty || qty <= 0) return toast.error("Cantidad inválida");
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/tickets/${activeId}/items`, {
        type: "product",
        ref_id: selectedProduct.id,
        quantity: qty,
        discount_type: discountValue ? discountMode : null,
        discount_value: discountValue ? Number(discountValue) : 0,
        discount_reason: discountReason || null,
      });
      toast.success(`${selectedProduct.name} agregado`);
      setSelectedProduct(null); setWeightInput(""); setQtyInput("1");
      setDiscountValue(""); setDiscountReason("");
      await loadTickets();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const addBag = async (code) => {
    if (!activeId) return toast.error("Abrí un ticket primero");
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/tickets/${activeId}/items`, { type: "bag", ref_id: code, quantity: 1 });
      toast.success(`Bolsón ${code} agregado`);
      await loadTickets();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const removeItem = async (iid) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.delete(`/tickets/${activeId}/items/${iid}`);
      await loadTickets();
    } catch (e) { toast.error("Error"); }
    finally { setBusy(false); }
  };

  const sendToCashier = async () => {
    if (!activeTicket?.items?.length) return toast.error("Ticket vacío");
    setSending(true);
    try {
      await api.post(`/tickets/${activeId}/send`);
      toast.success(`Ticket ${activeTicket.code} enviado a caja`);
      setActiveId(null);
      await loadTickets();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setSending(false);
    }
  };

  const cancelTicket = async () => {
    if (!window.confirm(`¿Cancelar ticket ${activeTicket.code}?`)) return;
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/tickets/${activeId}/cancel`);
      toast.success("Ticket cancelado");
      setActiveId(null);
      await loadTickets();
    } catch (e) { toast.error("Error"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {/* Header + station picker */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="label-uppercase">Puesto de venta</div>
          <h1 className="text-3xl sm:text-4xl font-semibold mt-1 flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
            <Scale className="w-7 h-7" /> Balanza · Ticket en curso
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Select value={stationId} onValueChange={changeStation}>
            <SelectTrigger className="w-48" data-testid="station-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              {stations.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button className="bg-[hsl(var(--primary))]" onClick={newTicket} disabled={busy} data-testid="new-ticket-btn">
            <Plus className="w-4 h-4 mr-1.5" /> Nuevo ticket
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: active tickets list */}
        <div className="space-y-2">
          <div className="label-uppercase mb-1">Tickets abiertos en este puesto</div>
          {tickets.length === 0 && (
            <div className="card-soft p-8 text-sm text-gray-500 text-center">
              Sin tickets abiertos. Presioná "Nuevo ticket" para comenzar.
            </div>
          )}
          {tickets.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              data-testid={`ticket-item-${t.code}`}
              className={`w-full text-left card-soft p-3 hover:border-[hsl(var(--primary))] transition-colors ${activeId === t.id ? "border-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]/20" : ""}`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-mono-display font-semibold text-sm text-[hsl(var(--primary))]">{t.code}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{fmtDateTime(t.created_at)}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold font-mono-display">{money(t.total)}</div>
                  <div className="text-xs text-gray-500">{t.items?.length || 0} ítems</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Center: active ticket detail */}
        <div className="lg:col-span-2 space-y-4">
          {!activeTicket ? (
            <div className="card-soft p-10 text-center text-gray-500">
              Elegí un ticket abierto o creá uno nuevo.
            </div>
          ) : (
            <>
              <div className="card-soft p-4">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <div className="font-mono-display font-semibold text-lg text-[hsl(var(--primary))]">{activeTicket.code}</div>
                    <div className="text-xs text-gray-500">{activeTicket.station_name} · {activeTicket.items?.length || 0} ítems</div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-semibold font-mono-display" data-testid="ticket-total">{money(activeTicket.total)}</div>
                    {activeTicket.total_discounts > 0 && (
                      <div className="text-xs text-orange-600">-{money(activeTicket.total_discounts)} en descuentos</div>
                    )}
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-2">
                  {activeTicket.items?.length === 0 ? (
                    <div className="text-sm text-gray-500 py-4 text-center">Sin ítems aún</div>
                  ) : (
                    <div className="space-y-1">
                      {activeTicket.items.map(it => (
                        <div key={it.id} className="flex items-center gap-2 text-sm py-1.5 border-b border-gray-50 last:border-0">
                          <div className="flex-1">
                            <div className="font-medium">{it.name} <span className="text-xs text-gray-400 font-mono-display">{it.plu}</span></div>
                            <div className="text-xs text-gray-500">
                              {it.sale_mode === "per_weight" ? kg(it.quantity) : `${it.quantity} un.`} × {money(it.unit_price)}
                              {it.discount_amount > 0 && <span className="text-orange-600 ml-2">-{money(it.discount_amount)} ({it.discount_reason || 'desc.'})</span>}
                            </div>
                          </div>
                          <div className="font-mono-display font-semibold">{money(it.subtotal)}</div>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => removeItem(it.id)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mt-3">
                  <Button variant="outline" onClick={cancelTicket} disabled={busy} className="text-red-600" data-testid="cancel-ticket-btn">
                    <X className="w-4 h-4 mr-1.5" /> Cancelar
                  </Button>
                  <Button
                    className="bg-[hsl(var(--primary))] flex-1"
                    disabled={sending || busy || !activeTicket.items?.length}
                    onClick={sendToCashier}
                    data-testid="send-ticket-btn"
                  >
                    <Send className="w-4 h-4 mr-1.5" /> Enviar a caja
                  </Button>
                </div>
              </div>

              {/* Add item panel */}
              <div className="card-soft p-4">
                <div className="label-uppercase mb-2">Agregar ítem</div>
                {!selectedProduct ? (
                  <>
                    <div className="relative mb-2">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        autoFocus
                        placeholder="Buscar por nombre o PLU..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                        data-testid="product-search-input"
                      />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {filteredProducts.map(p => (
                        <button
                          key={p.id}
                          onClick={() => pickProduct(p)}
                          data-testid={`product-btn-${p.plu || p.id}`}
                          className="text-left p-3 border border-gray-200 rounded-md hover:border-[hsl(var(--primary))] hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex justify-between items-start">
                            <div className="text-xs text-gray-500 font-mono-display">{p.plu || "—"}</div>
                            <div className="text-[10px] text-gray-500">{p.sale_mode === "per_weight" ? "kg" : "u"}</div>
                          </div>
                          <div className="font-medium text-sm mt-1">{p.name}</div>
                          <div className="font-mono-display text-xs mt-1">{money(p.sale_price)}</div>
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <Label className="text-xs">O escaneá un bolsón (BOL-XXXXXX):</Label>
                      <Input
                        className="mt-1 font-mono-display"
                        placeholder="BOL-000001"
                        disabled={busy}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && e.currentTarget.value) {
                            addBag(e.currentTarget.value.trim().toUpperCase());
                            e.currentTarget.value = "";
                          }
                        }}
                        data-testid="bag-scan-input"
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{selectedProduct.name}</div>
                        <div className="text-xs text-gray-500 font-mono-display">{selectedProduct.plu} · {money(selectedProduct.sale_price)}/{selectedProduct.sale_mode === "per_weight" ? "kg" : "u"}</div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setSelectedProduct(null)}><X className="w-4 h-4" /></Button>
                    </div>

                    {selectedProduct.sale_mode === "per_weight" ? (
                      <div>
                        <Label>Peso (kg) — ingresá lo que muestra la balanza</Label>
                        <Input
                          autoFocus
                          type="number"
                          step="0.001"
                          value={weightInput}
                          onChange={(e) => setWeightInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && addItem()}
                          className="text-2xl font-mono-display h-14"
                          data-testid="weight-input"
                        />
                        <div className="text-xs text-gray-400 mt-1">
                          Costura para futuro: el peso podrá inyectarse automáticamente desde la balanza (WebSocket).
                        </div>
                      </div>
                    ) : (
                      <div>
                        <Label>Cantidad (unidades)</Label>
                        <Input
                          autoFocus
                          type="number"
                          value={qtyInput}
                          onChange={(e) => setQtyInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && addItem()}
                          className="text-2xl font-mono-display h-14"
                          data-testid="qty-input"
                        />
                      </div>
                    )}

                    <details className="border border-gray-200 rounded-md p-2">
                      <summary className="cursor-pointer text-sm text-gray-600 select-none">
                        <Percent className="inline w-3.5 h-3.5 mr-1" />
                        Aplicar descuento por mal estado (opcional)
                      </summary>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <Select value={discountMode} onValueChange={setDiscountMode}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percent">% Porcentaje</SelectItem>
                            <SelectItem value="amount">$ Monto</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder={discountMode === "percent" ? "10" : "500"} data-testid="discount-value-input" />
                        <Input className="col-span-2" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="Motivo (ej: medio blando)" />
                      </div>
                    </details>

                    <Button className="w-full bg-[hsl(var(--primary))] h-11" onClick={addItem} disabled={busy} data-testid="add-item-btn">
                      <Plus className="w-4 h-4 mr-1.5" /> Agregar al ticket
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}