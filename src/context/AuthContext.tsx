import React, { createContext, useContext, useState, useEffect } from 'react';
import { AdminUser } from '../types';
import { api, setAuthToken, getAuthToken } from '../api';

interface AuthContextType {
  user: AdminUser | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (perm: string) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  hasPermission: () => false
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }

    api.adminGetMe()
      .then(res => {
        setUser(res.user);
      })
      .catch(() => {
        setAuthToken(null);
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = async (email: string, pass: string) => {
    const res = await api.adminLogin({ email, password: pass });
    setAuthToken(res.token);
    setUser(res.user);
  };

  const logout = async () => {
    await api.adminLogout();
    setUser(null);
  };

  const hasPermission = (perm: string) => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const p = user.permissions || [];
    if (p.includes(perm)) return true;
    if (perm === 'pages' && p.includes('cms')) return true;
    if (perm === 'cms' && p.includes('pages')) return true;
    if (perm === 'admins' && p.includes('users')) return true;
    if (perm === 'users' && p.includes('admins')) return true;
    return false;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
