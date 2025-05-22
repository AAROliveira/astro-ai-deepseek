import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request }) => {
  try {
    const { messages } = await request.json();

    // Validação de estrutura
    if (
      !Array.isArray(messages) ||
      !messages.every(
        (msg) =>
          typeof msg.role === "string" &&
          ["user", "assistant", "system"].includes(msg.role) &&
          typeof msg.content === "string"
      )
    ) {
      throw new Error("Invalid messages format");
    }

    // Mensagem de sistema (contexto)
    const systemMessage = {
      role: "system",
      content:
        "Você é um assistente de IA chamado Gemma 3. Responda sempre como Gemma e ajude o usuário da melhor forma possível. Tente responder utilizando o mesmo idioma falado pelo usuário.",
    };

    // Requisição ao Ollama
    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemma3:12b",
        messages: [systemMessage, ...messages],
      }),
    });

    if (!response.body) {
      console.error("Response body is null");
      return new Response(
        JSON.stringify({ error: "No response body from server" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Stream para o cliente
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            controller.enqueue(decoder.decode(value, { stream: true }));
          }
        } catch (err) {
          console.error("Erro no stream:", err);
          controller.error(err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Erro na rota API:", error);
    return new Response(
      JSON.stringify({
        error: "Erro ao processar a requisição",
        message: error instanceof Error ? error.message : "Erro desconhecido",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
