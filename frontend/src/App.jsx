import { useState, useEffect } from "react";
import Join    from "./pages/Join";
import Lecture from "./pages/Lecture";
import Admin   from "./pages/Admin";
import { supabase, getUserProfile } from "./supabaseClient";

export default function App() {
  const [page,        setPage]        = useState("join");   // join | lecture | admin
  const [prevPage,     setPrevPage]    = useState("join");   // where to return to after Admin
  const [studentName, setStudentName] = useState("");
  const [studentId,   setStudentId]   = useState("");
  const [courseId,    setCourseId]    = useState("");
  const [ltiChecking, setLtiChecking] = useState(true);       // briefly true while checking for an LTI launch

  const join = (name, cid, sid) => {
    setStudentName(name);
    setCourseId(cid);
    setStudentId(sid);
    setPage("lecture");
  };

  // An LTI launch (see supabase/functions/lti-launch) redirects here with ?ltiCourse=<id>
  // after already establishing a real Supabase session — the whole point of SSO is that
  // the Join screen (and its sign-in form) should never be shown in that case.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ltiCourse = params.get("ltiCourse");
    if (!ltiCourse) { setLtiChecking(false); return; }

    // supabase-js auto-detects the session from the URL hash on load; give it a moment.
    let cancelled = false;
    const tryJoin = async (attempt = 0) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const profile = await getUserProfile(session.user.id);
        if (!cancelled) {
          join(profile?.name || session.user.email, ltiCourse, session.user.id);
          window.history.replaceState({}, "", window.location.pathname); // drop the query param
          setLtiChecking(false);
        }
      } else if (attempt < 20) {
        setTimeout(() => tryJoin(attempt + 1), 150);
      } else {
        setLtiChecking(false); // gave up — fall through to the normal Join screen
      }
    };
    tryJoin();
    return () => { cancelled = true; };
  }, []);

  // Admin is reachable both before joining (from the Join screen, for staff who haven't
  // started a lecture session) and during a lecture (from its header button) — remember
  // which one so "Back" returns somewhere that actually makes sense.
  const goAdmin = () => { setPrevPage(page); setPage("admin"); };

  if (ltiChecking) {
    return <div style={{ height:"100vh", background:"#0F0C29", display:"flex", alignItems:"center", justifyContent:"center", color:"#6B7280", fontFamily:"system-ui" }}>Signing you in…</div>;
  }

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
