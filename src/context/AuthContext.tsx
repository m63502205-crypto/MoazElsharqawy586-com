import React, { createContext, useContext, useState, useEffect } from 'react';
import { AdminUser } from '../types';
import { api, setAuthToken, getAuthToken } from '../api';
import {
  firebaseAuth,
  onAuthStateChanged,
  signInWithGooglePopup,
  signOutFirebase,
  type FirebaseUser
} from '../firebase';

interface AuthContextType {
  user: AdminUser | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  linkCloudSync: () => Promise<{ seeded?: boolean; pulled?: boolean }>;
  logout: () => Promise<void>;
  hasPermission: (perm: string) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  loading: true,
  login: async () => {},
  loginWithGoogle: async () => {},
  linkCloudSync: async () => ({}),
  logout: async () => {},
  hasPermission: () => false
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, fbUser => {
      setFirebaseUser(fbUser);
    });
    return () => unsub();
  }, []);

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

  const login = async (identifier: string, pass: string) => {
    const res = await api.adminLogin({ email: identifier, identifier, password: pass });
    setAuthToken(res.token);
    setUser(res.user);
  };

  const loginWithGoogle = async () => {
    const { user: fbUser, idToken } = await signInWithGooglePopup();
    setFirebaseUser(fbUser);
    const res = await api.adminLoginGoogle(idToken);
    setAuthToken(res.token);
    setUser(res.user);
  };

  const linkCloudSync = async () => {
    const { user: fbUser, idToken } = await signInWithGooglePopup();
    setFirebaseUser(fbUser);
    return await api.adminCloudSync({ idToken });
  };

  const logout = async () => {
    await api.adminLogout();
    try {
      await signOutFirebase();
    } catch {
      // ignore
    }
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
    <AuthContext.Provider value={{ user, firebaseUser, loading, login, loginWithGoogle, linkCloudSync, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
