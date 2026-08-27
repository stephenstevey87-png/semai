import { useState, useEffect, useRef } from "react";
import { getCourses, deleteCourse, saveCourse, generateCourse, listInstitutions, getInstitutionDashboard, listPlatforms, savePlatform, deletePlatform } from "../api";
import { supabase, signUpUser, signInUser, signOutUser, getUserProfile } from "../supabaseClient";

function blankPlatform() {
  return { name:"", issuer:"", client_id:"", deployment_id:"", auth_login_url:"", auth_token_url:"", jwks_url:"", default_course_id:"" };
}

export default function Admin({ onBack }) {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out
  const [profile, setProfile] = useState(null);
  const [authMode, setAuthMode] = useState("signin"); // signin | signup
  const [signupKind, setSignupKind] = useState("join"); // join (existing institution, as lecturer) | register (new institution, becomes admin)
  const [institutions, setInstitutions] = useState([]);
  const [authForm, setAuthForm] = useState({ username:"", password:"", name:"", institutionId:"", newInstitutionName:"" });
  const [authStatus, setAuthStatus] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [courses, setCourses] = useState([]);
  const [tab, setTab] = useState("list"); // list | generate | institution

  const [genForm, setGenForm] = useState({ title:"", lecturer:"", institution:"", sourceText:"" });
  const [genStatus, setGenStatus] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const fileInputRef = useRef(null);

  const [dash, setDash] = useState(null); // institution dashboard data
  const [dashLoading, setDashLoading] = useState(false);
  const [platforms, setPlatforms] = useState([]);
  const [platformForm, setPlatformForm] = useState(blankPlatform());
  const [platformStatus, setPlatformStatus] = useState("");
  const [platformSaving, setPlatformSaving] = useState(false);

  // ── Auth session ─────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { listInstitutions().then(setInstitutions).catch(()=>{}); }
  }, [session]);

  useEffect(() => {
    if (session?.user) {
      getUserProfile(session.user.id).then(p => {
        setProfile(p);
        if (p) setGenForm(f => ({ ...f, lecturer: p.name, institution: p.institutions?.name || "" }));
      });
    } else {
      setProfile(null);
    }
  }, [session]);

  const load = () => getCourses().then(d => setCourses(d.courses || []));
  useEffect(() => { if (session) load(); }, [session]);

  const loadPlatforms = () => {
    if (profile?.institution_id) listPlatforms(profile.institution_id).then(setPlatforms).catch(()=>{});
  };
  useEffect(() => { if (profile?.role === "institution_admin" && tab === "lms") loadPlatforms(); }, [profile, tab]);

  useEffect(() => {
    if (profile?.role === "institution_admin" && profile.institution_id && tab === "institution") {
      setDashLoading(true);
      getInstitutionDashboard(profile.institution_id).then(setDash).catch(()=>{}).finally(()=>setDashLoading(false));
    }
  }, [profile, tab]);

  const submitAuth = async () => {
    setAuthLoading(true); setAuthStatus("");
    try {
      if (authMode === "signup") {
        if (!authForm.name.trim()) throw new Error("Name is required.");
        if (!authForm.username.trim()) throw new Error("Username is required.");
        if (signupKind === "join" && !authForm.institutionId) throw new Error("Please select your institution.");
        if (signupKind === "register" && !authForm.newInstitutionName.trim()) throw new Error("Institution name is required.");
        await signUpUser({
          username: authForm.username, password: authForm.password, name: authForm.name,
          role: "lecturer",
          institutionId: signupKind === "join" ? authForm.institutionId : undefined,
          newInstitutionName: signupKind === "register" ? authForm.newInstitutionName.trim() : undefined,
        });
        // signUpUser signs the account straight in — no email confirmation step exists in
        // this flow at all, so there's nothing further to wait on here.
      } else {
        await signInUser(authForm);
      }
    } catch (err) {
      setAuthStatus(`❌ ${err.message || "Something went wrong."}`);
    }
    setAuthLoading(false);
  };

  const signOut = async () => { await signOutUser(); };

  const del = async (id) => {
    if (!confirm("Delete this course? This removes it for everyone using the app.")) return;
    try { await deleteCourse(id); load(); } catch (err) { alert(err.message); }
  };

  // ── Generate flow ────────────────────────────────────────────────────────
  const genInp = (field) => ({
    value: genForm[field],
    onChange: e => setGenForm(f => ({ ...f, [field]: e.target.value })),
    style: { width:"100%", padding:"10px 13px", borderRadius:9, border:"1px solid #374151", background:"#111827", color:"white", fontSize:13, outline:"none", boxSizing:"border-box", marginBottom:12 },
  });

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadLoading(true); setGenStatus("");
    try {
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        throw new Error("PDF upload isn't supported in this version — paste the text directly, or upload a .txt file instead.");
      }
      const text = await file.text();
      setGenForm(f => ({ ...f, sourceText: f.sourceText ? `${f.sourceText}\n\n${text}` : text }));
      setGenStatus(`✅ Loaded text from ${file.name} — review it below before generating.`);
    } catch (err) {
      setGenStatus(`❌ ${err.message}`);
    }
    setUploadLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const runGenerate = async () => {
    if (!genForm.title.trim()) { setGenStatus("❌ Course title is required."); return; }
    if (!genForm.sourceText.trim()) { setGenStatus("❌ Describe the content, or upload a .txt file first."); return; }
    setGenLoading(true); setGenStatus(""); setPreview(null);
    try {
      const course = await generateCourse(genForm);
      setPreview(course);
      setGenStatus(`✅ Generated ${course.modules.length} module${course.modules.length===1?"":"s"}${course.subject ? ` for ${course.subject}` : ""} — review below, then save.`);
    } catch (err) {
      setGenStatus(`❌ ${err.message || "Generation failed — please try again."}`);
    }
    setGenLoading(false);
  };

  const savePreview = async () => {
    if (!preview) return;
    setGenLoading(true);
    try {
      await saveCourse({ title: genForm.title, ...preview });
      setGenStatus("✅ Course unit saved! It's now available to your institution's students on the Join screen.");
      setPreview(null);
      setGenForm(f => ({ title:"", lecturer:f.lecturer, institution:f.institution, sourceText:"" }));
      load();
      setTab("list");
    } catch (err) {
      setGenStatus(`❌ ${err.message || "Save failed — please try again."}`);
    }
    setGenLoading(false);
  };

  // ── LTI / LMS platform registration ─────────────────────────────────────
  const submitPlatform = async () => {
    const p = platformForm;
    if (!p.name.trim() || !p.issuer.trim() || !p.client_id.trim() || !p.deployment_id.trim() || !p.auth_login_url.trim() || !p.jwks_url.trim()) {
      setPlatformStatus("❌ Name, Issuer, Client ID, Deployment ID, Auth Login URL, and JWKS URL are all required.");
      return;
    }
    setPlatformSaving(true); setPlatformStatus("");
    try {
      await savePlatform({ ...p, institution_id: profile.institution_id, default_course_id: p.default_course_id || null });
      setPlatformStatus("✅ Platform saved.");
      setPlatformForm(blankPlatform());
      loadPlatforms();
    } catch (err) {
      setPlatformStatus(`❌ ${err.message || "Save failed."}`);
    }
    setPlatformSaving(false);
  };

  const removePlatform = async (id) => {
    if (!confirm("Remove this LMS connection? Existing launches from it will stop working.")) return;
    try { await deletePlatform(id); loadPlatforms(); } catch (err) { alert(err.message); }
  };

  const SUPABASE_FN_BASE = "https://hyxxmiigacfkqdwvxsjh.supabase.co/functions/v1";

  // ── Loading ──────────────────────────────────────────────────────────────
  if (session === undefined) {
    return <div style={{ height:"100vh", background:"#0F0C29", display:"flex", alignItems:"center", justifyContent:"center", color:"#6B7280", fontFamily:"system-ui" }}>Loading…</div>;
  }

  // ── Sign in / sign up gate ───────────────────────────────────────────────
  if (!session) {
    return (
      <div style={{ minHeight:"100vh", background:"#0F0C29", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Segoe UI',system-ui,sans-serif" }}>
        <div style={{ width:"90%", maxWidth:400, padding:20 }}>
          <div style={{ textAlign:"center", marginBottom:20 }}>
            <div style={{ width:64, height:64, borderRadius:18, background:"linear-gradient(135deg,#7C3AED,#4F46E5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:30, margin:"0 auto 14px" }}>🎓</div>
            <h2 style={{ color:"white", fontSize:20, fontWeight:800, margin:"0 0 4px" }}>Staff {authMode === "signup" ? "Sign Up" : "Sign In"}</h2>
            <p style={{ color:"#6B7280", fontSize:12, margin:0 }}>For lecturers and institution administrators.</p>
          </div>
          <div style={{ background:"#1A1640", borderRadius:16, padding:22, border:"1px solid #2D2757" }}>
            {authMode === "signup" && (
              <>
                <div style={{ display:"flex", gap:6, marginBottom:14, background:"#0F0C29", borderRadius:10, padding:3 }}>
                  <button onClick={()=>setSignupKind("join")}
                    style={{ flex:1, padding:"8px", borderRadius:8, border:"none", background:signupKind==="join"?"#7C3AED":"transparent", color:signupKind==="join"?"white":"#6B7280", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                    Join my institution
                  </button>
                  <button onClick={()=>setSignupKind("register")}
                    style={{ flex:1, padding:"8px", borderRadius:8, border:"none", background:signupKind==="register"?"#7C3AED":"transparent", color:signupKind==="register"?"white":"#6B7280", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                    Register new institution
                  </button>
                </div>

                <label style={{ display:"block", color:"#6B7280", fontSize:11, marginBottom:4 }}>YOUR NAME *</label>
                <input value={authForm.name} onChange={e=>setAuthForm(f=>({...f,name:e.target.value}))}
                  placeholder="e.g. Ssemambo Steven"
                  style={{ width:"100%", padding:"11px 14px", borderRadius:10, border:"1px solid #3730A3", background:"#0F0C29", color:"white", fontSize:14, marginBottom:12, boxSizing:"border-box" }}/>

                {signupKind === "join" ? (
                  <>
                    <label style={{ display:"block", color:"#6B7280", fontSize:11, marginBottom:4 }}>INSTITUTION *</label>
                    <select value={authForm.institutionId} onChange={e=>setAuthForm(f=>({...f,institutionId:e.target.value}))}
                      style={{ width:"100%", padding:"11px 14px", borderRadius:10, border:"1px solid #3730A3", background:"#0F0C29", color:"white", fontSize:13, marginBottom:12, boxSizing:"border-box" }}>
                      <option value="">Select your institution…</option>
                      {institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                    {institutions.length === 0 && (
                      <p style={{ color:"#4B5563", fontSize:11, margin:"-6px 0 12px" }}>No institutions registered yet — use "Register new institution" above if you're the first from your school.</p>
                    )}
                  </>
                ) : (
                  <>
                    <label style={{ display:"block", color:"#6B7280", fontSize:11, marginBottom:4 }}>INSTITUTION NAME *</label>
                    <input value={authForm.newInstitutionName} onChange={e=>setAuthForm(f=>({...f,newInstitutionName:e.target.value}))}
                      placeholder="e.g. Makerere University"
                      style={{ width:"100%", padding:"11px 14px", borderRadius:10, border:"1px solid #3730A3", background:"#0F0C29", color:"white", fontSize:14, marginBottom:6, boxSizing:"border-box" }}/>
                    <p style={{ color:"#4B5563", fontSize:11, margin:"0 0 12px" }}>You'll become this institution's administrator, overseeing its lecturers, courses, and students.</p>
                  </>
                )}
              </>
            )}
            <label style={{ display:"block", color:"#6B7280", fontSize:11, marginBottom:4 }}>USERNAME *</label>
            <input value={authForm.username} onChange={e=>setAuthForm(f=>({...f,username:e.target.value}))}
              placeholder="e.g. ssemambo.steven" autoCapitalize="off" autoCorrect="off"
              style={{ width:"100%", padding:"11px 14px", borderRadius:10, border:"1px solid #3730A3", background:"#0F0C29", color:"white", fontSize:14, marginBottom:12, boxSizing:"border-box" }}/>
            {authMode === "signup" && <p style={{ color:"#4B5563", fontSize:10.5, margin:"-8px 0 12px" }}>Letters, numbers, dots, dashes, and underscores only.</p>}
            <label style={{ display:"block", color:"#6B7280", fontSize:11, marginBottom:4 }}>PASSWORD *</label>
            <input type="password" value={authForm.password} onChange={e=>setAuthForm(f=>({...f,password:e.target.value}))}
              onKeyDown={e=>e.key==="Enter"&&submitAuth()} placeholder="At least 6 characters"
              style={{ width:"100%", padding:"11px 14px", borderRadius:10, border:"1px solid #3730A3", background:"#0F0C29", color:"white", fontSize:14, marginBottom:16, boxSizing:"border-box" }}/>

            {authStatus && <p style={{ color: authStatus.startsWith("✅")?"#34D399":"#F87171", fontSize:12, marginBottom:12 }}>{authStatus}</p>}

            <button onClick={submitAuth} disabled={authLoading || !authForm.username.trim() || !authForm.password.trim()}
              style={{ width:"100%", padding:"13px", borderRadius:10, border:"none", background:authLoading?"#374151":"linear-gradient(135deg,#7C3AED,#4F46E5)", color:"white", fontSize:14, fontWeight:700, cursor:authLoading?"default":"pointer", marginBottom:12 }}>
              {authLoading ? "Please wait…" : authMode === "signup" ? "Create Account →" : "Sign In →"}
            </button>

            <button onClick={()=>{ setAuthMode(m=>m==="signup"?"signin":"signup"); setAuthStatus(""); }}
              style={{ width:"100%", background:"none", border:"none", color:"#6B7280", fontSize:12, cursor:"pointer" }}>
              {authMode === "signup" ? "Already have an account? Sign in" : "New here? Create a staff account"}
            </button>
          </div>
          <button onClick={onBack} style={{ display:"block", margin:"14px auto 0", background:"none", border:"none", color:"#4B5563", fontSize:12, cursor:"pointer" }}>← Back</button>
        </div>
      </div>
    );
  }

  // ── Signed in ────────────────────────────────────────────────────────────
  const displayName = profile?.name || profile?.username || "there";
  const isAdmin = profile?.role === "institution_admin";
  const tabs = isAdmin ? ["list","generate","institution","lms"] : ["list","generate"];

  return (
    <div style={{ minHeight:"100vh", background:"#0F0C29", fontFamily:"'Segoe UI',system-ui,sans-serif", color:"white" }}>
      <div style={{ background:"#161616", borderBottom:"1px solid #2D2D2D", padding:"12px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:20 }}>🎓</span>
          <span style={{ fontWeight:700, fontSize:15 }}>SEMAI Admin</span>
          <span style={{ color:"#4B5563", fontSize:11 }}>· {displayName}{profile?.institutions?.name ? ` · ${profile.institutions.name}` : ""}</span>
          {isAdmin && <span style={{ background:"#312E81", border:"1px solid #4338CA", borderRadius:20, padding:"1px 10px", fontSize:10, color:"#A5B4FC" }}>🏛 Admin</span>}
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={signOut} style={{ background:"#2D2D2D", border:"none", borderRadius:8, padding:"6px 14px", color:"#9CA3AF", cursor:"pointer", fontSize:12 }}>Sign out</button>
          <button onClick={onBack} style={{ background:"#1F2937", border:"1px solid #374151", borderRadius:8, padding:"6px 14px", color:"#9CA3AF", cursor:"pointer", fontSize:12 }}>← Back</button>
        </div>
      </div>

      <div style={{ maxWidth:820, margin:"30px auto", padding:"0 20px 60px" }}>
        <div style={{ display:"flex", gap:0, marginBottom:20, borderBottom:"1px solid #2D2D2D", flexWrap:"wrap" }}>
          {tabs.map(t => (
            <button key={t} onClick={()=>setTab(t)} style={{ background:"none", border:"none", borderBottom:tab===t?"2px solid #7C3AED":"2px solid transparent", color:tab===t?"#A78BFA":"#6B7280", cursor:"pointer", padding:"9px 18px", fontSize:13, fontWeight:tab===t?600:400 }}>
              {t==="list" ? `📚 Course Units (${courses.length})` : t==="generate" ? "✨ Add a Course Unit" : t==="institution" ? "🏛 Institution Dashboard" : "🔗 LMS Integration"}
            </button>
          ))}
        </div>

        {tab==="list" && (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <p style={{ color:"#4B5563", fontSize:11, margin:"0 0 6px" }}>
              Courses your institution's students can see on the Join screen. You can only delete units you created yourself.
            </p>
            {courses.length === 0 && <p style={{ color:"#4B5563", textAlign:"center", marginTop:30 }}>No courses yet. Try "Add a Course Unit" above.</p>}
            {courses.map(c => {
              const isMine = c.lecturer && (c.lecturer === profile?.name || c.lecturer === profile?.username);
              return (
                <div key={c.id} style={{ background:"#1A1A2E", border:"1px solid #2D2D4A", borderRadius:12, padding:"16px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:14, marginBottom:3 }}>{c.title}</div>
                    <div style={{ color:"#6B7280", fontSize:11 }}>
                      {c.moduleCount} modules{c.subject ? ` · ${c.subject}` : ""}{c.lecturer ? ` · by ${c.lecturer}` : ""}
                    </div>
                    {c.description && <div style={{ color:"#4B5563", fontSize:11, marginTop:3 }}>{c.description.slice(0,90)}…</div>}
                  </div>
                  {isMine && (
                    <button onClick={()=>del(c.id)} style={{ background:"#991B1B", border:"none", borderRadius:7, padding:"6px 12px", color:"white", cursor:"pointer", fontSize:11, flexShrink:0 }}>Delete</button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab==="generate" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ background:"#1A1A2E", border:"1px solid #2D2D4A", borderRadius:14, padding:24 }}>
              <h3 style={{ margin:"0 0 4px", fontSize:15, color:"#A78BFA" }}>Add a new course unit</h3>
              <p style={{ color:"#6B7280", fontSize:12, margin:"0 0 18px" }}>
                Works for any subject — programming, business, marketing, accounting, history, science,
                law, anything you teach. Every course you add becomes its own separate unit and appears
                as a new option on the Join screen for students at your institution. Upload your slides
                or a syllabus, paste your notes, or just describe the topics you want covered — SEMAI
                will design the modules, slides, and a fitting hands-on exercise.
              </p>

              <label style={{ fontSize:11, color:"#6B7280" }}>COURSE TITLE *</label>
              <input {...genInp("title")} placeholder="e.g. BUS 220 — Principles of Marketing"/>

              <label style={{ fontSize:11, color:"#6B7280" }}>LECTURER NAME</label>
              <input {...genInp("lecturer")} placeholder="e.g. Ssemambo Steven"/>

              <label style={{ fontSize:11, color:"#6B7280" }}>INSTITUTION</label>
              <input {...genInp("institution")} placeholder="e.g. Makerere University" disabled/>

              <label style={{ fontSize:11, color:"#6B7280" }}>UPLOAD NOTES (.txt)</label>
              <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:12 }}>
                <input ref={fileInputRef} type="file" accept=".txt" onChange={handleFile}
                  style={{ fontSize:12, color:"#9CA3AF" }}/>
                {uploadLoading && <span style={{ fontSize:11, color:"#A78BFA" }}>Loading…</span>}
              </div>

              <label style={{ fontSize:11, color:"#6B7280" }}>OR PASTE YOUR COURSE / MODULE OUTLINE *</label>
              <p style={{ color:"#4B5563", fontSize:11, margin:"2px 0 6px" }}>
                Paste a syllabus, lecture notes, or just describe the concepts you want SEMAI to teach —
                the more detail you give, the closer the generated slides will match your actual lecture.
              </p>
              <textarea value={genForm.sourceText} onChange={e=>setGenForm(f=>({...f,sourceText:e.target.value}))}
                placeholder="Paste a course outline like:&#10;&#10;Module 1: Introduction to the 4 Ps — product, price, place, promotion, with real brand examples.&#10;Module 2: Market Segmentation — demographic, psychographic, and behavioural segmentation, case study.&#10;Module 3: Digital Marketing Basics — SEO, social media, email campaigns, measuring ROI.&#10;&#10;...or just describe the topics you want covered."
                rows={9}
                style={{ width:"100%", padding:"10px 13px", borderRadius:9, border:"1px solid #374151", background:"#111827", color:"white", fontSize:13, outline:"none", boxSizing:"border-box", resize:"vertical", marginBottom:14 }}/>

              {genStatus && <p style={{ color: genStatus.startsWith("✅")?"#34D399":"#F87171", fontSize:12, marginBottom:10 }}>{genStatus}</p>}

              <button onClick={runGenerate} disabled={genLoading}
                style={{ background:genLoading?"#374151":"linear-gradient(135deg,#7C3AED,#4F46E5)", border:"none", borderRadius:10, padding:"12px 24px", color:"white", cursor:genLoading?"default":"pointer", fontSize:13, fontWeight:700 }}>
                {genLoading ? "SEMAI is designing your course…" : "✨ Generate Course"}
              </button>
            </div>

            {preview && (
              <div style={{ background:"#1A1A2E", border:"1px solid #2D2D4A", borderRadius:14, padding:24 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6, flexWrap:"wrap", gap:10 }}>
                  <div>
                    <h3 style={{ margin:0, fontSize:15, color:"#A78BFA" }}>Preview: {genForm.title}</h3>
                    <p style={{ color:"#6B7280", fontSize:12, margin:"4px 0 0" }}>{preview.description}{preview.subject ? ` · ${preview.subject}` : ""}</p>
                  </div>
                  <button onClick={savePreview} disabled={genLoading}
                    style={{ background:"#7C3AED", border:"none", borderRadius:9, padding:"10px 18px", color:"white", cursor:"pointer", fontSize:12, fontWeight:700, whiteSpace:"nowrap", flexShrink:0 }}>
                    ✅ Save Course
                  </button>
                </div>

                <div style={{ display:"flex", flexDirection:"column", gap:12, marginTop:16 }}>
                  {preview.modules.map((m, i) => (
                    <div key={m.id} style={{ background:"#111827", border:"1px solid #2D2D4A", borderRadius:10, padding:14 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                        <span style={{ fontSize:18 }}>{m.icon}</span>
                        <span style={{ fontWeight:600, fontSize:13 }}>{i+1}. {m.title}</span>
                        <span style={{ color:"#4B5563", fontSize:11, marginLeft:"auto" }}>{m.slides.length} slides</span>
                      </div>
                      {m.slides.map((s, si) => (
                        <div key={si} style={{ marginBottom:8, paddingLeft:10, borderLeft:"2px solid #2D2D4A" }}>
                          <div style={{ fontSize:12, color:"#E2E8F0", fontWeight:600, marginBottom:2 }}>{s.title}</div>
                          <ul style={{ margin:0, paddingLeft:16, color:"#9CA3AF", fontSize:11.5, lineHeight:1.6 }}>
                            {s.bullets.map((b, bi) => <li key={bi}>{b}</li>)}
                          </ul>
                        </div>
                      ))}
                      {m.practicalType !== "none" && m.practical && (
                        <details style={{ marginTop:8 }}>
                          <summary style={{ cursor:"pointer", fontSize:11, color:"#7C3AED" }}>
                            View {m.practicalType === "code" ? `code demo (${m.practicalLanguage || "code"})` : "worked example"}
                          </summary>
                          <pre style={{ background:"#0A0A0A", borderRadius:7, padding:10, fontSize:11, color:"#D4D4D4", overflowX:"auto", marginTop:6, fontFamily:"'Fira Code',monospace", whiteSpace:"pre-wrap" }}>{m.practical}</pre>
                          {m.practicalNote && <p style={{ color:"#6B7280", fontSize:11, marginTop:6 }}>{m.practicalNote}</p>}
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab==="institution" && isAdmin && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {dashLoading && <p style={{ color:"#6B7280", textAlign:"center", marginTop:20 }}>Loading dashboard…</p>}
            {dash && (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:12 }}>
                  {[
                    { label:"Lecturers", value: dash.lecturers.length, icon:"👩‍🏫" },
                    { label:"Students", value: dash.students.length, icon:"🎓" },
                    { label:"Courses", value: dash.courses.length, icon:"📚" },
                  ].map(s => (
                    <div key={s.label} style={{ background:"#1A1A2E", border:"1px solid #2D2D4A", borderRadius:12, padding:16, textAlign:"center" }}>
                      <div style={{ fontSize:22 }}>{s.icon}</div>
                      <div style={{ fontSize:24, fontWeight:800, margin:"4px 0 2px" }}>{s.value}</div>
                      <div style={{ fontSize:11, color:"#6B7280" }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background:"#1A1A2E", border:"1px solid #2D2D4A", borderRadius:14, padding:20 }}>
                  <h4 style={{ margin:"0 0 12px", fontSize:13, color:"#A78BFA" }}>👩‍🏫 Lecturers ({dash.lecturers.length})</h4>
                  {dash.lecturers.length === 0 && <p style={{ color:"#4B5563", fontSize:12 }}>No lecturers have joined yet.</p>}
                  {dash.lecturers.map(l => (
                    <div key={l.id} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #2D2D2D", fontSize:12.5 }}>
                      <span>{l.name}</span>
                      <span style={{ color:"#4B5563" }}>{new Date(l.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>

                <div style={{ background:"#1A1A2E", border:"1px solid #2D2D4A", borderRadius:14, padding:20 }}>
                  <h4 style={{ margin:"0 0 4px", fontSize:13, color:"#A78BFA" }}>📚 Courses ({dash.courses.length})</h4>
                  <p style={{ color:"#4B5563", fontSize:11, margin:"0 0 12px" }}>Avg. quiz score is the clearest signal of whether a lecture is actually landing.</p>
                  {dash.courses.length === 0 && <p style={{ color:"#4B5563", fontSize:12 }}>No courses added yet.</p>}
                  {dash.courses.map(c => (
                    <div key={c.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid #2D2D2D", fontSize:12.5 }}>
                      <span>{c.title}{c.subject ? ` · ${c.subject}` : ""}<span style={{ color:"#4B5563" }}> · {c.lecturer_name}</span></span>
                      {c.avgQuizPct !== null ? (
                        <span style={{
                          background: c.avgQuizPct >= 70 ? "rgba(52,211,153,0.15)" : c.avgQuizPct >= 50 ? "rgba(251,191,36,0.15)" : "rgba(248,113,113,0.15)",
                          color: c.avgQuizPct >= 70 ? "#6EE7B7" : c.avgQuizPct >= 50 ? "#FCD34D" : "#FCA5A5",
                          borderRadius:20, padding:"3px 12px", fontSize:11.5, fontWeight:600, whiteSpace:"nowrap",
                        }}>
                          {c.avgQuizPct}% avg · {c.quizAttempts} quiz{c.quizAttempts===1?"":"zes"} taken
                        </span>
                      ) : (
                        <span style={{ color:"#4B5563", fontSize:11 }}>No quiz data yet</span>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ background:"#1A1A2E", border:"1px solid #2D2D4A", borderRadius:14, padding:20 }}>
                  <h4 style={{ margin:"0 0 12px", fontSize:13, color:"#A78BFA" }}>🎓 Students ({dash.students.length})</h4>
                  {dash.students.length === 0 && <p style={{ color:"#4B5563", fontSize:12 }}>No students have registered yet.</p>}
                  {dash.students.map(s => (
                    <div key={s.id} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #2D2D2D", fontSize:12.5 }}>
                      <span>{s.name}</span>
                      <span style={{ color:"#4B5563" }}>{s.modulesCompleted} module{s.modulesCompleted===1?"":"s"} completed</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {tab==="lms" && isAdmin && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ background:"#1A1A2E", border:"1px solid #2D2D4A", borderRadius:14, padding:20 }}>
              <h4 style={{ margin:"0 0 6px", fontSize:14, color:"#A78BFA" }}>Values to give your LMS administrator</h4>
              <p style={{ color:"#6B7280", fontSize:11.5, margin:"0 0 12px" }}>
                When registering SEMAI as an "External Tool" / "LTI 1.3 Tool" in Canvas, Moodle,
                or Blackboard, use these. Your LMS admin will give you back a Client ID and
                Deployment ID to paste into the form below.
              </p>
              {[
                { label: "OIDC Login URL", value: `${SUPABASE_FN_BASE}/lti-login` },
                { label: "Redirect / Launch URL", value: `${SUPABASE_FN_BASE}/lti-launch` },
                { label: "Tool JWKS URL", value: `${SUPABASE_FN_BASE}/lti-jwks` },
              ].map(row => (
                <div key={row.label} style={{ marginBottom:8 }}>
                  <div style={{ fontSize:10.5, color:"#6B7280", marginBottom:2 }}>{row.label}</div>
                  <code style={{ display:"block", background:"#0A0A0A", padding:"7px 10px", borderRadius:7, fontSize:11.5, color:"#D4D4D4", wordBreak:"break-all" }}>{row.value}</code>
                </div>
              ))}
              <p style={{ color:"#4B5563", fontSize:11, marginTop:10 }}>
                📌 Deep Linking (picking a SEMAI course from inside your LMS's content picker) and
                grade passback aren't built yet — each platform below launches into one fixed
                course, chosen below.
              </p>
            </div>

            <div style={{ background:"#1A1A2E", border:"1px solid #2D2D4A", borderRadius:14, padding:20 }}>
              <h4 style={{ margin:"0 0 12px", fontSize:14, color:"#A78BFA" }}>Connected platforms ({platforms.length})</h4>
              {platforms.length === 0 && <p style={{ color:"#4B5563", fontSize:12, marginBottom:14 }}>None connected yet.</p>}
              {platforms.map(p => (
                <div key={p.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #2D2D2D" }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{p.name}</div>
                    <div style={{ fontSize:11, color:"#6B7280" }}>{p.issuer} · launches into: {courses.find(c=>c.id===p.default_course_id)?.title || "— no course set —"}</div>
                  </div>
                  <button onClick={()=>removePlatform(p.id)} style={{ background:"#991B1B", border:"none", borderRadius:7, padding:"6px 12px", color:"white", cursor:"pointer", fontSize:11 }}>Remove</button>
                </div>
              ))}
            </div>

            <div style={{ background:"#1A1A2E", border:"1px solid #2D2D4A", borderRadius:14, padding:20 }}>
              <h4 style={{ margin:"0 0 14px", fontSize:14, color:"#A78BFA" }}>Connect a new platform</h4>

              <label style={{ fontSize:11, color:"#6B7280" }}>DISPLAY NAME *</label>
              <input value={platformForm.name} onChange={e=>setPlatformForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Canvas — Makerere University"
                style={{ width:"100%", padding:"10px 13px", borderRadius:9, border:"1px solid #374151", background:"#111827", color:"white", fontSize:13, marginBottom:12, boxSizing:"border-box" }}/>

              <label style={{ fontSize:11, color:"#6B7280" }}>ISSUER (iss) *</label>
              <input value={platformForm.issuer} onChange={e=>setPlatformForm(f=>({...f,issuer:e.target.value}))} placeholder="e.g. https://canvas.instructure.com"
                style={{ width:"100%", padding:"10px 13px", borderRadius:9, border:"1px solid #374151", background:"#111827", color:"white", fontSize:13, marginBottom:12, boxSizing:"border-box" }}/>

              <label style={{ fontSize:11, color:"#6B7280" }}>CLIENT ID *</label>
              <input value={platformForm.client_id} onChange={e=>setPlatformForm(f=>({...f,client_id:e.target.value}))} placeholder="Given by your LMS when you register SEMAI"
                style={{ width:"100%", padding:"10px 13px", borderRadius:9, border:"1px solid #374151", background:"#111827", color:"white", fontSize:13, marginBottom:12, boxSizing:"border-box" }}/>

              <label style={{ fontSize:11, color:"#6B7280" }}>DEPLOYMENT ID *</label>
              <input value={platformForm.deployment_id} onChange={e=>setPlatformForm(f=>({...f,deployment_id:e.target.value}))} placeholder="Given by your LMS"
                style={{ width:"100%", padding:"10px 13px", borderRadius:9, border:"1px solid #374151", background:"#111827", color:"white", fontSize:13, marginBottom:12, boxSizing:"border-box" }}/>

              <label style={{ fontSize:11, color:"#6B7280" }}>AUTH LOGIN URL (LMS's OIDC endpoint) *</label>
              <input value={platformForm.auth_login_url} onChange={e=>setPlatformForm(f=>({...f,auth_login_url:e.target.value}))} placeholder="e.g. https://canvas.instructure.com/api/lti/authorize_redirect"
                style={{ width:"100%", padding:"10px 13px", borderRadius:9, border:"1px solid #374151", background:"#111827", color:"white", fontSize:13, marginBottom:12, boxSizing:"border-box" }}/>

              <label style={{ fontSize:11, color:"#6B7280" }}>AUTH TOKEN URL (for future grade passback)</label>
              <input value={platformForm.auth_token_url} onChange={e=>setPlatformForm(f=>({...f,auth_token_url:e.target.value}))} placeholder="e.g. https://canvas.instructure.com/login/oauth2/token"
                style={{ width:"100%", padding:"10px 13px", borderRadius:9, border:"1px solid #374151", background:"#111827", color:"white", fontSize:13, marginBottom:12, boxSizing:"border-box" }}/>

              <label style={{ fontSize:11, color:"#6B7280" }}>LMS JWKS URL *</label>
              <input value={platformForm.jwks_url} onChange={e=>setPlatformForm(f=>({...f,jwks_url:e.target.value}))} placeholder="e.g. https://canvas.instructure.com/api/lti/security/jwks"
                style={{ width:"100%", padding:"10px 13px", borderRadius:9, border:"1px solid #374151", background:"#111827", color:"white", fontSize:13, marginBottom:12, boxSizing:"border-box" }}/>

              <label style={{ fontSize:11, color:"#6B7280" }}>LAUNCHES INTO WHICH SEMAI COURSE? *</label>
              <select value={platformForm.default_course_id} onChange={e=>setPlatformForm(f=>({...f,default_course_id:e.target.value}))}
                style={{ width:"100%", padding:"10px 13px", borderRadius:9, border:"1px solid #374151", background:"#111827", color:"white", fontSize:13, marginBottom:14, boxSizing:"border-box" }}>
                <option value="">Select a course…</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>

              {platformStatus && <p style={{ color: platformStatus.startsWith("✅")?"#34D399":"#F87171", fontSize:12, marginBottom:12 }}>{platformStatus}</p>}

              <button onClick={submitPlatform} disabled={platformSaving}
                style={{ background:platformSaving?"#374151":"linear-gradient(135deg,#7C3AED,#4F46E5)", border:"none", borderRadius:10, padding:"11px 22px", color:"white", cursor:platformSaving?"default":"pointer", fontSize:13, fontWeight:700 }}>
                {platformSaving ? "Saving…" : "🔗 Connect Platform"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
