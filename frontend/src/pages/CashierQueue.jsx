import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { money, fmtDateTime, kg } from "../lib/format";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Receipt, Check, X, Clock, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const PAYMENTS = [
  { v: "efectivo", l: "Efectivo" },
  { v: "transferencia", l: "Transferencia" },
  { v: "debito", l: "Débito" },
  { v: "credito", l: "Crédito" },
  { v: "mercadopago", l: "Mercado Pago" },
  { v: "cuenta_corriente", l: "Cuenta corriente" },
];

export default function CashierQueue() {
  const [tickets, setTickets] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [openTicket, setOpenTicket] = useState(null);
  const [payment, setPayment] = useState("efectivo");
  const [customerId, setCustomerId] = useState("none");
  const [confirming, setConfirming] = useState(false);

  const load = async () => {
    const [t, c] = await Promise.all([
      api.get("/tickets", { params: { status: "pendiente_caja" } }),
      api.get("/customers"),
    ]);
    setTickets(t.data);
    setCustomers(c.data);
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 5000); // poll every 5s for cross-device sync
    return () => clearInterval(iv);
  }, []);

  const confirm = async () => {
    if (confirming) return;
    setConfirming(true);
    try {
      await api.post(`/tickets/${openTicket.id}/confirm`, {
        payment_method: payment,
        customer_id: customerId && customerId !== "none" ? customerId : null,
      });
      toast.success(`Ticket ${openTicket.code} cobrado ✓`);
      setOpenTicket(null);
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="label-uppercase">Operación</div>
          <h1 className="text-3xl sm:text-4xl font-semibold mt-1 flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
            <Receipt className="w-7 h-7" /> Cola de Caja
          </h1>
          <p className="text-sm text-gray-500 mt-1">{tickets.length} tickets esperando cobro · actualiza cada 5s</p>
        </div>
        <Button variant="outline" onClick={load} data-testid="refresh-btn">
          <RefreshCw className="w-4 h-4 mr-1.5" /> Actualizar
        </Button>
      </div>

      {tickets.length === 0 ? (
        <div className="card-soft p-12 text-center text-gray-500">
          <Clock className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          Sin tickets pendientes. Cuando un puesto envíe un ticket, aparecerá acá.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tickets.map(t => (
            <button
              key={t.id}
              onClick={() => { setOpenTicket(t); setPayment("efectivo"); setCustomerId("none"); }}
              data-testid={`queue-ticket-${t.code}`}
              className="card-soft p-4 text-left hover:border-[hsl(var(--primary))] hover:shadow-md transition-all"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-mono-display font-semibold text-[hsl(var(--primary))]">{t.code}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{t.station_name}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold font-mono-display">{money(t.total)}</div>
                  <div className="text-xs text-gray-500">{t.items?.length} ítems</div>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                <div>Enviado {fmtDateTime(t.sent_to_cashier_at)}</div>
                {t.total_discounts > 0 && (
                  <div className="text-orange-600 mt-0.5">Contiene {money(t.total_discounts)} en descuentos</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!openTicket} onOpenChange={(v) => !v && setOpenTicket(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cobrar {openTicket?.code}</DialogTitle>
          </DialogHeader>
          {openTicket && (
            <div className="space-y-3">
              <div className="text-xs text-gray-500">{openTicket.station_name} · {fmtDateTime(openTicket.sent_to_cashier_at)}</div>
              <div className="border border-gray-200 rounded-md">
                <table className="w-full text-sm">
                  <tbody>
                    {openTicket.items.map(it => (
                      <tr key={it.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-3 py-2">
                          <div className="font-medium">{it.name}</div>
                          <div className="text-xs text-gray-500">
                            {it.sale_mode === "per_weight" ? kg(it.quantity) : `${it.quantity} un.`} × {money(it.unit_price)}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono-display">{money(it.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between text-2xl font-semibold pt-2 border-t border-gray-200">
                <span>Total</span>
                <span className="font-mono-display" data-testid="queue-total">{money(openTicket.total)}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Método de pago</Label>
                  <Select value={payment} onValueChange={setPayment}>
                    <SelectTrigger data-testid="payment-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENTS.map(p => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Cliente (opcional)</Label>
                  <Select value={customerId} onValueChange={setCustomerId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin cliente</SelectItem>
                      {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenTicket(null)}>Cerrar</Button>
            <Button className="bg-[hsl(var(--primary))]" onClick={confirm} disabled={confirming} data-testid="confirm-payment-btn">
              <Check className="w-4 h-4 mr-1.5" /> {confirming ? "Cobrando..." : "Confirmar cobro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
