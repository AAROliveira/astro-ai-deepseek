import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { loadChatHistory, saveChatHistory } from "./loadSaveChatHistory";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  role: "user" | "assistant";
  content: string;
  fileUrl?: string;
  isError?: boolean;
}

const Chat: React.FC = () => {
  console.log("🚀 Renderizando Chat!");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [copiedMessageKey, setCopiedMessageKey] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  // const [speechRecognition, setSpeechRecognition] = useState<SpeechRecognition | null>(null); // Removed old STT state
  const [mediaRecorderState, setMediaRecorderState] = useState<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  // TTS states
  // const [speechSynthesisApi, setSpeechSynthesisApi] = useState<SpeechSynthesis | null>(null); // Removed old TTS state
  const [isSpeaking, setIsSpeaking] = useState(false); // Will be true while audio is playing
  const [isSynthesizing, setIsSynthesizing] = useState(false); // True while fetching audio from backend
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [ttsEnabled, setTtsEnabled] = useState(true); // User control can be added later
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const load = async () => {
      try {
        const savedMessages = await loadChatHistory();
        if (savedMessages && savedMessages.length > 0) {
          setMessages(savedMessages);
        }
      } catch (error) {
        console.error("Erro ao carregar histórico de chat:", error);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const save = async () => {
      try {
        await saveChatHistory(messages);
      } catch (error) {
        console.error("Erro ao salvar histórico de chat:", error);
      }
    };
    if (messages.length > 0) save();
  }, [messages]);

  const sendMessage = async () => {
    if (input.trim() === "") return;

    if (!hasUserInteracted) {
      setHasUserInteracted(true);
    }

    setIsLoading(true);

    let fileContent = "";
    let uploadedFileUrl = "";

    if (file) {
      if (file.type.startsWith("text/")) {
        const raw = await file.text();
        const lines = raw.split("\n");
        const maxLines = 200;
        const uniqueLimitedLines = Array.from(new Set(lines.slice(0, maxLines)));
        fileContent = uniqueLimitedLines.join("\n");
      }
      uploadedFileUrl = URL.createObjectURL(file);
    }

    const newUserMessage: Message = {
      role: "user",
      content:
        input.trim() +
        (fileContent
          ? `\n\n[Este é o conteúdo de um arquivo de texto enviado pelo usuário. Interprete ou resuma se possível:]\n\n${fileContent}`
          : ""),
      fileUrl: uploadedFileUrl || undefined,
    };

    setMessages((prev) => [...prev, newUserMessage]);
    setInput("");
    setFile(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, newUserMessage] }),
      });

      if (!response.body) throw new Error("Resposta sem corpo");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((line) => line.trim() !== "");

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              assistantContent += parsed.message.content;
              setMessages((prev) =>
                prev.map((msg, idx) =>
                  idx === prev.length - 1 ? { ...msg, content: assistantContent } : msg
                )
              );
            }
          } catch (err) {
            console.error("Erro ao interpretar NDJSON:", err, line);
          }
        }
      }
    } catch (error) {
      console.error("Detailed error:", error); 
      let errorMessage = "Ocorreu um erro inesperado. Por favor, tente novamente.";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: errorMessage, isError: true },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

const PYTHON_BACKEND_URL = 'http://localhost:8008'; // Define backend URL

// Initialize SpeechSynthesis & Check MediaDevices
useEffect(() => {
    // Pre-check for navigator.mediaDevices (essential for STT using MediaRecorder)
    if (typeof navigator.mediaDevices === 'undefined' || typeof navigator.mediaDevices.getUserMedia === 'undefined') {
      setPermissionError("Erro: Acesso ao microfone requer uma conexão segura (HTTPS) ou execução em localhost. Verifique se o site está em HTTPS.");
    }
    // TTS (Backend) does not require browser API initialization here, only fetch.
    // The old Web Speech API TTS initialization is removed.
  }, []); // Removed setInput dependency, as it's not used in this effect anymore.

  const playAudioFromBackend = useCallback(async (text: string) => {
    if (!ttsEnabled || !hasUserInteracted || !text.trim()) {
      if (!hasUserInteracted && text.trim()) {
        console.log("TTS deferred: User has not interacted yet.");
      }
      return;
    }

    // Stop and clear any currently playing audio
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      URL.revokeObjectURL(audioPlayerRef.current.src); // Clean up previous object URL
      audioPlayerRef.current = null;
    }

    setIsSynthesizing(true);
    setIsSpeaking(true); // Considered speaking as soon as synthesis starts for UI feedback
    setTtsError(null);

    try {
      const response = await fetch(`${PYTHON_BACKEND_URL}/tts/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text, voice_preset: "v2/en_speaker_1" }), // Changed to English preset
      });

      if (response.ok) {
        const audioBlob = await response.blob();
        if (audioBlob.size === 0) {
            console.warn("Received empty audio blob from backend.");
            setTtsError("Falha ao gerar áudio: resposta vazia do servidor.");
            setIsSpeaking(false);
            return;
        }
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audioPlayerRef.current = audio;

        audio.play().catch(playError => {
            console.error("Error playing audio:", playError);
            setTtsError(`Erro ao reproduzir áudio: ${playError.message}`);
            setIsSpeaking(false);
            URL.revokeObjectURL(audioUrl);
            audioPlayerRef.current = null;
        });

        audio.onended = () => {
          console.log("Audio playback ended.");
          setIsSpeaking(false);
          if (audioPlayerRef.current) { // Check if it hasn't been replaced by another call
             URL.revokeObjectURL(audioPlayerRef.current.src);
             audioPlayerRef.current = null;
          }
        };
        audio.onerror = (event: Event | string) => {
          console.error("Audio playback error:", event);
          setTtsError("Erro durante a reprodução do áudio.");
          setIsSpeaking(false);
          if (audioPlayerRef.current) {
             URL.revokeObjectURL(audioPlayerRef.current.src);
             audioPlayerRef.current = null;
          }
        };
      } else {
        const errorText = await response.text();
        console.error("TTS API Error:", errorText);
        setTtsError(`Falha na síntese de voz: ${response.status} - ${errorText || 'Erro desconhecido do servidor'}`);
        setIsSpeaking(false);
      }
    } catch (error: any) {
      console.error("Network or TTS fetch error:", error);
      setTtsError(`Erro de rede ou servidor TTS não acessível: ${error.message}`);
      setIsSpeaking(false);
    } finally {
      setIsSynthesizing(false);
    }
  }, [ttsEnabled, hasUserInteracted]);

  // Effect to speak the latest assistant message
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "assistant" && !lastMessage.isError && lastMessage.content) {
        playAudioFromBackend(lastMessage.content);
      }
    }
  }, [messages, playAudioFromBackend]); // playAudioFromBackend is now a dependency


  const handleToggleRecording = useCallback(async () => {
    if (typeof navigator.mediaDevices === 'undefined' || typeof navigator.mediaDevices.getUserMedia === 'undefined') {
        setPermissionError("Erro: Acesso ao microfone não é suportado ou requer HTTPS/localhost.");
        return;
    }
    
    if (isRecording && mediaRecorderState) {
      mediaRecorderState.stop(); // This will trigger the onstop event
      setIsRecording(false); 
      // isTranscribing will be set true in onstop
    } else {
      // Start recording
      setPermissionError(null);
      audioChunksRef.current = []; // Clear previous audio chunks

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!hasUserInteracted) {
          setHasUserInteracted(true);
        }
        
        const recorder = new MediaRecorder(stream);
        setMediaRecorderState(recorder);

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        recorder.onstop = async () => {
          console.log("Recording stopped, processing audio...");
          setIsTranscribing(true);
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          // audioChunksRef.current = []; // Clear chunks after creating blob

          const formData = new FormData();
          formData.append("audio", audioBlob, "recording.webm");

          try {
            const response = await fetch(`${PYTHON_BACKEND_URL}/stt/`, {
              method: "POST",
              body: formData,
            });

            if (response.ok) {
              const data = await response.json();
              setInput(data.text);
              setPermissionError(null); // Clear any previous error
            } else {
              const errorText = await response.text();
              console.error("STT API Error:", errorText);
              setPermissionError(`Falha na transcrição: ${response.status} - ${errorText || 'Erro do servidor'}`);
            }
          } catch (error: any) {
            console.error("Network or STT fetch error:", error);
            setPermissionError(`Erro de rede ou servidor STT não acessível: ${error.message}`);
          } finally {
            setIsTranscribing(false);
            // Clean up the stream tracks
            stream.getTracks().forEach(track => track.stop());
            setMediaRecorderState(null); // Release recorder instance
          }
        };
        
        recorder.start();
        setIsRecording(true);

      } catch (err) {
        console.error("Microphone permission error:", err);
        if (err instanceof Error) {
          if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
            setPermissionError("Permissão para o microfone negada. Por favor, habilite nas configurações do seu navegador.");
          } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
            setPermissionError("Nenhum microfone encontrado. Por favor, conecte um microfone.");
          } else {
            setPermissionError(`Erro ao acessar microfone: ${err.message}`);
          }
        } else {
          setPermissionError("Ocorreu um erro desconhecido ao tentar acessar o microfone.");
        }
        setIsRecording(false); // Ensure recording state is false if permission fails
      }
    }
  }, [isRecording, mediaRecorderState, hasUserInteracted, setInput, setPermissionError, setIsRecording, setIsTranscribing, setHasUserInteracted]);

  const handleCopy = async (text: string, key: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageKey(key);
      setTimeout(() => {
        setCopiedMessageKey(null);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
      // Optionally: display a toast or other feedback for copy failure
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-200 text-black font-serif">
      {/* O padding foi removido daqui e é gerenciado pelo Layout.astro */}
      <div className="w-full max-w-3xl flex flex-col overflow-hidden shadow-xl rounded-2xl border-2 border-gray-300 bg-gray-100">
        {/* Cabeçalho */}
        <div className="p-6 text-2xl font-bold text-center border-b-2 border-gray-300 bg-gray-100">
          Fale com Gemma: Seu assistente para tudo
        </div>
        {/* Área de mensagens */}
        <div className="flex-1 max-h-[65vh] overflow-y-auto p-6 space-y-4">
          <AnimatePresence>
            {messages.map((message, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"
                  }`}
              >
                <div
                  className={`relative max-w-2xl px-4 py-3 rounded-xl shadow-sm whitespace-pre-wrap transition-all duration-300 ${
                    message.isError
                      ? "bg-red-200 text-red-800 self-start" // Error messages are from assistant
                      : message.role === "user"
                      ? "bg-blue-200 text-black self-end"
                      : "bg-slate-50 text-black self-start" // Assistant messages slightly different bg
                  }`}
                >
                  {message.role === "assistant" && !message.isError && (
                    <button
                      onClick={() => handleCopy(message.content, index)}
                      className="absolute top-2 right-2 p-1 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md"
                      aria-label="Copy message to clipboard"
                    >
                      {copiedMessageKey === index ? "✓ Copied" : "📋 Copy"}
                    </button>
                  )}
                  <div className={message.role === "assistant" && !message.isError ? "pr-10" : ""}> 
                    {/* Add padding-right for copy button space only for assistant non-error messages */}
                    <ReactMarkdown>{`${message.isError ? "⚠️ " : ""}${message.content}`}</ReactMarkdown>
                  </div>
                  {/* Removed the pb-4 div, relying on pr-10 and button positioning */}
                  {message.fileUrl && (
                    <a
                      href={message.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block mt-2 text-xs underline text-blue-500"
                    >
                      Arquivo enviado
                    </a>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {isLoading && (
            <div className="flex items-center space-x-1 text-sm text-gray-500">
              <span>Gemma está digitando</span>
              <span className="animate-bounce delay-0">.</span>
              <span className="animate-bounce delay-150">.</span>
              <span className="animate-bounce delay-300">.</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Área de entrada */}
        <div className="border-t-2 border-gray-300 p-4 bg-gray-50 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem..."
            className={`flex-1 px-4 py-2 border border-gray-300 rounded-md text-base bg-white text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              isLoading ? "opacity-50 cursor-not-allowed" : ""
            }`}
            disabled={isLoading}
          />
          <button
            onClick={handleToggleRecording}
            disabled={isLoading || isSpeaking || isTranscribing || isSynthesizing || typeof navigator.mediaDevices === 'undefined'}
            className={`px-3 py-2 ml-2 rounded-md text-white ${
              isRecording ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"
            } focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              (isSpeaking || isTranscribing || isSynthesizing || typeof navigator.mediaDevices === 'undefined') ? "opacity-50 cursor-not-allowed" : ""
            } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
            title={
              isRecording ? "Parar gravação"
              : isTranscribing ? "Transcrevendo áudio..."
              : isSynthesizing ? "Sintetizando áudio..."
              : isSpeaking ? "Assistente falando..."
              : permissionError?.startsWith("Erro: Acesso ao microfone requer") ? "Gravação indisponível (sem HTTPS/localhost)"
              : (typeof navigator.mediaDevices === 'undefined') ? "Gravação indisponível (sem microfone/permissão)"
              : "Gravar áudio"
            }
          >
            {isRecording ? "🎤 Parar"
              : isTranscribing ? "⌛"
              : isSynthesizing ? "🔊..."
              : isSpeaking ? "..."
              : (typeof navigator.mediaDevices === 'undefined' || permissionError?.startsWith("Erro: Acesso ao microfone requer")) ? "🚫"
              : "🎤 Gravar"}
          </button>
          <div className="flex flex-col items-start">
            <input
              type="file"
              data-testid="file-input"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className={`text-sm text-gray-600 file:mr-2 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 ${
                isLoading ? "opacity-50 cursor-not-allowed" : ""
              }`}
              disabled={isLoading}
            />
            {file && (
              <div className="text-xs text-gray-500 mt-1 pl-1">
                <p className="truncate max-w-xs">Arquivo: {file.name}</p>
                {file.type.startsWith("text/") && (
                  <p>Primeiras 200 linhas únicas serão usadas.</p>
                )}
              </div>
            )}
          </div>
          <button
            onClick={sendMessage}
            disabled={isLoading || isRecording || isTranscribing || isSpeaking || isSynthesizing} 
            className={`px-4 py-2 bg-blue-500 text-white font-semibold rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
              (isLoading || isTranscribing || isSpeaking || isSynthesizing) ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {isLoading ? "Enviando..." : "Enviar"}
          </button>
        </div>
        {permissionError && (
          <div className="p-2 text-center text-sm text-red-600 bg-red-100 border-t-2 border-gray-300">
            {permissionError}
          </div>
        )}
        {ttsError && (
          <div className="p-2 text-center text-sm text-orange-600 bg-orange-100 border-t-2 border-gray-300">
            {ttsError}
          </div>
        )}
      </div>
    </div>
  );
};

export default Chat;
