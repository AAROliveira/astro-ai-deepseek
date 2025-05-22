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
  const [speechRecognition, setSpeechRecognition] = useState<SpeechRecognition | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  // TTS states
  const [speechSynthesisApi, setSpeechSynthesisApi] = useState<SpeechSynthesis | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true); // User control can be added later
  const [ttsError, setTtsError] = useState<string | null>(null);


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

  // Initialize SpeechRecognition & SpeechSynthesis
  useEffect(() => {
    // SpeechRecognition (STT)
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognitionAPI) {
      const recognitionInstance = new SpeechRecognitionAPI();
      recognitionInstance.continuous = false;
      recognitionInstance.interimResults = false;
      recognitionInstance.lang = "pt-BR";

      recognitionInstance.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        // setIsRecording(false); // onend will handle this
      };

      recognitionInstance.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech recognition error", event.error);
        setPermissionError(`Erro no STT: ${event.error}`);
        setIsRecording(false);
      };

      recognitionInstance.onend = () => {
        setIsRecording(false);
      };

      setSpeechRecognition(recognitionInstance);
    } else {
      setPermissionError("Seu navegador não suporta a Web Speech API.");
    }

    // SpeechSynthesis (TTS)
    if ('speechSynthesis' in window) {
      setSpeechSynthesisApi(window.speechSynthesis);
      // Ensure voices are loaded
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length === 0) {
          window.speechSynthesis.onvoiceschanged = loadVoices;
        }
        // Optional: log voices to see available options
        // console.log("Available voices:", voices);
      };
      loadVoices();
    } else {
      setTtsError("Seu navegador não suporta a Web Speech API (para TTS).");
    }
  }, [setInput]); // setInput is a dependency for STT part

  const speakText = useCallback((text: string) => {
    if (!speechSynthesisApi || !ttsEnabled || text.trim() === "") {
      return;
    }

    if (speechSynthesisApi.speaking) {
      speechSynthesisApi.cancel(); // Stop current speech if any
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";
    
    // Attempt to find a preferred voice (e.g., Google's Portuguese voice)
    const voices = speechSynthesisApi.getVoices();
    const ptBRVoice = voices.find(voice => voice.lang === "pt-BR" && voice.name.includes("Google") && voice.name.includes("Brasil")) ||
                      voices.find(voice => voice.lang === "pt-BR" && voice.name.includes("Google")) ||
                      voices.find(voice => voice.lang === "pt-BR" && voice.localService) || // Prefer local voices
                      voices.find(voice => voice.lang === "pt-BR"); // Fallback to any pt-BR
    
    if (ptBRVoice) {
      utterance.voice = ptBRVoice;
      // console.log("Using voice:", ptBRVoice.name);
    } else {
      // console.log("Using default voice for pt-BR.");
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
      setTtsError(null);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
    };

    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      console.error("Speech synthesis error", event.error);
      setTtsError(`Erro no TTS: ${event.error}`);
      setIsSpeaking(false);
    };

    speechSynthesisApi.speak(utterance);

  }, [speechSynthesisApi, ttsEnabled]); // Removed isSpeaking from deps to avoid re-creating if it changes rapidly

  // Effect to speak the latest assistant message
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "assistant" && !lastMessage.isError && lastMessage.content) {
        // Only speak if the message content is substantial (not just an empty string from initialization)
        // And if the message is fully formed (not streaming character by character if that were the case)
        // The current setup updates the whole content, so cancel() in speakText handles re-speaking.
        speakText(lastMessage.content);
      }
    }
  }, [messages, speakText]);


  const handleToggleRecording = useCallback(async () => {
    if (!speechRecognition) {
      setPermissionError("Reconhecimento de voz não está disponível.");
      return;
    }

    if (isRecording) {
      speechRecognition.stop();
      setIsRecording(false);
    } else {
      setPermissionError(null); // Clear previous errors
      try {
        // Request microphone permission
        await navigator.mediaDevices.getUserMedia({ audio: true });
        speechRecognition.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Microphone permission error", err);
        if (err instanceof Error) {
          if (err.name === "NotAllowedError") {
            setPermissionError("Permissão para o microfone negada. Por favor, habilite nas configurações do seu navegador.");
          } else {
            setPermissionError(`Erro ao acessar microfone: ${err.message}`);
          }
        } else {
          setPermissionError("Ocorreu um erro desconhecido ao tentar acessar o microfone.");
        }
        setIsRecording(false);
      }
    }
  }, [speechRecognition, isRecording]);

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
            disabled={isLoading || !speechRecognition || isRecording || isSpeaking}
            className={`px-3 py-2 ml-2 rounded-md text-white ${
              isRecording ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"
            } focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              (!speechRecognition || isSpeaking) ? "opacity-50 cursor-not-allowed" : "" // Apply disabled style if no API or if speaking
            } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
            title={isRecording ? "Parar gravação" : (isSpeaking ? "Aguarde o assistente terminar de falar" : "Gravar áudio")}
          >
            {isRecording ? "🎤 Parar" : (isSpeaking ? "..." : "🎤 Gravar")}
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
            disabled={isLoading || isRecording} // Disable send if recording
            className={`px-4 py-2 bg-blue-500 text-white font-semibold rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
              isLoading ? "opacity-50 cursor-not-allowed" : ""
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
