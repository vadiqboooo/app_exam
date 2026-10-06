import { createContext, useContext } from 'react';
import { Outlet } from 'react-router-dom';
import type { Session } from '../types';

const SessionContext = createContext<{ session: Session; logout: () => void } | null>(null);

/** Who is signed in and how to sign out, for the profile menu inside the Halloween cabinet. */
export function useHalloweenSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('Halloween shell is missing');
  return value;
}

/** The student's cabinet in the Halloween theme: a dark stage with a phone-wide column. */
export function HalloweenShell({ session, logout }: { session: Session; logout: () => void }) {
  return (
    <SessionContext.Provider value={{ session, logout }}>
      <div className="hw-scope hw-stage hw-shell">
        <div className="hw-col">
          <Outlet />
        </div>
      </div>
    </SessionContext.Provider>
  );
}
