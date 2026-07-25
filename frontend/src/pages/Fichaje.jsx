import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Clock, LogIn, LogOut, CheckCircle2 } from "lucide-react";
import { toast, Toaster } from "sonner";

export default function Fichaje() {
  const { user, loading, login, logout } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(null); // {employee, last, next_type} | {error}
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(null); // último fichaje confirmado en esta sesión

  const loadStatus = async () => {
    try {
      const { data } = await api.get("/attendance/me");
      setStatus(data);
    } catch (e) {
      setStatus({ error: formatApiError(e.response?.data?.detail) || "Tu usuario no está vinculado a ningún empleado" });
    }
  };

  useEffect(() => { if (user) loadStatus(); }, [user]);

  const submitLogin = async (e) => {
    e.preventDefault();
    setError(""); setSubmitting(true);
    try {
      await login(email, password);
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail) || "No pudimos iniciar sesión");
    } finally { setSubmitting(false); }
  };

  const confirmClock = async () => {
    setConfirming(true);
    try {
      const { data } = await api.post("/attendance/clock");
      setDone(data);
      toast.success(data.type === "entrada" ? "Entrada registrada" : "Salida registrada");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setConfirming(false); }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Cargando...</div>;
  }

  // No logueado -> mini formulario de login propio de esta pantalla (no manda a /app)
  if (!user) {
    return (
      <div className="min-h-screen bg-[#2C392F] flex items-center justify-center p-6">
        <Toaster position="top-center" richColors />
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
          <div className="w-14 h-14 rounded-full bg-[hsl(var(--primary))] flex items-center justify-center mx-auto mb-4">
            <Clock className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "Outfit" }}>Fichaje</h1>
          <p className="text-sm text-gray-500 mt-1 mb-6">Ingresá con tu usuario para marcar tu entrada o salida.</p>
          <form onSubmit={submitLogin} className="space-y-3 text-left">
            <div>
              <Label>Usuario</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} data-testid="fichaje-username-input" required autoFocus />
            </div>
            <div>
              <Label>Contraseña</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="fichaje-password-input" required />
            </div>
            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2.5">{error}</div>}
            <Button type="submit" className="w-full bg-[hsl(var(--primary))] h-11" disabled={submitting} data-testid="fichaje-login-btn">
              {submitting ? "Ingresando..." : "Ingresar"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // Logueado pero el usuario no está vinculado a ningún empleado activo
  if (status?.error) {
    return (
      <div className="min-h-screen bg-[#2C392F] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
          <p className="text-red-600 text-sm">{status.error}</p>
          <Button variant="outline" className="mt-4" onClick={logout} data-testid="fichaje-logout-error-btn">Salir</Button>
        </div>
      </div>
    );
  }

  const nextType = status?.next_type;
  const empName = status?.employee?.name;

  return (
    <div className="min-h-screen bg-[#2C392F] flex items-center justify-center p-6">
      <Toaster position="top-center" richColors />
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
        <div className="label-uppercase text-gray-400">Fichaje</div>
        <h1 className="text-2xl font-semibold mt-1" style={{ fontFamily: "Outfit" }}>Hola, {empName || "..."}</h1>

        {done ? (
          <div className="mt-6">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <p className="text-lg font-semibold">{done.type === "entrada" ? "Entrada registrada" : "Salida registrada"}</p>
            <p className="text-sm text-gray-500 mt-1">
              {new Date(done.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
            </p>
            <Button variant="outline" className="mt-6" onClick={logout} data-testid="fichaje-logout-btn">
              Listo, salir
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mt-1 mb-6">
              {nextType === "entrada" ? "Todavía no marcaste tu entrada de hoy." : "Estás fichado desde tu última entrada."}
            </p>
            <Button
              onClick={confirmClock}
              disabled={confirming || !nextType}
              className={`w-full h-16 text-lg ${nextType === "entrada" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"}`}
              data-testid="fichaje-confirm-btn"
            >
              {nextType === "entrada" ? <LogIn className="w-5 h-5 mr-2" /> : <LogOut className="w-5 h-5 mr-2" />}
              {confirming ? "Confirmando..." : nextType === "entrada" ? "Marcar entrada" : "Marcar salida"}
            </Button>
            <button onClick={logout} className="mt-4 text-xs text-gray-400 hover:underline" data-testid="fichaje-logout-link">
              No soy yo, salir
            </button>
          </>
        )}
      </div>
    </div>
  );
}