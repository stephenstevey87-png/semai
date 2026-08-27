// phase: 'question' shows the current question; 'result' shows the final score summary.
export default function QuizScreen({ phase, question, idx, total, selected, answered, onSelect, onNext, result, moduleTitle }) {
  if (phase === "result") {
    const pct = result.total ? Math.round((result.score / result.total) * 100) : 0;
    return (
      <div style={{ width:"100%", height:"100%", background:"linear-gradient(160deg,#0F0C29,#1A1540 55%,#0D1B3E)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, padding:24 }}>
        <div style={{ fontSize:48 }}>{pct >= 80 ? "🎉" : pct >= 50 ? "👍" : "📚"}</div>
        <h2 style={{ color:"white", fontSize:22, fontWeight:800, margin:0 }}>Quiz complete!</h2>
        <p style={{ color:"#A78BFA", fontSize:16, margin:0 }}>You scored {result.score} / {result.total} ({pct}%)</p>
        <p style={{ color:"#6B7280", fontSize:13, margin:0 }}>on {moduleTitle}</p>
      </div>
    );
  }

  return (
    <div style={{ width:"100%", height:"100%", background:"linear-gradient(160deg,#0F0C29,#1A1540 55%,#0D1B3E)", display:"flex", flexDirection:"column", padding:"32px 40px", overflowY:"auto" }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <span style={{ fontSize:11, color:"#7C7C9C", letterSpacing:2, textTransform:"uppercase" }}>Quick Check</span>
        <span style={{ fontSize:12, color:"#4B5563", fontFamily:"monospace" }}>Question {idx + 1} / {total}</span>
      </div>

      {question.objective && (
        <div style={{ display:"inline-block", alignSelf:"flex-start", background:"rgba(124,58,237,0.15)", border:"1px solid rgba(124,58,237,0.35)", borderRadius:20, padding:"4px 14px", fontSize:11, color:"#C4B5FD", marginBottom:16 }}>
          🎯 {question.objective}
        </div>
      )}

      <h2 style={{ color:"white", fontSize:19, fontWeight:700, lineHeight:1.5, margin:"0 0 24px" }}>{question.question}</h2>

      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {question.options.map((opt, i) => {
          let bg = "rgba(255,255,255,0.04)", border = "1px solid rgba(124,58,237,0.2)", color = "#E5E7EB";
          if (answered) {
            if (i === answered.correctIndex) { bg = "rgba(52,211,153,0.15)"; border = "1px solid #34D399"; color = "#6EE7B7"; }
            else if (i === selected) { bg = "rgba(248,113,113,0.15)"; border = "1px solid #F87171"; color = "#FCA5A5"; }
          } else if (i === selected) {
            bg = "rgba(124,58,237,0.2)"; border = "1px solid #7C3AED";
          }
          return (
            <button key={i} onClick={() => !answered && onSelect(i)} disabled={!!answered}
              style={{ textAlign:"left", padding:"14px 18px", borderRadius:12, background:bg, border, color, fontSize:14.5, cursor:answered?"default":"pointer", display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ width:24, height:24, borderRadius:"50%", background:"rgba(255,255,255,0.08)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11.5, fontWeight:700, flexShrink:0 }}>
                {String.fromCharCode(65 + i)}
              </span>
              {opt}
              {answered && i === answered.correctIndex && <span style={{ marginLeft:"auto" }}>✅</span>}
              {answered && i === selected && i !== answered.correctIndex && <span style={{ marginLeft:"auto" }}>❌</span>}
            </button>
          );
        })}
      </div>

      {answered && (
        <div style={{ marginTop:20, padding:"14px 18px", borderRadius:12, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(124,58,237,0.2)", animation:"fadeUp 0.3s ease" }}>
          <p style={{ margin:0, fontSize:13.5, color:"#D1D5DB", lineHeight:1.6 }}>{answered.explanation}</p>
        </div>
      )}

      {answered && (
        <button onClick={onNext}
          style={{ alignSelf:"flex-start", marginTop:20, background:"linear-gradient(135deg,#7C3AED,#4F46E5)", border:"none", borderRadius:10, padding:"11px 22px", color:"white", fontSize:13, fontWeight:700, cursor:"pointer" }}>
          {idx + 1 < total ? "Next Question →" : "See My Results →"}
        </button>
      )}
    </div>
  );
}
