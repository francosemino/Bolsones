import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { money, fmtDate } from "../lib/format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Wallet, Clock, CheckCircle2, History } from "lucide-react";
import { toast } from "sonner";

const PAY_LABELS = {
  dia: "por día", hora: "por hora", semanal: "semanal", quincenal: "quincenal",
  mensual: "mensual", comision: "comisión", changa: "changa",
};

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

// Sugerencia de período según cómo le paguen a ese empleado
function suggestedPeriod(paymentType) {
  const now = new Date();
  const end = toISODate(now);
  const start = new Date(now);
  if (paymentType === "semanal" || paymentType === "hora" || paymentType === "dia") {
    start.setDate(start.getDate() - 7);
  } else if (paymentType === "quincenal") {
    start.setDate(start.getDate() - 15);
  } else {
    start.setDate(start.getDate() - 30);
  }
  return { start: toISODate(start), end };
}

export default function Payroll() {
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [calc, setCalc] = useState(null);
  const [amountOverride, setAmountOverride] = useState("");
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [history, setHistory] = useState([]);

  const load = async () => setEmployees((await api.get("/employees")).data.filter(e => e.active));
  const loadHistory = async () => setHistory((await api.get("/payroll/history")).data);
  useEffect(() => { load(); loadHistory(); }, []);

  const employee = useMemo(() => employees.find(e => e.id === employeeId), [employees, employeeId]);

  const pickEmployee = (id) => {
    setEmployeeId(id);
    setCalc(null);
    const emp = employees.find(e => e.id === id);
    if (emp) {
      const { start, end } = suggestedPeriod(emp.payment_type);
      setPeriodStart(start); setPeriodEnd(end);
    }
  };

  const runCalc = async () => {
    if (!employeeId || !periodStart || !periodEnd) return toast.error("Elegí empleado y período");
    setLoading(true);
    try {
      const { data } = await api.get("/payroll/calc", {
        params: { employee_id: employeeId, period_start: `${periodStart}T00:00:00`, period_end: `${periodEnd}T23:59:59` },
      });
      setCalc(data);
      setAmountOverride(String(data.suggested_amount));
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setLoading(false); }
  };

  const pay = async () => {
    if (!calc) return;
    setPaying(true);
    try {
      await api.post("/payroll/pay", {
        employee_id: employeeId,
        period_start: `${periodStart}T00:00:00`, period_end: `${periodEnd}T23:59:59`,
        hours_worked: calc.hours_worked, amount: Number(amountOverride),
      });
      toast.success(`Sueldo de ${employee?.name} registrado`);
      setCalc(null); setEmployeeId(""); loadHistory();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setPaying(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="label-uppercase">Gestión</div>
        <h1 className="text-3xl sm:text-4xl font-semibold mt-1" style={{ fontFamily: "Outfit" }}>Sueldos</h1>
        <p className="text-sm text-gray-500 mt-1">Calculá y registrá el pago de sueldos por período.</p>
      </div>

      <div className="card-soft p-5 max-w-xl space-y-4">
        <div>
          <Label>Empleado</Label>
          <Select value={employeeId} onValueChange={pickEmployee}>
            <SelectTrigger data-testid="payroll-employee-select"><SelectValue placeholder="Elegir empleado" /></SelectTrigger>
            <SelectContent>
              {employees.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.name} — {PAY_LABELS[e.payment_type]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {employeeId && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Desde</Label><Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} data-testid="payroll-start-input" /></div>
              <div><Label>Hasta</Label><Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} data-testid="payroll-end-input" /></div>
            </div>
            <Button onClick={runCalc} disabled={loading} className="w-full bg-[hsl(var(--primary))]" data-testid="payroll-calc-btn">
              <Clock className="w-4 h-4 mr-1.5" /> {loading ? "Calculando..." : "Calcular"}
            </Button>
          </>
        )}

        {calc && (
          <div className="border-t border-gray-200 pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-md p-3">
                <div className="text-gray-500 text-xs">Horas fichadas</div>
                <div className="font-mono-display font-semibold text-lg">{calc.hours_worked}hs</div>
              </div>
              <div className="bg-gray-50 rounded-md p-3">
                <div className="text-gray-500 text-xs">Días trabajados</div>
                <div className="font-mono-display font-semibold text-lg">{calc.worked_days}</div>
              </div>
            </div>

            {calc.already_paid ? (
              <div className="text-sm bg-amber-50 text-amber-700 rounded-md p-3">
                Este período ya fue pagado el {fmtDate(calc.already_paid.created_at)} por {money(calc.already_paid.amount)}.
              </div>
            ) : (
              <>
                <div>
                  <Label>Monto a pagar</Label>
                  <Input type="number" value={amountOverride} onChange={(e) => setAmountOverride(e.target.value)} className="text-lg font-mono-display" data-testid="payroll-amount-input" />
                  {["semanal", "quincenal", "mensual"].includes(employee?.payment_type) && (
                    <div className="text-xs text-gray-400 mt-1">Sueldo fijo — las horas de arriba son solo de referencia, podés ajustar el monto si hace falta.</div>
                  )}
                </div>
                <Button onClick={pay} disabled={paying} className="w-full bg-emerald-600 hover:bg-emerald-700 h-11" data-testid="payroll-pay-btn">
                  <Wallet className="w-4 h-4 mr-1.5" /> {paying ? "Registrando..." : `Registrar pago · ${money(Number(amountOverride) || 0)}`}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="label-uppercase mb-2 flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Historial de pagos</div>
        <div className="card-soft overflow-hidden max-w-2xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/70 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Empleado</th>
                <th className="text-left px-4 py-2.5 font-medium">Período</th>
                <th className="text-right px-4 py-2.5 font-medium">Horas</th>
                <th className="text-right px-4 py-2.5 font-medium">Monto</th>
              </tr>
            </thead>
            <tbody>
              {history.map(p => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="px-4 py-2.5 font-medium">{p.employee_name}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{fmtDate(p.period_start)} — {fmtDate(p.period_end)}</td>
                  <td className="px-4 py-2.5 text-right font-mono-display">{p.hours_worked}hs</td>
                  <td className="px-4 py-2.5 text-right font-mono-display font-semibold">{money(p.amount)}</td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-gray-400">Sin pagos registrados todavía</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}