import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { loadChatHistory, saveChatHistory } from "./loadSaveChatHistory";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  role: "user" | "assistant";
  content: string;
  fileUrl?: string;
}

const Chat: React.FC = () => {
  console.log("🚀 Renderizando Chat!");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      console.error("Erro ao enviar mensagem:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Erro ao processar sua solicitação." },
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-200 text-black px-10 sm:px-20 lg:px-32 py-20 sm:py-32 lg:py-40 font-serif">
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
                  className={`max-w-xl px-4 py-3 rounded-lg shadow-sm whitespace-pre-wrap transition-all duration-300 ${message.role === "user"
                      ? "bg-blue-200 text-black self-end"
                      : "bg-gray-100 text-black self-start"
                    }`}
                >
                  <ReactMarkdown>{message.content}</ReactMarkdown>
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
            <div className="text-sm text-gray-500 animate-pulse">
              Gemma está digitando...
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
            className="flex-1 px-4 py-2 border rounded-md text-base bg-gray-700 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="text-sm text-gray-600"
          />
          <button
            onClick={sendMessage}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-500 text-white font-semibold rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Enviando..." : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chat;
