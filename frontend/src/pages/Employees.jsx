import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { money } from "../lib/format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Plus, Edit, KeyRound, UserX, QrCode } from "lucide-react";
import { toast } from "sonner";

const PAY = ["dia", "hora", "semanal", "quincenal", "mensual", "comision", "changa"];
const ROLES = ["encargado", "cajero", "armador", "repartidor", "lectura"];

const PERMISSIONS = [
  { key: "ventas", label: "Ventas y caja" },
  { key: "stock", label: "Productos y stock" },
  { key: "bolsones", label: "Armado de bolsones" },
  { key: "perdidas", label: "Mermas y pérdidas" },
  { key: "pedidos", label: "Pedidos" },
  { key: "reportes", label: "Reportes y gastos" },
  { key: "empleados", label: "Empleados y sueldos" },
  { key: "config", label: "Configuración del negocio" },
];

const blank = { name: "", phone: "", role: "cajero", payment_type: "mensual", payment_amount: 0, active: true, notes: "" };

export default function Employees() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(blank);
  const [linkedUser, setLinkedUser] = useState(null); // usuario del sistema vinculado a este empleado
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: "", email: "", password: "", permissions: [] });

  const load = async () => setList((await api.get("/employees")).data);
  useEffect(() => { load(); }, []);

  const openEdit = async (emp) => {
    setEdit(emp);
    setShowLoginForm(false);
    setLoginForm({ username: "", email: "", password: "", permissions: [] });
    setLinkedUser(null);
    setOpen(true);
    if (emp.user_id) {
      try {
        const users = (await api.get("/auth/users")).data;
        setLinkedUser(users.find(u => u.id === emp.user_id) || null);
      } catch (e) { /* si no tiene permiso de config, simplemente no lo muestra */ }
    }
  };

  const save = async () => {
    try {
      if (edit.id) await api.patch(`/employees/${edit.id}`, edit);
      else await api.post("/employees", edit);
      toast.success("Empleado guardado"); setOpen(false); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const togglePerm = (key) => {
    setLoginForm(f => ({
      ...f,
      permissions: f.permissions.includes(key) ? f.permissions.filter(p => p !== key) : [...f.permissions, key],
    }));
  };

  const createLogin = async () => {
    if (!loginForm.username || !loginForm.password) return toast.error("Completá usuario y contraseña");
    try {
      const { data } = await api.post(`/employees/${edit.id}/create-login`, loginForm);
      toast.success("Usuario creado — ya puede fichar y usar el sistema con esos permisos");
      setShowLoginForm(false);
      setEdit({ ...edit, user_id: data.user_id });
      setLinkedUser({ id: data.user_id, username: data.username, email: loginForm.email, permissions: loginForm.permissions });
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const updateLinkedPermissions = async (newPerms) => {
    try {
      await api.patch(`/auth/users/${linkedUser.id}`, { permissions: newPerms });
      setLinkedUser({ ...linkedUser, permissions: newPerms });
      toast.success("Permisos actualizados");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const unlinkLogin = async () => {
    if (!window.confirm(`¿Quitarle el acceso al sistema a ${edit.name}? Ya no va a poder loguearse ni fichar.`)) return;
    try {
      await api.post(`/employees/${edit.id}/unlink-login`);
      if (linkedUser) await api.patch(`/auth/users/${linkedUser.id}`, { active: false });
      toast.success("Acceso quitado");
      setLinkedUser(null);
      load();
    } catch (e) { toast.error("Error"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="label-uppercase">Gestión</div>
          <h1 className="text-3xl sm:text-4xl font-semibold mt-1" style={{ fontFamily: "Outfit" }}>Empleados</h1>
          <p className="text-sm text-gray-500 mt-1">{list.length} empleados</p>
        </div>
        <Button onClick={() => { setEdit(blank); setOpen(true); setLinkedUser(null); setShowLoginForm(false); }} className="bg-[hsl(var(--primary))]" data-testid="new-employee-btn">
          <Plus className="w-4 h-4 mr-1.5" /> Nuevo empleado
        </Button>
      </div>

      <div className="card-soft overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50/70 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Nombre</th>
              <th className="text-left px-4 py-3 font-medium">Rol</th>
              <th className="text-left px-4 py-3 font-medium">Teléfono</th>
              <th className="text-left px-4 py-3 font-medium">Tipo de pago</th>
              <th className="text-right px-4 py-3 font-medium">Monto</th>
              <th className="text-center px-4 py-3 font-medium">Acceso</th>
              <th className="text-right px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {list.map(e => (
              <tr key={e.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium">{e.name}</td>
                <td className="px-4 py-3 capitalize">{e.role}</td>
                <td className="px-4 py-3 text-gray-600">{e.phone}</td>
                <td className="px-4 py-3 capitalize">{e.payment_type}</td>
                <td className="px-4 py-3 text-right font-mono-display">{money(e.payment_amount)}</td>
                <td className="px-4 py-3 text-center">
                  {e.user_id
                    ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Sí</span>
                    : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">No</span>}
                </td>
                <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => openEdit({ ...e })}><Edit className="w-3.5 h-3.5" /></Button></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-gray-500">Sin empleados</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{edit.id ? "Editar" : "Nuevo"} empleado</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} data-testid="employee-name-input" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Teléfono</Label><Input value={edit.phone || ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
              <div><Label>Puesto</Label>
                <Select value={edit.role} onValueChange={(v) => setEdit({ ...edit, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Tipo de pago</Label>
                <Select value={edit.payment_type} onValueChange={(v) => setEdit({ ...edit, payment_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAY.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Monto</Label><Input type="number" value={edit.payment_amount} onChange={(e) => setEdit({ ...edit, payment_amount: Number(e.target.value) })} /></div>
            </div>
          </div>

          {/* Usuario del sistema: fichaje + permisos. Solo disponible una vez guardado el empleado. */}
          {edit.id && (
            <div className="border-t border-gray-200 pt-3 mt-1">
              <div className="label-uppercase mb-2 flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5" /> Acceso al sistema / fichaje QR
              </div>

              {linkedUser ? (
                <div className="space-y-3">
                  <div className="text-sm bg-gray-50 rounded-md p-2.5">
                    Usuario: <span className="font-mono-display">{linkedUser.username}</span>
                  </div>
                  <div>
                    <Label className="text-xs">Qué puede hacer en el sistema</Label>
                    <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                      {PERMISSIONS.map(p => (
                        <label key={p.key} className="flex items-center gap-1.5 text-sm">
                          <input
                            type="checkbox"
                            checked={(linkedUser.permissions || []).includes(p.key)}
                            onChange={() => {
                              const cur = linkedUser.permissions || [];
                              const next = cur.includes(p.key) ? cur.filter(x => x !== p.key) : [...cur, p.key];
                              updateLinkedPermissions(next);
                            }}
                            data-testid={`linked-perm-${p.key}`}
                          />
                          {p.label}
                        </label>
                      ))}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">Fichar entrada/salida no necesita ningún permiso especial.</div>
                  </div>
                  <Button size="sm" variant="outline" className="text-red-600" onClick={unlinkLogin} data-testid="unlink-login-btn">
                    <UserX className="w-3.5 h-3.5 mr-1.5" /> Quitar acceso
                  </Button>
                </div>
              ) : showLoginForm ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">Nombre de usuario</Label><Input value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })} placeholder="juan.perez" data-testid="login-username-input" /></div>
                    <div><Label className="text-xs">Contraseña</Label><Input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} data-testid="login-password-input" /></div>
                  </div>
                  <div><Label className="text-xs">Email (opcional, para notificaciones)</Label><Input value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} placeholder="juan@real.com" data-testid="login-email-input" /></div>
                  <div>
                    <Label className="text-xs">Qué puede hacer en el sistema</Label>
                    <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                      {PERMISSIONS.map(p => (
                        <label key={p.key} className="flex items-center gap-1.5 text-sm">
                          <input type="checkbox" checked={loginForm.permissions.includes(p.key)} onChange={() => togglePerm(p.key)} data-testid={`new-perm-${p.key}`} />
                          {p.label}
                        </label>
                      ))}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">Si no marcás nada, igual va a poder fichar su entrada/salida — solo no va a poder tocar el resto del sistema.</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setShowLoginForm(false)}>Cancelar</Button>
                    <Button size="sm" className="bg-[hsl(var(--primary))]" onClick={createLogin} data-testid="create-login-btn">Crear usuario</Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setShowLoginForm(true)} data-testid="show-create-login-btn">
                  <KeyRound className="w-3.5 h-3.5 mr-1.5" /> Crear usuario para este empleado
                </Button>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cerrar</Button>
            <Button onClick={save} className="bg-[hsl(var(--primary))]" data-testid="save-employee-btn">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}