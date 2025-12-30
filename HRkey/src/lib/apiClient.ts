import { supabase } from "./supabaseClient";

const ENV_API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_PUBLIC_URL ||
  "";

const normalizeBase = (base: string) => base.replace(/\/$/, "");
const ensureLeadingSlash = (path: string) => (path.startsWith("/") ? path : `/${path}`);

export const resolveApiBase = () => {
  if (ENV_API_BASE) return normalizeBase(ENV_API_BASE);
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    const isLocal = origin.includes("localhost:3000") || origin.includes("127.0.0.1:3000");
    return normalizeBase(isLocal ? "http://localhost:3001" : origin);
  }
  return "http://localhost:3001";
};

const buildUrl = (path: string, query?: Record<string, string | number | boolean | null | undefined>) => {
  const baseUrl = resolveApiBase();
  const url = new URL(`${baseUrl}${ensureLeadingSlash(path)}`);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
};

const getSupabaseToken = async () => {
  if (typeof window === "undefined") return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn("Unable to retrieve Supabase session", error);
    return null;
  }
  return data.session?.access_token ?? null;
};

export class ApiClientError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
    this.name = "ApiClientError";
  }
}

export type ApiRequestOptions = {
  auth?: boolean;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  signal?: AbortSignal;
};

const request = async <T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> => {
  const url = buildUrl(path, options.query);
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  };

  const shouldAttachAuth = options.auth !== false;
  if (shouldAttachAuth) {
    const token = await getSupabaseToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(url, {
    method,
    headers,
    body: method === "GET" ? undefined : options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
    credentials: "include",
  });

  const rawText = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  let data: unknown = null;
  if (rawText) {
    if (isJson) {
      try {
        data = JSON.parse(rawText);
      } catch (err) {
        console.warn("Unable to parse JSON response", err);
        data = rawText;
      }
    } else {
      data = rawText;
    }
  }

  if (!response.ok) {
    const message = (data as any)?.error || (data as any)?.message || `Request failed with status ${response.status}`;
    throw new ApiClientError(message, response.status, data);
  }

  return data as T;
};

export const apiGet = async <T>(path: string, options?: ApiRequestOptions) => request<T>("GET", path, options);
export const apiPost = async <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
  request<T>("POST", path, { ...options, body });
export const apiPatch = async <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
  request<T>("PATCH", path, { ...options, body });

export const apiClient = {
  get: apiGet,
  post: apiPost,
  patch: apiPatch,
  resolveApiBase,
};

