import { useState, useEffect } from "react";
import { getCourses } from "../api";

const SUPABASE_FN_BASE = "https://hyxxmiigacfkqdwvxsjh.supabase.co/functions/v1";

// Shown when a lecturer adds a new SEMAI link inside their LMS (Canvas/Moodle/etc).
// Picking a course here completes the LTI Deep Linking handshake and hands a
// course-specific link back to the LMS — see lti-deep-link-respond.
export default function DeepLinkPicker({ token }) {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState("");

  useEffect(() => {
    getCourses().then(d => setCourses(d.courses || [])).finally(() => setLoading(false));
  }, []);

  const pick = (courseId) => {
    setPicking(courseId);
    window.location.href = `${SUPABASE_FN_BASE}/lti-deep-link-respond?token=${encodeURIComponent(token)}&course=${encodeURIComponent(courseId)}`;
  };

  return (
    <div style={{ minHeight:"100vh", background:"#0F0C29", fontFamily:"'Segoe UI',system-ui,sans-serif", color:"white", padding:"40px 20px" }}>
      <div style={{ maxWidth:640, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ width:64, height:64, borderRadius:18, background:"linear-gradient(135deg,#7C3AED,#4F46E5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:30, margin:"0 auto 14px" }}>🎓</div>
          <h2 style={{ fontSize:20, fontWeight:800, margin:"0 0 6px" }}>Choose a SEMAI course to link</h2>
          <p style={{ color:"#6B7280", fontSize:13, margin:0 }}>This will add a link to it right where you're editing in your LMS.</p>
        </div>

        {loading && <p style={{ textAlign:"center", color:"#6B7280" }}>Loading your courses…</p>}
        {!loading && courses.length === 0 && (
          <p style={{ textAlign:"center", color:"#6B7280" }}>No courses yet — add one first from SEMAI's Admin screen.</p>
        )}

        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {courses.map(c => (
            <button key={c.id} onClick={()=>pick(c.id)} disabled={!!picking}
              style={{ textAlign:"left", background:"#1A1A2E", border:"1px solid #2D2D4A", borderRadius:12, padding:"16px 18px", color:"white", cursor:picking?"default":"pointer", opacity:picking && picking!==c.id ? 0.4 : 1 }}>
              <div style={{ fontWeight:600, fontSize:14, marginBottom:3 }}>{c.title}</div>
              <div style={{ color:"#6B7280", fontSize:11 }}>{c.moduleCount} modules{c.subject ? ` · ${c.subject}` : ""}</div>
              {picking === c.id && <div style={{ color:"#A78BFA", fontSize:11, marginTop:6 }}>Linking… you'll be sent back to your LMS.</div>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
