import { useState } from "react";
import Join    from "./pages/Join";
import Lecture from "./pages/Lecture";
import Admin   from "./pages/Admin";

export default function App() {
  const [page,        setPage]        = useState("join");   // join | lecture | admin
  const [prevPage,     setPrevPage]    = useState("join");   // where to return to after Admin
  const [studentName, setStudentName] = useState("");
  const [courseId,    setCourseId]    = useState("");

  const join = (name, cid) => {
    setStudentName(name);
    setCourseId(cid);
    setPage("lecture");
  };

  // Admin is reachable both before joining (from the Join screen, for a lecturer who
  // hasn't started a lecture session) and during a lecture (from its header button) —
  // remember which one so "Back" returns somewhere that actually makes sense.
  const goAdmin = () => { setPrevPage(page); setPage("admin"); };

  if (page === "join")    return <Join    onJoin={join} onAdmin={goAdmin}/>;
  if (page === "admin")   return <Admin   onBack={()=>setPage(prevPage)}/>;
  if (page === "lecture") return (
    <Lecture
      studentName={studentName}
      courseId={courseId}
      onLeave={()=>setPage("join")}
      onAdmin={goAdmin}
    />
  );
}
