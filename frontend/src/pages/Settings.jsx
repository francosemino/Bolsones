import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const MODULES = [
  { key: "advanced_stock", label: "Stock avanzado" },
  { key: "recipes", label: "Recetas de bolsones" },
  { key: "scale", label: "Balanza" },
  { key: "labels", label: "Etiquetas" },
  { key: "online_orders", label: "Pedidos online" },
  { key: "cash", label: "Caja" },
  { key: "employees", label: "Empleados" },
  { key: "accounts", label: "Cuentas corrientes" },
  { key: "delivery", label: "Delivery" },
  { key: "traceability", label: "Trazabilidad avanzada" },
];

export default function Settings() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/config").then(r => setCfg(r.data));
  }, []);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api.put("/config", cfg);
      toast.success("Configuración guardada");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  if (!cfg) return <div className="text-gray-500">Cargando...</div>;

  return (
    <div className="space-y-6">
      <div>
        <div className="label-uppercase">Sistema</div>
        <h1 className="text-3xl sm:text-4xl font-semibold mt-1" style={{ fontFamily: "Outfit" }}>Configuración</h1>
        <p className="text-sm text-gray-500 mt-1">Datos del negocio y módulos habilitados</p>
      </div>

      <div className="card-soft p-5">
        <div className="label-uppercase mb-2">Link de pedidos online</div>
        <p className="text-sm text-gray-500 mb-3">Compartí este link con tus clientes (Instagram, WhatsApp, donde quieras) para que hagan pedidos.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input readOnly value={`${window.location.origin}/pedido`} className="font-mono-display text-sm" data-testid="public-order-link-input" />
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/pedido`);
                toast.success("Link copiado");
              }}
              data-testid="copy-public-order-link-btn"
            >
              <Copy className="w-4 h-4 mr-1.5" /> Copiar
            </Button>
            <a href="/pedido" target="_blank" rel="noreferrer">
              <Button variant="outline"><ExternalLink className="w-4 h-4" /></Button>
            </a>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-soft p-5 space-y-3">
          <div className="label-uppercase">Datos del negocio</div>
          <div><Label>Nombre</Label><Input value={cfg.business_name} onChange={(e) => setCfg({ ...cfg, business_name: e.target.value })} data-testid="cfg-name-input" /></div>
          <div><Label>Dirección</Label><Input value={cfg.address || ""} onChange={(e) => setCfg({ ...cfg, address: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Teléfono</Label><Input value={cfg.phone || ""} onChange={(e) => setCfg({ ...cfg, phone: e.target.value })} /></div>
            <div><Label>WhatsApp</Label><Input value={cfg.whatsapp || ""} onChange={(e) => setCfg({ ...cfg, whatsapp: e.target.value })} /></div>
          </div>
          <div><Label>Email</Label><Input value={cfg.email || ""} onChange={(e) => setCfg({ ...cfg, email: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>CUIT</Label><Input value={cfg.cuit || ""} onChange={(e) => setCfg({ ...cfg, cuit: e.target.value })} /></div>
            <div><Label>Instagram</Label><Input value={cfg.instagram || ""} onChange={(e) => setCfg({ ...cfg, instagram: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
            <div><Label>Alias bancario</Label><Input value={cfg.bank_alias || ""} onChange={(e) => setCfg({ ...cfg, bank_alias: e.target.value })} placeholder="verduleria.pagos" /></div>
            <div><Label>CBU</Label><Input value={cfg.bank_cbu || ""} onChange={(e) => setCfg({ ...cfg, bank_cbu: e.target.value })} /></div>
          </div>
          </div>
          <div><Label>Texto en etiquetas</Label><Input value={cfg.label_text || ""} onChange={(e) => setCfg({ ...cfg, label_text: e.target.value })} /></div>
        </div>

        <div className="space-y-4">
          <div className="card-soft p-5 space-y-3">
            <div className="label-uppercase">Balanza</div>
            <div className="flex justify-between items-center">
              <Label className="flex-1">Habilitada</Label>
              <Switch checked={cfg.scale_config?.enabled !== false} onCheckedChange={(v) => setCfg({ ...cfg, scale_config: { ...cfg.scale_config, enabled: v } })} />
            </div>
            <div><Label>Modo</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={cfg.scale_config?.mode || "manual"} onChange={(e) => setCfg({ ...cfg, scale_config: { ...cfg.scale_config, mode: e.target.value } })}>
                <option value="manual">Manual</option>
                <option value="simulated">Simulada</option>
                <option value="web_serial">Web Serial</option>
                <option value="bridge">Puente local</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Puerto</Label><Input value={cfg.scale_config?.port || ""} onChange={(e) => setCfg({ ...cfg, scale_config: { ...cfg.scale_config, port: e.target.value } })} /></div>
              <div><Label>Baud rate</Label><Input type="number" value={cfg.scale_config?.baud_rate || 9600} onChange={(e) => setCfg({ ...cfg, scale_config: { ...cfg.scale_config, baud_rate: Number(e.target.value) } })} /></div>
            </div>
            <div className="text-xs text-gray-500">
              El sistema funciona aunque la balanza no esté conectada. Web Serial requiere navegador compatible (Chrome/Edge).
            </div>
          </div>

          <div className="card-soft p-5">
            <div className="label-uppercase mb-3">Módulos habilitados</div>
            <div className="space-y-2">
              {MODULES.map(m => (
                <div key={m.key} className="flex justify-between items-center">
                  <Label className="flex-1">{m.label}</Label>
                  <Switch
                    checked={!!cfg.enabled_modules?.[m.key]}
                    onCheckedChange={(v) => setCfg({ ...cfg, enabled_modules: { ...cfg.enabled_modules, [m.key]: v } })}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button className="bg-[hsl(var(--primary))]" onClick={save} disabled={saving} data-testid="save-config-btn">{saving ? "Guardando..." : "Guardar configuración"}</Button>
      </div>
    </div>
  );
}
