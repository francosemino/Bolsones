import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export const API_BASE = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// Attach bearer token from localStorage on each request (cookie + bearer dual)
api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("bc_token");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// Si el token venció (o es inválido) en cualquier pedido, sacamos a la
// persona directo al login en vez de dejarla trabada con un cartel de error
// sin explicación, salvo que el 401 sea del login mismo (credenciales mal
// tipeadas, ese no debe redirigir).
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const isLoginCall = error.config?.url?.includes("/auth/login");
    const isProtectedPage = window.location.pathname.startsWith("/app");
    if (error.response?.status === 401 && !isLoginCall && isProtectedPage) {
      localStorage.removeItem("bc_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export function setToken(token) {
  if (token) localStorage.setItem("bc_token", token);
  else localStorage.removeItem("bc_token");
}

export function formatApiError(detail) {
  if (detail == null) return "Ocurrió un error. Intentá de nuevo.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  }
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
