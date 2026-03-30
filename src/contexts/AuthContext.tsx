import React, { createContext, useContext, useState } from 'react';
import { User } from '@/types';
import { mockUser, mockAdmin } from '@/data/mockData';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => boolean;
  logout: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => false,
  logout: () => {},
  isAdmin: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  const login = (email: string, _password: string) => {
    if (email.includes('admin')) {
      setUser(mockAdmin);
    } else {
      setUser(mockUser);
    }
    return true;
  };

  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin: user?.role === 'club_admin' }}>
      {children}
    </AuthContext.Provider>
  );
};
