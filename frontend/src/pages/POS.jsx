import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { money, kg } from "../lib/format";
import StateBadge from "../components/StateBadge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { ScanLine, Trash2, Plus, ShoppingBag, Search } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function POS() {
  const [scan, setScan] = useState("");
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [payment, setPayment] = useState("efectivo");
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [cashSession, setCashSession] = useState(null);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      const [c, cs] = await Promise.all([api.get("/customers"), api.get("/cash/current")]);
      setCustomers(c.data); setCashSession(cs.data);
    })();
  }, []);

  const handleScan = async (e) => {
    e.preventDefault();
    const code = scan.trim().toUpperCase();
    if (!code) return;
    try {
      const { data } = await api.get(`/bags/by-code/${code}`);
      if (data.status !== "disponible") {
        toast.error(`Bolsón ${data.code} está ${data.status}`);
        setScan(""); return;
      }
      if (cart.find(it => it.type === "bag" && it.ref_id === data.id)) {
        toast.warning("Ya está en el carrito");
      } else {
        setCart([...cart, {
          type: "bag",
          ref_id: data.id,
          name: data.bag_type_name,
          code: data.code,
          quantity: 1,
          unit: "unidad",
          unit_price: data.final_price,
          subtotal: data.final_price,
          weight: data.weight_kg,
        }]);
        toast.success(`${data.code} agregado`);
      }
      setScan("");
    } catch (err) {
      toast.error("Bolsón no encontrado");
    }
  };

  const searchProduct = async (q) => {
    setProductSearch(q);
    if (!q) { setProductResults([]); return; }
    const { data } = await api.get("/products", { params: { search: q, active_only: true } });
    setProductResults(data.slice(0, 6));
  };

  const addProduct = (p, qty = 1) => {
    setCart([...cart, {
      type: "product",
      ref_id: p.id,
      name: p.name,
      quantity: qty,
      unit: p.unit,
      unit_price: p.sale_price,
      subtotal: p.sale_price * qty,
    }]);
    setProductSearch(""); setProductResults([]);
    toast.success(`${p.name} agregado`);
  };

  const updateQty = (i, qty) => {
    const next = [...cart]; const q = Math.max(0, Number(qty));
    next[i].quantity = q;
    next[i].subtotal = next[i].unit_price * q;
    setCart(next);
  };
  const removeItem = (i) => setCart(cart.filter((_, idx) => idx !== i));

  const subtotal = cart.reduce((s, i) => s + Number(i.subtotal), 0);
  const total = Math.max(0, subtotal - Number(discount || 0));

  const confirm = async () => {
    if (!cart.length) return toast.error("Carrito vacío");
    if (!cashSession) {
      if (!window.confirm("La caja no está abierta. ¿Continuar igual?")) return;
    }
    try {
      const { data } = await api.post("/sales", {
        items: cart.map(it => ({
          type: it.type,
          ref_id: it.ref_id,
          name: it.name,
          code: it.code,
          quantity: it.quantity,
          unit: it.unit,
          unit_price: it.unit_price,
          subtotal: it.subtotal,
        })),
        discount: Number(discount || 0),
        payment_method: payment,
        customer_id: customerId && customerId !== "none" ? customerId : null,
      });
      setLastSale(data);
      setCart([]); setDiscount(0); setCustomerId("");
      setConfirmOpen(false);
      toast.success(`Venta #${data.id.slice(0, 8)} registrada`);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="label-uppercase">Operación</div>
          <h1 className="text-3xl sm:text-4xl font-semibold mt-1" style={{ fontFamily: "Outfit" }}>Punto de venta</h1>
          <p className="text-sm text-gray-500 mt-1">Escaneá un bolsón o buscá un producto.</p>
        </div>
        {!cashSession && (
          <Button variant="outline" onClick={() => nav("/app/cash")} data-testid="open-cash-btn">
            ⚠ Abrir caja
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: scan + product search */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card-soft p-5">
            <Label>Escanear bolsón (QR o código)</Label>
            <form onSubmit={handleScan} className="mt-1 flex gap-2">
              <div className="relative flex-1">
                <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  autoFocus
                  className="pl-9 font-mono-display"
                  placeholder="BOL-000123"
                  value={scan}
                  onChange={(e) => setScan(e.target.value)}
                  data-testid="pos-scan-input"
                />
              </div>
              <Button type="submit" className="bg-[hsl(var(--primary))]" data-testid="pos-scan-btn">Agregar</Button>
            </form>
          </div>

          <div className="card-soft p-5">
            <Label>Buscar producto suelto</Label>
            <div className="mt-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input className="pl-9" placeholder="Nombre del producto..." value={productSearch} onChange={(e) => searchProduct(e.target.value)} data-testid="pos-product-search" />
            </div>
            {productResults.length > 0 && (
              <div className="mt-2 space-y-1">
                {productResults.map(p => (
                  <button
                    key={p.id}
                    onClick={() => addProduct(p, p.unit === "kg" ? 1 : 1)}
                    className="w-full text-left p-2 rounded-md hover:bg-gray-50 flex justify-between text-sm"
                    data-testid={`pos-add-product-${p.id}`}
                  >
                    <span>{p.name} <span className="text-gray-400 text-xs">({p.unit})</span></span>
                    <span className="font-mono-display">{money(p.sale_price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card-soft overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="label-uppercase">Carrito</div>
              <div className="text-sm text-gray-500">{cart.length} ítems</div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50/70 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Ítem</th>
                  <th className="text-right px-4 py-2 font-medium">Cant.</th>
                  <th className="text-right px-4 py-2 font-medium">P. unit.</th>
                  <th className="text-right px-4 py-2 font-medium">Subtotal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((it, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-4 py-2">
                      <div className="font-medium">{it.name}</div>
                      <div className="text-xs text-gray-500">{it.code || it.unit}{it.weight ? ` · ${it.weight} kg` : ""}</div>
                    </td>
                    <td className="px-4 py-2 text-right w-24">
                      {it.type === "bag" ? "1" : <Input className="text-right h-8 font-mono-display" type="number" step="0.001" value={it.quantity} onChange={(e) => updateQty(i, e.target.value)} />}
                    </td>
                    <td className="px-4 py-2 text-right font-mono-display">{money(it.unit_price)}</td>
                    <td className="px-4 py-2 text-right font-mono-display font-semibold">{money(it.subtotal)}</td>
                    <td className="px-4 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => removeItem(i)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button></td>
                  </tr>
                ))}
                {cart.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-gray-500">Sin ítems en el carrito</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: totals + payment */}
        <div className="space-y-4">
          <div className="card-soft p-5">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span className="font-mono-display">{money(subtotal)}</span></div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Descuento</span>
                <Input type="number" className="w-28 h-8 text-right font-mono-display" value={discount} onChange={(e) => setDiscount(e.target.value)} data-testid="pos-discount" />
              </div>
              <div className="flex justify-between text-2xl font-semibold border-t border-gray-200 pt-2 mt-2">
                <span>Total</span>
                <span className="font-mono-display" data-testid="pos-total">{money(total)}</span>
              </div>
            </div>
          </div>

          <div className="card-soft p-5 space-y-3">
            <div>
              <Label>Cliente (opcional)</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Sin cliente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin cliente</SelectItem>
                  {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Método de pago</Label>
              <Select value={payment} onValueChange={setPayment}>
                <SelectTrigger data-testid="pos-payment-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="debito">Débito</SelectItem>
                  <SelectItem value="credito">Crédito</SelectItem>
                  <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                  <SelectItem value="cuenta_corriente">Cuenta corriente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full bg-[hsl(var(--primary))] hover:bg-[#1F2922] h-11"
              disabled={!cart.length}
              onClick={() => setConfirmOpen(true)}
              data-testid="pos-confirm-btn"
            >
              <ShoppingBag className="w-4 h-4 mr-1.5" /> Cobrar
            </Button>
          </div>

          {lastSale && (
            <div className="card-soft p-4 bg-emerald-50/40 border-emerald-300">
              <div className="text-sm text-emerald-800">
                Venta #{lastSale.id.slice(0, 8)} cobrada
              </div>
              <div className="text-2xl font-semibold mt-1 font-mono-display">{money(lastSale.total)}</div>
              <div className="text-xs text-gray-600 capitalize mt-0.5">{lastSale.payment_method}</div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar venta</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Ítems</span><span>{cart.length}</span></div>
            <div className="flex justify-between"><span>Método</span><span className="capitalize">{payment}</span></div>
            <div className="flex justify-between text-2xl font-semibold border-t border-gray-200 pt-2 mt-2">
              <span>Total</span><span className="font-mono-display">{money(total)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={confirm} className="bg-[hsl(var(--primary))]" data-testid="pos-confirm-final-btn">Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
