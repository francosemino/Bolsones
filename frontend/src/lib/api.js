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
