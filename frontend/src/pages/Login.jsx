import React, { useEffect, useState } from "react";
import { useNavigate, Navigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatApiError } from "../lib/api";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Leaf, ExternalLink } from "lucide-react";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [businessName, setBusinessName] = useState("BolsonesControl");

  useEffect(() => {
    axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/public/catalog`)
      .then(({ data }) => { if (data?.business?.name) setBusinessName(data.business.name); })
      .catch(() => {});
  }, []);

  if (user) return <Navigate to="/app" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(identifier, password);
      nav("/app");
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      {/* Left – imagen del negocio */}
      <div className="hidden md:flex relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(/imagenes/bolsones.jpg)" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1F2922]/90 via-[#2C392F]/20 to-[#2C392F]/40" />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-lg bg-white/15 backdrop-blur flex items-center justify-center">
              <Leaf className="w-5 h-5" />
            </div>
            <div className="font-semibold text-lg" style={{ fontFamily: "Outfit" }}>{businessName}</div>
          </div>
          <div className="text-xs text-white/70">© {new Date().getFullYear()} {businessName}</div>
        </div>
      </div>

      {/* Right – form */}
      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="md:hidden flex items-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-lg bg-[hsl(var(--primary))] flex items-center justify-center">
              <Leaf className="w-5 h-5 text-white" />
            </div>
            <div className="font-semibold text-lg" style={{ fontFamily: "Outfit" }}>{businessName}</div>
          </div>
          <div className="label-uppercase mb-2">Iniciá sesión</div>
          <h2 className="text-3xl font-semibold mb-1" style={{ fontFamily: "Outfit" }}>Bienvenido de nuevo</h2>
          <p className="text-sm text-gray-500 mb-8">Ingresá con tu usuario para administrar el negocio.</p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="identifier">Usuario</Label>
              <Input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Usuario o email"
                data-testid="login-email-input"
                required
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                data-testid="login-password-input"
                required
              />
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3" data-testid="login-error">
                {error}
              </div>
            )}
            <Button
              type="submit"
              className="w-full bg-[hsl(var(--primary))] hover:bg-[#1F2922] h-11"
              disabled={loading}
              data-testid="login-submit-button"
            >
              {loading ? "Ingresando..." : "Ingresar al sistema"}
            </Button>
          </form>

          <Link
            to="/pedido"
            className="mt-6 inline-flex items-center gap-1.5 text-sm text-[hsl(var(--primary))] hover:underline"
            data-testid="public-form-link"
          >
            Ver formulario público de pedidos <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}