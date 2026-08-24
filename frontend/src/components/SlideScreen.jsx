export default function SlideScreen({ slide, mod, idx, total, courseTitle, institution }) {
  if (!slide) return null;
  const bullets = slide.bullets || [];

  return (
    <div key={idx} style={{ width:"100%", height:"100%", background:"linear-gradient(160deg,#0F0C29,#1A1540 55%,#0D1B3E)", display:"flex", flexDirection:"column", animation:"slideEnter 0.45s cubic-bezier(0.22,1,0.36,1)" }}>
      <style>{`
        @keyframes slideEnter{from{opacity:0;transform:translateY(14px) scale(0.99)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes bulletEnter{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
        @keyframes highlightPulse{0%,100%{box-shadow:0 0 0 0 rgba(251,191,36,0.25)}50%{box-shadow:0 0 0 6px rgba(251,191,36,0)}}
      `}</style>

      {/* Header */}
      <div style={{ background:"linear-gradient(90deg,#7C3AED,#4338CA)", padding:"20px 36px 22px", flexShrink:0, position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:-40, right:-40, width:160, height:160, borderRadius:"50%", background:"rgba(255,255,255,0.06)" }}/>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", position:"relative" }}>
          <div style={{ display:"flex", alignItems:"center", gap:16 }}>
            <div style={{ width:48, height:48, borderRadius:14, background:"rgba(255,255,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, flexShrink:0 }}>{mod?.icon}</div>
            <div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.6)", letterSpacing:3, textTransform:"uppercase", marginBottom:5, fontWeight:600 }}>{mod?.title}</div>
              <div style={{ fontSize:25, fontWeight:800, color:"white", lineHeight:1.15, marginBottom: slide.subtitle ? 5 : 0 }}>{slide.title}</div>
              {slide.subtitle && (
                <div style={{ fontSize:13.5, color:"rgba(255,255,255,0.75)", fontStyle:"italic", lineHeight:1.4, maxWidth:560 }}>{slide.subtitle}</div>
              )}
            </div>
          </div>
          <div style={{ background:"rgba(255,255,255,0.15)", borderRadius:20, padding:"5px 16px", fontSize:12, color:"rgba(255,255,255,0.85)", fontFamily:"monospace", flexShrink:0 }}>
            {idx + 1} / {total}
          </div>
        </div>

        {/* Progress dots */}
        <div style={{ display:"flex", gap:5, marginTop:14, position:"relative" }}>
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={{ height:4, borderRadius:2, flex: i === idx ? 2.4 : 1, background: i <= idx ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.25)", transition:"all 0.35s ease" }}/>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex:1, padding:"28px 40px", display:"flex", flexDirection:"column", justifyContent:"center", gap:12, overflowY:"auto" }}>
        {bullets.map((b, i) => (
          <div key={i} style={{
            display:"flex", alignItems:"flex-start", gap:16, padding:"14px 18px", borderRadius:12,
            background:"rgba(255,255,255,0.035)", border:"1px solid rgba(124,58,237,0.18)",
            animation:`bulletEnter 0.4s ease ${i * 0.08}s both`,
          }}>
            <div style={{ width:30, height:30, borderRadius:9, background:"rgba(124,58,237,0.22)", border:"1.5px solid rgba(124,58,237,0.55)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12.5, fontWeight:800, color:"#C4B5FD", flexShrink:0, marginTop:1 }}>
              {i + 1}
            </div>
            <p style={{ margin:0, fontSize:15.5, color:"#E5E7EB", lineHeight:1.65 }}>{b}</p>
          </div>
        ))}

        {slide.highlight && (
          <div style={{
            marginTop:6, display:"flex", alignItems:"center", gap:14, padding:"16px 20px", borderRadius:12,
            background:"linear-gradient(90deg,rgba(251,191,36,0.12),rgba(251,191,36,0.04))",
            border:"1px solid rgba(251,191,36,0.35)", animation:"highlightPulse 3s ease-in-out infinite",
          }}>
            <span style={{ fontSize:22, flexShrink:0 }}>✨</span>
            <p style={{ margin:0, fontSize:14.5, color:"#FDE68A", lineHeight:1.6, fontStyle:"italic", fontWeight:500 }}>{slide.highlight}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding:"10px 36px", background:"rgba(0,0,0,0.3)", display:"flex", justifyContent:"space-between", flexShrink:0 }}>
        <span style={{ fontSize:10, color:"rgba(255,255,255,0.22)", letterSpacing:1 }}>{[institution, courseTitle].filter(Boolean).join(" · ").toUpperCase()}</span>
        <span style={{ fontSize:10, color:"rgba(255,255,255,0.22)", letterSpacing:1 }}>SEMAI · SAYMYTECH DEVELOPERS</span>
      </div>
    </div>
  );
}
