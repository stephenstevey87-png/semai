import { useState, useCallback } from "react";
import { sendChat, explainSlide } from "../api";

export function useSEMAI({ courseId, studentName, speak }) {
  const [messages, setMessages] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [preparing, setPreparing] = useState(false); // true while SEMAI composes a full slide explanation

  // Full lecturer-style explanation of a slide — teaches every bullet, not just reads it.
  // onDone receives the content-specific check-in question so the caller can speak it
  // separately, AFTER the full explanation has genuinely finished playing.
  const teachSlide = useCallback(async ({ courseTitle, moduleTitle, slideTitle, slideSubtitle, highlight, bullets }, onDone) => {
    setPreparing(true);
    try {
      const data = await explainSlide({ courseTitle, moduleTitle, studentName, slideTitle, slideSubtitle, highlight, bullets });
      speak(data.explanation, () => onDone?.(data.checkInQuestion));
    } catch {
      // Graceful fallback if the Edge Function call fails entirely.
      speak(`Let's look at ${slideTitle}. ${bullets.join(". ")}.`, () => onDone?.("Does that make sense so far?"));
    } finally {
      setPreparing(false);
    }
  }, [studentName, speak]);

  const ask = useCallback(async (userText, context = "", onReply) => {
    if (!userText.trim() || loading) return;

    const userMsg = { role: "user", content: userText };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const data = await sendChat({
        messages:    [...messages, userMsg],
        courseId:    courseId || "",
        studentName: studentName || "Student",
        context,
      });

      const reply = data.reply || "Sorry, I had a connection issue. Please try again!";
      const aiMsg = { role: "assistant", content: reply };
      setMessages(prev => [...prev, aiMsg]);
      speak(reply, onReply);
      return reply;
    } catch (err) {
      const errMsg = "Sorry class, connection issue — please try again!";
      setMessages(prev => [...prev, { role: "assistant", content: errMsg }]);
      speak(errMsg);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, courseId, studentName, speak]);

  const clearMessages = () => setMessages([]);

  return { ask, messages, loading, clearMessages, teachSlide, preparing };
}
