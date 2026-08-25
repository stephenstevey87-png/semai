import { useState, useEffect } from "react";
import { getCourses, listInstitutions } from "../api";
import { supabase, signUpUser, signInUser, signOutUser, getUserProfile } from "../supabaseClient";

export default function Join({ onJoin, onAdmin }) {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out
  const [profile, setProfile] = useState(null);
  const [authMode, setAuthMode] = useState("signin"); // signin | signup
  const [institutions, setInstitutions] = useState([]);
  const [authForm, setAuthForm] = useState({ email:"", password:"", name:"", institutionId:"" });
  const [authStatus, setAuthStatus] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [courses,  setCourses]  = useState([]);
  const [courseId, setCourseId] = useState("");
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) listInstitutions().then(setInstitutions).catch(()=>{});
  }, [session]);

  useEffect(() => {
    if (session?.user) getUserProfile(session.user.id).then(setProfile);
    else setProfile(null);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    getCourses()
      .then(d => {
        const list = d.courses || [];
        setCourses(list);
        if (list.length) setCourseId(list[0].id);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [session]);

  const submitAuth = async () => {
    setAuthLoading(true); setAuthStatus("");
    try {
      if (authMode === "signup") {
        if (!authForm.name.trim()) throw new Error("Name is required.");
        if (!authForm.institutionId) throw new Error("Please select your institution.");
        await signUpUser({
          email: authForm.email, password: authForm.password, name: authForm.name,
          role: "student", institutionId: authForm.institutionId,
        });
        setAuthStatus("✅ Account created! Check your email to confirm, then sign in.");
        setAuthMode("signin");
      } else {
        await signInUser(authForm);
      }
    } catch (err) {
      setAuthStatus(`❌ ${err.message || "Something went wrong."}`);
    }
    setAuthLoading(false);
  };

  const canJoin = courseId && session?.user;
  const doJoin = () => canJoin && onJoin(profile?.name || session.user.email, courseId, session.user.id);

  if (session === undefined) {
    return <div style={{ height:"100vh", background:"#0F0C29", display:"flex", alignItems:"center", justifyContent:"center", color:"#6B7280", fontFamily:"system-ui" }}>Loading…</div>;
  }

  return (
    <div style={{ minHeight:"100vh", background:"#0F0C29", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Segoe UI',system-ui,sans-serif" }}>
      <style>{`
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        input:focus,select:focus{outline:none;border-color:#7C3AED!important;box-shadow:0 0 0 2px rgba(124,58,237,0.2)!important}
      `}</style>

      <div style={{ textAlign:"center", width:"90%", maxWidth:400, padding:20 }}>
        {/* Logo */}
        <div style={{ width:76, height:76, borderRadius:22, background:"linear-gradient(135deg,#7C3AED,#4F46E5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:38, margin:"0 auto 20px", boxShadow:"0 0 40px rgba(124,58,237,0.45)", animation:"float 3s ease-in-out infinite" }}>🎓</div>
        <h1 style={{ color:"white", fontSize:28, fontWeight:900, margin:"0 0 4px" }}>SEMAI</h1>
        <p style={{ color:"#A78BFA", fontSize:11, letterSpacing:3, margin:"0 0 4px" }}>AI LECTURER</p>
        <p style={{ color:"#4B5563", fontSize:11, margin:"0 0 24px" }}>SayMyTech Developers</p>

        {!session ? (
          <div style={{ background:"#1A1640", borderRadius:16, padding:24, border:"1px solid #2D2757", textAlign:"left" }}>
            <p style={{ color:"#9CA3AF", fontSize:13, margin:"0 0 16px", textAlign:"center" }}>
              Student {authMode === "signup" ? "Sign Up" : "Sign In"}
            </p>

            {authMode === "signup" && (
              <>
                <label style={{ display:"block", color:"#6B7280", fontSize:11, marginBottom:4 }}>YOUR NAME *</label>
                <input value={authForm.name} onChange={e=>setAuthForm(f=>({...f,name:e.target.value}))}
                  placeholder="Enter your name"
                  style={{ width:"100%", padding:"11px 14px", borderRadius:10, border:"1px solid #3730A3", background:"#0F0C29", color:"white", fontSize:14, marginBottom:12, boxSizing:"border-box" }}/>

                <label style={{ display:"block", color:"#6B7280", fontSize:11, marginBottom:4 }}>INSTITUTION *</label>
                <select value={authForm.institutionId} onChange={e=>setAuthForm(f=>({...f,institutionId:e.target.value}))}
                  style={{ width:"100%", padding:"11px 14px", borderRadius:10, border:"1px solid #3730A3", background:"#0F0C29", color:"white", fontSize:13, marginBottom:12, boxSizing:"border-box" }}>
                  <option value="">Select your institution…</option>
                  {institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                {institutions.length === 0 && (
                  <p style={{ color:"#4B5563", fontSize:11, margin:"-6px 0 12px" }}>Your institution isn't registered yet — ask a lecturer or administrator to set it up first.</p>
                )}
              </>
            )}

            <label style={{ display:"block", color:"#6B7280", fontSize:11, marginBottom:4 }}>EMAIL *</label>
            <input type="email" value={authForm.email} onChange={e=>setAuthForm(f=>({...f,email:e.target.value}))}
              placeholder="you@example.com"
              style={{ width:"100%", padding:"11px 14px", borderRadius:10, border:"1px solid #3730A3", background:"#0F0C29", color:"white", fontSize:14, marginBottom:12, boxSizing:"border-box" }}/>

            <label style={{ display:"block", color:"#6B7280", fontSize:11, marginBottom:4 }}>PASSWORD *</label>
            <input type="password" value={authForm.password} onChange={e=>setAuthForm(f=>({...f,password:e.target.value}))}
              onKeyDown={e=>e.key==="Enter"&&submitAuth()} placeholder="At least 6 characters"
              style={{ width:"100%", padding:"11px 14px", borderRadius:10, border:"1px solid #3730A3", background:"#0F0C29", color:"white", fontSize:14, marginBottom:16, boxSizing:"border-box" }}/>

            {authStatus && <p style={{ color: authStatus.startsWith("✅")?"#34D399":"#F87171", fontSize:12, marginBottom:12 }}>{authStatus}</p>}

            <button onClick={submitAuth} disabled={authLoading || !authForm.email.trim() || !authForm.password.trim()}
              style={{ width:"100%", padding:"13px", borderRadius:10, border:"none", background:authLoading?"#374151":"linear-gradient(135deg,#7C3AED,#4F46E5)", color:"white", fontSize:14, fontWeight:700, cursor:authLoading?"default":"pointer", marginBottom:10 }}>
              {authLoading ? "Please wait…" : authMode === "signup" ? "Create Account →" : "Sign In →"}
            </button>

            <button onClick={()=>{ setAuthMode(m=>m==="signup"?"signin":"signup"); setAuthStatus(""); }}
              style={{ width:"100%", background:"none", border:"none", color:"#6B7280", fontSize:12, cursor:"pointer" }}>
              {authMode === "signup" ? "Already have an account? Sign in" : "New student? Create an account"}
            </button>
          </div>
        ) : (
          <div style={{ background:"#1A1640", borderRadius:16, padding:24, border:"1px solid #2D2757" }}>
            <p style={{ color:"#9CA3AF", fontSize:13, margin:"0 0 4px" }}>Welcome, {profile?.name || session.user.email}</p>
            {profile?.institutions?.name && <p style={{ color:"#4B5563", fontSize:11, margin:"0 0 16px" }}>{profile.institutions.name}</p>}

            <label style={{ display:"block", color:"#6B7280", fontSize:11, textAlign:"left", marginBottom:4 }}>COURSE</label>
            <select value={courseId} onChange={e=>setCourseId(e.target.value)}
              style={{ width:"100%", padding:"11px 14px", borderRadius:10, border:"1px solid #3730A3", background:"#0F0C29", color:"white", fontSize:13, marginBottom:18, boxSizing:"border-box" }}>
              {loading && <option value="">Loading courses…</option>}
              {!loading && courses.length === 0 && <option value="">No courses yet for your institution</option>}
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>

            <button onClick={doJoin} disabled={!canJoin}
              style={{ width:"100%", padding:"13px", borderRadius:10, border:"none", background:canJoin?"linear-gradient(135deg,#7C3AED,#4F46E5)":"#2D2757", color:canJoin?"white":"#6B7280", fontSize:14, fontWeight:700, cursor:canJoin?"pointer":"default" }}>
              Join Lecture →
            </button>

            <button onClick={signOutUser} style={{ width:"100%", background:"none", border:"none", color:"#6B7280", fontSize:11, marginTop:12, cursor:"pointer" }}>Sign out</button>
          </div>
        )}

        <p style={{ color:"#2D2757", fontSize:10, marginTop:14 }}>By Ssemambo Steven · SayMyTech Developers</p>
        <button onClick={onAdmin} style={{ background:"none", border:"none", color:"#4B5563", fontSize:11, marginTop:10, cursor:"pointer", textDecoration:"underline" }}>
          Lecturer or administrator? Sign in here →
        </button>
      </div>
    </div>
  );
}
