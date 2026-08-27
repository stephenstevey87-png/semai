import { useState, useEffect } from "react";
import Join            from "./pages/Join";
import Lecture          from "./pages/Lecture";
import Admin            from "./pages/Admin";
import DeepLinkPicker   from "./pages/DeepLinkPicker";
import { supabase, getUserProfile } from "./supabaseClient";

export default function App() {
  const [page,        setPage]        = useState("join");   // join | lecture | admin | deeplink
  const [prevPage,     setPrevPage]    = useState("join");   // where to return to after Admin
  const [studentName, setStudentName] = useState("");
  const [studentId,   setStudentId]   = useState("");
  const [courseId,    setCourseId]    = useState("");
  const [deepLinkToken, setDeepLinkToken] = useState("");
  const [ltiChecking, setLtiChecking] = useState(true);       // briefly true while checking for an LTI launch

  const join = (name, cid, sid) => {
    setStudentName(name);
    setCourseId(cid);
    setStudentId(sid);
    setPage("lecture");
  };

  // An LTI launch (see supabase/functions/lti-launch) redirects here with EITHER:
  //   ?ltiCourse=<id>      — a student/lecturer opening an existing link -> straight into a lecture
  //   ?ltiDeepLink=<token> — a lecturer adding a NEW link from inside their LMS -> course picker
  // Either way, a real Supabase session has already been established before the redirect — the
  // whole point of SSO is that the Join screen's sign-in form should never appear in these cases.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ltiCourse = params.get("ltiCourse");
    const ltiDeepLink = params.get("ltiDeepLink");
    if (!ltiCourse && !ltiDeepLink) { setLtiChecking(false); return; }

    // supabase-js auto-detects the session from the URL hash on load; give it a moment.
    let cancelled = false;
    const tryResolve = async (attempt = 0) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        if (cancelled) return;
        if (ltiDeepLink) {
          setDeepLinkToken(ltiDeepLink);
          setPage("deeplink");
        } else {
          const profile = await getUserProfile(session.user.id);
          if (!cancelled) join(profile?.name || profile?.username || "Student", ltiCourse, session.user.id);
        }
        window.history.replaceState({}, "", window.location.pathname); // drop the query param
        setLtiChecking(false);
      } else if (attempt < 20) {
        setTimeout(() => tryResolve(attempt + 1), 150);
      } else {
        setLtiChecking(false); // gave up — fall through to the normal Join screen
      }
    };
    tryResolve();
    return () => { cancelled = true; };
  }, []);

  // Admin is reachable both before joining (from the Join screen, for staff who haven't
  // started a lecture session) and during a lecture (from its header button) — remember
  // which one so "Back" returns somewhere that actually makes sense.
  const goAdmin = () => { setPrevPage(page); setPage("admin"); };

  if (ltiChecking) {
    return <div style={{ height:"100vh", background:"#0F0C29", display:"flex", alignItems:"center", justifyContent:"center", color:"#6B7280", fontFamily:"system-ui" }}>Signing you in…</div>;
  }

  if (page === "deeplink") return <DeepLinkPicker token={deepLinkToken}/>;
  if (page === "join")    return <Join    onJoin={join} onAdmin={goAdmin}/>;
  if (page === "admin")   return <Admin   onBack={()=>setPage(prevPage)}/>;
  if (page === "lecture") return (
    <Lecture
      studentName={studentName}
      studentId={studentId}
      courseId={courseId}
      onLeave={()=>setPage("join")}
      onAdmin={goAdmin}
    />
  );
}
