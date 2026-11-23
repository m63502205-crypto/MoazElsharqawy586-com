import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { AdminUser } from '../types';
import { api, setAuthToken, getAuthToken } from '../api';
import { auth } from '../firebase';
import { signInWithGoogleForAdmin, signOutFirebaseAdmin } from '../utils/firestoreSync';

interface AuthContextType {
  user: AdminUser | null;
  loading: boolean;
  firebaseReady: boolean;
  firebaseEmail: string | null;
  login: (email: string, pass: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  linkGoogleSession: () => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (perm: string) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  firebaseReady: false,
  firebaseEmail: null,
  login: async () => {},
  loginWithGoogle: async () => {},
  linkGoogleSession: async () => {},
  logout: async () => {},
  hasPermission: () => false
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [firebaseEmail, setFirebaseEmail] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, fbUser => {
      if (fbUser && fbUser.email && fbUser.emailVerified) {
        setFirebaseReady(true);
        setFirebaseEmail(fbUser.email.toLowerCase());
      } else {
        setFirebaseReady(false);
        setFirebaseEmail(null);
      }
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
    const { idToken } = await signInWithGoogleForAdmin();
    try {
      const res = await api.adminGoogleLogin(idToken);
      setAuthToken(res.token);
      setUser(res.user);
    } catch (err) {
      await signOutFirebaseAdmin();
      throw err;
    }
  };

  const linkGoogleSession = async () => {
    const { email } = await signInWithGoogleForAdmin();
    if (email) {
      setFirebaseReady(true);
      setFirebaseEmail(email);
    }
  };

  const logout = async () => {
    await api.adminLogout();
    await signOutFirebaseAdmin();
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
    <AuthContext.Provider
      value={{
        user,
        loading,
        firebaseReady,
        firebaseEmail,
        login,
        loginWithGoogle,
        linkGoogleSession,
        logout,
        hasPermission
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
