import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const instance = useRef<Recognition | null>(null);
  const callback = useRef(onText);
  callback.current = onText;
  useEffect(() => {
    const browser = window as SpeechWindow;
    setSupported(Boolean(browser.SpeechRecognition ?? browser.webkitSpeechRecognition));
    return () => {
      if (instance.current) {
        instance.current.onend = null;
        instance.current.onresult = null;
        instance.current.onerror = null;
        instance.current.abort();
      }
    };
  }, []);
  const stop = () => instance.current?.stop();
  const toggle = () => {
    if (listening) {
      stop();
      return;
    }
    const browser = window as SpeechWindow;
    const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Constructor) {
      toast.error("El dictado no está disponible en este navegador. Probá Chrome o Edge.");
      return;
    }
    const recognition = new Constructor();
    instance.current = recognition;
    recognition.lang = "es-UY";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result?.isFinal) callback.current(result[0].transcript);
      }
    };
    recognition.onerror = (event) => {
      setListening(false);
      toast.error(
        event.error === "not-allowed"
          ? "Permití el micrófono en tu navegador para dictar."
          : "No se pudo completar el dictado. Volvé a intentarlo.",
      );
    };
    recognition.onend = () => {
      setListening(false);
      instance.current = null;
    };
    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
      toast.error("No se pudo iniciar el micrófono.");
    }
  };
  return { listening, supported, toggle, stop };
}
