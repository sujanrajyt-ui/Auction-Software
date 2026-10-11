import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);
const TOKEN_STORAGE_KEY = 'vista_verdict_auth_token';
const USER_STORAGE_KEY = 'vista_verdict_auth_user';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY) || null);
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(USER_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  const saveSession = useCallback((newToken, newUser) => {
    if (newToken && newUser) {
      localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser));
      setToken(newToken);
      setUser(newUser);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
      setToken(null);
      setUser(null);
    }
  }, []);

  const logout = useCallback(() => {
    saveSession(null, null);
  }, [saveSession]);

  const apiFetch = useCallback(
    async (url, options = {}) => {
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(url, {
        ...options,
        headers
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      return data;
    },
    [token]
  );

  useEffect(() => {
    let mounted = true;
    async function verify() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (mounted) {
            setUser(data.user);
            localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
          }
        } else if (mounted) {
          saveSession(null, null);
        }
      } catch {
        // Keep cached user if temporarily offline
      } finally {
        if (mounted) setLoading(false);
      }
    }
    verify();
    return () => {
      mounted = false;
    };
  }, [token, saveSession]);

  const loginAdmin = async (email, password) => {
    const data = await apiFetch('/api/auth/admin-login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    saveSession(data.token, data.user);
    return data.user;
  };

  const loginTeam = async ({ auctionId, code, pin }) => {
    const data = await apiFetch('/api/auth/team-login', {
      method: 'POST',
      body: JSON.stringify({ auctionId, code, pin })
    });
    saveSession(data.token, data.user);
    return data.user;
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        loading,
        loginAdmin,
        loginTeam,
        logout,
        apiFetch
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
