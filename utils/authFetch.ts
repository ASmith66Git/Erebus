import { getApiUrl } from './apiConfig';

type LogoutCallback = () => void;

let logoutCallback: LogoutCallback | null = null;

export function setLogoutCallback(callback: LogoutCallback) {
  logoutCallback = callback;
}

export function clearLogoutCallback() {
  logoutCallback = null;
}

export async function authFetch(
  endpoint: string,
  token: string | null,
  options: RequestInit = {}
): Promise<Response> {
  const url = endpoint.startsWith('http') ? endpoint : `${getApiUrl()}${endpoint}`;
  
  const headers: HeadersInit = {
    ...options.headers,
  };
  
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if ((response.status === 401 || response.status === 403) && logoutCallback) {
    logoutCallback();
  }

  return response;
}
