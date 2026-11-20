import { useEffect, useState } from "react";
import { Activity, Bell, BrainCircuit, ChevronDown, ChevronRight, LayoutDashboard, LogOut, Menu, Server, Settings, ShieldCheck, Users, X } from "lucide-react";
import { AlertsPage, CollectorsPage, Dashboard, EgressPage, InfrastructurePage, InsightsPage, SettingsPage, TenantsPage } from "./pages/Pages";
import { getDemoAccountEmail, isDemoSessionActive, loginDemo, logoutDemo } from "./services/authService";
import Toast from "./components/common/Toast";
import "./App.css";

const nav = [["Dashboard",LayoutDashboard],["Infrastructure",Activity],["Tenants",Users],["Collectors",Server],["Alerts & Incidents",Bell],["AI Insights",BrainCircuit],["Egress Proof",ShieldCheck]];
const paths = { Dashboard:"/dashboard", Infrastructure:"/infrastructure", Tenants:"/tenants", Collectors:"/collectors", "Alerts & Incidents":"/alerts", "AI Insights":"/insights", "Egress Proof":"/egress", Settings:"/settings" };
function readRoute() {
 const url = new URL(window.location.href), path = url.pathname.replace(/\/$/, "") || "/dashboard", status = url.searchParams.get("status");
 if (path === "/login") return { name:"Login" };
 if (path === "/tenants") return { name:"Tenants" };
 if (path === "/collectors") {
  const collectorStatus = status?.toLowerCase();
  return { name:"Collectors", status:collectorStatus === "online" ? "Online" : collectorStatus === "offline" ? "Offline" : "All" };
 }
 if (path === "/incidents") return { name:"Alerts & Incidents", tab:"Incidents", activeOnly:status === "active" };
 if (path === "/infrastructure") return { name:"Infrastructure" };
 if (path === "/alerts") return { name:"Alerts & Incidents" };
 if (path === "/insights") return { name:"AI Insights" };
 if (path === "/egress") return { name:"Egress Proof" };
 if (path === "/settings") return { name:"Settings" };
 return { name:"Dashboard" };
}
function goTo(target, { replace = false } = {}) {
 const path = target.startsWith("/") ? target : (paths[target] || "/dashboard");
 window.history[replace ? "replaceState" : "pushState"]({}, "", path);
 window.dispatchEvent(new PopStateEvent("popstate"));
}

function Sidebar({page,go,open,setOpen,onLogout,accountEmail}) { const [profileOpen,setProfileOpen]=useState(false); return <>{open&&<button className="sidebar-overlay" aria-label="Close navigation" onClick={()=>setOpen(false)}/>}<aside className={`sidebar ${open?"sidebar-open":""}`}><div className="brand"><div className="brand-mark"><Activity size={22}/></div><div><div className="brand-name">CICADA<span>.</span></div><div className="brand-caption">SECURE OBSERVABILITY</div></div><button className="mobile-close" onClick={()=>setOpen(false)} aria-label="Close navigation"><X size={18}/></button></div><div className="nav-label">WORKSPACE</div><nav className="navigation" aria-label="Main navigation">{nav.map(([name,Icon])=><button key={name} className={`nav-item ${page===name?"active":""}`} aria-current={page===name?"page":undefined} onClick={()=>go(name)}><Icon size={18}/><span>{name}</span>{name==="Alerts & Incidents"&&<span className="nav-count">3</span>}</button>)}</nav><div className="sidebar-bottom"><div className="collector-status"><div className="collector-status-icon"><ShieldCheck size={18}/></div><div><strong>Privacy boundary</strong><span>Local filtering Â· demo</span></div></div><button className={`nav-item ${page==="Settings"?"active":""}`} onClick={()=>go("Settings")}><Settings size={18}/><span>Settings</span></button><button className="profile profile-button" aria-expanded={profileOpen} onClick={()=>setProfileOpen(v=>!v)}><div className="profile-avatar">AD</div><div className="profile-info"><strong>Admin User</strong><span>{accountEmail || "Demo account"}</span></div><ChevronDown size={15}/></button>{profileOpen&&<div className="profile-menu"><span>{accountEmail || "Demo session"}</span><button onClick={onLogout}><LogOut size={14}/>Log out</button></div>}</div></aside></> }
function Header({page,setOpen}) { return <header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={()=>setOpen(true)} aria-label="Open navigation"><Menu size={21}/></button><div className="breadcrumb"><span>Workspace</span><ChevronRight size={14}/><strong>{page}</strong></div></div><div className="topbar-actions"><span className="environment-pill"><i/> DEMO MODE</span><span className="topbar-user">AD</span></div></header> }

export function LoginPage({onLogin}) {
 const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[remember,setRemember]=useState(false),[visible,setVisible]=useState(false),[error,setError]=useState(""),[loading,setLoading]=useState(false);
 const submit=async(e)=>{e.preventDefault();setError("");if(!email.trim()||!/^\S+@\S+\.\S+$/.test(email.trim())){setError("Enter a valid email address.");return}if(!password){setError("Enter a password to continue.");return}setLoading(true);const result=await loginDemo({email:email.trim(),password,remember});setLoading(false);if(result.success)onLogin(result.accountEmail);else setError(result.message)};
 return <main className="login-shell"><section className="login-card"><div className="login-brand"><div className="brand-mark"><Activity size={23}/></div><div><div className="brand-name">CICADA<span>.</span></div><div className="brand-caption">SECURE OBSERVABILITY</div></div></div><div className="login-title"><span className="eyebrow">SECURE AIOPS OBSERVABILITY PLATFORM</span><h1>Welcome back</h1><p>Sign in to continue to your monitoring workspace.</p></div><div className="login-demo-note"><ShieldCheck size={17}/><div><strong>Frontend demo login</strong><span>Enter any valid email and a non-empty password. This demo does not verify credentials.</span></div></div><form onSubmit={submit} noValidate><label className="login-field">Email address<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@organisation.com" aria-invalid={!!error&&(!email.trim()||!/^\S+@\S+\.\S+$/.test(email.trim()))}/></label><label className="login-field">Password<div className="password-control"><input type={visible?"text":"password"} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password"/><button type="button" className="password-toggle" onClick={()=>setVisible(v=>!v)}>{visible?"Hide":"Show"}</button></div></label>{error&&<p className="login-error" role="alert">{error}</p>}<div className="login-options"><label><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>Remember this demo session</label></div><button className="primary-button login-submit" type="submit" disabled={loading}>{loading?"Starting demo sessionâ€¦":"Continue to CICADA"}</button></form><p className="login-footnote">Demo only Â· No password is saved. Remembering this session stores only a demo-session marker in this browser.</p><div className="login-project">CICADA 2026 Â· Secure AIOps Observability Platform</div></section></main>;
}

export default function App() {
 const [session,setSession]=useState(isDemoSessionActive),[accountEmail,setAccountEmail]=useState(getDemoAccountEmail),[route,setRoute]=useState(readRoute),[open,setOpen]=useState(false),[toast,setToast]=useState(null);
 useEffect(()=>{const sync=()=>setRoute(readRoute());window.addEventListener("popstate",sync);return()=>window.removeEventListener("popstate",sync)},[]);
 useEffect(()=>{if(!session&&route.name!=="Login"){goTo("/login",{replace:true})}else if(session&&route.name==="Login"){goTo("/dashboard",{replace:true})}},[session,route.name]);
 const go=(target)=>{if(!session)return;goTo(target);setOpen(false)};
 const login=(email)=>{setAccountEmail(email);setSession(true);goTo("/dashboard",{replace:true})};
 const logout=()=>{logoutDemo();setAccountEmail("");setSession(false);goTo("/login",{replace:true})};
 const notify=(message)=>{setToast({type:"info",title:"Demo updated",message});window.setTimeout(()=>setToast(null),3500)};
 if(!session||route.name==="Login")return <LoginPage onLogin={login}/>;
 const pageName=route.name;
 const view=pageName==="Dashboard"?<Dashboard navigate={go}/>:pageName==="Infrastructure"?<InfrastructurePage/>:pageName==="Tenants"?<TenantsPage/>:pageName==="Collectors"?<CollectorsPage key={`${pageName}-${route.status}`} initialStatus={route.status} navigate={go}/>:pageName==="Alerts & Incidents"?<AlertsPage key={`${pageName}-${route.tab||"alerts"}-${route.activeOnly}`} initialTab={route.tab} activeOnly={route.activeOnly} navigate={go} notify={notify}/>:pageName==="AI Insights"?<InsightsPage notify={notify}/>:pageName==="Egress Proof"?<EgressPage/>:<SettingsPage notify={notify} accountEmail={accountEmail}/>;
 const heading=route.status==="Online"?"Online Collectors":route.activeOnly?"Active Incidents":pageName;
 return <div className="app-shell"><Sidebar page={pageName} go={go} open={open} setOpen={setOpen} onLogout={logout} accountEmail={accountEmail}/><main className="main-area"><Header page={heading} setOpen={setOpen}/><div className="page-content">{view}</div></main><Toast toast={toast} onClose={()=>setToast(null)}/></div>;
}




