import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import "./styles.css";
import { AuthProvider, useAuth } from "./lib/auth.tsx";
import { RulesProvider, useRulesState } from "./lib/rules.tsx";
import { isLocalMode } from "./lib/supabase.ts";
import { Login } from "./pages/Login.tsx";
import { CharacterList } from "./pages/CharacterList.tsx";
import { Wizard } from "./pages/Wizard.tsx";
import { SheetPage } from "./pages/SheetPage.tsx";

function Shell() {
  const auth = useAuth();
  if (!auth.ready) return null;
  if (!auth.userId) return <Login />;
  return (
    <RulesProvider enabled>
      <header className="topbar">
        <Link to="/" className="brand">RuneGate</Link>
        <div className="row small">
          {isLocalMode ? <span className="tag">Local mode</span> : <span className="muted">{auth.email}</span>}
          {!isLocalMode && <button className="btn small quiet" onClick={auth.signOut}>Sign out</button>}
        </div>
      </header>
      <RulesGate />
    </RulesProvider>
  );
}

function RulesGate() {
  const { rules, error } = useRulesState();
  if (error) return <main className="shell"><div className="panel section"><h3>The rules could not be loaded</h3><p style={{ marginTop: "0.5rem" }}>{error}</p><p className="small muted">Check your connection and reload. If it keeps failing, the rules file may be missing from storage.</p></div></main>;
  if (!rules) return <main className="shell"><p className="section muted">Loading the rules…</p></main>;
  return (
    <Routes>
      <Route path="/" element={<CharacterList />} />
      <Route path="/new" element={<Wizard mode="create" />} />
      <Route path="/c/:id" element={<SheetPage />} />
      <Route path="/c/:id/level-up" element={<Wizard mode="levelup" />} />
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
